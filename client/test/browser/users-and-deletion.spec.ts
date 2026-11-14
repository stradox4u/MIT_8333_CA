import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
const controls = process.env.BROWSER_CONTROLS_URL ?? "http://127.0.0.1:4175";
async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByRole("button", { name: "Email me a Sign-in Link", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible();
  const mail = await request.get(
    `${controls}/mail?email=${encodeURIComponent(email)}`,
  );
  await page.goto((await mail.json()).link);
  await page.getByRole("button", { name: "Continue signing in" }).click();
  await expect(
    page.getByRole("heading", { name: /^Welcome back,/ }),
  ).toBeVisible();
}
async function capture(page: Page, name: string) {
  for (const [label, width, height] of [
    ["desktop", 1280, 900],
    ["mobile", 390, 844],
    ["small-phone", 320, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/users-and-deletion/${name}-${label}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${controls}/reset`)).ok()).toBeTruthy();
  expect(
    (
      await request.post(`${controls}/invite`, {
        data: {
          firstName: "Funmi",
          lastName: "Adeyemi",
          email: "admin@example.test",
          role: "administrator",
        },
      })
    ).status(),
  ).toBe(201);
});
test("Administrator manages another User through the existing account workflows", async ({
  page,
  request,
  browser,
}) => {
  await signIn(page, request, "admin@example.test");
  await page.getByRole("link", { name: "Users", exact: true }).click();
  const own = page.getByRole("article").filter({ hasText: "Funmi Adeyemi" });
  await expect(own.getByRole("button")).toHaveCount(0);
  await page.getByLabel("First name").fill("Chinedu");
  await page.getByLabel("Last name").fill("Eze");
  await page.getByLabel("Email", { exact: true }).fill("typo@example.test");
  await page.getByLabel("Invitation Role").selectOption("maintenance_officer");
  await page
    .getByRole("button", { name: "Send Invitation", exact: true })
    .click();
  await expect(
    page.getByText("Invitation sent.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Manage Chinedu Eze" }).click();
  await capture(page, "users-invitation");
  await page
    .getByRole("button", { name: "Resend Invitation", exact: true })
    .click();
  await expect(page.getByRole("form", { name: "Manage User" })).toHaveCount(0);
  await page.getByRole("button", { name: "Manage Chinedu Eze" }).click();
  await page.getByLabel("Invitation email").fill("officer@example.test");
  await page.getByRole("button", { name: "Correct email and resend" }).click();
  await page.getByRole("button", { name: "Confirm email correction" }).click();
  await expect(
    page.getByRole("article").filter({ hasText: "Chinedu Eze" }),
  ).toContainText("officer@example.test");
  const otherContext = await browser.newContext();
  const officer = await otherContext.newPage();
  await signIn(officer, request, "officer@example.test");
  await page.reload();
  await page.getByRole("button", { name: "Manage Chinedu Eze" }).click();
  await page.getByLabel("Role", { exact: true }).selectOption("staff");
  await page.getByRole("button", { name: "Change Role" }).click();
  await page.getByRole("button", { name: "Confirm Role change" }).click();
  await expect(page.getByRole("form", { name: "Manage User" })).toHaveCount(0);
  for (const [action, confirmation] of [
    ["Deactivate", "Confirm deactivation"],
    ["Reactivate", "Confirm reactivation"],
    ["Erase personal data", "Confirm erasure"],
  ]) {
    await page.getByRole("button", { name: "Manage Chinedu Eze" }).click();
    await page.getByRole("button", { name: action, exact: true }).click();
    if (action === "Erase personal data")
      await capture(page, "users-erase-confirmation");
    await page.getByRole("button", { name: confirmation, exact: true }).click();
    await expect(page.getByRole("form", { name: "Manage User" })).toHaveCount(
      0,
    );
  }
  await expect(page.getByText("Erased user", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Users list" }),
  ).not.toContainText("officer@example.test");
  await otherContext.close();
});
test("Administrator deletes from tracking with a reason; old links and all ordinary views lose the request", async ({
  page,
  request,
}) => {
  await signIn(page, request, "admin@example.test");
  await page.getByRole("link", { name: "Report a fault", exact: true }).click();
  await page.getByLabel("Title").fill("Duplicate leaking tap");
  await page.getByRole("radio", { name: "Plumbing", exact: true }).check();
  await page.getByLabel("Location").fill("Block C, ground floor");
  await page
    .getByLabel("Description")
    .fill("The tap is dripping onto the floor.");
  await page.getByRole("button", { name: "Submit Service Request" }).click();
  await expect(page).toHaveURL(/\/requests\/SR-PLUMB-1$/);
  await page
    .getByRole("button", { name: "Delete request", exact: true })
    .click();
  await page
    .getByLabel("Deletion reason")
    .fill("Duplicate of an existing report");
  await capture(page, "delete-confirmation");
  await page
    .getByRole("button", { name: "Delete Service Request", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Confirm that you understand",
  );
  await page.getByRole("checkbox", { name: /I understand/ }).check();
  await page
    .getByRole("button", { name: "Delete Service Request", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/requests$/);
  await expect(page.getByText("Duplicate leaking tap")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  await page.goto("/requests/SR-PLUMB-1");
  await expect(
    page.getByRole("heading", { name: "We can’t find SR-PLUMB-1" }),
  ).toBeVisible();
});
