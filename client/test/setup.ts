import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/vue";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const server = setupServer(
  http.get("http://localhost:5173/api/auth/sessions", () =>
    HttpResponse.json([]),
  ),
);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
});
afterAll(() => server.close());
