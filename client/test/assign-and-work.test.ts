import { expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/vue";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import {
  api,
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
  ["student", ["Dashboard", "My Requests", "Account Settings"]],
  ["staff", ["Dashboard", "My Requests", "Account Settings"]],
  [
    "maintenance_officer",
    ["Dashboard", "My Assignments", "My Requests", "Account Settings"],
  ],
  ["administrator", ["Dashboard", "Requests", "My Requests", "Account Settings"]],
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

const officers = [
  { id: "blessing", name: "Blessing Okoro", openAssignments: 0 },
  { id: "chinedu", name: "Chinedu Eze", openAssignments: 3 },
  { id: "tunde", name: "Tunde Bakare", openAssignments: 1 },
];
function withOfficers(list = officers) {
  let reads = 0;
  server.use(
    http.get(`${api}/maintenance-officers`, () => {
      reads++;
      return HttpResponse.json(list);
    }),
  );
  return { reads: () => reads };
}
/** The Assign button on a Submitted row of the table. */
const assignButton = async (reference: string) =>
  within(await screen.findByRole("table")).getByRole("button", {
    name: `Assign ${reference}`,
  });
/** The picker's choices, in order, as "name | load". */
const choices = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("radio")
    .map((radio) => {
      const label = radio.closest("label")!;
      return [".officer-name", ".officer-load"]
        .map((part) => label.querySelector(part)?.textContent?.trim())
        .join(" ");
    });

test("Assign opens a picker of officers, fewest Open Assignments first, and assigns the chosen one", async () => {
  signedIn("administrator", admin);
  const items: Item[] = [
    { ...summary("SR-ELEC-1", "Sparking socket"), priority: "normal" },
  ];
  withRequests(items);
  withOfficers();
  const bodies: unknown[] = [];
  server.use(
    http.put(
      `${api}/service-requests/SR-ELEC-1/assignment`,
      async ({ request }) => {
        bodies.push(await request.json());
        items[0] = {
          ...items[0],
          status: "assigned",
          assignment: assignedTo({ id: "tunde", name: "Tunde Bakare" }),
        };
        return HttpResponse.json({ ...items[0], description: "", timeline: [] });
      },
    ),
  );
  const { runtime, user } = open("/admin/requests");
  await user.click(await assignButton("SR-ELEC-1"));
  const dialog = await screen.findByRole("dialog", { name: "Assign SR-ELEC-1" });
  await waitFor(() =>
    expect(choices(dialog)).toEqual([
      "Blessing Okoro 0 Open Assignments",
      "Tunde Bakare 1 Open Assignment",
      "Chinedu Eze 3 Open Assignments",
    ]),
  );
  await user.click(within(dialog).getByRole("button", { name: "Assign" }));
  expect(within(dialog).getByText("Choose a Maintenance Officer.")).toBeTruthy();
  expect(bodies).toEqual([]);
  await user.click(within(dialog).getByRole("radio", { name: /Tunde Bakare/ }));
  await user.click(within(dialog).getByRole("button", { name: "Assign" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(bodies).toEqual([{ officerId: "tunde" }]);
  expect(
    (await screen.findByText(/assigned to Tunde Bakare/)).textContent?.trim(),
  ).toBe("SR-ELEC-1 assigned to Tunde Bakare. It’s now Assigned.");
  await screen.findByText("Tunde Bakare", { selector: "td" });
  runtime.queryClient.clear();
});

test("the picker shows the server's officerId refusal and a conflict inside it, and Cancel closes it", async () => {
  signedIn("administrator", admin);
  withRequests([{ ...summary("SR-ELEC-1", "Sparking socket"), priority: "normal" }]);
  const officerReads = withOfficers();
  let answer: "invalid" | "conflict" = "invalid";
  server.use(
    http.put(`${api}/service-requests/SR-ELEC-1/assignment`, () =>
      answer === "invalid"
        ? HttpResponse.json(
            {
              statusCode: 400,
              error: "Bad Request",
              message: ["officerId: Not an active Maintenance Officer"],
              issues: [
                { path: ["officerId"], message: "Not an active Maintenance Officer" },
              ],
            },
            { status: 400 },
          )
        : HttpResponse.json(
            {
              message: "A Service Request that’s Cancelled can’t be assigned",
              error: "Conflict",
              statusCode: 409,
            },
            { status: 409 },
          ),
    ),
  );
  const { runtime, user } = open("/admin/requests");
  const opener = await assignButton("SR-ELEC-1");
  await user.click(opener);
  const dialog = await screen.findByRole("dialog", { name: "Assign SR-ELEC-1" });
  await user.click(await within(dialog).findByRole("radio", { name: /Tunde Bakare/ }));
  await user.click(within(dialog).getByRole("button", { name: "Assign" }));
  const refusal = await within(dialog).findByText(
    "Tunde Bakare is no longer an active Maintenance Officer. Choose someone else.",
  );
  expect(refusal.id).toBeTruthy();
  await waitFor(() => expect(officerReads.reads()).toBe(2));
  answer = "conflict";
  await user.click(within(dialog).getByRole("radio", { name: /Blessing Okoro/ }));
  await user.click(within(dialog).getByRole("button", { name: "Assign" }));
  expect(
    (await within(dialog).findByRole("alert")).textContent?.trim(),
  ).toBe(
    "SR-ELEC-1 changed while you were choosing. Close this to see its latest details, then try again.",
  );
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(opener);
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
