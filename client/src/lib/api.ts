export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(new URL(`/api${path}`, window.location.origin), {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const body =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    throw new ApiError(
      response.status,
      typeof body.error === "string" ? body.error : "request_failed",
      typeof body.message === "string"
        ? body.message
        : "We couldn’t complete that request. Please try again.",
      Array.isArray(body.issues)
        ? body.issues.filter(
            (issue): issue is ValidationIssue =>
              issue &&
              Array.isArray(issue.path) &&
              issue.path.every(
                (key: unknown) =>
                  typeof key === "string" || typeof key === "number",
              ) &&
              typeof issue.message === "string",
          )
        : [],
    );
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return "Too many attempts. Please wait before trying again.";
    if (error.code === "account_deactivated")
      return "Your access is deactivated. Contact a university Administrator.";
    return error.message;
  }
  return "We couldn’t connect. Check your connection and try again.";
}
