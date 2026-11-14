import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/vue";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// jsdom has no modal dialogs: open and close them as browsers do, minus the
// focus trap, which the browser journeys cover.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(value?: string) {
    if (!this.open) return;
    this.removeAttribute("open");
    if (value !== undefined) this.returnValue = value;
    this.dispatchEvent(new Event("close"));
  };
}

export const server = setupServer(
  http.get("http://localhost:5173/api/service-requests/summary", () =>
    HttpResponse.json({
      byStatus: {
        submitted: 0,
        assigned: 0,
        in_progress: 0,
        completed: 0,
        verified: 0,
        cancelled: 0,
      },
      openByCategory: [],
    }),
  ),
  http.get("http://localhost:5173/api/service-requests", () =>
    HttpResponse.json({ items: [], page: 1, pageSize: 5, total: 0 }),
  ),
  http.get("http://localhost:5173/api/request-categories", () =>
    HttpResponse.json([]),
  ),
  http.get("http://localhost:5173/api/maintenance-officers", () =>
    HttpResponse.json([]),
  ),
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
