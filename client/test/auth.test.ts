import { expect, test } from "vitest";
import { render, screen } from "@testing-library/vue";
import { createMemoryHistory } from "vue-router";
import { http, HttpResponse } from "msw";
import App from "../src/App.vue";
import { createClientRuntime } from "../src/app";
import { server } from "./setup";
import userEvent from "@testing-library/user-event";
import { waitFor, within } from "@testing-library/vue";
import { meKey } from "../src/auth/identity";
import { useUiStore } from "../src/stores/ui";

test("confirmed erasure clears old private data even when its response arrives after departure", async () => {
  let erased = false;
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      erased
        ? new HttpResponse(null, { status: 401 })
        : HttpResponse.json({
            id: "student",
            email: "ada@example.test",
            firstName: "Ada",
            lastName: "Okafor",
            role: "student",
            signUpComplete: true,
            hasPassword: false,
          }),
    ),
    http.delete("http://localhost:5173/api/me", async () => {
      erased = true;
      started();
      await pending;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/account/settings");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Erase my account" }),
  );
  await user.click(screen.getByRole("checkbox", { name: /I understand/ }));
  await user.click(
    screen.getByRole("button", { name: "Erase my account permanently" }),
  );
  await waiting;
  await user.click(screen.getByRole("link", { name: "Dashboard" }));
  await screen.findByRole("heading", { name: "Your campus workspace" });
  release();
  await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
  expect(runtime.queryClient.getQueryData(meKey)).not.toMatchObject({
    id: "student",
  });
  await screen.findByRole("heading", { name: "Welcome back." });
  runtime.queryClient.clear();
});

test("an identity retry cannot override Back after the connection screen is abandoned", async () => {
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  server.use(
    http.get("http://localhost:5173/api/auth/me", async () => {
      started();
      await pending;
      return new HttpResponse(null, { status: 401 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/check-email");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  await screen.findByRole("heading", { name: "Check your inbox." });
  useUiStore(runtime.pinia).retryTarget = "/dashboard";
  await runtime.router.push("/connection");
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Try again" }));
  await waiting;
  runtime.router.back();
  await screen.findByRole("heading", { name: "Check your inbox." });
  release();
  await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
  expect(runtime.router.currentRoute.value.path).toBe("/check-email");
  runtime.queryClient.clear();
});

test("leaving settings during its identity preflight prevents a later erasure request", async () => {
  let preflight = false;
  let started!: () => void;
  let release!: () => void;
  let erasures = 0;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get("http://localhost:5173/api/auth/me", async () => {
      if (preflight) {
        started();
        await pending;
      }
      return HttpResponse.json({
        id: "student",
        email: "ada@example.test",
        firstName: "Ada",
        lastName: "Okafor",
        role: "student",
        signUpComplete: true,
        hasPassword: false,
      });
    }),
    http.delete("http://localhost:5173/api/me", () => {
      erasures++;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/account/settings");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Erase my account" }),
  );
  await user.click(screen.getByRole("checkbox", { name: /I understand/ }));
  preflight = true;
  await user.click(
    screen.getByRole("button", { name: "Erase my account permanently" }),
  );
  await waiting;
  await user.click(screen.getByRole("link", { name: "Dashboard" }));
  await screen.findByRole("heading", { name: "Your campus workspace" });
  release();
  await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
  expect(erasures).toBe(0);
  expect(runtime.router.currentRoute.value.path).toBe("/dashboard");
  runtime.queryClient.clear();
});

test("an abandoned link request cannot redirect the active password form", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get(
      "http://localhost:5173/api/auth/me",
      () => new HttpResponse(null, { status: 401 }),
    ),
    http.post("http://localhost:5173/api/auth/sign-in-link", async () => {
      await pending;
      return new HttpResponse(null, { status: 202 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/sign-in");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText("Email address"),
    "ada@example.test",
  );
  await user.click(
    screen.getByRole("button", { name: "Email me a Sign-in Link" }),
  );
  await user.click(
    screen.getByRole("link", { name: "Use a password instead" }),
  );
  await screen.findByLabelText("Password", { exact: true });
  release();
  await waitFor(() => expect(runtime.queryClient.isMutating()).toBe(0));
  expect(runtime.router.currentRoute.value.path).toBe("/sign-in/password");
  runtime.queryClient.clear();
});

test("inbox confirmation uses the submitted recipient even if the field changes while pending", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get(
      "http://localhost:5173/api/auth/me",
      () => new HttpResponse(null, { status: 401 }),
    ),
    http.post("http://localhost:5173/api/auth/sign-in-link", async () => {
      await pending;
      return new HttpResponse(null, { status: 202 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/sign-in");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  const input = await screen.findByLabelText("Email address");
  await user.type(input, "ada@example.test");
  await user.click(
    screen.getByRole("button", { name: "Email me a Sign-in Link" }),
  );
  await user.clear(input);
  await user.type(input, "grace@example.test");
  release();
  await screen.findByRole("heading", { name: "Check your inbox." });
  expect(screen.getByText("ada@example.test")).toBeTruthy();
  expect(screen.queryByText("grace@example.test")).toBeNull();
  runtime.queryClient.clear();
});

test("a session expiring during Finish sign-up clears pending identity and returns to Sign in", async () => {
  let expired = false;
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      expired
        ? new HttpResponse(null, { status: 401 })
        : HttpResponse.json({
            id: "pending",
            email: "ada@example.test",
            firstName: "Ada",
            lastName: "Okafor",
            role: null,
            signUpComplete: false,
            hasPassword: false,
          }),
    ),
    http.post("http://localhost:5173/api/auth/sign-up/complete", () => {
      expired = true;
      return new HttpResponse(null, { status: 401 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/finish-sign-up");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("radio", { name: /Student/ }));
  await user.click(screen.getByRole("button", { name: "Finish sign-up" }));
  await screen.findByRole("heading", { name: "Welcome back." });
  expect(runtime.queryClient.getQueryData(meKey)).toBeNull();
  runtime.queryClient.clear();
});

test("structured server issues attach to known fields and keep unknown paths beneath the action", async () => {
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      HttpResponse.json({
        id: "pending",
        email: "ada@example.test",
        firstName: "Ada",
        lastName: "Okafor",
        role: null,
        signUpComplete: false,
        hasPassword: false,
      }),
    ),
    http.post("http://localhost:5173/api/auth/sign-up/complete", () =>
      HttpResponse.json(
        {
          statusCode: 400,
          error: "Bad Request",
          message: ["legacy text"],
          issues: [
            { path: ["firstName"], message: "Please check this name." },
            { path: [], message: "This profile could not be saved." },
          ],
        },
        { status: 400 },
      ),
    ),
  );
  const history = createMemoryHistory();
  history.push("/finish-sign-up");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("radio", { name: /Student/ }));
  expect(screen.queryByText("Please check this name.")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Finish sign-up" }));
  const message = await screen.findByText("Please check this name.");
  expect(
    screen.getByLabelText("First name").getAttribute("aria-describedby"),
  ).toBe(message.id);
  expect(
    message.closest(".field")?.contains(screen.getByLabelText("First name")),
  ).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe(
    "This profile could not be saved.",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Finish sign-up",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  runtime.queryClient.clear();
});

test.each([
  {
    label: "a unique hint in another tab",
    hints: [
      {
        id: "tab-a",
        path: "/account/settings#sessions",
        expiresAt: Date.now() + 600_000,
      },
    ],
    path: "/account/settings",
  },
  {
    label: "ambiguous hints",
    hints: [
      {
        id: "a",
        path: "/account/settings#erase",
        expiresAt: Date.now() + 600_000,
      },
      {
        id: "b",
        path: "/account/settings#password",
        expiresAt: Date.now() + 600_000,
      },
    ],
    path: "/dashboard",
  },
  {
    label: "an external destination",
    hints: [
      { id: "a", path: "//evil.example", expiresAt: Date.now() + 600_000 },
    ],
    path: "/dashboard",
  },
  {
    label: "an expired hint",
    hints: [{ id: "a", path: "/account/settings", expiresAt: Date.now() - 1 }],
    path: "/dashboard",
  },
  {
    label: "a credential-bearing hint",
    hints: [
      {
        id: "a",
        path: "/account/settings?token=secret",
        expiresAt: Date.now() + 600_000,
      },
    ],
    path: "/dashboard",
  },
])("authentication handles $label safely", async ({ hints, path }) => {
  localStorage.setItem("mit8333.auth-navigation.v1", JSON.stringify(hints));
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      HttpResponse.json({
        id: "student",
        email: "ada@example.test",
        firstName: "Ada",
        lastName: "Okafor",
        role: "student",
        signUpComplete: true,
        hasPassword: false,
      }),
    ),
  );
  const history = createMemoryHistory();
  history.push("/auth/complete");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  await screen.findByRole("heading", {
    name: path === "/dashboard" ? "Your campus workspace" : "Account settings",
  });
  expect(runtime.router.currentRoute.value.path).toBe(path);
  runtime.queryClient.clear();
});

test("an unfinished User must finish sign-up before reaching Account settings", async () => {
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      HttpResponse.json({
        id: "pending-user",
        email: "ada@example.test",
        firstName: null,
        lastName: null,
        role: null,
        signUpComplete: false,
        hasPassword: false,
      }),
    ),
  );
  const runtime = createClientRuntime(createMemoryHistory());
  render(App, { global: { plugins: [runtime.plugin] } });
  await runtime.router.push("/account/settings");
  await screen.findByRole("heading", { name: "Finish sign-up." });
  expect(runtime.router.currentRoute.value.path).toBe("/finish-sign-up");
  expect(
    screen.queryByRole("heading", { name: "Account settings" }),
  ).toBeNull();
  runtime.queryClient.clear();
});

test("passwordless reauthentication never resumes erasure for a different User", async () => {
  let otherUser = false;
  let erasureAttempts = 0;
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      HttpResponse.json({
        id: otherUser ? "other-user" : "original-user",
        email: otherUser ? "grace@example.test" : "ada@example.test",
        firstName: otherUser ? "Grace" : "Ada",
        lastName: "Okafor",
        role: "student",
        signUpComplete: true,
        hasPassword: false,
      }),
    ),
    http.delete("http://localhost:5173/api/me", () => {
      erasureAttempts++;
      return HttpResponse.json(
        { error: "fresh_authentication_required", message: "Sign in again" },
        { status: 403 },
      );
    }),
    http.post(
      "http://localhost:5173/api/auth/sign-in-link",
      () => new HttpResponse(null, { status: 202 }),
    ),
    http.post("http://localhost:5173/api/auth/sign-in-link/consume", () => {
      otherUser = true;
      return new HttpResponse(null, { status: 200 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/account/settings");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Erase my account" }),
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "I understand that my Service Requests and their text will remain.",
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Erase my account permanently" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Email me a Sign-in Link" }),
  );
  await screen.findByRole("heading", { name: "Check your inbox." });
  await runtime.router.push("/sign-in/link?token=other-identity");
  await user.click(
    await screen.findByRole("button", { name: "Continue signing in" }),
  );
  await screen.findByRole("heading", { name: "Your campus workspace" });
  await screen.findByText(
    "You signed in with a different email. Your previous change was not made.",
  );
  expect(erasureAttempts).toBe(1);
  expect(
    screen.queryByRole("button", { name: "Erase my account permanently" }),
  ).toBeNull();
  runtime.queryClient.clear();
});

test("erasure requires its impact acknowledgement and final confirmation before any request", async () => {
  let signedIn = true;
  let erasures = 0;
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      signedIn
        ? HttpResponse.json({
            id: "student",
            email: "ada@example.test",
            firstName: "Ada",
            lastName: "Okafor",
            role: "student",
            signUpComplete: true,
            hasPassword: false,
          })
        : new HttpResponse(null, { status: 401 }),
    ),
    http.delete("http://localhost:5173/api/me", async ({ request }) => {
      expect(await request.json()).toEqual({});
      erasures++;
      signedIn = false;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/account/settings");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Erase my account" }),
  );
  expect(erasures).toBe(0);
  await user.click(
    screen.getByRole("button", { name: "Erase my account permanently" }),
  );
  await screen.findByText("Confirm that you understand what will remain.");
  expect(erasures).toBe(0);
  await user.click(
    screen.getByRole("checkbox", {
      name: "I understand that my Service Requests and their text will remain.",
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Erase my account permanently" }),
  );
  await screen.findByRole("heading", { name: "Welcome back." });
  expect(erasures).toBe(1);
  runtime.queryClient.clear();
});

test("individual sessions end immediately but signing out everywhere confirms the current session too", async () => {
  let signedIn = true;
  let revoked = false;
  let allSignouts = 0;
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      signedIn
        ? HttpResponse.json({
            id: "student",
            email: "ada@example.test",
            firstName: "Ada",
            lastName: "Okafor",
            role: "student",
            signUpComplete: true,
            hasPassword: false,
          })
        : new HttpResponse(null, { status: 401 }),
    ),
    http.get("http://localhost:5173/api/auth/sessions", () =>
      HttpResponse.json([
        {
          id: "current",
          userAgent: "Chrome",
          signedInAt: "2026-11-12T09:00:00Z",
          lastActiveAt: "2026-11-12T09:00:00Z",
          current: true,
        },
        ...(!revoked
          ? [
              {
                id: "other",
                userAgent: "Firefox on Windows",
                signedInAt: "2026-11-12T08:00:00Z",
                lastActiveAt: "2026-11-12T08:00:00Z",
                current: false,
              },
            ]
          : []),
      ]),
    ),
    http.delete("http://localhost:5173/api/auth/sessions/other", () => {
      revoked = true;
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("http://localhost:5173/api/auth/sign-out-everywhere", () => {
      allSignouts++;
      signedIn = false;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/account/settings");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", {
      name: "End session for Firefox on Windows",
    }),
  );
  await screen.findByText("Session ended.");
  expect(revoked).toBe(true);
  await user.click(screen.getByRole("button", { name: "Sign out everywhere" }));
  const confirmation = screen.getByRole("group", {
    name: "Confirm sign out everywhere",
  });
  expect(
    within(confirmation).getByText(/including the one you’re using now/),
  ).toBeTruthy();
  expect(allSignouts).toBe(0);
  await user.click(
    within(confirmation).getByRole("button", { name: "Sign out everywhere" }),
  );
  await screen.findByRole("heading", { name: "Welcome back." });
  expect(allSignouts).toBe(1);
  runtime.queryClient.clear();
});

test("password settings ask for current password only when required and show server errors below that field", async () => {
  let changes = 0;
  let sessions = [
    {
      id: "current",
      userAgent: "Chrome",
      signedInAt: "2026-11-12T09:00:00Z",
      lastActiveAt: "2026-11-12T09:00:00Z",
      current: true,
    },
    {
      id: "other",
      userAgent: "Firefox on Windows",
      signedInAt: "2026-11-12T08:00:00Z",
      lastActiveAt: "2026-11-12T08:00:00Z",
      current: false,
    },
  ];
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      HttpResponse.json({
        id: "student",
        email: "ada@example.test",
        firstName: "Ada",
        lastName: "Okafor",
        role: "student",
        signUpComplete: true,
        hasPassword: true,
      }),
    ),
    http.get("http://localhost:5173/api/auth/sessions", () =>
      HttpResponse.json(sessions),
    ),
    http.put("http://localhost:5173/api/auth/password", async ({ request }) => {
      const body = await request.json();
      changes++;
      if (changes === 1) {
        expect(body).toEqual({ newPassword: "New password 123!" });
        return HttpResponse.json(
          { error: "fresh_authentication_required", message: "Sign in again" },
          { status: 403 },
        );
      }
      if (changes === 2)
        return HttpResponse.json(
          {
            error: "wrong_current_password",
            message: "The current password is wrong",
          },
          { status: 403 },
        );
      expect(body).toEqual({
        newPassword: "New password 123!",
        currentPassword: "correct secret",
      });
      sessions = sessions.filter((session) => session.current);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/account/settings");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Account settings" });
  expect(screen.queryByLabelText("Current password")).toBeNull();
  await user.type(
    screen.getByLabelText("New password", { exact: true }),
    "New password 123!",
  );
  await user.type(
    screen.getByLabelText("Confirm new password"),
    "New password 123!",
  );
  await user.click(screen.getByRole("button", { name: "Change password" }));
  await user.type(
    await screen.findByLabelText("Current password"),
    "wrong secret",
  );
  await user.click(screen.getByRole("button", { name: "Change password" }));
  await screen.findByText("The current password is wrong.");
  expect(
    screen.getByLabelText("Current password").getAttribute("aria-invalid"),
  ).toBe("true");
  await user.clear(screen.getByLabelText("Current password"));
  await user.type(screen.getByLabelText("Current password"), "correct secret");
  await user.click(screen.getByRole("button", { name: "Change password" }));
  await screen.findByText("Password saved. Your other sessions have ended.");
  await waitFor(() =>
    expect(screen.queryByText("Firefox on Windows")).toBeNull(),
  );
  expect(
    (screen.getByLabelText("New password", { exact: true }) as HTMLInputElement)
      .value,
  ).toBe("");
  runtime.queryClient.clear();
});

test("password sign-in accepts an existing password, shows generic rejection inline and allows retry", async () => {
  let signedIn = false;
  let attempts = 0;
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      signedIn
        ? HttpResponse.json({
            id: "student",
            email: "ada@example.test",
            firstName: "Ada",
            lastName: "Okafor",
            role: "student",
            signUpComplete: true,
            hasPassword: true,
          })
        : new HttpResponse(null, { status: 401 }),
    ),
    http.post("http://localhost:5173/api/auth/sign-in", async ({ request }) => {
      expect(await request.json()).toEqual({
        email: "ada@example.test",
        password: "old pass",
        keepSignedIn: false,
      });
      if (++attempts === 1)
        return HttpResponse.json(
          {
            statusCode: 401,
            error: "Unauthorized",
            message: "Wrong email or password",
          },
          { status: 401 },
        );
      signedIn = true;
      return new HttpResponse(null, { status: 200 });
    }),
  );
  const history = createMemoryHistory();
  history.push("/sign-in/password");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText("Email address"),
    "ada@example.test",
  );
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "old pass",
  );
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Wrong email or password.");
  expect(
    screen
      .getByLabelText("Password", { exact: true })
      .getAttribute("aria-invalid"),
  ).toBe("true");
  expect(
    (screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Your campus workspace" });
  runtime.queryClient.clear();
});

test("sign-up collects names and Role together, then returns to the original protected page", async () => {
  let phase: "guest" | "pending" | "complete" = "guest";
  let submitted: unknown;
  const account = {
    id: "new-user",
    email: "ada@example.test",
    firstName: null as string | null,
    lastName: null as string | null,
    role: null as string | null,
    signUpComplete: false,
    hasPassword: false,
  };
  server.use(
    http.get("http://localhost:5173/api/auth/me", () =>
      phase === "guest"
        ? new HttpResponse(null, { status: 401 })
        : HttpResponse.json(account),
    ),
    http.post(
      "http://localhost:5173/api/auth/sign-in-link",
      () => new HttpResponse(null, { status: 202 }),
    ),
    http.post("http://localhost:5173/api/auth/sign-in-link/consume", () => {
      phase = "pending";
      return new HttpResponse(null, { status: 200 });
    }),
    http.post(
      "http://localhost:5173/api/auth/sign-up/complete",
      async ({ request }) => {
        submitted = await request.json();
        phase = "complete";
        Object.assign(account, {
          firstName: "Alexandria-Margaret",
          lastName: "Okafor-Williams",
          role: "staff",
          signUpComplete: true,
        });
        return new HttpResponse(null, { status: 200 });
      },
    ),
  );
  const history = createMemoryHistory();
  history.push("/account/settings");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("link", { name: "Sign up" }));
  await user.type(screen.getByLabelText("Email address"), "ada@example.test");
  await user.click(
    screen.getByRole("button", { name: "Email me a Sign-in Link" }),
  );
  await screen.findByRole("heading", { name: "Check your inbox." });
  await runtime.router.push("/sign-in/link?token=onboarding-proof");
  await user.click(
    await screen.findByRole("button", { name: "Continue signing in" }),
  );
  await screen.findByRole("heading", { name: "Finish sign-up." });
  await user.type(screen.getByLabelText("First name"), " Alexandria-Margaret ");
  await user.type(screen.getByLabelText("Last name"), "Okafor-Williams");
  await user.click(screen.getByRole("radio", { name: /Staff/ }));
  await user.click(screen.getByRole("button", { name: "Finish sign-up" }));
  await screen.findByRole("heading", { name: "Account settings" });
  expect(submitted).toEqual({
    firstName: "Alexandria-Margaret",
    lastName: "Okafor-Williams",
    role: "staff",
  });
  expect(runtime.router.currentRoute.value.path).toBe("/account/settings");
  runtime.queryClient.clear();
});

test("opening a Sign-in Link never consumes it, and a failed identity read retries only that read", async () => {
  let consumes = 0;
  let identityReads = 0;
  server.use(
    http.post(
      "http://localhost:5173/api/auth/sign-in-link/consume",
      async ({ request }) => {
        expect(await request.json()).toEqual({ token: "single-use-proof" });
        consumes++;
        return new HttpResponse(null, { status: 200 });
      },
    ),
    http.get("http://localhost:5173/api/auth/me", () => {
      identityReads++;
      return identityReads === 1
        ? new HttpResponse(null, { status: 503 })
        : HttpResponse.json({
            id: "pending-user",
            email: "ada@example.test",
            firstName: null,
            lastName: null,
            role: null,
            signUpComplete: false,
            hasPassword: false,
          });
    }),
  );
  const history = createMemoryHistory();
  history.push("/sign-in/link?token=single-use-proof");
  const runtime = createClientRuntime(history);
  render(App, { global: { plugins: [runtime.plugin] } });
  const user = userEvent.setup();
  const confirm = await screen.findByRole("button", {
    name: "Continue signing in",
  });
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.query.token).toBeUndefined(),
  );
  expect(consumes).toBe(0);
  await user.click(confirm);
  await screen.findByRole("heading", {
    name: "We couldn’t check your sign-in.",
  });
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Finish sign-up." });
  expect(consumes).toBe(1);
  runtime.queryClient.clear();
});

test("Sign-in Link submission shows blur errors, prevents duplicates and settles at Check inbox", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const requests: unknown[] = [];
  server.use(
    http.get(
      "http://localhost:5173/api/auth/me",
      () => new HttpResponse(null, { status: 401 }),
    ),
    http.post(
      "http://localhost:5173/api/auth/sign-in-link",
      async ({ request }) => {
        requests.push(await request.json());
        await pending;
        return new HttpResponse(null, { status: 202 });
      },
    ),
  );
  const runtime = createClientRuntime(createMemoryHistory());
  render(App, { global: { plugins: [runtime.plugin] } });
  await runtime.router.push("/sign-in");
  const user = userEvent.setup();
  const email = await screen.findByLabelText("Email address");
  await user.click(email);
  await user.tab();
  expect(await screen.findByText("Enter your email address.")).toBeTruthy();
  await user.type(email, "ada@example.test");
  const submit = screen.getByRole("button", {
    name: "Email me a Sign-in Link",
  });
  await user.click(submit);
  await waitFor(() =>
    expect((submit as HTMLButtonElement).disabled).toBe(true),
  );
  expect(submit.getAttribute("aria-busy")).toBe("true");
  await user.click(submit);
  finish();
  await screen.findByRole("heading", { name: "Check your inbox." });
  expect(requests).toEqual([
    { email: "ada@example.test", keepSignedIn: false },
  ]);
  expect(
    screen
      .getByRole("button", { name: "Send another link" })
      .hasAttribute("disabled"),
  ).toBe(false);
  runtime.queryClient.clear();
});
