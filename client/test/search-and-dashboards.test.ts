import { expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/vue";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import {
  api,
  open,
  signedIn,
  summary,
  withCategories,
  withRequests,
} from "./support";

test("Reference or title search shares its URL, keeps paging filters, and resets the page when changed", async () => {
  signedIn();
  const queries = withRequests([summary("SR-PLUMB-1", "Leaking pipe")]);
  const { runtime, user } = open("/requests?search=pipe&status=open&page=2");
  const search = await screen.findByRole("searchbox", { name: "Search" });
  expect((search as HTMLInputElement).value).toBe("pipe");
  await waitFor(() => expect(queries.at(-1)?.get("search")).toBe("pipe"));
  await user.clear(search);
  await user.type(search, "SR-PLUMB");
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.query).toEqual({
      search: "SR-PLUMB",
      status: "open",
    }),
  );
  runtime.router.back();
  await waitFor(() => expect((search as HTMLInputElement).value).toBe("pipe"));
  expect(runtime.router.currentRoute.value.query.page).toBe("2");
  runtime.queryClient.clear();
});

test("Request management restores all server filters and sort from a shared link and changes reset paging", async () => {
  signedIn("administrator");
  withCategories();
  const officerId = "88888888-8888-4888-8888-888888888888";
  server.use(
    http.get(`${api}/maintenance-officers`, () =>
      HttpResponse.json([
        { id: officerId, name: "Chinedu Eze", openAssignments: 2 },
      ]),
    ),
  );
  const queries = withRequests([summary("SR-PLUMB-1", "Leaking pipe")]);
  const { runtime, user } = open(
    `/admin/requests?search=Hostel&status=open&category=plumbing&priority=urgent&officerId=${officerId}&submittedFrom=2026-11-01&submittedTo=2026-11-12&sort=priority&page=3`,
  );
  await screen.findByRole("searchbox");
  await waitFor(() => expect(queries.at(-1)?.get("category")).toBe("plumbing"));
  expect(queries.at(-1)?.get("priority")).toBe("urgent");
  expect(queries.at(-1)?.get("officerId")).toBe(officerId);
  expect(queries.at(-1)?.get("submittedFrom")).toBe("2026-11-01");
  expect(queries.at(-1)?.get("submittedTo")).toBe("2026-11-12");
  expect(queries.at(-1)?.get("sort")).toBe("priority");
  await user.selectOptions(screen.getByLabelText("Priority"), "high");
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.query.page).toBeUndefined(),
  );
  expect(runtime.router.currentRoute.value.query.category).toBe("plumbing");
  expect(runtime.router.currentRoute.value.query.search).toBe("Hostel");
  runtime.queryClient.clear();
});

const counts = {
  submitted: 2,
  assigned: 3,
  in_progress: 1,
  completed: 1,
  verified: 4,
  cancelled: 0,
};
function withDashboard(
  scope: string,
  rows = [summary("SR-PLUMB-1", "Leaking pipe", "completed")],
) {
  server.use(
    http.get(`${api}/service-requests/summary`, ({ request }) => {
      expect(new URL(request.url).searchParams.toString()).toBe(
        `scope=${scope}`,
      );
      return HttpResponse.json({
        byStatus: counts,
        ...(scope === "all"
          ? {
              openByCategory: [
                {
                  category: { id: "plumbing", name: "Plumbing", code: "PLUMB" },
                  count: 6,
                },
              ],
            }
          : {}),
      });
    }),
  );
  return withRequests(rows);
}

test("Student dashboard uses scoped counts, Completed answers and newest submitted short lists without Priority", async () => {
  signedIn();
  const queries = withDashboard("requested", [
    {
      ...summary("SR-PLUMB-1", "Leaking pipe", "completed"),
      priority: "urgent",
    },
  ]);
  const { runtime, user } = open("/dashboard");
  await screen.findByRole("heading", { name: "Welcome back, Ada" });
  const stats = await screen.findByRole("list", {
    name: "Your requests by Status",
  });
  expect(
    within(stats)
      .getByRole("link", { name: "Open requests 6" })
      .getAttribute("href"),
  ).toBe("/requests?status=open");
  expect(
    within(stats)
      .getByRole("link", { name: "Waiting for your answer 1" })
      .getAttribute("href"),
  ).toBe("/requests?status=completed");
  await screen.findByRole("link", { name: "Answer for SR-PLUMB-1" });
  expect(screen.queryByText("Urgent")).toBeNull();
  expect(
    queries.some(
      (q) => q.get("status") === "completed" && q.get("pageSize") === "5",
    ),
  ).toBe(true);
  await waitFor(() =>
    expect(
      queries.some(
        (q) =>
          !q.get("status") &&
          q.get("sort") === "newest" &&
          q.get("pageSize") === "5",
      ),
    ).toBe(true),
  );
  await user.click(
    within(stats).getByRole("link", { name: "Open requests 6" }),
  );
  await screen.findByRole("heading", { name: "My requests" });
  expect(runtime.router.currentRoute.value.query).toEqual({ status: "open" });
  runtime.queryClient.clear();
});

test("Officer dashboard asks for current Open Assignments by Priority and scopes its Status counts", async () => {
  const officerId = "88888888-8888-4888-8888-888888888888";
  signedIn("maintenance_officer", {
    id: officerId,
    firstName: "Chinedu",
    lastName: "Eze",
  });
  const item = {
    ...summary("SR-PLUMB-2", "Urgent leaking pipe", "assigned"),
    priority: "urgent",
    assignment: {
      officer: { id: officerId, name: "Chinedu Eze" },
      assignedAt: "2026-11-12T09:00:00Z",
    },
  };
  const queries = withDashboard("assigned", [item]);
  const { runtime } = open("/dashboard");
  const list = await screen.findByRole("region", {
    name: "Current Assignments",
  });
  await within(list).findByText("Urgent");
  expect(queries.at(-1)?.get("officerId")).toBe(officerId);
  expect(queries.at(-1)?.get("status")).toBe("open");
  expect(queries.at(-1)?.get("sort")).toBe("priority");
  expect(queries.at(-1)?.get("pageSize")).toBe("5");
  expect(
    screen.getByRole("link", { name: "Assigned 3" }).getAttribute("href"),
  ).toBe("/assignments?status=assigned");
  expect(
    within(list)
      .getByRole("link", { name: "Start SR-PLUMB-2" })
      .getAttribute("href"),
  ).toBe("/requests/SR-PLUMB-2");
  runtime.queryClient.clear();
});

test("Administrator dashboard uses all-scope counts, Open category links and globally ordered short queues", async () => {
  signedIn("administrator");
  const queries = withDashboard("all", [
    { ...summary("SR-PLUMB-1", "Leaking pipe"), priority: "urgent" },
  ]);
  const { runtime } = open("/dashboard");
  const stats = await screen.findByRole("list", {
    name: "Service Requests by Status",
  });
  expect(within(stats).getAllByRole("link")).toHaveLength(6);
  expect(
    within(stats)
      .getByRole("link", { name: "Submitted 2" })
      .getAttribute("href"),
  ).toBe("/admin/requests?status=submitted");
  const waiting = await screen.findByRole("region", {
    name: "Waiting for an Assignment",
  });
  await within(waiting).findByRole("button", { name: "Assign SR-PLUMB-1" });
  expect(
    within(waiting)
      .getByRole("link", { name: "View all (1)" })
      .getAttribute("href"),
  ).toBe("/admin/requests?status=submitted&sort=priority");
  const categories = screen.getByRole("region", {
    name: "Open requests by Request Category",
  });
  expect(
    within(categories)
      .getByRole("link", { name: "Plumbing" })
      .getAttribute("href"),
  ).toBe("/admin/requests?status=open&category=plumbing");
  await waitFor(() =>
    expect(
      queries.some(
        (q) =>
          q.get("status") === "open" &&
          q.get("priority") === "urgent" &&
          q.get("sort") === "priority" &&
          q.get("pageSize") === "5",
      ),
    ).toBe(true),
  );
  runtime.queryClient.clear();
});

test("assigning from a mounted Administrator dashboard refreshes Status counts and the waiting queue", async () => {
  signedIn("administrator");
  const officer = {
    id: "88888888-8888-4888-8888-888888888888",
    name: "Chinedu Eze",
    openAssignments: 0,
  };
  const item = { ...summary("SR-PLUMB-1", "Leaking pipe"), priority: "normal" };
  let assigned = false;
  withRequests([item]);
  server.use(
    http.get(`${api}/service-requests/summary`, () =>
      HttpResponse.json({
        byStatus: {
          submitted: assigned ? 0 : 1,
          assigned: assigned ? 1 : 0,
          in_progress: 0,
          completed: 0,
          verified: 0,
          cancelled: 0,
        },
        openByCategory: [],
      }),
    ),
    http.get(`${api}/maintenance-officers`, () => HttpResponse.json([officer])),
    http.put(`${api}/service-requests/SR-PLUMB-1/assignment`, () => {
      assigned = true;
      item.status = "assigned";
      return HttpResponse.json({
        ...item,
        assignment: { officer, assignedAt: "2026-11-12T09:00:00Z" },
        description: "Water drips from the pipe.",
        timeline: [],
      });
    }),
  );
  const { runtime, user } = open("/dashboard");
  await user.click(
    await screen.findByRole("button", { name: "Assign SR-PLUMB-1" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Assign SR-PLUMB-1" });
  await user.click(
    await within(dialog).findByRole("radio", { name: /Chinedu Eze/ }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Assign" }));
  await screen.findByText(
    "SR-PLUMB-1 assigned to Chinedu Eze. It’s now Assigned.",
  );
  await screen.findByRole("link", { name: "Submitted 0" });
  expect(screen.getByRole("link", { name: "Assigned 1" })).toBeTruthy();
  expect(
    within(
      screen.getByRole("region", { name: "Waiting for an Assignment" }),
    ).getByText(/Nothing is waiting/),
  ).toBeTruthy();
  runtime.queryClient.clear();
});

test("invalid shared filters are canonicalized before HTTP while Administrator My requests stays free of Priority", async () => {
  signedIn("administrator");
  const queries = withRequests([
    { ...summary("SR-PLUMB-1", "Admin’s own fault"), priority: "urgent" },
  ]);
  const { runtime } = open(
    "/requests?search=%20pipe%20&status=open&priority=urgent&category=plumbing&sort=priority&page=9007199254740991&unknown=x",
  );
  await screen.findByText("Admin’s own fault", { selector: "table a" });
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.query).toEqual({
      search: "pipe",
      status: "open",
    }),
  );
  expect(Object.fromEntries(queries.at(-1)!)).toEqual({
    scope: "requested",
    search: "pipe",
    status: "open",
    page: "1",
    pageSize: "20",
  });
  expect(screen.queryByRole("columnheader", { name: "Priority" })).toBeNull();
  expect(screen.queryByText("Urgent")).toBeNull();
  runtime.queryClient.clear();
});

test("repeated, malformed and reversed Administrator URL filters never reach the strict API", async () => {
  signedIn("administrator");
  const queries = withRequests([]);
  const { runtime } = open(
    "/admin/requests?status=open&status=assigned&category=bad&priority=highest&officerId=unknown&submittedFrom=2026-11-12&submittedTo=2026-11-01&page=1e2&sort=oldest",
  );
  await screen.findByRole("heading", { name: "No Service Requests yet" });
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.query).toEqual({}),
  );
  expect(Object.fromEntries(queries.at(-1)!)).toEqual({
    scope: "all",
    page: "1",
    pageSize: "20",
  });
  await runtime.router.push(
    "/admin/requests?submittedFrom=2026-02-30&submittedTo=0000-01-01",
  );
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.query).toEqual({}),
  );
  runtime.queryClient.clear();
});

test("reversed submitted dates explain the error without replacing the last valid list query", async () => {
  signedIn("administrator");
  withRequests([]);
  const { runtime, user } = open(
    "/admin/requests?submittedFrom=2026-11-01&submittedTo=2026-11-12&page=2",
  );
  const to = await screen.findByLabelText("Submitted to");
  await user.clear(to);
  await user.type(to, "2026-10-01");
  await user.tab();
  await screen.findByText("Choose a date on or after the “from” date.");
  expect(runtime.router.currentRoute.value.query.submittedTo).toBeUndefined();
  expect(runtime.router.currentRoute.value.query.submittedFrom).toBe(
    "2026-11-01",
  );
  expect(to.getAttribute("aria-invalid")).toBe("true");
  runtime.queryClient.clear();
});

test("late filter responses cannot show previous rows, totals or empty states for a different Status", async () => {
  signedIn();
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get(`${api}/service-requests`, async ({ request }) => {
      const status = new URL(request.url).searchParams.get("status");
      if (status === "completed") {
        started();
        await pending;
      }
      return HttpResponse.json({
        items:
          status === "completed"
            ? []
            : [
                summary(
                  "SR-PLUMB-1",
                  status === "assigned" ? "Assigned pipe" : "Old pipe",
                  status ?? "submitted",
                ),
              ],
        page: 1,
        pageSize: 20,
        total: status === "completed" ? 0 : 1,
      });
    }),
  );
  const { runtime, user } = open("/requests");
  await screen.findByText("Old pipe", { selector: "table a" });
  await user.selectOptions(screen.getByLabelText("Status"), "completed");
  await waiting;
  expect(screen.queryByText("Old pipe", { selector: "table a" })).toBeNull();
  expect(screen.queryByText(/Showing/)).toBeNull();
  await screen.findByText("Loading Service Requests…");
  await user.selectOptions(screen.getByLabelText("Status"), "assigned");
  await screen.findByText("Assigned pipe", { selector: "table a" });
  release();
  await waitFor(() => expect(runtime.queryClient.isFetching()).toBe(0));
  expect(
    screen.queryByRole("heading", { name: "No Service Requests match" }),
  ).toBeNull();
  expect(
    screen.getByText("Assigned pipe", { selector: "table a" }),
  ).toBeTruthy();
  runtime.queryClient.clear();
});

test.each([
  "student",
  "staff",
  "maintenance_officer",
  "administrator",
] as const)(
  "%s dashboard has a useful empty state and permitted navigation",
  async (role) => {
    signedIn(role, {
      id: "88888888-8888-4888-8888-888888888888",
      firstName: "Ada",
      lastName: "Okafor",
    });
    const { runtime } = open("/dashboard");
    await screen.findByRole("heading", { name: "Welcome back, Ada" });
    if (role === "student" || role === "staff") {
      await screen.findByRole("heading", { name: "Nothing reported yet" });
      expect(
        screen.queryByRole("region", { name: "Current Assignments" }),
      ).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Waiting for an Assignment" }),
      ).toBeNull();
    } else if (role === "maintenance_officer") {
      await screen.findByText(/No current Assignments/);
      expect(
        screen.queryByRole("region", { name: "Waiting for an Assignment" }),
      ).toBeNull();
    } else {
      await screen.findByText(/Nothing is waiting/);
      expect(screen.getByRole("link", { name: "Submitted 0" })).toBeTruthy();
    }
    runtime.queryClient.clear();
  },
);

test("a dashboard summary failure can be retried without repeating a mutation", async () => {
  signedIn("staff");
  let failed = true;
  server.use(
    http.get(`${api}/service-requests/summary`, () =>
      failed
        ? HttpResponse.json({}, { status: 500 })
        : HttpResponse.json({ byStatus: counts }),
    ),
  );
  withRequests([]);
  const { runtime, user } = open("/dashboard");
  await screen.findByRole("heading", {
    name: "We couldn’t load your dashboard",
  });
  failed = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: "Open requests 6" });
  runtime.queryClient.clear();
});

test("each short dashboard list exposes a retry when its read fails", async () => {
  signedIn("maintenance_officer", {
    id: "88888888-8888-4888-8888-888888888888",
    firstName: "Chinedu",
    lastName: "Eze",
  });
  withDashboard("assigned");
  let failed = true;
  server.use(
    http.get(`${api}/service-requests`, () =>
      failed
        ? HttpResponse.json({}, { status: 500 })
        : HttpResponse.json({ items: [], page: 1, pageSize: 5, total: 0 }),
    ),
  );
  const { runtime, user } = open("/dashboard");
  await screen.findByRole("heading", {
    name: "We couldn’t load Current Assignments",
  });
  failed = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText(/No current Assignments/);
  runtime.queryClient.clear();
});

test("an ended dashboard session clears private data and retains the eligible destination", async () => {
  let expired = false;
  server.use(
    http.get(`${api}/auth/me`, () =>
      expired
        ? new HttpResponse(null, { status: 401 })
        : HttpResponse.json({
            id: "ada",
            firstName: "Ada",
            lastName: "Okafor",
            email: "ada@example.test",
            role: "student",
            signUpComplete: true,
            hasPassword: false,
          }),
    ),
    http.get(`${api}/service-requests/summary`, () => {
      expired = true;
      return new HttpResponse(null, { status: 401 });
    }),
  );
  const { runtime } = open("/dashboard");
  await screen.findByRole("heading", { name: "Welcome back." });
  expect(runtime.router.currentRoute.value.path).toBe("/sign-in");
  expect(
    runtime.queryClient.getQueryData(["service-requests-summary", "requested"]),
  ).toBeUndefined();
  runtime.queryClient.clear();
});

test("a lifecycle response arriving after leaving the tracking page refreshes the mounted Requester dashboard", async () => {
  signedIn();
  const item = summary("SR-PLUMB-1", "Leaking pipe", "completed");
  let verified = false;
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  withRequests([item]);
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json({
        ...item,
        description: "Water drips from the pipe.",
        timeline: [],
      }),
    ),
    http.get(`${api}/service-requests/summary`, () =>
      HttpResponse.json({
        byStatus: {
          submitted: 0,
          assigned: 0,
          in_progress: 0,
          completed: verified ? 0 : 1,
          verified: verified ? 1 : 0,
          cancelled: 0,
        },
      }),
    ),
    http.post(`${api}/service-requests/SR-PLUMB-1/verify`, async () => {
      started();
      await pending;
      verified = true;
      item.status = "verified";
      return HttpResponse.json({
        ...item,
        description: "Water drips from the pipe.",
        timeline: [],
      });
    }),
  );
  const { runtime, user } = open("/requests/SR-PLUMB-1");
  await user.click(await screen.findByRole("button", { name: "Fixed" }));
  await waiting;
  await user.click(screen.getByRole("link", { name: "Dashboard" }));
  await screen.findByRole("link", { name: "Waiting for your answer 1" });
  release();
  await screen.findByRole("link", { name: "Waiting for your answer 0" });
  expect(screen.getByRole("link", { name: "Verified 1" })).toBeTruthy();
  runtime.queryClient.clear();
});

test.each([
  ["student", "/requests", "Status", "open", "status"],
  ["maintenance_officer", "/assignments", "Status", "open", "status"],
  ["administrator", "/admin/requests", "Sort", "priority", "sort"],
] as const)(
  "%s combines a pending Search with the next filter change",
  async (role, path, label, value, key) => {
    signedIn(role);
    const queries = withRequests([summary("SR-PLUMB-1", "Leaking pipe")]);
    const { runtime, user } = open(`${path}?page=2`);
    const search = await screen.findByRole("searchbox", { name: "Search" });
    await user.type(search, "Leaking pipe");
    await user.selectOptions(screen.getByLabelText(label), value);
    await waitFor(() =>
      expect(runtime.router.currentRoute.value.query).toEqual({
        search: "Leaking pipe",
        [key]: value,
      }),
    );
    expect((search as HTMLInputElement).value).toBe("Leaking pipe");
    await waitFor(() =>
      expect(queries.at(-1)?.get("search")).toBe("Leaking pipe"),
    );
    expect(queries.at(-1)?.get(key)).toBe(value);
    expect(queries.at(-1)?.get("page")).toBe("1");
    runtime.queryClient.clear();
  },
);
