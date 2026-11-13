import { expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/vue";
import {
  open,
  signedIn,
  summary,
  withRequests,
  type Item,
  type Role,
} from "./support";

const chinedu = { id: "chinedu", name: "Chinedu Eze" };
const tunde = { id: "tunde", name: "Tunde Bakare" };
const officer = { id: "chinedu", firstName: "Chinedu", lastName: "Eze" };
const admin = { id: "funmi", firstName: "Funmi", lastName: "Adeyemi" };
const assignedTo = (person: { id: string; name: string }) => ({
  officer: person,
  assignedAt: "2026-11-12T10:00:00.000Z",
});

/** The rows of the list's table, cell by cell. */
function rows() {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .map((row) =>
      within(row)
        .queryAllByRole(row.querySelector("th") ? "columnheader" : "cell")
        .map((cell) => cell.textContent?.replace(/\s+/g, " ").trim()),
    );
}

const navLinks = () =>
  within(screen.getByRole("navigation", { name: "Main" }))
    .getAllByRole("link")
    .map((link) => link.textContent?.trim());

test.each<[Role, string[]]>([
  ["student", ["Dashboard", "My requests", "Account settings"]],
  ["staff", ["Dashboard", "My requests", "Account settings"]],
  [
    "maintenance_officer",
    ["Dashboard", "My assignments", "My requests", "Account settings"],
  ],
  ["administrator", ["Dashboard", "Requests", "My requests", "Account settings"]],
])("a %s sees the navigation for their Role", async (role, links) => {
  signedIn(role);
  const { runtime } = open("/dashboard");
  await screen.findByRole("navigation", { name: "Main" });
  expect(navLinks()).toEqual(links);
  runtime.queryClient.clear();
});

test.each<[string, Role]>([
  ["/assignments", "student"],
  ["/assignments", "administrator"],
  ["/admin/requests", "staff"],
  ["/admin/requests", "maintenance_officer"],
])("%s is closed to a %s, who lands on the dashboard", async (path, role) => {
  signedIn(role);
  withRequests([]);
  const { runtime } = open(path);
  await screen.findByRole("heading", { name: "Your campus workspace" });
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.path).toBe("/dashboard"),
  );
  runtime.queryClient.clear();
});

test("My assignments lists the officer's Assignments, marking ones taken away as read only, without their Priority", async () => {
  signedIn("maintenance_officer", officer);
  const items: Item[] = [
    {
      ...summary("SR-PLUMB-3", "Blocked shower drain", "in_progress"),
      priority: "urgent",
      assignment: assignedTo(chinedu),
    },
    {
      ...summary("SR-PLUMB-2", "Dripping tap", "assigned"),
      assignment: assignedTo(tunde),
    },
  ];
  const queries = withRequests(items);
  const { runtime } = open("/assignments?status=open");
  await screen.findByRole("heading", { name: "My assignments" });
  await screen.findByText("Blocked shower drain", { selector: "table a" });
  expect(queries[0].toString()).toBe(
    "scope=assigned&status=open&page=1&pageSize=20",
  );
  expect(rows()).toEqual([
    [
      "Reference",
      "Service Request",
      "Priority",
      "Status",
      "Requester",
      "Submitted",
    ],
    [
      "SR-PLUMB-3",
      "Blocked shower drain Hostel B, room 214",
      "Urgent",
      "In Progress",
      "Ada Okafor",
      "12 Nov",
    ],
    [
      "SR-PLUMB-2",
      "Dripping tap Hostel B, room 214",
      "—Not shown",
      "AssignedReassigned · read only",
      "Ada Okafor",
      "12 Nov",
    ],
  ]);
  runtime.queryClient.clear();
});

test("Request management lists every request with its Priority and Maintenance Officer", async () => {
  signedIn("administrator", admin);
  const queries = withRequests([
    {
      ...summary("SR-PLUMB-2", "Dripping tap", "assigned"),
      priority: "high",
      assignment: assignedTo(chinedu),
    },
    { ...summary("SR-ELEC-1", "Sparking socket"), priority: "normal" },
  ]);
  const { runtime } = open("/admin/requests");
  await screen.findByRole("heading", { name: "Request management" });
  await screen.findByText("Dripping tap", { selector: "table a" });
  expect(queries[0].get("scope")).toBe("all");
  expect(rows()).toEqual([
    [
      "Reference",
      "Service Request",
      "Request Category",
      "Priority",
      "Status",
      "Requester",
      "Maintenance Officer",
      "Submitted",
    ],
    [
      "SR-PLUMB-2",
      "Dripping tap Hostel B, room 214",
      "Plumbing",
      "High",
      "Assigned",
      "Ada Okafor",
      "Chinedu Eze",
      "12 Nov",
    ],
    [
      "SR-ELEC-1",
      "Sparking socket Hostel B, room 214",
      "Plumbing",
      "Normal",
      "Submitted",
      "Ada Okafor",
      "Assign",
      "12 Nov",
    ],
  ]);
  expect(
    within(screen.getByRole("table")).getByRole("button", {
      name: "Assign SR-ELEC-1",
    }),
  ).toBeTruthy();
  runtime.queryClient.clear();
});

test.each([
  ["/assignments?status=open", "maintenance_officer" as const, "My assignments"],
  ["/admin/requests?page=2", "administrator" as const, "Request management"],
])(
  "a session ending on %s comes back to it after Sign in",
  async (path, role, heading) => {
    const { server } = await import("./setup");
    const { http, HttpResponse } = await import("msw");
    let session: "live" | "ended" | "back" = "live";
    server.use(
      http.get("http://localhost:5173/api/auth/me", () =>
        session === "ended"
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({
              id: "someone",
              email: "someone@example.test",
              firstName: "Some",
              lastName: "One",
              role,
              signUpComplete: true,
              hasPassword: false,
            }),
      ),
      http.get("http://localhost:5173/api/service-requests", () => {
        if (session === "back")
          return HttpResponse.json({ items: [], page: 1, pageSize: 20, total: 0 });
        session = "ended";
        return new HttpResponse(null, { status: 401 });
      }),
    );
    const { runtime } = open(path);
    await screen.findByRole("heading", { name: "Welcome back." });
    session = "back";
    runtime.queryClient.clear();
    await runtime.router.push("/auth/complete");
    await screen.findByRole("heading", { name: heading });
    expect(runtime.router.currentRoute.value.fullPath).toBe(path);
    runtime.queryClient.clear();
  },
);
