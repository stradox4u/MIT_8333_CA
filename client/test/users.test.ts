import { expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/vue";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { api, open, signedIn } from "./support";
import type { ManagedUser } from "../src/users-api";
const person = (
  id: string,
  status: ManagedUser["status"] = "active",
): ManagedUser => ({
  id,
  name: `${id} User`,
  firstName: id,
  lastName: "User",
  email: `${id}@example.test`,
  role: "staff",
  status,
  createdAt: "2026-11-12T09:00:00Z",
});
function withUsers() {
  signedIn("administrator");
  const users = [
    person("ada"),
    person("other"),
    person("pending", "invited"),
    person("inactive", "deactivated"),
    person("erased", "erased"),
  ];
  server.use(http.get(`${api}/users`, () => HttpResponse.json(users)));
  return users;
}
test("Users navigation lists account details, keeps own row read only and expands one panel", async () => {
  withUsers();
  const { user, runtime } = open("/admin/users");
  await screen.findByText("ada User");
  const own = screen.getByText("ada User").closest("article")!;
  expect(within(own).queryByRole("button")).toBeNull();
  expect(screen.getByText("Pending Invitation")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Manage erased User" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Manage other User" }));
  await screen.findByRole("form", { name: "Manage User" });
  await user.click(screen.getByRole("button", { name: "Manage pending User" }));
  expect(screen.getAllByRole("form", { name: "Manage User" })).toHaveLength(1);
  expect(screen.getByLabelText("Invitation email")).toBeTruthy();
  runtime.queryClient.clear();
});
test("invitation validates names/email, maps server errors, prevents duplicates and refreshes the list", async () => {
  const users = withUsers();
  let calls = 0;
  let release!: () => void;
  server.use(
    http.post(`${api}/users`, async ({ request }) => {
      const body = (await request.json()) as Record<string, string>;
      calls++;
      if (calls === 1)
        return HttpResponse.json(
          { issues: [{ path: ["email"], message: "Choose another address." }] },
          { status: 400 },
        );
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      users.push({
        ...person("new"),
        ...body,
        name: `${body.firstName} ${body.lastName}`,
        role: body.role as ManagedUser["role"],
        status: "invited",
      });
      return HttpResponse.json(users.at(-1), { status: 201 });
    }),
  );
  const { user, runtime } = open("/admin/users");
  const invite = await screen.findByRole("form", { name: "Invite a User" });
  await user.click(
    within(invite).getByRole("button", { name: "Send Invitation" }),
  );
  expect(calls).toBe(0);
  await user.type(within(invite).getByLabelText("First name"), "New");
  await user.type(within(invite).getByLabelText("Last name"), "Person");
  await user.type(within(invite).getByLabelText("Email"), "new@example.test");
  await user.click(
    within(invite).getByRole("button", { name: "Send Invitation" }),
  );
  await screen.findByText("Choose another address.");
  await user.type(within(invite).getByLabelText("Email"), "x");
  await user.click(
    within(invite).getByRole("button", { name: "Send Invitation" }),
  );
  await waitFor(() => expect(calls).toBe(2));
  expect(
    within(invite)
      .getByRole("button", { name: "Send Invitation" })
      .getAttribute("aria-busy"),
  ).toBe("true");
  release();
  await screen.findByText("Invitation sent.");
  await screen.findByText("New Person");
  runtime.queryClient.clear();
});
test.each([
  ["other", "Deactivate", "Confirm deactivation", "deactivate", "deactivated"],
  ["inactive", "Reactivate", "Confirm reactivation", "reactivate", "active"],
  ["other", "Erase personal data", "Confirm erasure", "erase", "erased"],
] as const)(
  "%s %s requires confirmation and reconciles account status",
  async (id, label, confirm, endpoint, status) => {
    const users = withUsers();
    let calls = 0;
    server.use(
      http.post(`${api}/users/${id}/${endpoint}`, () => {
        calls++;
        users.find((item) => item.id === id)!.status = status;
        return HttpResponse.json(users.find((item) => item.id === id));
      }),
    );
    const { user, runtime } = open("/admin/users");
    await user.click(
      await screen.findByRole("button", { name: `Manage ${id} User` }),
    );
    await user.click(screen.getByRole("button", { name: label }));
    expect(calls).toBe(0);
    await user.click(screen.getByRole("button", { name: confirm }));
    await waitFor(() => expect(calls).toBe(1));
    await waitFor(() =>
      expect(screen.queryByRole("form", { name: "Manage User" })).toBeNull(),
    );
    runtime.queryClient.clear();
  },
);
test("Role change preserves server last-Administrator feedback and allows retry", async () => {
  withUsers();
  let sent: unknown;
  server.use(
    http.patch(`${api}/users/other/role`, async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(
        {
          message: "The last active Administrator can’t be given another Role",
        },
        { status: 409 },
      );
    }),
  );
  const { user, runtime } = open("/admin/users");
  await user.click(
    await screen.findByRole("button", { name: "Manage other User" }),
  );
  await user.selectOptions(
    screen.getByLabelText("Role", { exact: true }),
    "administrator",
  );
  await user.click(screen.getByRole("button", { name: "Change Role" }));
  await user.click(screen.getByRole("button", { name: "Confirm Role change" }));
  await screen.findByText(
    "The last active Administrator can’t be given another Role",
  );
  expect(sent).toEqual({ role: "administrator" });
  expect(
    screen
      .getByRole("button", { name: "Confirm Role change" })
      .hasAttribute("disabled"),
  ).toBe(false);
  runtime.queryClient.clear();
});
test("pending Invitations can be resent and corrected with confirmation", async () => {
  const users = withUsers();
  let resends = 0;
  let corrected: unknown;
  server.use(
    http.post(`${api}/users/pending/invitation`, () => {
      resends++;
      return new HttpResponse(null, { status: 202 });
    }),
    http.patch(`${api}/users/pending/email`, async ({ request }) => {
      corrected = await request.json();
      users[2]!.email = "correct@example.test";
      return HttpResponse.json(users[2]);
    }),
  );
  const { user, runtime } = open("/admin/users");
  await user.click(
    await screen.findByRole("button", { name: "Manage pending User" }),
  );
  await user.click(screen.getByRole("button", { name: "Resend Invitation" }));
  await waitFor(() => expect(resends).toBe(1));
  await waitFor(() =>
    expect(screen.queryByRole("form", { name: "Manage User" })).toBeNull(),
  );
  await user.click(screen.getByRole("button", { name: "Manage pending User" }));
  await user.clear(screen.getByLabelText("Invitation email"));
  await user.type(
    screen.getByLabelText("Invitation email"),
    "correct@example.test",
  );
  await user.click(
    screen.getByRole("button", { name: "Correct email and resend" }),
  );
  expect(corrected).toBeUndefined();
  await user.click(
    screen.getByRole("button", { name: "Confirm email correction" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("region", { name: "Users list" }).textContent,
    ).toContain("correct@example.test"),
  );
  expect(corrected).toEqual({ email: "correct@example.test" });
  runtime.queryClient.clear();
});
test("non-Administrators cannot enter Users management", async () => {
  signedIn("student");
  const { runtime } = open("/admin/users");
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.path).toBe("/dashboard"),
  );
  expect(screen.queryByRole("heading", { name: "Users" })).toBeNull();
  runtime.queryClient.clear();
});
test("a delayed permission refresh cannot redirect a departed Users page", async () => {
  withUsers();
  let release!: () => void;
  let refreshing = false;
  server.use(
    http.post(`${api}/users/other/deactivate`, () =>
      HttpResponse.json({ message: "Forbidden" }, { status: 403 }),
    ),
  );
  const { user, runtime } = open("/admin/users");
  await user.click(
    await screen.findByRole("button", { name: "Manage other User" }),
  );
  server.use(
    http.get(`${api}/auth/me`, async () => {
      refreshing = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return HttpResponse.json({
        id: "ada",
        firstName: "Ada",
        lastName: "Okafor",
        email: "ada@example.test",
        role: "staff",
        signUpComplete: true,
        hasPassword: false,
      });
    }),
  );
  await user.click(screen.getByRole("button", { name: "Deactivate" }));
  await user.click(
    screen.getByRole("button", { name: "Confirm deactivation" }),
  );
  await waitFor(() => expect(refreshing).toBe(true));
  await runtime.router.push("/connection");
  release();
  await waitFor(() => expect(runtime.queryClient.isFetching()).toBe(0));
  expect(runtime.router.currentRoute.value.path).toBe("/connection");
  runtime.queryClient.clear();
});
test.each([401, 403])(
  "a stale %s from User management cannot expire or redirect the current identity",
  async (status) => {
    withUsers();
    let release!: () => void;
    server.use(
      http.post(`${api}/users/other/deactivate`, async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json(
          { message: "Old identity refused" },
          { status },
        );
      }),
    );
    const { user, runtime } = open("/admin/users");
    await user.click(
      await screen.findByRole("button", { name: "Manage other User" }),
    );
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await user.click(
      screen.getByRole("button", { name: "Confirm deactivation" }),
    );
    await waitFor(() => expect(release).toBeTypeOf("function"));
    runtime.queryClient.setQueryData(["auth", "me"], {
      id: "new-admin",
      role: "administrator",
      signUpComplete: true,
    });
    release();
    await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
    expect(runtime.router.currentRoute.value.path).toBe("/admin/users");
    expect(runtime.queryClient.getQueryData(["auth", "me"])).toMatchObject({
      id: "new-admin",
    });
    expect(screen.queryByText("Old identity refused")).toBeNull();
    runtime.queryClient.clear();
  },
);
test("a refused Users read refreshes lost Administrator access", async () => {
  signedIn("administrator");
  server.use(
    http.get(`${api}/users`, () => {
      signedIn("staff");
      return HttpResponse.json({ message: "Forbidden" }, { status: 403 });
    }),
  );
  const { runtime } = open("/admin/users");
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.path).toBe("/dashboard"),
  );
  expect(runtime.queryClient.getQueryData(["auth", "me"])).toMatchObject({
    role: "staff",
  });
  runtime.queryClient.clear();
});
