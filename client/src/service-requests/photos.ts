import { api } from "../lib/api";

export interface PhotoSelection {
  photoKeys: string[];
  pending: boolean;
  failed: boolean;
}
interface SignedUpload {
  objectKey: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

/** S3 receives only file bytes and its signed headers; the browser supplies Content-Length. */
export async function uploadPhoto(
  file: File,
  signal: AbortSignal,
  progress: (percent: number) => void,
) {
  const signed = await api<SignedUpload>("/photo-uploads", {
    method: "POST",
    body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
    signal,
  });
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open(signed.method, signed.url);
    xhr.withCredentials = false;
    for (const [name, value] of Object.entries(signed.headers))
      xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Photo upload failed"));
    };
    xhr.onerror = () => reject(new Error("Photo upload failed"));
    xhr.onabort = () =>
      reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
  return signed.objectKey;
}
