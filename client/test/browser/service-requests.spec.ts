import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const controls = "http://127.0.0.1:4175";
const email = "ada@example.test";

/** Signs up as a Student through a Sign-in Link, landing on the dashboard. */
async function signUpAsStudent(page: Page, request: APIRequestContext) {
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
  expect(mail.ok()).toBeTruthy();
  await page.goto((await mail.json()).link);
  await page.getByRole("button", { name: "Continue signing in" }).click();
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Okafor");
  await page.getByRole("radio", { name: /Student/ }).check();
  await page
    .getByRole("button", { name: "Finish sign-up", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your campus workspace" }),
  ).toBeVisible();
}

async function capture(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/service-requests/${name}.png`,
    fullPage: true,
  });
}

async function fitsTheViewport(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${controls}/reset`)).ok()).toBeTruthy();
});

test("a Student reports a fault, lands on its tracking page, then finds it in My requests", async ({
  page,
  request,
}) => {
  await signUpAsStudent(page, request);
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Report a fault" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Report a fault" }),
  ).toBeVisible();

  // Nothing is sent until the form is valid.
  await page
    .getByRole("button", { name: "Submit Service Request" })
    .click();
  await expect(page.getByText("Enter a title.")).toBeVisible();
  await expect(page.getByText("Choose a Request Category.")).toBeVisible();
  await expect(page.getByLabel("Title")).toBeFocused();
  await capture(page, "report-a-fault-errors-desktop");

  await page.getByLabel("Title").fill("Leaking pipe under the bathroom sink");
  await page.getByRole("radio", { name: "Plumbing" }).check();
  await page.getByLabel("Location").fill("Hostel B, room 214");
  await page
    .getByLabel("Description")
    .fill(
      "Water drips from the pipe under the sink and collects on the floor. It gets worse when the tap runs.",
    );
  await expect(page.getByText("Enter a title.")).toBeHidden();
  await capture(page, "report-a-fault-desktop");
  await page
    .getByRole("button", { name: "Submit Service Request" })
    .click();

  await expect(page).toHaveURL(/\/requests\/SR-PLUMB-1$/);
  await expect(page.getByRole("status").filter({ hasText: "submitted" })).toHaveText(
    "Service Request SR-PLUMB-1 submitted.",
  );
  const header = page.locator("section.sr-head");
  await expect(
    header.getByRole("heading", {
      level: 1,
      name: "Leaking pipe under the bathroom sink",
    }),
  ).toBeVisible();
  await expect(header.locator(".status-chip")).toHaveText("Status: Submitted");
  await expect(header).toContainText("Plumbing");
  await expect(header).toContainText("Hostel B, room 214");
  await expect(header).toContainText("You");
  // Students never see a Priority.
  await expect(header).not.toContainText("Priority");
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByRole("listitem")).toHaveCount(1);
  await expect(timeline).toContainText("Fault reported");
  await expect(timeline).toContainText("Status Update · You · Requester");
  await capture(page, "tracking-desktop");

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "My requests" })
    .click();
  await expect(page).toHaveURL(/\/requests$/);
  const row = page.getByRole("row", { name: /SR-PLUMB-1/ });
  await expect(row).toContainText("Leaking pipe under the bathroom sink");
  await expect(row).toContainText("Submitted");
  await expect(page.getByText("Showing 1–1 of 1 Service Request")).toBeVisible();

  // The API's own answer, not rows kept on screen while it loads.
  const [open] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/api/service-requests?scope=requested&status=open"),
    ),
    page.getByLabel("Status").selectOption("open"),
  ]);
  expect(open.status()).toBe(200);
  await expect(page).toHaveURL(/\/requests\?status=open$/);
  await expect(page.getByRole("row", { name: /SR-PLUMB-1/ })).toBeVisible();
  await page.getByLabel("Status").selectOption("completed");
  await expect(
    page.getByRole("heading", { name: "No Service Requests match" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/requests\?status=open$/);
  await expect(page.getByLabel("Status")).toHaveValue("open");
  await page.getByLabel("Status").selectOption("");
  await capture(page, "my-requests-desktop");

  await page.getByRole("row", { name: /SR-PLUMB-1/ }).getByRole("link").click();
  await expect(page).toHaveURL(/\/requests\/SR-PLUMB-1$/);
  // The submitted notice shows once, not on later visits.
  await expect(page.getByText("Service Request SR-PLUMB-1 submitted.")).toBeHidden();
});

test("on a phone, the request pages use the menu and fit the screen", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUpAsStudent(page, request);
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.locator("#mobile-menu");
  // aria-current already says "current page"; the visible badge mustn't say it again.
  await expect(
    menu.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await menu.getByRole("link", { name: "My requests" }).click();
  await expect(
    page.getByRole("heading", { name: "You haven’t reported any faults yet" }),
  ).toBeVisible();
  await fitsTheViewport(page);
  await capture(page, "my-requests-empty-mobile");

  await page.getByRole("main").getByRole("link", { name: "Report a fault" }).click();
  await page.getByLabel("Title").fill("Wardrobe door off its hinges");
  await page.getByRole("radio", { name: "Furniture" }).check();
  await page.getByLabel("Location").fill("Hostel B, room 214");
  await page
    .getByLabel("Description")
    .fill("The left wardrobe door has come off its top hinge.");
  await fitsTheViewport(page);
  await capture(page, "report-a-fault-mobile");
  await page
    .getByRole("button", { name: "Submit Service Request" })
    .click();

  await expect(page).toHaveURL(/\/requests\/SR-FURN-1$/);
  await expect(
    page.getByRole("heading", { name: "Wardrobe door off its hinges" }),
  ).toBeVisible();
  // Only the current step shows until the toggle opens them all.
  const steps = page.getByRole("list", { name: "Progress" });
  await expect(steps.getByRole("listitem").filter({ visible: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Show all steps" }).click();
  await expect(steps.getByRole("listitem").filter({ visible: true })).toHaveCount(5);
  await fitsTheViewport(page);
  await capture(page, "tracking-mobile");

  await page.getByRole("link", { name: "My requests" }).first().click();
  await expect(page.getByRole("table")).toBeHidden();
  await expect(
    page.getByRole("list", { name: "My requests" }).getByRole("link", {
      name: "Wardrobe door off its hinges",
    }),
  ).toBeVisible();
  await fitsTheViewport(page);
  await capture(page, "my-requests-mobile");
});
