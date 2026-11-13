import type { User } from "./identity";

const key = "mit8333.auth-navigation.v1";
const tabKey = "mit8333.auth-flow.v1";
const lifetime = 15 * 60_000;
export type ResumeSection = "password" | "erase";
interface Context {
  id: string;
  path: string;
  expiresAt: number;
  expectedUserId?: string;
  section?: ResumeSection;
}

/**
 * The workspace's pages. A Service Request's page may still answer 404, and
 * the router sends anyone whose Role a page isn't for to the dashboard.
 */
const eligiblePaths =
  /^\/(dashboard|account\/settings|assignments|admin\/requests|requests(\/new|\/SR-[A-Z]+-[1-9][0-9]*(\/edit)?)?)$/;

/** Hints never grant access. Only routes implemented for every completed Role are eligible. */
export function safeReturnPath(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
    return null;
  try {
    const url = new URL(path, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !eligiblePaths.test(url.pathname)
    )
      return null;
    if (
      [...url.searchParams.keys()].some((name) =>
        /token|password|secret|code|state/i.test(name),
      )
    )
      return null;
    if (url.hash && !["#password", "#erase", "#sessions"].includes(url.hash))
      return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
function read(): Context[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (item): item is Context =>
          item &&
          typeof item.id === "string" &&
          typeof item.path === "string" &&
          safeReturnPath(item.path) !== null &&
          typeof item.expiresAt === "number" &&
          item.expiresAt > Date.now() &&
          item.expiresAt <= Date.now() + lifetime &&
          (item.expectedUserId === undefined ||
            typeof item.expectedUserId === "string") &&
          (item.section === undefined ||
            ["password", "erase"].includes(item.section)),
      )
      .slice(-5);
  } catch {
    return [];
  }
}
function write(contexts: Context[]) {
  try {
    localStorage.setItem(key, JSON.stringify(contexts));
  } catch {
    /* Navigation is optional when storage is unavailable. */
  }
}
export function rememberDestination(
  path: string,
  expectedUserId?: string,
  section?: ResumeSection,
) {
  const safe = safeReturnPath(path);
  if (!safe) return;
  try {
    const id = sessionStorage.getItem(tabKey) ?? crypto.randomUUID();
    write([
      ...read().filter((context) => context.id !== id),
      {
        id,
        path: safe,
        expiresAt: Date.now() + lifetime,
        ...(expectedUserId ? { expectedUserId } : {}),
        ...(section ? { section } : {}),
      },
    ]);
    sessionStorage.setItem(tabKey, id);
  } catch {
    /* Use the dashboard fallback if browser storage is disabled. */
  }
}
export function takeDestination(user: User): { path: string; notice?: string } {
  if (!user.signUpComplete) return { path: "/finish-sign-up" };
  const contexts = read();
  let own: string | null = null;
  try {
    own = sessionStorage.getItem(tabKey);
  } catch {
    /* A unique browser-wide hint can still be used. */
  }
  const context = own
    ? contexts.find((item) => item.id === own)
    : contexts.length === 1
      ? contexts[0]
      : undefined;
  if (!context) return { path: "/dashboard" };
  write(contexts.filter((item) => item.id !== context.id));
  try {
    sessionStorage.removeItem(tabKey);
  } catch {
    /* Best effort. */
  }
  if (context.expectedUserId && context.expectedUserId !== user.id)
    return {
      path: "/dashboard",
      ...(context.section
        ? {
            notice:
              "You signed in with a different email. Your previous change was not made.",
          }
        : {}),
    };
  return { path: safeReturnPath(context.path) ?? "/dashboard" };
}
export function clearReturnContext() {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(tabKey);
  } catch {
    /* Best effort. */
  }
}
