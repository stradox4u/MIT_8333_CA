import { expect, test } from "@playwright/test";
import type {
  ServiceRequestDetails,
  Status,
} from "../../src/service-requests/api";

const user = {
  id: "ada",
  email: "ada@example.test",
  firstName: "Ada",
  lastName: "Okafor",
  role: "administrator",
  signUpComplete: true,
  hasPassword: false,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
});

test("workspace navigation keeps the preview's responsive breakpoints", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your campus workspace" }),
  ).toBeVisible();
  for (const width of [1280, 1060, 1024, 1023, 901, 900, 600, 440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    if (width <= 900) await expect(menu).toBeVisible();
    else await expect(menu).toBeHidden();
    const brand = page
      .getByRole("banner")
      .getByText("UNIVERSITY", { exact: true });
    if (width <= 440) await expect(brand).toBeHidden();
    else await expect(brand).toBeVisible();
  }
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Current page", { exact: true })).toBeVisible();
});

test("all Status and Priority variants retain the preview palette", async ({
  page,
}) => {
  const request: ServiceRequestDetails = {
    reference: "SR-PLUMB-1",
    title: "Leaking pipe under the sink",
    category: { id: "plumbing", name: "Plumbing", code: "PLUMB" },
    location: "Hostel B, room 214",
    status: "submitted",
    priority: "normal",
    requester: { id: "ada", name: "Ada Okafor" },
    submittedAt: "2026-11-12T10:00:00.000Z",
    description: "Water drips from the pipe.",
    timeline: [],
  };
  await page.route("**/api/service-requests/SR-PLUMB-1", (route) =>
    route.fulfill({ json: request }),
  );
  const surface = "rgb(241, 244, 244)";
  const navy = "rgb(10, 16, 69)";
  const statuses: [Status, string, string][] = [
    ["submitted", surface, navy],
    ["assigned", "rgb(220, 228, 229)", "rgb(108, 127, 134)"],
    ["in_progress", navy, navy],
    ["completed", "rgb(113, 247, 159)", navy],
    ["verified", surface, navy],
    ["cancelled", "rgb(201, 212, 214)", "rgba(0, 0, 0, 0)"],
  ];
  for (const [status, background, border] of statuses) {
    request.status = status;
    await page.goto("/requests/SR-PLUMB-1");
    const chip = page
      .getByRole("region", { name: request.title })
      .locator(".status-chip");
    await expect(chip).toHaveCSS("background-color", background);
    await expect(chip).toHaveCSS("border-top-color", border);
    await expect(chip).toHaveCSS(
      "color",
      status === "in_progress" ? surface : navy,
    );
  }
  for (const priority of ["low", "normal", "high", "urgent"] as const) {
    request.priority = priority;
    await page.reload();
    const tag = page
      .getByRole("region", { name: request.title })
      .locator(".priority");
    await expect(tag).toHaveCSS(
      "color",
      priority === "urgent"
        ? surface
        : priority === "low"
          ? "rgb(65, 75, 107)"
          : navy,
    );
    if (priority === "urgent")
      await expect(tag).toHaveCSS("background-color", navy);
  }
});

test("pagination keeps its active-page styling and phone layout", async ({
  page,
}) => {
  await page.route("**/api/service-requests?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            reference: "SR-PLUMB-1",
            title: "Leaking pipe under the sink",
            category: { id: "plumbing", name: "Plumbing", code: "PLUMB" },
            location: "Hostel B, room 214",
            status: "submitted",
            requester: { id: "ada", name: "Ada Okafor" },
            submittedAt: "2026-11-12T10:00:00.000Z",
          },
        ],
        page: 2,
        pageSize: 20,
        total: 45,
      },
    }),
  );
  await page.goto("/requests?page=2");
  const pagination = page.getByRole("navigation", { name: "Pagination" });
  const current = pagination.getByRole("link", { name: "Page 2", exact: true });
  await expect(current).toHaveCSS("background-color", "rgb(10, 16, 69)");
  await expect(current).toHaveCSS("color", "rgb(241, 244, 244)");
  await expect(
    pagination.getByRole("link", { name: "Page 1", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(current).toBeVisible();
  await expect(current).toHaveCSS("height", "44px");
  await expect(
    pagination.getByRole("link", { name: "Page 1", exact: true }),
  ).toBeHidden();
  await expect(
    pagination.getByRole("link", { name: "Page 3", exact: true }),
  ).toBeHidden();
});
