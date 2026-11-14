import type { Browser, TestApp } from './test-app.js';

export const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082',
  'hex',
);

export function storagePath(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

export async function uploadPhoto(
  user: Browser,
  bytes = PNG,
  contentType = 'image/png',
) {
  const signed = await user
    .post('/api/photo-uploads')
    .send({ contentType, contentLength: bytes.length })
    .expect(201);
  await user
    .put(storagePath(signed.body.url))
    .set(signed.body.headers)
    .send(bytes)
    .expect(200);
  return {
    ...signed.body,
    photoId: signed.body.objectKey.split('/').at(-1),
  } as {
    objectKey: string;
    photoId: string;
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
}

export async function downloadPhoto(
  app: TestApp,
  url: string,
): Promise<Buffer> {
  const downloaded = await app
    .browser()
    .get(storagePath(url))
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
      res.on('error', callback);
    })
    .expect(200);
  return downloaded.body;
}
