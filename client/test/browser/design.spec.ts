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
    page.getByRole("heading", { name: /^Welcome back,/ }),
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
    assignment: null,
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

test("Progress Note controls preserve the preview through validation, pending and failure states", async ({
  page,
}) => {
  const details: ServiceRequestDetails = {
    reference: "SR-PLUMB-1",
    title: "Leaking pipe under the sink",
    category: { id: "plumbing", name: "Plumbing", code: "PLUMB" },
    location: "Hostel B, room 214",
    status: "assigned",
    requester: { id: "ada", name: "Ada Okafor" },
    submittedAt: "2026-11-12T10:00:00.000Z",
    assignment: {
      officer: { id: "chinedu", name: "Chinedu Eze" },
      assignedAt: "2026-11-12T11:00:00.000Z",
    },
    description: "Water drips from the pipe.",
    timeline: [
      {
        type: "progress_note",
        actor: { id: "ada", name: "Ada Okafor" },
        occurredAt: "2026-11-12T12:00:00.000Z",
        text: "<b>Room open</b>\n" + "x".repeat(2000),
      },
    ],
  };
  await page.route("**/api/service-requests/SR-PLUMB-1", (route) =>
    route.fulfill({ json: details }),
  );
  let finish!: () => void;
  await page.route(
    "**/api/service-requests/SR-PLUMB-1/progress-notes",
    async (route) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      await route.fulfill({ status: 500, json: {} });
    },
  );
  await page.goto("/requests/SR-PLUMB-1");
  const field = page.getByRole("textbox", { name: "Add a Progress Note" });
  const form = page.getByRole("form", { name: "Add a Progress Note" });
  const button = form.getByRole("button", { name: "Add Progress Note" });
  async function capture(state: string) {
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
        path: `test-results/progress-notes/${state}-${label}.png`,
        fullPage: true,
      });
    }
  }
  await expect(field).toHaveCSS("min-height", "92px");
  await expect(field).toHaveCSS("background-color", "rgb(241, 244, 244)");
  await capture("ready");
  await field.focus();
  await field.blur();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await capture("validation");
  await field.fill("Room is open after noon.");
  await button.click();
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button).toBeDisabled();
  await expect(field).toBeDisabled();
  const spinner = button.locator(".animate-spin");
  await expect(spinner).toBeVisible();
  const [spinnerBox, buttonBox] = await Promise.all([
    spinner.boundingBox(),
    button.boundingBox(),
  ]);
  expect(spinnerBox!.x).toBeGreaterThan(buttonBox!.x + buttonBox!.width / 2);
  await capture("pending");
  finish();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(field).toHaveValue("Room is open after noon.");
  await capture("failure");
});

test("list and dashboard states match the approved responsive layout without overflow", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const categories = [
    { id: "electrical", name: "Electrical", code: "ELEC" },
    { id: "plumbing", name: "Plumbing", code: "PLUMB" },
    { id: "furniture", name: "Furniture", code: "FURN" },
    { id: "network", name: "Internet and network", code: "NET" },
    { id: "classroom_equipment", name: "Classroom equipment", code: "CLASS" },
    { id: "other", name: "Other", code: "OTHER" },
  ];
  let role = "student";
  let state = "populated";
  let release!: () => void;
  let pending = Promise.resolve();
  const officer = {
    id: "88888888-8888-4888-8888-888888888888",
    name: "Chinedu Eze",
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({ json: { ...user, id: officer.id, role } });
    if (url.pathname.endsWith("/request-categories"))
      return route.fulfill({ json: categories });
    if (url.pathname.endsWith("/maintenance-officers"))
      return route.fulfill({ json: [{ ...officer, openAssignments: 3 }] });
    if (state === "loading") await pending;
    if (state === "error") return route.fulfill({ status: 500, json: {} });
    if (url.pathname.endsWith("/summary"))
      return route.fulfill({
        json: {
          byStatus:
            state === "empty"
              ? {
                  submitted: 0,
                  assigned: 0,
                  in_progress: 0,
                  completed: 0,
                  verified: 0,
                  cancelled: 0,
                }
              : {
                  submitted: 3,
                  assigned: 7,
                  in_progress: 7,
                  completed: 2,
                  verified: 130,
                  cancelled: 11,
                },
          ...(role === "administrator"
            ? {
                openByCategory: categories.map((category, index) => ({
                  category,
                  count: state === "empty" ? 0 : [3, 6, 3, 0, 4, 1][index],
                })),
              }
            : {}),
        },
      });
    const status = url.searchParams.get("status");
    const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    const total =
      state === "empty"
        ? 0
        : pageSize === 5
          ? status === "completed"
            ? 2
            : status === "submitted"
              ? 3
              : 14
          : 27;
    const rows =
      state === "empty"
        ? []
        : Array.from({ length: Math.min(pageSize, total) }, (_, index) => ({
            reference: `SR-PLUMB-${50 - index}`,
            title: index
              ? "Overhead tank overflowing"
              : "Leaking pipe under the sink",
            category: categories[1],
            location: "Hostel B, room 214",
            status:
              status === "completed"
                ? "completed"
                : status === "submitted"
                  ? "submitted"
                  : role === "maintenance_officer"
                    ? "assigned"
                    : index % 3
                      ? "in_progress"
                      : "submitted",
            ...(index !== 1 || role !== "maintenance_officer"
              ? { priority: "urgent" }
              : {}),
            requester: { id: "ada", name: "Ada Okafor" },
            submittedAt: "2026-11-12T09:00:00Z",
            assignment:
              index % 3 || role === "maintenance_officer"
                ? {
                    officer:
                      index === 1
                        ? { id: "another", name: "Tunde Bakare" }
                        : officer,
                    assignedAt: "2026-11-12T10:00:00Z",
                  }
                : null,
          }));
    return route.fulfill({
      json: {
        items: rows,
        page: 1,
        pageSize: Number(url.searchParams.get("pageSize") ?? 20),
        total,
      },
    });
  });
  for (const [name, nextRole, path] of [
    ["my-requests", "student", "/requests"],
    ["my-assignments", "maintenance_officer", "/assignments"],
    ["management", "administrator", "/admin/requests"],
    ["dashboard-student", "student", "/dashboard"],
    ["dashboard-staff", "staff", "/dashboard"],
    ["dashboard-maintenance_officer", "maintenance_officer", "/dashboard"],
    ["dashboard-administrator", "administrator", "/dashboard"],
  ]) {
    role = nextRole!;
    for (const nextState of ["populated", "empty", "error", "loading"]) {
      state = nextState;
      pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path!);
      if (state === "loading")
        await expect(
          page.getByText(
            name!.startsWith("dashboard")
              ? "Loading your dashboard…"
              : "Loading Service Requests…",
            { exact: true },
          ),
        ).toBeVisible();
      else if (state === "error")
        await expect(
          page.getByRole("heading", { name: /We couldn’t load/ }).first(),
        ).toBeVisible();
      else if (state === "populated")
        await expect(
          name!.startsWith("dashboard")
            ? page.getByRole("list").first()
            : page.getByRole("table"),
        ).toBeVisible();
      else
        await expect(
          page
            .getByText(
              /Nothing reported yet|No Assignments yet|No Service Requests yet|No current Assignments|Nothing is waiting|You haven’t reported any faults yet/,
            )
            .first(),
        ).toBeVisible();
      for (const [size, width, height] of [
        ["desktop", 1280, 900],
        ["mobile", 390, 844],
        ["small-phone", 320, 844],
      ] as const) {
        await page.setViewportSize({ width, height });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: `test-results/search-and-dashboards/${name}-${state}-${size}.png`,
          fullPage: true,
        });
      }
      if (state === "populated" && name === "management") {
        await page
          .getByRole("button", { name: "Filters", exact: true })
          .click();
        await expect(
          page.getByLabel("Priority", { exact: true }),
        ).toBeVisible();
        const statusBox = (await page
          .getByLabel("Status", { exact: true })
          .boundingBox())!;
        const categoryBox = (await page
          .getByLabel("Request Category", { exact: true })
          .boundingBox())!;
        const priorityBox = (await page
          .getByLabel("Priority", { exact: true })
          .boundingBox())!;
        expect(categoryBox.x).toBe(statusBox.x);
        expect(priorityBox.x).toBe(statusBox.x);
        expect(categoryBox.y).toBeGreaterThan(statusBox.y);
        expect(priorityBox.y).toBeGreaterThan(categoryBox.y);
        expect(statusBox.width).toBeGreaterThan(220);
        await page.getByLabel("Priority", { exact: true }).focus();
        await expect(page.getByLabel("Priority", { exact: true })).toHaveCSS(
          "outline-style",
          "solid",
        );
        await page.screenshot({
          path: "test-results/search-and-dashboards/management-filters-focus-320.png",
          fullPage: true,
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(320);
      }
      release();
      if (state === "loading") await page.waitForLoadState("networkidle");
    }
  }
});
