import { expect, test } from "vitest";
import { screen, waitFor } from "@testing-library/vue";
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
import {
  serviceRequestOptions,
  type Status,
} from "../src/service-requests/api";
function tracked(status: Status = "verified") {
  const data = {
    ...summary("SR-PLUMB-1", "Leaking tap", status),
    description: "The tap keeps dripping.",
    timeline: [],
  };
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json(data),
    ),
  );
}
test("deletion requires reason and explicit confirmation, prevents duplicates, removes cached details and returns to management", async () => {
  signedIn("administrator");
  tracked();
  withCategories();
  withRequests([]);
  let sent: unknown;
  let calls = 0;
  let release!: () => void;
  server.use(
    http.delete(`${api}/service-requests/SR-PLUMB-1`, async ({ request }) => {
      calls++;
      sent = await request.json();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(
    await screen.findByRole("button", { name: "Delete request" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Delete Service Request" }),
  );
  expect(calls).toBe(0);
  await user.type(screen.getByLabelText("Deletion reason"), "Duplicate report");
  await user.click(
    screen.getByRole("button", { name: "Delete Service Request" }),
  );
  expect(calls).toBe(0);
  await user.click(screen.getByRole("checkbox", { name: /I understand/ }));
  await user.click(
    screen.getByRole("button", { name: "Delete Service Request" }),
  );
  await waitFor(() => expect(calls).toBe(1));
  expect(
    screen
      .getByRole("button", { name: "Delete Service Request" })
      .getAttribute("aria-busy"),
  ).toBe("true");
  release();
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.path).toBe("/admin/requests"),
  );
  await waitFor(() =>
    expect(
      runtime.queryClient.getQueryData(
        serviceRequestOptions("SR-PLUMB-1").queryKey,
      ),
    ).toBeUndefined(),
  );
  expect(sent).toEqual({ reason: "Duplicate report" });
  expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  runtime.queryClient.clear();
});
test.each([
  "submitted",
  "assigned",
  "in_progress",
  "completed",
  "verified",
  "cancelled",
] as const)("Administrator can delete %s requests", async (status) => {
  signedIn("administrator");
  tracked(status);
  const { runtime } = open("/requests/SR-PLUMB-1");
  await screen.findByRole("button", { name: "Delete request" });
  runtime.queryClient.clear();
});
test("deletion failures preserve the reason for retry", async () => {
  signedIn("administrator");
  tracked();
  server.use(
    http.delete(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json(
        {
          issues: [
            { path: ["reason"], message: "Explain why this is a duplicate." },
          ],
        },
        { status: 400 },
      ),
    ),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(
    await screen.findByRole("button", { name: "Delete request" }),
  );
  await user.type(screen.getByLabelText("Deletion reason"), "Duplicate report");
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Delete Service Request" }),
  );
  await screen.findByText("Explain why this is a duplicate.");
  expect(
    (screen.getByLabelText("Deletion reason") as HTMLTextAreaElement).value,
  ).toBe("Duplicate report");
  runtime.queryClient.clear();
});
test("a Requester cannot delete a Service Request", async () => {
  signedIn();
  tracked("submitted");
  const { runtime } = open("/requests/SR-PLUMB-1");
  await screen.findByRole("heading", { name: "Leaking tap" });
  expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  await screen.findByRole("button", { name: "Cancel request" });
  runtime.queryClient.clear();
});
test("a late deletion success reconciles cache without navigating a departed screen", async () => {
  signedIn("administrator");
  tracked();
  withRequests([]);
  let release!: () => void;
  server.use(
    http.delete(`${api}/service-requests/SR-PLUMB-1`, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(
    await screen.findByRole("button", { name: "Delete request" }),
  );
  await user.type(screen.getByLabelText("Deletion reason"), "Duplicate report");
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Delete Service Request" }),
  );
  await waitFor(() => expect(release).toBeTypeOf("function"));
  await runtime.router.push("/requests");
  release();
  await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
  expect(runtime.router.currentRoute.value.path).toBe("/requests");
  expect(
    runtime.queryClient.getQueryData(
      serviceRequestOptions("SR-PLUMB-1").queryKey,
    ),
  ).toBeUndefined();
  runtime.queryClient.clear();
});
test("a deletion response for a previous identity does not navigate or show its success notice", async () => {
  signedIn("administrator");
  tracked();
  let release!: () => void;
  server.use(
    http.delete(`${api}/service-requests/SR-PLUMB-1`, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(
    await screen.findByRole("button", { name: "Delete request" }),
  );
  await user.type(screen.getByLabelText("Deletion reason"), "Duplicate report");
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Delete Service Request" }),
  );
  await waitFor(() => expect(release).toBeTypeOf("function"));
  runtime.queryClient.setQueryData(["auth", "me"], {
    id: "another",
    role: "student",
    signUpComplete: true,
  });
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json({}, { status: 404 }),
    ),
  );
  release();
  await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
  expect(runtime.router.currentRoute.value.path).toBe("/requests/SR-PLUMB-1");
  expect(screen.queryByText(/deleted\. The Requester/)).toBeNull();
  await screen.findByRole("heading", { name: "We can’t find SR-PLUMB-1" });
  runtime.queryClient.clear();
});
test.each([401, 403])(
  "a stale deletion %s cannot expire or redirect the current identity",
  async (status) => {
    signedIn("administrator");
    tracked();
    let release!: () => void;
    server.use(
      http.delete(`${api}/service-requests/SR-PLUMB-1`, async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json(
          { message: "Old identity refused" },
          { status },
        );
      }),
    );
    const { user, runtime } = open("/requests/SR-PLUMB-1");
    await user.click(
      await screen.findByRole("button", { name: "Delete request" }),
    );
    await user.type(
      screen.getByLabelText("Deletion reason"),
      "Duplicate report",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Delete Service Request" }),
    );
    await waitFor(() => expect(release).toBeTypeOf("function"));
    runtime.queryClient.setQueryData(["auth", "me"], {
      id: "new-admin",
      role: "administrator",
      signUpComplete: true,
    });
    release();
    await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
    expect(runtime.router.currentRoute.value.path).toBe("/requests/SR-PLUMB-1");
    expect(runtime.queryClient.getQueryData(["auth", "me"])).toMatchObject({
      id: "new-admin",
    });
    expect(screen.queryByText("Old identity refused")).toBeNull();
    runtime.queryClient.clear();
  },
);
