import { expect, test } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/vue";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import {
  api,
  details,
  open,
  signedIn,
  summary,
  withCategories,
  type Role,
} from "./support";
import type {
  ServiceRequestDetails,
  Status,
} from "../src/service-requests/api";

function detail(status: Status = "assigned"): ServiceRequestDetails {
  return {
    ...summary("SR-PLUMB-1", "Leaking tap", status),
    status,
    priority: undefined,
    assignment: {
      officer: { id: "chinedu", name: "Chinedu Eze" },
      assignedAt: "2026-11-12T10:00:00.000Z",
    },
    description: "Water drips onto the floor.",
    timeline: [],
  };
}
function tracked(data: ServiceRequestDetails) {
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json(data),
    ),
  );
  return data;
}
test("readers see Progress Notes in server order with safe text and author labels", async () => {
  signedIn();
  const data = tracked(detail("verified"));
  data.timeline = [
    {
      type: "progress_note",
      occurredAt: "2026-11-12T10:00:00.000Z",
      actor: { id: "ada", name: "Ada Okafor" },
      text: "<b>Room open</b>\nAfter noon",
    },
    {
      type: "progress_note",
      occurredAt: "2026-11-12T10:00:00.000Z",
      actor: { id: "erased", name: "Erased user" },
      text: "Waiting for a part.",
    },
  ];
  const { runtime } = open("/requests/SR-PLUMB-1");
  const timeline = await screen.findByRole("region", { name: "Timeline" });
  await within(timeline).findByText("<b>Room open</b> After noon");
  const entries = within(timeline).getAllByRole("listitem");
  expect(entries[0]?.textContent).toContain("You · Requester");
  expect(entries[1]?.textContent).toContain("Erased user");
  expect(timeline.querySelector("b")).toBeNull();
  expect(
    screen.queryByRole("form", { name: "Add a Progress Note" }),
  ).toBeNull();
  runtime.queryClient.clear();
});

test("a Requester adds a trimmed Progress Note once and can continue writing after success", async () => {
  signedIn();
  const data = tracked(detail());
  let finish!: () => void;
  const sent: unknown[] = [];
  server.use(
    http.post(
      `${api}/service-requests/SR-PLUMB-1/progress-notes`,
      async ({ request }) => {
        sent.push(await request.json());
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        data.timeline.push({
          type: "progress_note",
          occurredAt: "2026-11-12T11:00:00.000Z",
          actor: data.requester,
          text: "Room open after noon.",
        });
        return HttpResponse.json(data, { status: 201 });
      },
    ),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  const field = await screen.findByRole("textbox", {
    name: "Add a Progress Note",
  });
  await user.type(field, "  Room open after noon.  ");
  const button = screen.getByRole("button", {
    name: "Add Progress Note",
  });
  await user.click(button);
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  await user.click(button);
  expect(sent).toEqual([{ text: "Room open after noon." }]);
  finish();
  await screen.findByText("Progress Note added.");
  await screen.findByText("Room open after noon.");
  await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(""));
  await waitFor(() => expect(document.activeElement).toBe(field));
  expect(
    screen.getByRole("region", { name: "Leaking tap" }).textContent,
  ).toContain("Assigned");
  runtime.queryClient.clear();
});

test("notes validate on blur and submit, show server issues and retain text for a retry", async () => {
  signedIn();
  tracked(detail());
  const sent: unknown[] = [];
  server.use(
    http.post(
      `${api}/service-requests/SR-PLUMB-1/progress-notes`,
      async ({ request }) => {
        sent.push(await request.json());
        if (sent.length === 1)
          return HttpResponse.json(
            {
              issues: [
                { path: ["text"], message: "Explain the access arrangements." },
              ],
            },
            { status: 400 },
          );
        return HttpResponse.error();
      },
    ),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  const field = await screen.findByRole("textbox", {
    name: "Add a Progress Note",
  });
  const form = screen.getByRole("form", { name: "Add a Progress Note" });
  const button = within(form).getByRole("button", {
    name: "Add Progress Note",
  });
  await user.click(field);
  await user.tab();
  expect(field.getAttribute("aria-invalid")).toBe("true");
  await user.click(button);
  expect(sent).toEqual([]);
  await fireEvent.update(field, "x".repeat(2001));
  await fireEvent.blur(field);
  await screen.findByText("Use 2,000 characters or fewer.");
  await user.click(button);
  expect(sent).toEqual([]);
  await fireEvent.update(field, "  Room is open.  ");
  await user.click(button);
  const error = await screen.findByText("Explain the access arrangements.");
  expect(field.getAttribute("aria-describedby")).toContain(error.id);
  expect((field as HTMLTextAreaElement).value).toBe("  Room is open.  ");
  await user.click(button);
  await within(form).findByRole("alert");
  expect((field as HTMLTextAreaElement).value).toBe("  Room is open.  ");
  expect(button.hasAttribute("disabled")).toBe(false);
  expect(sent).toEqual([{ text: "Room is open." }, { text: "Room is open." }]);
  runtime.queryClient.clear();
});

const authors: [string, Role, string, boolean][] = [
  ["Student Requester", "student", "ada", true],
  ["Staff Requester", "staff", "ada", true],
  ["officer Requester", "maintenance_officer", "ada", true],
  ["Administrator Requester", "administrator", "ada", true],
  ["current officer", "maintenance_officer", "chinedu", true],
  ["Administrator", "administrator", "funmi", true],
  ["former officer", "maintenance_officer", "former", false],
];
test.each(
  authors.flatMap(([label, role, id, allowed]) =>
    (
      [
        "submitted",
        "assigned",
        "in_progress",
        "completed",
        "verified",
        "cancelled",
      ] as Status[]
    ).map((status) => ({
      label,
      role,
      id,
      status,
      allowed: allowed && status !== "verified" && status !== "cancelled",
    })),
  ),
)(
  "$label composer eligibility while $status",
  async ({ role, id, status, allowed }) => {
    signedIn(role, { id, firstName: "Viewer", lastName: "Name" });
    tracked(detail(status));
    const { runtime } = open("/requests/SR-PLUMB-1");
    await screen.findByRole("heading", { name: "Timeline" });
    expect(!!screen.queryByRole("form", { name: "Add a Progress Note" })).toBe(
      allowed,
    );
    runtime.queryClient.clear();
  },
);

test.each([403, 404, 409])(
  "note refusal %s refreshes the tracking page",
  async (status) => {
    signedIn();
    const data = tracked(detail());
    let hidden = false;
    server.use(
      http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
        hidden
          ? HttpResponse.json({}, { status: 404 })
          : HttpResponse.json(data),
      ),
      http.post(`${api}/service-requests/SR-PLUMB-1/progress-notes`, () => {
        if (status === 404) hidden = true;
        else if (status === 409) data.status = "verified";
        else {
          signedIn("maintenance_officer", {
            id: "former",
            firstName: "Former",
            lastName: "Officer",
          });
        }
        return HttpResponse.json({}, { status });
      }),
    );
    const { user, runtime } = open("/requests/SR-PLUMB-1");
    await user.type(
      await screen.findByRole("textbox", { name: "Add a Progress Note" }),
      "Room open.",
    );
    await user.click(screen.getByRole("button", { name: "Add Progress Note" }));
    if (status === 404)
      await screen.findByRole("heading", { name: "We can’t find SR-PLUMB-1" });
    else if (status === 409)
      await screen.findByText(/changed while you had it open/);
    else
      await screen.findByText(
        "You can no longer add Progress Notes to this Service Request.",
      );
    await waitFor(() =>
      expect(
        screen.queryByRole("form", { name: "Add a Progress Note" }),
      ).toBeNull(),
    );
    runtime.queryClient.clear();
  },
);

test("expired sessions return to sign in without automatically sending a note", async () => {
  signedIn();
  tracked(detail());
  let calls = 0;
  server.use(
    http.post(`${api}/service-requests/SR-PLUMB-1/progress-notes`, () => {
      calls++;
      server.use(
        http.get(`${api}/auth/me`, () =>
          HttpResponse.json({}, { status: 401 }),
        ),
      );
      return HttpResponse.json({}, { status: 401 });
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.type(
    await screen.findByRole("textbox", { name: "Add a Progress Note" }),
    "Room open.",
  );
  await user.click(screen.getByRole("button", { name: "Add Progress Note" }));
  await screen.findByRole("heading", { name: "Welcome back." });
  server.use(
    http.post(`${api}/auth/sign-in`, () => {
      signedIn();
      return new HttpResponse(null, { status: 200 });
    }),
  );
  await user.click(
    screen.getByRole("link", { name: "Use a password instead" }),
  );
  await user.type(
    await screen.findByLabelText("Email address"),
    "ada@example.test",
  );
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "example password",
  );
  await user.click(screen.getByRole("button", { name: /^Sign in$/ }));
  await screen.findByRole("textbox", { name: "Add a Progress Note" });
  expect(calls).toBe(1);
  runtime.queryClient.clear();
});

test.each([201, 401])(
  "a late note response %s cannot affect another request screen",
  async (status) => {
    signedIn();
    const data = tracked(detail());
    let finish!: () => void;
    const second = {
      ...detail(),
      reference: "SR-PLUMB-2",
      title: "Second request",
    };
    server.use(
      http.get(`${api}/service-requests/SR-PLUMB-2`, () =>
        HttpResponse.json(second),
      ),
      http.post(
        `${api}/service-requests/SR-PLUMB-1/progress-notes`,
        async () => {
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
          if (status === 201)
            data.timeline.push({
              type: "progress_note",
              occurredAt: "2026-11-12T11:00:00.000Z",
              actor: data.requester,
              text: "Room open.",
            });
          return HttpResponse.json(data, { status });
        },
      ),
    );
    const { user, runtime } = open("/requests/SR-PLUMB-1");
    await user.type(
      await screen.findByRole("textbox", { name: "Add a Progress Note" }),
      "Room open.",
    );
    await user.click(screen.getByRole("button", { name: "Add Progress Note" }));
    await runtime.router.push("/requests/SR-PLUMB-2");
    await screen.findByRole("heading", { name: "Second request" });
    const field = screen.getByRole("textbox", { name: "Add a Progress Note" });
    await user.type(field, "New draft.");
    finish();
    await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
    expect(runtime.router.currentRoute.value.path).toBe("/requests/SR-PLUMB-2");
    expect((field as HTMLTextAreaElement).value).toBe("New draft.");
    expect(screen.queryByText("Progress Note added.")).toBeNull();
    if (status === 201) {
      let finishRead!: () => void;
      server.use(
        http.get(`${api}/service-requests/SR-PLUMB-1`, async () => {
          await new Promise<void>((resolve) => {
            finishRead = resolve;
          });
          return HttpResponse.json(data);
        }),
      );
      await runtime.router.push("/requests/SR-PLUMB-1");
      await screen.findByText("Room open.");
      await waitFor(() => expect(finishRead).toBeTypeOf("function"));
      finishRead();
      await waitFor(() => expect(runtime.queryClient.isFetching()).toBe(0));
    }
    runtime.queryClient.clear();
  },
);

test.each([false, true])(
  "a delayed note cannot restore Completed after Fixed, including refresh failure: %s",
  async (refreshFails) => {
    signedIn();
    const data = detail("completed");
    let failRefresh = false;
    let finish!: () => void;
    server.use(
      http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
        failRefresh
          ? HttpResponse.json({}, { status: 500 })
          : HttpResponse.json(data),
      ),
      http.post(
        `${api}/service-requests/SR-PLUMB-1/progress-notes`,
        async () => {
          data.timeline.push({
            type: "progress_note",
            occurredAt: "2026-11-12T11:00:00.000Z",
            actor: data.requester,
            text: "Water is running clearly now.",
          });
          const response = HttpResponse.json(data, { status: 201 });
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
          return response;
        },
      ),
      http.post(`${api}/service-requests/SR-PLUMB-1/verify`, () => {
        data.status = "verified";
        return HttpResponse.json(data);
      }),
    );
    const { user, runtime } = open("/requests/SR-PLUMB-1");
    await user.type(
      await screen.findByRole("textbox", { name: "Add a Progress Note" }),
      "Water is running clearly now.",
    );
    await user.click(screen.getByRole("button", { name: "Add Progress Note" }));
    await user.click(screen.getByRole("button", { name: "Fixed" }));
    await screen.findByText("SR-PLUMB-1 is Verified.");
    failRefresh = refreshFails;
    finish();
    await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
    await waitFor(() => expect(runtime.queryClient.isFetching()).toBe(0));
    if (refreshFails) {
      await screen.findByRole("heading", {
        name: "We couldn’t load SR-PLUMB-1",
      });
      failRefresh = false;
      await user.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByRole("heading", { name: "Leaking tap" });
    }
    expect(
      screen.queryByRole("form", { name: "Add a Progress Note" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Fixed" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "Leaking tap" }).textContent,
    ).toContain("Verified");
    await screen.findByText("Water is running clearly now.");
    runtime.queryClient.clear();
  },
);

test.each(["Priority", "corrections"])(
  "a delayed %s response cannot discard a newer Progress Note",
  async (action) => {
    signedIn("administrator");
    withCategories();
    const data = tracked({ ...detail(), priority: "normal" as const });
    let finish!: () => void;
    async function delayedResponse() {
      const response = HttpResponse.json(data);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return response;
    }
    server.use(
      http.get(`${api}/maintenance-officers`, () => HttpResponse.json([])),
      http.put(`${api}/service-requests/SR-PLUMB-1/priority`, () => {
        data.priority = "high";
        return delayedResponse();
      }),
      http.patch(`${api}/service-requests/SR-PLUMB-1`, () => {
        data.location = "Room 101";
        return delayedResponse();
      }),
      http.post(`${api}/service-requests/SR-PLUMB-1/progress-notes`, () => {
        data.timeline.push({
          type: "progress_note",
          occurredAt: "2026-11-12T11:00:00.000Z",
          actor: data.requester,
          text: "The room is open now.",
        });
        return HttpResponse.json(data, { status: 201 });
      }),
    );
    const { user, runtime } = open("/requests/SR-PLUMB-1");
    await screen.findByRole("heading", { name: "Leaking tap" });
    if (action === "Priority") {
      await user.click(screen.getByRole("radio", { name: "High" }));
      await user.click(screen.getByRole("button", { name: "Set Priority" }));
    } else {
      await user.click(
        screen.getByRole("button", {
          name: "Correct Request Category or location",
        }),
      );
      const form = screen.getByRole("form", {
        name: "Correct Request Category or location",
      });
      const field = within(form).getByLabelText("Location");
      await user.clear(field);
      await user.type(field, "Room 101");
      await user.click(
        within(form).getByRole("button", { name: "Save corrections" }),
      );
    }
    await user.type(
      screen.getByRole("textbox", { name: "Add a Progress Note" }),
      "The room is open now.",
    );
    await user.click(screen.getByRole("button", { name: "Add Progress Note" }));
    await screen.findByText("Progress Note added.");
    finish();
    await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
    await waitFor(() => expect(runtime.queryClient.isFetching()).toBe(0));
    expect(
      screen.getByRole("region", { name: "Timeline" }).textContent,
    ).toContain("The room is open now.");
    if (action === "Priority")
      expect(
        (screen.getByRole("radio", { name: "High" }) as HTMLInputElement)
          .checked,
      ).toBe(true);
    else expect(details("Location")).toBe("Room 101");
    runtime.queryClient.clear();
  },
);
