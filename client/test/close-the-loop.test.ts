import { expect, test } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/vue";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import {
  api,
  open,
  signedIn,
  summary,
  withCategories,
  withRequests,
  type Role,
} from "./support";
import {
  serviceRequestOptions,
  type ServiceRequestDetails,
  type Status,
} from "../src/service-requests/api";

const detail = (status: Status = "completed"): ServiceRequestDetails => ({
  ...summary("SR-PLUMB-1", "Leaking tap", status),
  status,
  priority: undefined,
  description: "The tap is dripping onto the floor.",
  assignment:
    status === "submitted"
      ? null
      : {
          officer: { id: "chinedu", name: "Chinedu Eze" },
          assignedAt: "2026-11-12T10:00:00.000Z",
        },
  timeline:
    status === "completed"
      ? [
          {
            type: "status_update",
            occurredAt: "2026-11-12T11:00:00.000Z",
            actor: { id: "chinedu", name: "Chinedu Eze" },
            fromStatus: "in_progress",
            toStatus: "completed",
            reason: null,
            note: "Replaced the washer.",
          },
        ]
      : [],
});
function tracked(data: ServiceRequestDetails) {
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json(data),
    ),
  );
  return data;
}

test("Fixed verifies immediately, prevents duplicate submission and uses the returned request", async () => {
  signedIn();
  const data = tracked(detail());
  let calls = 0;
  let finish!: () => void;
  server.use(
    http.post(`${api}/service-requests/SR-PLUMB-1/verify`, async () => {
      calls++;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      data.status = "verified";
      return HttpResponse.json(data);
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  const fixed = await screen.findByRole("button", { name: "Fixed" });
  await user.click(fixed);
  expect(fixed.hasAttribute("disabled")).toBe(true);
  await user.click(fixed);
  expect(calls).toBe(1);
  finish();
  await screen.findByText("SR-PLUMB-1 is Verified.");
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Fixed" })).toBeNull(),
  );
  runtime.queryClient.clear();
});

test("Not fixed validates on blur, maps server field errors and retains the reason for retry", async () => {
  signedIn();
  const data = tracked(detail());
  const sent: unknown[] = [];
  server.use(
    http.post(
      `${api}/service-requests/SR-PLUMB-1/not-fixed`,
      async ({ request }) => {
        sent.push(await request.json());
        if (sent.length === 1)
          return HttpResponse.json(
            {
              issues: [
                { path: ["reason"], message: "Explain what still leaks." },
              ],
            },
            { status: 400 },
          );
        data.status = "assigned";
        return HttpResponse.json(data);
      },
    ),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(await screen.findByRole("button", { name: "Not fixed" }));
  const reason = screen.getByLabelText("Reason");
  await user.type(reason, "a");
  await user.tab();
  expect(reason.getAttribute("aria-invalid")).toBe("true");
  await user.click(screen.getByRole("button", { name: "Send Not fixed" }));
  expect(sent).toEqual([]);
  await user.clear(reason);
  await user.type(reason, "  It still leaks.  ");
  await user.click(screen.getByRole("button", { name: "Send Not fixed" }));
  await screen.findByText("Explain what still leaks.");
  expect((reason as HTMLTextAreaElement).value).toBe("  It still leaks.  ");
  await user.click(screen.getByRole("button", { name: "Send Not fixed" }));
  await screen.findByText("SR-PLUMB-1 is Assigned again.");
  expect(sent).toEqual([
    { reason: "It still leaks." },
    { reason: "It still leaks." },
  ]);
  runtime.queryClient.clear();
});

test("an open Not fixed form cannot submit while Fixed is pending", async () => {
  signedIn();
  const data = tracked(detail());
  let finish!: () => void;
  let answers = 0;
  server.use(
    http.post(`${api}/service-requests/SR-PLUMB-1/verify`, async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      data.status = "verified";
      return HttpResponse.json(data);
    }),
    http.post(`${api}/service-requests/SR-PLUMB-1/not-fixed`, () => {
      answers++;
      return HttpResponse.json(data);
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(await screen.findByRole("button", { name: "Not fixed" }));
  const reason = screen.getByLabelText("Reason");
  await user.type(reason, "Still leaking.");
  await user.click(screen.getByRole("button", { name: /^Fixed$/ }));
  const send = screen.getByRole("button", { name: "Send Not fixed" });
  expect(send.hasAttribute("disabled")).toBe(true);
  await user.click(send);
  await fireEvent.submit(send.closest("form")!);
  expect(answers).toBe(0);
  finish();
  await screen.findByText("SR-PLUMB-1 is Verified.");
  runtime.queryClient.clear();
});

test("a Requester cancels Submitted work only after entering a reason, and can keep it instead", async () => {
  signedIn();
  const data = tracked(detail("submitted"));
  const sent: unknown[] = [];
  server.use(
    http.post(
      `${api}/service-requests/SR-PLUMB-1/cancel`,
      async ({ request }) => {
        sent.push(await request.json());
        data.status = "cancelled";
        return HttpResponse.json(data);
      },
    ),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  const trigger = await screen.findByRole("button", { name: "Cancel request" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Keep it" }));
  expect(trigger).toBe(document.activeElement);
  expect(sent).toEqual([]);
  await user.click(trigger);
  await user.click(
    screen.getByRole("button", { name: "Cancel Service Request" }),
  );
  expect(sent).toEqual([]);
  await user.type(screen.getByLabelText("Reason"), "Duplicate report.");
  await user.click(
    screen.getByRole("button", { name: "Cancel Service Request" }),
  );
  await screen.findByText("SR-PLUMB-1 is Cancelled.");
  expect(sent).toEqual([{ reason: "Duplicate report." }]);
  runtime.queryClient.clear();
});

test("the edit route reuses the report form, preloads only the Requester’s Submitted details and saves a PATCH", async () => {
  signedIn();
  withCategories();
  const data = tracked(detail("submitted"));
  const sent: unknown[] = [];
  server.use(
    http.patch(`${api}/service-requests/SR-PLUMB-1`, async ({ request }) => {
      const body = (await request.json()) as Record<string, string>;
      sent.push(body);
      Object.assign(data, {
        title: body.title,
        location: body.location,
        description: body.description,
        category: { id: "electrical", name: "Electrical", code: "ELEC" },
      });
      return HttpResponse.json(data);
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1/edit");
  await screen.findByRole("heading", { name: "Edit details" });
  const title = await screen.findByLabelText("Title");
  expect((title as HTMLInputElement).value).toBe("Leaking tap");
  await user.clear(title);
  await user.type(title, "  Faulty light  ");
  await user.click(screen.getByRole("radio", { name: "Electrical" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("Details saved. The Reference stays SR-PLUMB-1.");
  expect(runtime.router.currentRoute.value.path).toBe("/requests/SR-PLUMB-1");
  expect(sent).toEqual([
    {
      title: "Faulty light",
      categoryId: "electrical",
      location: data.location,
      description: data.description,
    },
  ]);
  runtime.queryClient.clear();
});

test("Administrators set Priority on Open work without sending unchanged values", async () => {
  signedIn("administrator", {
    id: "funmi",
    firstName: "Funmi",
    lastName: "Adeyemi",
  });
  const data = tracked({ ...detail("assigned"), priority: "normal" });
  const sent: unknown[] = [];
  server.use(
    http.get(`${api}/maintenance-officers`, () =>
      HttpResponse.json([
        { id: "chinedu", name: "Chinedu Eze", openAssignments: 1 },
      ]),
    ),
    http.put(
      `${api}/service-requests/SR-PLUMB-1/priority`,
      async ({ request }) => {
        sent.push(await request.json());
        data.priority = "high";
        return HttpResponse.json(data);
      },
    ),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  const high = await screen.findByRole("radio", { name: "High" });
  expect(screen.queryByRole("button", { name: "Set Priority" })).toBeNull();
  await user.click(high);
  await user.click(screen.getByRole("button", { name: "Set Priority" }));
  await screen.findByText("Priority set to High.");
  expect(sent).toEqual([{ priority: "high" }]);
  expect(screen.queryByRole("button", { name: "Set Priority" })).toBeNull();
  runtime.queryClient.clear();
});

test("Administrator corrections PATCH only category and location and preserve the Reference", async () => {
  signedIn("administrator", {
    id: "funmi",
    firstName: "Funmi",
    lastName: "Adeyemi",
  });
  withCategories();
  const data = tracked({ ...detail("assigned"), priority: "normal" });
  const sent: unknown[] = [];
  server.use(
    http.get(`${api}/maintenance-officers`, () => HttpResponse.json([])),
    http.patch(`${api}/service-requests/SR-PLUMB-1`, async ({ request }) => {
      const body = (await request.json()) as {
        categoryId: string;
        location: string;
      };
      sent.push(body);
      data.location = body.location;
      data.category = { id: "electrical", name: "Electrical", code: "ELEC" };
      return HttpResponse.json(data);
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(
    await screen.findByRole("button", {
      name: "Correct Request Category or location",
    }),
  );
  const form = screen.getByRole("form", {
    name: "Correct Request Category or location",
  });
  await user.selectOptions(
    within(form).getByLabelText("Request Category"),
    "electrical",
  );
  const location = within(form).getByLabelText("Location");
  await user.clear(location);
  await user.type(location, "  Room 101  ");
  await user.click(
    within(form).getByRole("button", { name: "Save corrections" }),
  );
  await screen.findByText("Details corrected. The Reference stays SR-PLUMB-1.");
  expect(sent).toEqual([{ categoryId: "electrical", location: "Room 101" }]);
  expect(
    screen.queryByRole("form", {
      name: "Correct Request Category or location",
    }),
  ).toBeNull();
  runtime.queryClient.clear();
});

test.each<[Role, string, Status, boolean, boolean, boolean, boolean, boolean]>([
  ["student", "ada", "submitted", false, false, true, false, true],
  ["student", "ada", "assigned", false, false, false, false, false],
  ["student", "ada", "in_progress", false, false, false, false, false],
  ["student", "ada", "completed", true, false, false, false, false],
  ["student", "ada", "verified", false, false, false, false, false],
  ["student", "ada", "cancelled", false, false, false, false, false],
  ["staff", "ada", "completed", true, false, false, false, false],
  ["maintenance_officer", "ada", "completed", true, false, false, false, false],
  [
    "maintenance_officer",
    "chinedu",
    "completed",
    false,
    false,
    false,
    false,
    false,
  ],
  [
    "maintenance_officer",
    "tunde",
    "assigned",
    false,
    false,
    false,
    false,
    false,
  ],
  ["administrator", "funmi", "assigned", false, false, false, true, true],
  ["administrator", "funmi", "completed", false, true, false, false, false],
  ["administrator", "ada", "submitted", false, false, true, true, true],
  ["administrator", "ada", "completed", true, false, false, false, false],
  ["administrator", "funmi", "verified", false, false, false, false, false],
])(
  "shows the right closing actions for %s %s while %s",
  async (role, id, status, fixed, verify, edit, manage, cancel) => {
    signedIn(role, { id, firstName: "Test", lastName: "User" });
    tracked({
      ...detail(status),
      ...(role === "administrator" ? { priority: "normal" as const } : {}),
    });
    server.use(
      http.get(`${api}/maintenance-officers`, () => HttpResponse.json([])),
    );
    const { runtime } = open("/requests/SR-PLUMB-1");
    await screen.findByRole("heading", { name: "Leaking tap" });
    expect(!!screen.queryByRole("button", { name: "Fixed" })).toBe(fixed);
    expect(!!screen.queryByRole("button", { name: "Not fixed" })).toBe(fixed);
    expect(!!screen.queryByRole("button", { name: "Verify" })).toBe(verify);
    expect(!!screen.queryByRole("link", { name: "Edit details" })).toBe(edit);
    expect(
      !!screen.queryByRole("button", {
        name: "Correct Request Category or location",
      }),
    ).toBe(manage);
    expect(!!screen.queryByRole("button", { name: "Cancel request" })).toBe(
      cancel,
    );
    runtime.queryClient.clear();
  },
);

test.each(["assigned", "completed"] as const)(
  "an edit link opened for %s work never exposes editable fields",
  async (status) => {
    signedIn();
    withCategories();
    tracked(detail(status));
    const { runtime } = open("/requests/SR-PLUMB-1/edit");
    await screen.findByRole("heading", {
      name: "These details can’t be edited",
    });
    expect(screen.queryByLabelText("Title")).toBeNull();
    runtime.queryClient.clear();
  },
);

test("another Administrator uses corrections rather than the Requester’s full edit form", async () => {
  signedIn("administrator", {
    id: "funmi",
    firstName: "Funmi",
    lastName: "Adeyemi",
  });
  tracked({ ...detail("submitted"), priority: "normal" });
  const { runtime } = open("/requests/SR-PLUMB-1/edit");
  await screen.findByRole("heading", { name: "These details can’t be edited" });
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  runtime.queryClient.clear();
});

test("a 409 refreshes Status and removes cancellation controls after another user assigns the request", async () => {
  signedIn();
  const data = tracked(detail("submitted"));
  server.use(
    http.post(`${api}/service-requests/SR-PLUMB-1/cancel`, () => {
      data.status = "assigned";
      return HttpResponse.json(
        { message: "Already assigned" },
        { status: 409 },
      );
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(
    await screen.findByRole("button", { name: "Cancel request" }),
  );
  await user.type(screen.getByLabelText("Reason"), "Duplicate report.");
  await user.click(
    screen.getByRole("button", { name: "Cancel Service Request" }),
  );
  await screen.findByText(/changed while you had it open/);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull(),
  );
  runtime.queryClient.clear();
});

test("network failure retains the reason and re-enables submission", async () => {
  signedIn();
  tracked(detail());
  server.use(
    http.post(`${api}/service-requests/SR-PLUMB-1/not-fixed`, () =>
      HttpResponse.error(),
    ),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(await screen.findByRole("button", { name: "Not fixed" }));
  const reason = screen.getByLabelText("Reason");
  await user.type(reason, "It still leaks.");
  const send = screen.getByRole("button", { name: "Send Not fixed" });
  await user.click(send);
  await screen.findByText(/We couldn’t connect/);
  await waitFor(() => expect(send.hasAttribute("disabled")).toBe(false));
  expect((reason as HTMLTextAreaElement).value).toBe("It still leaks.");
  runtime.queryClient.clear();
});

test("verification refreshes changed permissions without officer-specific feedback", async () => {
  const person = { id: "funmi", firstName: "Funmi", lastName: "Adeyemi" };
  signedIn("administrator", person);
  tracked(detail());
  server.use(
    http.post(`${api}/service-requests/SR-PLUMB-1/verify`, () => {
      signedIn("staff", person);
      return HttpResponse.json({ message: "Forbidden" }, { status: 403 });
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(await screen.findByRole("button", { name: "Verify" }));
  await screen.findByText(/Your permissions changed/);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Verify" })).toBeNull(),
  );
  expect(screen.queryByText(/You’re no longer assigned to SR/)).toBeNull();
  runtime.queryClient.clear();
});

test.each(["verify", "edit"])(
  "a %s refusal refreshes an unavailable request",
  async (action) => {
    signedIn();
    withCategories();
    let hidden = false;
    const data = detail(action === "edit" ? "submitted" : "completed");
    const refuse = () => {
      hidden = true;
      return new HttpResponse(null, { status: 404 });
    };
    server.use(
      http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
        hidden
          ? new HttpResponse(null, { status: 404 })
          : HttpResponse.json(data),
      ),
      http.post(`${api}/service-requests/SR-PLUMB-1/verify`, refuse),
      http.patch(`${api}/service-requests/SR-PLUMB-1`, refuse),
    );
    const { user, runtime } = open(
      `/requests/SR-PLUMB-1${action === "edit" ? "/edit" : ""}`,
    );
    await user.click(
      await screen.findByRole("button", {
        name: action === "edit" ? "Save changes" : "Fixed",
      }),
    );
    await screen.findByRole("heading", { name: "We can’t find SR-PLUMB-1" });
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fixed" })).toBeNull();
    runtime.queryClient.clear();
  },
);

test("a late verification updates its cache without adding a notice to a different page", async () => {
  signedIn();
  withRequests([]);
  const data = tracked(detail());
  let finish!: () => void;
  server.use(
    http.post(`${api}/service-requests/SR-PLUMB-1/verify`, async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      data.status = "verified";
      return HttpResponse.json(data);
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(await screen.findByRole("button", { name: "Fixed" }));
  await runtime.router.push("/requests");
  await screen.findByRole("heading", { name: "My requests" });
  finish();
  await waitFor(() =>
    expect(
      runtime.queryClient.getQueryData(
        serviceRequestOptions(data.reference).queryKey,
      )?.status,
    ).toBe("verified"),
  );
  expect(screen.queryByText("SR-PLUMB-1 is Verified.")).toBeNull();
  expect(runtime.router.currentRoute.value.path).toBe("/requests");
  runtime.queryClient.clear();
});

test("editing preserves a valid draft when a conflict refreshes still-Submitted details", async () => {
  signedIn();
  withCategories();
  const data = tracked(detail("submitted"));
  server.use(
    http.patch(`${api}/service-requests/SR-PLUMB-1`, () => {
      data.title = "A correction from someone else";
      return HttpResponse.json({ message: "Changed" }, { status: 409 });
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1/edit");
  const title = await screen.findByLabelText("Title");
  await user.clear(title);
  await user.type(title, "My unsent correction");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText(/This request changed while you were editing/);
  expect((title as HTMLInputElement).value).toBe("My unsent correction");
  runtime.queryClient.clear();
});

test("an expired edit session returns to the edit route after sign-in, without saving automatically", async () => {
  let ended = false;
  let calls = 0;
  withCategories();
  tracked(detail("submitted"));
  server.use(
    http.get(`${api}/auth/me`, () =>
      ended
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
    http.patch(`${api}/service-requests/SR-PLUMB-1`, () => {
      calls++;
      ended = true;
      return new HttpResponse(null, { status: 401 });
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1/edit");
  await screen.findByLabelText("Title");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("heading", { name: "Welcome back." });
  ended = false;
  runtime.queryClient.clear();
  await runtime.router.push("/auth/complete");
  await screen.findByRole("heading", { name: "Edit details" });
  expect(runtime.router.currentRoute.value.path).toBe(
    "/requests/SR-PLUMB-1/edit",
  );
  expect(calls).toBe(1);
  runtime.queryClient.clear();
});
