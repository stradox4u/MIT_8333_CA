import { expect, test } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/vue";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { api, open, signedIn, summary, type Role } from "./support";
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
    tracked(detail());
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
          return HttpResponse.json(detail(), { status });
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
    runtime.queryClient.clear();
  },
);
