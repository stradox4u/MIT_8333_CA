import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "vue-router";
import { http, HttpResponse } from "msw";
import App from "../src/App.vue";
import { createClientRuntime } from "../src/app";
import { server } from "./setup";

/** Shared wiring for the Service Request tests: the whole app over MSW. */

export const api = "http://localhost:5173/api";

export type Role = "student" | "staff" | "maintenance_officer" | "administrator";

/** Signs in as a completed User with this Role. */
export function signedIn(
  role: Role = "student",
  user: { id: string; firstName: string; lastName: string } = {
    id: "ada",
    firstName: "Ada",
    lastName: "Okafor",
  },
) {
  server.use(
    http.get(`${api}/auth/me`, () =>
      HttpResponse.json({
        ...user,
        email: `${user.id}@example.test`,
        role,
        signUpComplete: true,
        hasPassword: false,
      }),
    ),
  );
}

/** Mounts the whole app at `path`, with real Router, Pinia and Query. */
export function open(path: string) {
  const history = createMemoryHistory();
  history.push(path);
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  return { runtime, user: userEvent.setup() };
}

export const categories = [
  { id: "electrical", name: "Electrical", code: "ELEC" },
  { id: "plumbing", name: "Plumbing", code: "PLUMB" },
  { id: "furniture", name: "Furniture", code: "FURN" },
  { id: "network", name: "Internet and network", code: "NET" },
  { id: "classroom_equipment", name: "Classroom equipment", code: "CLASS" },
  { id: "other", name: "Other", code: "OTHER" },
];
export function withCategories() {
  server.use(
    http.get(`${api}/request-categories`, () => HttpResponse.json(categories)),
  );
}

export interface Person {
  id: string;
  name: string;
}
export interface Item {
  reference: string;
  title: string;
  category: { id: string; name: string; code: string };
  location: string;
  status: string;
  priority?: string;
  requester: Person;
  submittedAt: string;
  assignment: { officer: Person; assignedAt: string } | null;
}

/** A list item, as the API sends it. */
export function summary(
  reference: string,
  title: string,
  status = "submitted",
): Item {
  return {
    reference,
    title,
    category: { id: "plumbing", name: "Plumbing", code: "PLUMB" },
    location: "Hostel B, room 214",
    status,
    requester: { id: "ada", name: "Ada Okafor" },
    submittedAt: "2026-11-12T09:00:00.000Z",
    assignment: null,
  };
}

/** Answers the list from `items`, a page at a time, recording each query. */
export function withRequests(
  items: Item[],
  queries: URLSearchParams[] = [],
) {
  server.use(
    http.get(`${api}/service-requests`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      queries.push(query);
      const page = Number(query.get("page") ?? 1);
      const pageSize = Number(query.get("pageSize") ?? 20);
      const status = query.get("status");
      const matching = items.filter((item) =>
        status === "open"
          ? ["submitted", "assigned", "in_progress"].includes(item.status)
          : !status || item.status === status,
      );
      return HttpResponse.json({
        items: matching.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: matching.length,
      });
    }),
  );
  return queries;
}

/** The value of a term in the tracking page's header. */
export function details(term: string) {
  const label = screen.getByText(term, { selector: "dt" });
  return label.nextElementSibling?.textContent?.trim();
}
