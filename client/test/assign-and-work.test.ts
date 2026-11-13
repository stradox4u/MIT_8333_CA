import { expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/vue";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import {
  api,
  details,
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
  [
    "administrator",
    ["Dashboard", "Requests", "My Requests", "Account Settings"],
  ],
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
        return HttpResponse.json({
          ...items[0],
          description: "",
          timeline: [],
        });
      },
    ),
  );
  const { runtime, user } = open("/admin/requests");
  await user.click(await assignButton("SR-ELEC-1"));
  const dialog = await screen.findByRole("dialog", {
    name: "Assign SR-ELEC-1",
  });
  await waitFor(() =>
    expect(choices(dialog)).toEqual([
      "Blessing Okoro 0 Open Assignments",
      "Tunde Bakare 1 Open Assignment",
      "Chinedu Eze 3 Open Assignments",
    ]),
  );
  await user.click(within(dialog).getByRole("button", { name: "Assign" }));
  expect(
    within(dialog).getByText("Choose a Maintenance Officer."),
  ).toBeTruthy();
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
  withRequests([
    { ...summary("SR-ELEC-1", "Sparking socket"), priority: "normal" },
  ]);
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
                {
                  path: ["officerId"],
                  message: "Not an active Maintenance Officer",
                },
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
  const dialog = await screen.findByRole("dialog", {
    name: "Assign SR-ELEC-1",
  });
  await user.click(
    await within(dialog).findByRole("radio", { name: /Tunde Bakare/ }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Assign" }));
  const refusal = await within(dialog).findByText(
    "Tunde Bakare is no longer an active Maintenance Officer. Choose someone else.",
  );
  expect(refusal.id).toBeTruthy();
  await waitFor(() => expect(officerReads.reads()).toBe(2));
  answer = "conflict";
  await user.click(
    within(dialog).getByRole("radio", { name: /Blessing Okoro/ }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Assign" }));
  expect((await within(dialog).findByRole("alert")).textContent?.trim()).toBe(
    "SR-ELEC-1 changed while you were choosing. Close this to see its latest details, then try again.",
  );
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(opener);
  runtime.queryClient.clear();
});

test.each([
  [
    "/assignments?status=open",
    "maintenance_officer" as const,
    "My assignments",
  ],
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
          return HttpResponse.json({
            items: [],
            page: 1,
            pageSize: 20,
            total: 0,
          });
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

const ada = { id: "ada", name: "Ada Okafor" };
const funmi = { id: "funmi", name: "Funmi Adeyemi" };
const at = (hour: number) =>
  `2026-11-12T${String(hour).padStart(2, "0")}:00:00.000Z`;
const statusUpdate = (
  hour: number,
  actor: { id: string; name: string } | null,
  fromStatus: string | null,
  toStatus: string,
  extra: { reason?: string; note?: string } = {},
) => ({
  type: "status_update",
  occurredAt: at(hour),
  actor,
  fromStatus,
  toStatus,
  reason: extra.reason ?? null,
  note: extra.note ?? null,
});
const assignmentChange = (
  hour: number,
  change: string,
  officer: { id: string; name: string },
  extra: {
    previousOfficer?: { id: string; name: string };
    statusUpdate?: { fromStatus: string; toStatus: string };
    actor?: { id: string; name: string } | null;
  } = {},
) => ({
  type: "assignment",
  occurredAt: at(hour),
  actor: extra.actor === undefined ? funmi : extra.actor,
  change,
  officer,
  previousOfficer: extra.previousOfficer ?? null,
  statusUpdate: extra.statusUpdate ?? null,
});

/** A Service Request's details, as the API sends them, and a handler serving it. */
function withRequest(overrides: Record<string, unknown> = {}) {
  let current: Record<string, unknown> = {
    ...summary("SR-PLUMB-1", "Leaking pipe under the sink"),
    description: "Water drips from the pipe.",
    timeline: [statusUpdate(9, ada, null, "submitted")],
    ...overrides,
  };
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json(current),
    ),
  );
  return {
    get: () => current,
    set(changes: Record<string, unknown>) {
      current = { ...current, ...changes };
      return current;
    },
  };
}
/** Each timeline entry as "title | detail | meta", with the time left out. */
const timeline = () =>
  within(screen.getByRole("region", { name: "Timeline" }))
    .getAllByRole("listitem")
    .map((entry) =>
      [".tl-title", ".tl-detail", ".tl-meta"]
        .map((part) =>
          [...(entry.querySelector(part)?.childNodes ?? [])]
            .filter((node) => node.nodeType !== Node.COMMENT_NODE)
            .map((node) => node.textContent?.trim())
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .replace(/ · \d+ \w+ \d{4}, \d\d:\d\d$/, ""),
        )
        .filter(Boolean)
        .join(" | "),
    );

test("the tracking page names the Maintenance Officer, and the timeline shows each Assignment change as one entry", async () => {
  signedIn("student");
  withRequest({
    status: "completed",
    assignment: assignedTo(tunde),
    timeline: [
      statusUpdate(9, ada, null, "submitted"),
      assignmentChange(10, "assigned", chinedu, {
        statusUpdate: { fromStatus: "submitted", toStatus: "assigned" },
      }),
      statusUpdate(11, chinedu, "assigned", "in_progress"),
      assignmentChange(12, "reassigned", tunde, {
        previousOfficer: chinedu,
        statusUpdate: { fromStatus: "in_progress", toStatus: "assigned" },
      }),
      assignmentChange(13, "reassigned", chinedu, { previousOfficer: tunde }),
      assignmentChange(14, "unassigned", chinedu, {
        statusUpdate: { fromStatus: "assigned", toStatus: "submitted" },
      }),
      assignmentChange(15, "assigned", tunde, {
        statusUpdate: { fromStatus: "submitted", toStatus: "assigned" },
      }),
      statusUpdate(16, tunde, "assigned", "in_progress"),
      statusUpdate(17, tunde, "in_progress", "completed", {
        note: "Replaced the washer.",
      }),
    ],
  });
  const { runtime } = open("/requests/SR-PLUMB-1");
  await screen.findByRole("heading", { name: "Leaking pipe under the sink" });
  expect(details("Maintenance Officer")).toBe("Tunde Bakare");
  expect(timeline()).toEqual([
    "Submitted Fault reported | Status Update · You · Requester",
    "Assigned to Chinedu Eze | Status Update: Submitted → Assigned | Assignment · Funmi Adeyemi",
    "In Progress Work started | Status Update · Chinedu Eze",
    "Reassigned from Chinedu Eze to Tunde Bakare | Status Update: In Progress → Assigned | Assignment · Funmi Adeyemi",
    "Reassigned from Tunde Bakare to Chinedu Eze | Assignment · Funmi Adeyemi",
    "Unassigned Chinedu Eze | Status Update: Assigned → Submitted | Assignment · Funmi Adeyemi",
    "Assigned to Tunde Bakare | Status Update: Submitted → Assigned | Assignment · Funmi Adeyemi",
    "In Progress Work started | Status Update · Tunde Bakare",
    "Completed Work completed | Status Update · Tunde Bakare",
  ]);
  const completed = within(
    screen.getByRole("region", { name: "Timeline" }),
  ).getAllByRole("listitem")[8];
  expect(completed.textContent).toContain(
    "Completion noteReplaced the washer.",
  );
  runtime.queryClient.clear();
});

/** The "what's next" panel, found by its heading. */
const panel = (name: string | RegExp) => screen.findByRole("region", { name });
/** Answers an action on SR-PLUMB-1 with the request's new details. */
function withAction(
  method: "post" | "put" | "delete",
  path: string,
  answer: (body: unknown) => Record<string, unknown> | Response,
) {
  const bodies: unknown[] = [];
  server.use(
    http[method](
      `${api}/service-requests/SR-PLUMB-1${path}`,
      async ({ request }) => {
        const text = await request.text();
        const body = text ? JSON.parse(text) : undefined;
        bodies.push(body);
        const result = answer(body);
        return result instanceof Response ? result : HttpResponse.json(result);
      },
    ),
  );
  return bodies;
}
const conflict = (verb: string) =>
  HttpResponse.json(
    {
      message: `A Service Request that’s Completed can’t be ${verb}`,
      error: "Conflict",
      statusCode: 409,
    },
    { status: 409 },
  );

test("the current officer starts the work, then completes it with an optional note", async () => {
  signedIn("maintenance_officer", officer);
  const request = withRequest({
    status: "assigned",
    priority: "high",
    assignment: assignedTo(chinedu),
  });
  const starts = withAction("post", "/start", () =>
    request.set({
      status: "in_progress",
      timeline: [
        ...(request.get().timeline as unknown[]),
        statusUpdate(11, chinedu, "assigned", "in_progress"),
      ],
    }),
  );
  const completions = withAction("post", "/complete", (body) =>
    request.set({
      status: "completed",
      priority: "high",
      timeline: [
        ...(request.get().timeline as unknown[]),
        statusUpdate(12, chinedu, "in_progress", "completed", {
          note: (body as { note?: string }).note,
        }),
      ],
    }),
  );
  const { runtime, user } = open("/requests/SR-PLUMB-1");
  const ready = await panel("Ready to start?");
  expect(
    within(ready).getByText(/Starting moves it to In Progress/),
  ).toBeTruthy();
  await user.click(within(ready).getByRole("button", { name: "Start work" }));
  expect(starts).toEqual([undefined]);
  expect(
    (await screen.findByText("Started. SR-PLUMB-1 is In Progress.")).closest(
      "[role=status]",
    ),
  ).toBeTruthy();
  const finish = await panel("Finished the work?");
  await user.click(within(finish).getByRole("button", { name: "Complete" }));
  const form = within(finish).getByRole("form", {
    name: "Complete SR-PLUMB-1",
  });
  const note = within(form).getByLabelText(/Note for the Requester/);
  expect(document.activeElement).toBe(note);
  await user.click(note);
  await user.paste("x".repeat(2001));
  await user.click(
    within(form).getByRole("button", { name: "Mark as Completed" }),
  );
  expect(within(form).getByText("Use 2,000 characters or fewer.")).toBeTruthy();
  expect(completions).toEqual([]);
  await user.clear(note);
  await user.type(note, "  Replaced the washer. ");
  await user.click(
    within(form).getByRole("button", { name: "Mark as Completed" }),
  );
  await screen.findByText("SR-PLUMB-1 is Completed.");
  expect(completions).toEqual([{ note: "Replaced the washer." }]);
  expect(await panel("Waiting for the Requester")).toBeTruthy();
  expect(
    within(screen.getByRole("region", { name: "Timeline" })).getByText(
      "Replaced the washer.",
    ),
  ).toBeTruthy();
  runtime.queryClient.clear();
});

test("completing without a note sends no note", async () => {
  signedIn("maintenance_officer", officer);
  const request = withRequest({
    status: "in_progress",
    assignment: assignedTo(chinedu),
  });
  const completions = withAction("post", "/complete", () =>
    request.set({ status: "completed" }),
  );
  const { runtime, user } = open("/requests/SR-PLUMB-1");
  const finish = await panel("Finished the work?");
  await user.click(within(finish).getByRole("button", { name: "Complete" }));
  await user.click(
    within(finish).getByRole("button", { name: "Mark as Completed" }),
  );
  await screen.findByText("SR-PLUMB-1 is Completed.");
  expect(completions).toEqual([{}]);
  runtime.queryClient.clear();
});

test("a 409 refreshes the request and explains, and a 403 says the officer is no longer assigned", async () => {
  signedIn("maintenance_officer", officer);
  const request = withRequest({
    status: "assigned",
    assignment: assignedTo(chinedu),
  });
  let answer: "conflict" | "forbidden" = "conflict";
  withAction("post", "/start", () => {
    if (answer === "conflict") {
      request.set({ status: "completed" });
      return conflict("started");
    }
    request.set({ status: "assigned", assignment: assignedTo(tunde) });
    return HttpResponse.json(
      { message: "Forbidden", statusCode: 403 },
      { status: 403 },
    );
  });
  const { runtime, user } = open("/requests/SR-PLUMB-1");
  await user.click(
    within(await panel("Ready to start?")).getByRole("button", {
      name: "Start work",
    }),
  );
  expect((await screen.findByRole("alert")).textContent?.trim()).toBe(
    "SR-PLUMB-1 changed while you had it open. We’ve refreshed it, so check its Status before trying again.",
  );
  await waitFor(() =>
    expect(screen.getByText("Status:").parentElement?.textContent).toBe(
      "Status: Completed",
    ),
  );
  request.set({ status: "assigned" });
  answer = "forbidden";
  await runtime.queryClient.invalidateQueries();
  await user.click(
    within(await panel("Ready to start?")).getByRole("button", {
      name: "Start work",
    }),
  );
  expect(
    await screen.findByText(
      "You’re no longer assigned to SR-PLUMB-1, so you can’t do that.",
    ),
  ).toBeTruthy();
  expect(
    await screen.findByText(
      /You’re no longer assigned to this Service Request/,
    ),
  ).toBeTruthy();
  runtime.queryClient.clear();
});

test("an officer reassigned away reads the request with a read-only banner and no actions", async () => {
  signedIn("maintenance_officer", officer);
  withRequest({ status: "in_progress", assignment: assignedTo(tunde) });
  const { runtime } = open("/requests/SR-PLUMB-1");
  const banner = await screen.findByText(
    /You’re no longer assigned to this Service Request/,
  );
  expect(banner.closest("p")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
    "You’re no longer assigned to this Service Request. It was reassigned to Tunde Bakare. You can still read it, but you can’t act on it.",
  );
  expect(screen.queryByRole("button", { name: /Start|Complete/ })).toBeNull();
  expect(screen.queryByText(/Priority/)).toBeNull();
  expect(
    screen.getByRole("link", { name: "My assignments" }).getAttribute("href"),
  ).toBe("/assignments");
  runtime.queryClient.clear();
});

test.each([
  [
    "submitted",
    null,
    "Waiting for an Assignment",
    "An Administrator will assign a Maintenance Officer to it.",
  ],
  ["assigned", chinedu, "Assigned to Chinedu Eze", "They’ll start soon."],
  [
    "in_progress",
    chinedu,
    "Chinedu Eze is working on it",
    "You’ll see here when it’s Completed.",
  ],
])(
  "the Requester sees what happens next while it's %s, and no actions",
  async (status, holder, heading, text) => {
    signedIn("student");
    withRequest({ status, assignment: holder ? assignedTo(holder) : null });
    const { runtime } = open("/requests/SR-PLUMB-1");
    const next = await panel(heading);
    expect(next.textContent).toContain(text);
    expect(within(next).queryByRole("button")).toBeNull();
    runtime.queryClient.clear();
  },
);

test("an Administrator assigns a Submitted request from its page", async () => {
  signedIn("administrator", admin);
  withOfficers();
  const request = withRequest({ status: "submitted", priority: "normal" });
  const bodies = withAction("put", "/assignment", () =>
    request.set({ status: "assigned", assignment: assignedTo(tunde) }),
  );
  const { runtime, user } = open("/requests/SR-PLUMB-1");
  const next = await panel("Waiting for an Assignment");
  await user.click(
    within(next).getByRole("button", { name: "Assign a Maintenance Officer" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Assign SR-PLUMB-1",
  });
  await user.click(
    await within(dialog).findByRole("radio", { name: /Tunde Bakare/ }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Assign" }));
  await screen.findByText(
    "SR-PLUMB-1 assigned to Tunde Bakare. It’s now Assigned.",
  );
  expect(bodies).toEqual([{ officerId: "tunde" }]);
  expect(details("Maintenance Officer")).toBe("Tunde Bakare");
  expect(
    screen
      .getByRole("link", { name: "Request management" })
      .getAttribute("href"),
  ).toBe("/admin/requests");
  runtime.queryClient.clear();
});

test("the Manage card reassigns to another officer, with the current one unavailable", async () => {
  signedIn("administrator", admin);
  withOfficers();
  const request = withRequest({
    status: "in_progress",
    priority: "high",
    assignment: assignedTo(chinedu),
  });
  const bodies = withAction("put", "/assignment", () =>
    request.set({ status: "assigned", assignment: assignedTo(tunde) }),
  );
  const { runtime, user } = open("/requests/SR-PLUMB-1");
  const manage = await screen.findByRole("region", { name: "Manage" });
  expect(await within(manage).findByText("3 Open Assignments")).toBeTruthy();
  expect(within(manage).getByText("Chinedu Eze")).toBeTruthy();
  await user.click(within(manage).getByRole("button", { name: "Reassign" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Reassign SR-PLUMB-1",
  });
  const current = await within(dialog).findByRole("radio", {
    name: /Chinedu Eze/,
  });
  expect((current as HTMLInputElement).disabled).toBe(true);
  expect(current.closest("label")?.textContent).toContain("Current officer");
  await user.click(within(dialog).getByRole("radio", { name: /Tunde Bakare/ }));
  await user.click(within(dialog).getByRole("button", { name: "Reassign" }));
  await screen.findByText(
    "SR-PLUMB-1 reassigned to Tunde Bakare. It’s now Assigned.",
  );
  expect(bodies).toEqual([{ officerId: "tunde" }]);
  runtime.queryClient.clear();
});

test("Unassign asks first, then takes the request back to Submitted", async () => {
  signedIn("administrator", admin);
  withOfficers();
  const request = withRequest({
    status: "assigned",
    priority: "normal",
    assignment: assignedTo(chinedu),
  });
  const bodies = withAction("delete", "/assignment", () =>
    request.set({ status: "submitted", assignment: null }),
  );
  const { runtime, user } = open("/requests/SR-PLUMB-1");
  const manage = await screen.findByRole("region", { name: "Manage" });
  await user.click(within(manage).getByRole("button", { name: "Unassign" }));
  const confirm = within(manage).getByRole("group", {
    name: "Unassign Chinedu Eze?",
  });
  expect(confirm.textContent).toContain("SR-PLUMB-1 goes back to Submitted.");
  await user.click(
    within(confirm).getByRole("button", { name: "Keep Assignment" }),
  );
  expect(within(manage).queryByRole("group")).toBeNull();
  expect(bodies).toEqual([]);
  await user.click(within(manage).getByRole("button", { name: "Unassign" }));
  await user.click(
    within(
      within(manage).getByRole("group", { name: "Unassign Chinedu Eze?" }),
    ).getByRole("button", { name: "Unassign" }),
  );
  await screen.findByText(
    "Chinedu Eze unassigned. SR-PLUMB-1 is Submitted again.",
  );
  expect(bodies).toEqual([undefined]);
  expect(await panel("Waiting for an Assignment")).toBeTruthy();
  runtime.queryClient.clear();
});

test("an action on a request that has gone answers 404, and the page says it can't be found", async () => {
  signedIn("administrator", admin);
  withOfficers();
  let gone = false;
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      gone
        ? HttpResponse.json(
            {
              message: "No such Service Request",
              error: "Not Found",
              statusCode: 404,
            },
            { status: 404 },
          )
        : HttpResponse.json({
            ...summary("SR-PLUMB-1", "Leaking pipe under the sink", "assigned"),
            priority: "normal",
            assignment: assignedTo(chinedu),
            description: "",
            timeline: [],
          }),
    ),
    http.delete(`${api}/service-requests/SR-PLUMB-1/assignment`, () => {
      gone = true;
      return HttpResponse.json(
        {
          message: "No such Service Request",
          error: "Not Found",
          statusCode: 404,
        },
        { status: 404 },
      );
    }),
  );
  const { runtime, user } = open("/requests/SR-PLUMB-1");
  const manage = await screen.findByRole("region", { name: "Manage" });
  await user.click(within(manage).getByRole("button", { name: "Unassign" }));
  await user.click(
    within(within(manage).getByRole("group")).getByRole("button", {
      name: "Unassign",
    }),
  );
  await screen.findByRole("heading", { name: "We can’t find SR-PLUMB-1" });
  runtime.queryClient.clear();
});

test("an officer who left reads as their Assignment ending, and a request with no officer says so", async () => {
  signedIn("administrator", admin);
  withRequest({
    status: "submitted",
    priority: "normal",
    timeline: [
      statusUpdate(9, ada, null, "submitted"),
      assignmentChange(10, "assigned", chinedu, {
        statusUpdate: { fromStatus: "submitted", toStatus: "assigned" },
      }),
      assignmentChange(11, "officer_left", chinedu, {
        statusUpdate: { fromStatus: "assigned", toStatus: "submitted" },
      }),
    ],
  });
  const { runtime } = open("/requests/SR-PLUMB-1");
  await screen.findByRole("heading", { name: "Leaking pipe under the sink" });
  expect(details("Maintenance Officer")).toBe("Not assigned yet");
  expect(timeline()[2]).toBe(
    "Chinedu Eze is no longer a Maintenance Officer | Status Update: Assigned → Submitted | Assignment · You",
  );
  runtime.queryClient.clear();
});
