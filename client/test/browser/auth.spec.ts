import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const controls = "http://127.0.0.1:4175";
const email = "ada@example.test";
const password = "Campus password 123!";

async function mail(request: APIRequestContext, address = email) {
  const response = await request.get(
    `${controls}/mail?email=${encodeURIComponent(address)}`,
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()).link as string;
}
async function requestLink(page: Page, address = email) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(address);
  await page
    .getByRole("button", { name: "Email me a Sign-in Link", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible();
}
async function consumeLink(
  page: Page,
  request: APIRequestContext,
  address = email,
) {
  await page.goto(await mail(request, address));
  await expect(
    page.getByRole("button", { name: "Continue signing in" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/token=/);
  await page.getByRole("button", { name: "Continue signing in" }).click();
}
async function finishSignup(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Finish sign-up." }),
  ).toBeVisible();
  await page.getByLabel("First name").fill("Alexandria-Margaret");
  await page.getByLabel("Last name").fill("Okafor-Williams");
  await page.getByRole("radio", { name: /Student/ }).check();
  await page
    .getByRole("button", { name: "Finish sign-up", exact: true })
    .click();
}
async function signup(page: Page, request: APIRequestContext) {
  await requestLink(page);
  await consumeLink(page, request);
  await finishSignup(page);
  await expect(
    page.getByRole("heading", { name: "Your campus workspace" }),
  ).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${controls}/reset`)).ok()).toBeTruthy();
});

test("signup preserves a protected destination and requires an explicit link confirmation", async ({
  page,
  request,
}) => {
  await page.goto("/account/settings");
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a Sign-in Link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible();
  const link = await mail(request);
  // A scanner's GET cannot authenticate or consume the single-use token.
  expect((await request.get(link)).ok()).toBeTruthy();
  await page.goto(link);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  await page.getByRole("button", { name: "Continue signing in" }).click();
  await expect(
    page.getByRole("heading", { name: "Finish sign-up." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/finish-signup-desktop.png",
    fullPage: true,
  });
  const first = await page.getByLabel("First name").boundingBox();
  const last = await page.getByLabel("Last name").boundingBox();
  expect(first!.x).toBe(last!.x);
  expect(last!.y).toBeGreaterThan(first!.y + first!.height);
  await finishSignup(page);
  await expect(page).toHaveURL(/\/account\/settings$/);
  await expect(
    page.getByRole("heading", { name: "Account settings" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/settings-desktop.png",
    fullPage: true,
  });
});

test("mobile expired links offer replacement and keep the form inside the viewport", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await requestLink(page);
  const expired = await mail(request);
  await request.post(`${controls}/advance`, {
    data: { milliseconds: 16 * 60_000 },
  });
  await page.goto(expired);
  await page.getByRole("button", { name: "Continue signing in" }).click();
  await expect(
    page.getByRole("heading", { name: "This link can’t be used." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send a new link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible();
  await page.goto("/sign-in");
  await page.getByLabel("Email address").clear();
  await page.getByLabel("Email address").blur();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/sign-in-mobile.png",
    fullPage: true,
  });
});

test("password changes require fresh proof when stale and revoke other sessions", async ({
  page,
  request,
  browser,
}) => {
  await signup(page, request);
  await page.goto("/account/settings");
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  await expect(
    page.getByText("Password saved. Your other sessions have ended."),
  ).toBeVisible();
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  async function passwordSignIn() {
    await otherPage.goto("http://127.0.0.1:5173/sign-in/password");
    await otherPage.getByLabel("Email address").fill(email);
    await otherPage.getByLabel("Password", { exact: true }).fill(password);
    await otherPage
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(
      otherPage.getByRole("heading", { name: "Your campus workspace" }),
    ).toBeVisible();
  }
  try {
    await passwordSignIn();
    await page.reload();
    await page.getByRole("button", { name: /^End session for/ }).click();
    await expect(
      page.getByText("Session ended.", { exact: true }),
    ).toBeVisible();
    expect(
      (await other.request.get("http://127.0.0.1:5173/api/auth/me")).status(),
    ).toBe(401);
    await passwordSignIn();
    await request.post(`${controls}/advance`, {
      data: { milliseconds: 11 * 60_000 },
    });
    await page.reload();
    await page
      .getByLabel("New password", { exact: true })
      .fill("Another password 123!");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("Another password 123!");
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await page
      .getByLabel("Current password", { exact: true })
      .fill("wrong password");
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(
      page.getByText("The current password is wrong."),
    ).toBeVisible();
    await page.getByLabel("Current password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(
      page.getByText("Password saved. Your other sessions have ended."),
    ).toBeVisible();
    expect(
      (await other.request.get("http://127.0.0.1:5173/api/auth/me")).status(),
    ).toBe(401);
    await page
      .getByRole("button", { name: "Sign out everywhere", exact: true })
      .click();
    const confirmation = page.getByRole("group", {
      name: "Confirm sign out everywhere",
    });
    await expect(confirmation).toContainText(
      "including the one you’re using now",
    );
    await confirmation
      .getByRole("button", { name: "Sign out everywhere" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  } finally {
    await other.close();
  }
});

test("fresh link authentication returns to erasure with acknowledgement reset", async ({
  page,
  request,
}) => {
  await signup(page, request);
  await request.post(`${controls}/advance`, {
    data: { milliseconds: 11 * 60_000 },
  });
  await page.goto("/account/settings");
  await page
    .getByRole("button", { name: "Erase my account", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I understand/ }).check();
  await page
    .getByRole("button", { name: "Erase my account permanently" })
    .click();
  await page
    .getByRole("button", { name: "Email me a Sign-in Link", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible();
  await consumeLink(page, request);
  await expect(page).toHaveURL(/\/account\/settings#erase$/);
  await expect(
    page.getByRole("checkbox", { name: /I understand/ }),
  ).not.toBeChecked();
  expect((await page.request.get("/api/auth/me")).status()).toBe(200);
  await page.getByRole("checkbox", { name: /I understand/ }).check();
  await page
    .getByRole("button", { name: "Erase my account permanently" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});

test("invited maintenance users skip Finish sign-up after authenticating", async ({
  page,
  request,
}) => {
  const invited = await request.post(`${controls}/invite`, {
    data: {
      email,
      firstName: "Ada",
      lastName: "Okafor",
      role: "maintenance_officer",
    },
  });
  expect(invited.status()).toBe(201);
  await page.goto(await mail(request));
  await expect(
    page.getByRole("heading", { name: "You’re invited." }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await page.getByRole("button", { name: "Email me a Sign-in Link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible();
  await consumeLink(page, request);
  await expect(
    page.getByRole("heading", { name: "Your campus workspace" }),
  ).toBeVisible();
  await expect(
    page.getByText("Maintenance Officer · MIT 8333 UNIVERSITY"),
  ).toBeVisible();
});

test("Google uses the real callback and prefills a new account, with failures returning to the client", async ({
  page,
  request,
  context,
}) => {
  let verified = false;
  await context.route("**/api/auth/oidc/google/login?**", async (route) => {
    // Keep the real login response/transaction cookie; replace only the provider hop.
    const login = await route.fetch({ maxRedirects: 0 });
    const response = await request.post(`${controls}/google`, {
      data: {
        authorizationUrl: login.headers().location,
        account: {
          sub: "google-ada",
          email,
          emailVerified: verified,
          givenName: "Ada",
          familyName: "Okafor",
        },
      },
    });
    expect(response.ok()).toBeTruthy();
    await route.fulfill({
      response: login,
      headers: {
        ...login.headers(),
        location: (await response.json()).callbackUrl,
      },
    });
  });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByText(
      "Google sign-in couldn’t be completed. Try again or use a Sign-in Link.",
    ),
  ).toBeVisible();
  verified = true;
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("heading", { name: "Finish sign-up." }),
  ).toBeVisible();
  await expect(page.getByLabel("First name")).toHaveValue("Ada");
  await expect(page.getByLabel("Last name")).toHaveValue("Okafor");
});
