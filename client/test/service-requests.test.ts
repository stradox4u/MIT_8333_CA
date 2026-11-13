import { expect, test } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "vue-router";
import { http, HttpResponse } from "msw";
import App from "../src/App.vue";
import { createClientRuntime } from "../src/app";
import { server } from "./setup";

const api = "http://localhost:5173/api";

function signedIn(
  role: "student" | "staff" | "maintenance_officer" | "administrator" =
    "student",
) {
  server.use(
    http.get(`${api}/auth/me`, () =>
      HttpResponse.json({
        id: "ada",
        email: "ada@example.test",
        firstName: "Ada",
        lastName: "Okafor",
        role,
        signUpComplete: true,
        hasPassword: false,
      }),
    ),
  );
}

function open(path: string) {
  const history = createMemoryHistory();
  history.push(path);
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  return { runtime, user: userEvent.setup() };
}

test("the workspace links to My requests and offers Report a fault as its primary action", async () => {
  signedIn();
  const { runtime, user } = open("/dashboard");
  const nav = await screen.findByRole("navigation", { name: "Main" });
  expect(
    within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent?.trim()),
  ).toEqual(["Dashboard", "My requests", "Account settings"]);
  expect(
    within(nav).getByRole("link", { name: "Dashboard" }).getAttribute(
      "aria-current",
    ),
  ).toBe("page");
  await user.click(screen.getByRole("link", { name: "Report a fault" }));
  await screen.findByRole("heading", { name: "Report a fault" });
  expect(runtime.router.currentRoute.value.path).toBe("/requests/new");
  expect(
    screen
      .getByRole("link", { name: "Report a fault" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(
    within(screen.getByRole("navigation", { name: "Main" }))
      .getByRole("link", { name: "Dashboard" })
      .getAttribute("aria-current"),
  ).toBeNull();
  runtime.queryClient.clear();
});

const categories = [
  { id: "electrical", name: "Electrical", code: "ELEC" },
  { id: "plumbing", name: "Plumbing", code: "PLUMB" },
  { id: "furniture", name: "Furniture", code: "FURN" },
  { id: "network", name: "Internet and network", code: "NET" },
  { id: "classroom_equipment", name: "Classroom equipment", code: "CLASS" },
  { id: "other", name: "Other", code: "OTHER" },
];
function withCategories() {
  server.use(
    http.get(`${api}/request-categories`, () => HttpResponse.json(categories)),
  );
}

test("Report a fault asks for a title, a Request Category from the API, a location and a description", async () => {
  signedIn();
  withCategories();
  const { runtime } = open("/requests/new");
  const group = await screen.findByRole("group", { name: "Request Category" });
  expect(
    (await within(group).findAllByRole("radio")).map((radio) =>
      radio.closest("label")?.textContent?.trim(),
    ),
  ).toEqual(categories.map((category) => category.name));
  expect(screen.getByLabelText("Title")).toBeTruthy();
  expect(screen.getByLabelText("Location")).toBeTruthy();
  expect(screen.getByLabelText("Description")).toBeTruthy();
  expect(screen.getByText("Don’t include personal details")).toBeTruthy();
  expect(
    screen.getByLabelText("Description").getAttribute("aria-describedby"),
  ).toContain("privacy-hint");
  runtime.queryClient.clear();
});

test("Report a fault checks the server's limits on blur and before sending, after trimming", async () => {
  signedIn();
  withCategories();
  let submissions = 0;
  server.use(
    http.post(`${api}/service-requests`, () => {
      submissions++;
      return HttpResponse.json({ reference: "SR-PLUMB-1" }, { status: 201 });
    }),
  );
  const { runtime, user } = open("/requests/new");
  await screen.findAllByRole("radio");
  const title = screen.getByLabelText("Title");
  await user.type(title, "  ab  ");
  expect(screen.queryByText("Use at least 3 characters.")).toBeNull();
  await user.tab();
  const tooShort = screen.getByText("Use at least 3 characters.");
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(title.getAttribute("aria-describedby")).toContain(tooShort.id);
  await user.type(title, "c");
  expect(screen.queryByText("Use at least 3 characters.")).toBeNull();

  await user.click(
    screen.getByRole("button", { name: "Submit Service Request" }),
  );
  expect(screen.getByText("Choose a Request Category.")).toBeTruthy();
  expect(screen.getByText("Enter where the fault is.")).toBeTruthy();
  expect(screen.getByText("Enter a description of the fault.")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getAllByRole("radio")[0]);

  await user.click(screen.getByRole("radio", { name: "Plumbing" }));
  expect(screen.queryByText("Choose a Request Category.")).toBeNull();
  await user.type(screen.getByLabelText("Location"), "B");
  await user.click(screen.getByLabelText("Description"));
  await user.paste("x".repeat(5001));
  await user.click(
    screen.getByRole("button", { name: "Submit Service Request" }),
  );
  expect(screen.getByText("Use at least 2 characters.")).toBeTruthy();
  expect(screen.getByText("Use 5,000 characters or fewer.")).toBeTruthy();
  expect(screen.getByText("5,001 / 5,000")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Submit Service Request",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(submissions).toBe(0);
  runtime.queryClient.clear();
});

const submitted = {
  reference: "SR-PLUMB-1",
  title: "Leaking pipe under the sink",
  category: { id: "plumbing", name: "Plumbing", code: "PLUMB" },
  location: "Hostel B, room 214",
  status: "submitted",
  requester: { id: "ada", name: "Ada Okafor" },
  submittedAt: "2026-11-12T09:00:00.000Z",
  description: "Water drips from the pipe and collects on the floor.",
  timeline: [
    {
      type: "status_update",
      occurredAt: "2026-11-12T09:00:00.000Z",
      actor: { id: "ada", name: "Ada Okafor" },
      fromStatus: null,
      toStatus: "submitted",
      reason: null,
    },
  ],
};

async function fillReport(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByLabelText("Title"),
    "  Leaking pipe under the sink ",
  );
  await user.click(await screen.findByRole("radio", { name: "Plumbing" }));
  await user.type(screen.getByLabelText("Location"), "Hostel B, room 214");
  await user.type(
    screen.getByLabelText("Description"),
    "Water drips from the pipe and collects on the floor.",
  );
}

test("submitting sends the trimmed report once, then shows the new request with a submitted notice", async () => {
  signedIn();
  withCategories();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bodies: unknown[] = [];
  server.use(
    http.post(`${api}/service-requests`, async ({ request }) => {
      bodies.push(await request.json());
      await pending;
      return HttpResponse.json({ reference: "SR-PLUMB-1" }, { status: 201 });
    }),
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json(submitted),
    ),
  );
  const { runtime, user } = open("/requests/new");
  await fillReport(user);
  const button = screen.getByRole("button", {
    name: "Submit Service Request",
  }) as HTMLButtonElement;
  await user.click(button);
  await waitFor(() => expect(button.disabled).toBe(true));
  expect(button.getAttribute("aria-busy")).toBe("true");
  await user.click(button);
  release();
  await screen.findByRole("heading", { name: "Leaking pipe under the sink" });
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.path).toBe(
      "/requests/SR-PLUMB-1",
    ),
  );
  expect(bodies).toEqual([
    {
      title: "Leaking pipe under the sink",
      categoryId: "plumbing",
      location: "Hostel B, room 214",
      description: "Water drips from the pipe and collects on the floor.",
    },
  ]);
  const notice = screen
    .getAllByRole("status")
    .find((element) => element.classList.contains("page-feedback"));
  expect(notice?.textContent?.trim()).toBe(
    "Service Request SR-PLUMB-1 submitted.",
  );
  runtime.queryClient.clear();
});

function details(term: string) {
  const label = screen.getByText(term, { selector: "dt" });
  return label.nextElementSibling?.textContent?.trim();
}

test("the tracking page shows the Requester their request's header, description and timeline, without Priority", async () => {
  signedIn("student");
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json(submitted),
    ),
  );
  const { runtime } = open("/requests/SR-PLUMB-1");
  const heading = await screen.findByRole("heading", {
    level: 1,
    name: "Leaking pipe under the sink",
  });
  const header = heading.closest("section")!;
  expect(within(header).getByText("SR-PLUMB-1")).toBeTruthy();
  expect(within(header).getByText("Status:").parentElement?.textContent).toBe(
    "Status: Submitted",
  );
  expect(within(header).queryByText(/Priority/)).toBeNull();
  expect(details("Request Category")).toBe("Plumbing");
  expect(details("Location")).toBe("Hostel B, room 214");
  expect(details("Submitted")).toBe("12 Nov 2026");
  expect(details("Requester")).toBe("You");
  expect(
    within(header)
      .getByRole("list", { name: "Progress" })
      .querySelector("[aria-current='step']")?.textContent,
  ).toContain("Submitted");
  expect(
    screen.getByText("Water drips from the pipe and collects on the floor."),
  ).toBeTruthy();
  const timeline = within(
    screen.getByRole("region", { name: "Timeline" }),
  ).getAllByRole("listitem");
  expect(timeline).toHaveLength(1);
  expect(timeline[0].textContent).toContain("Fault reported");
  expect(timeline[0].textContent).toMatch(
    /Status Update · You · Requester · 12 Nov 2026, \d\d:\d\d/,
  );
  runtime.queryClient.clear();
});

test("an Administrator sees the Priority, and the timeline names automatic actions and Erased Users, oldest first", async () => {
  signedIn("administrator");
  const erased = { id: "gone", name: "Erased user" };
  const officer = { id: "chinedu", name: "Chinedu Eze" };
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-7`, () =>
      HttpResponse.json({
        ...submitted,
        reference: "SR-PLUMB-7",
        status: "verified",
        priority: "high",
        requester: erased,
        timeline: [
          ["2026-11-01T09:00:00.000Z", erased, null, "submitted", null],
          ["2026-11-02T09:00:00.000Z", officer, "assigned", "in_progress", null],
          ["2026-11-03T09:00:00.000Z", officer, "in_progress", "completed", null],
          [
            "2026-11-04T09:00:00.000Z",
            erased,
            "completed",
            "assigned",
            "It still drips.",
          ],
          ["2026-11-05T09:00:00.000Z", officer, "assigned", "in_progress", null],
          ["2026-11-06T09:00:00.000Z", officer, "in_progress", "completed", null],
          ["2026-11-13T09:00:00.000Z", null, "completed", "verified", null],
        ].map(([occurredAt, actor, fromStatus, toStatus, reason]) => ({
          type: "status_update",
          occurredAt,
          actor,
          fromStatus,
          toStatus,
          reason,
        })),
      }),
    ),
  );
  const { runtime } = open("/requests/SR-PLUMB-7");
  const heading = await screen.findByRole("heading", { level: 1 });
  const header = heading.closest("section")!;
  expect(within(header).getByText("Priority:").parentElement?.textContent).toBe(
    "Priority: High",
  );
  expect(details("Requester")).toBe("Erased user");
  const entries = within(
    screen.getByRole("region", { name: "Timeline" }),
  ).getAllByRole("listitem");
  expect(
    entries.map(
      (entry) =>
        `${[...entry.querySelector(".tl-title")!.children]
          .map((part) => part.textContent?.trim())
          .join(" ")} | ${entry
          .querySelector(".tl-meta")
          ?.textContent?.replace(/\s+/g, " ")
          .replace(/ · \d.*$/, "")
          .trim()}`,
    ),
  ).toEqual([
    "Submitted Fault reported | Status Update · Erased user · Requester",
    "In Progress Work started | Status Update · Chinedu Eze",
    "Completed Work completed | Status Update · Chinedu Eze",
    "Assigned Not fixed | Status Update · Erased user · Requester",
    "In Progress Work started | Status Update · Chinedu Eze",
    "Completed Work completed | Status Update · Chinedu Eze",
    "Verified No answer within 7 days | Status Update · Automatically, after 7 days",
  ]);
  expect(entries[3].textContent).toContain("ReasonIt still drips.");
  runtime.queryClient.clear();
});

test("a Cancelled request says who cancelled it and why, in place of the progress steps", async () => {
  signedIn();
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json({
        ...submitted,
        status: "cancelled",
        timeline: [
          ...submitted.timeline,
          {
            type: "status_update",
            occurredAt: "2026-11-12T12:00:00.000Z",
            actor: { id: "ada", name: "Ada Okafor" },
            fromStatus: "submitted",
            toStatus: "cancelled",
            reason: "Reported twice.",
          },
        ],
      }),
    ),
  );
  const { runtime } = open("/requests/SR-PLUMB-1");
  await screen.findByRole("heading", { level: 1 });
  expect(
    screen
      .getByText("Cancelled", { selector: "strong" })
      .parentElement?.textContent?.replace(/\s+/g, " ")
      .trim(),
  ).toBe("Cancelled on 12 Nov 2026 by you. Reason: Reported twice.");
  expect(screen.queryByRole("list", { name: "Progress" })).toBeNull();
  runtime.queryClient.clear();
});

test("the tracking page answers an unknown or malformed Reference with a not-found page", async () => {
  signedIn();
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-999`, () =>
      HttpResponse.json(
        {
          message: "No such Service Request",
          error: "Not Found",
          statusCode: 404,
        },
        { status: 404 },
      ),
    ),
    http.get(`${api}/service-requests/not-a-reference`, () =>
      HttpResponse.json(
        {
          statusCode: 400,
          error: "Bad Request",
          message: ["is not a Reference, such as SR-PLUMB-42"],
          issues: [
            { path: [], message: "is not a Reference, such as SR-PLUMB-42" },
          ],
        },
        { status: 400 },
      ),
    ),
  );
  const { runtime } = open("/requests/SR-PLUMB-999");
  await screen.findByRole("heading", { name: "We can’t find SR-PLUMB-999" });
  expect(
    screen.getByText(
      "Check the Reference. If someone shared it with you, you may not have access to it.",
    ),
  ).toBeTruthy();
  await runtime.router.push("/requests/not-a-reference");
  await screen.findByRole("heading", {
    name: "We can’t find not-a-reference",
  });
  runtime.queryClient.clear();
});

test("the tracking page offers another try when it couldn't load", async () => {
  signedIn();
  let fail = true;
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      fail ? HttpResponse.error() : HttpResponse.json(submitted),
    ),
  );
  const { runtime, user } = open("/requests/SR-PLUMB-1");
  await screen.findByRole("heading", { name: "We couldn’t load SR-PLUMB-1" });
  fail = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Leaking pipe under the sink" });
  runtime.queryClient.clear();
});

test("the server's 400 issues show under the matching fields, and an unknown Request Category asks for another", async () => {
  signedIn();
  withCategories();
  server.use(
    http.post(`${api}/service-requests`, () =>
      HttpResponse.json(
        {
          statusCode: 400,
          error: "Bad Request",
          message: ["legacy text"],
          issues: [
            { path: ["title"], message: "Use 120 characters or fewer." },
            { path: ["categoryId"], message: "No such Request Category" },
          ],
        },
        { status: 400 },
      ),
    ),
  );
  const { runtime, user } = open("/requests/new");
  await fillReport(user);
  await user.click(
    screen.getByRole("button", { name: "Submit Service Request" }),
  );
  const titleError = await screen.findByText("Use 120 characters or fewer.");
  expect(
    screen.getByLabelText("Title").getAttribute("aria-describedby"),
  ).toContain(titleError.id);
  const categoryError = screen.getByText(
    "That Request Category isn’t available any more. Choose another.",
  );
  expect(
    screen
      .getByRole("radio", { name: "Plumbing" })
      .getAttribute("aria-describedby"),
  ).toContain(categoryError.id);
  expect(screen.queryByText("legacy text")).toBeNull();
  expect(document.activeElement).toBe(screen.getByLabelText("Title"));
  expect(
    (
      screen.getByRole("button", {
        name: "Submit Service Request",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  runtime.queryClient.clear();
});

test("a connection failure keeps the report and says so beneath the button", async () => {
  signedIn();
  withCategories();
  server.use(http.post(`${api}/service-requests`, () => HttpResponse.error()));
  const { runtime, user } = open("/requests/new");
  await fillReport(user);
  await user.click(
    screen.getByRole("button", { name: "Submit Service Request" }),
  );
  expect((await screen.findByRole("alert")).textContent?.trim()).toBe(
    "We couldn’t connect. Check your connection and try again. Your details are still here.",
  );
  expect((screen.getByLabelText("Location") as HTMLInputElement).value).toBe(
    "Hostel B, room 214",
  );
  expect(runtime.router.currentRoute.value.path).toBe("/requests/new");
  runtime.queryClient.clear();
});

test("a session that ends while reporting goes to Sign in and comes back to the form", async () => {
  let signedOut = false;
  server.use(
    http.get(`${api}/auth/me`, () =>
      signedOut
        ? new HttpResponse(null, { status: 401 })
        : HttpResponse.json({
            id: "ada",
            email: "ada@example.test",
            firstName: "Ada",
            lastName: "Okafor",
            role: "student",
            signUpComplete: true,
            hasPassword: false,
          }),
    ),
    http.post(`${api}/service-requests`, () => {
      signedOut = true;
      return new HttpResponse(null, { status: 401 });
    }),
  );
  withCategories();
  const { runtime, user } = open("/requests/new");
  await fillReport(user);
  await user.click(
    screen.getByRole("button", { name: "Submit Service Request" }),
  );
  await screen.findByText("Your session has ended. Please sign in again.");
  expect(runtime.router.currentRoute.value.path).toBe("/sign-in");
  // Signing in again clears the cached identity, as completeAuthentication does.
  signedOut = false;
  runtime.queryClient.clear();
  await runtime.router.push("/auth/complete");
  await screen.findByRole("heading", { name: "Report a fault" });
  expect(runtime.router.currentRoute.value.path).toBe("/requests/new");
  runtime.queryClient.clear();
});
