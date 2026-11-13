import {
  expect,
  test,
  type Browser,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const controls = "http://127.0.0.1:4175";
async function signIn(
  browser: Browser,
  request: APIRequestContext,
  email: string,
) {
  const page = await (await browser.newContext()).newPage();
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
  const link = (await mail.json()).link;
  expect(new URL(link).origin).toBe(new URL(page.url()).origin);
  await page.goto(link);
  await page.getByRole("button", { name: "Continue signing in" }).click();
  return page;
}
async function accounts(browser: Browser, request: APIRequestContext) {
  for (const [email, firstName, lastName, role] of [
    ["funmi@example.test", "Funmi", "Adeyemi", "administrator"],
    ["chinedu@example.test", "Chinedu", "Eze", "maintenance_officer"],
  ])
    expect(
      (
        await request.post(`${controls}/invite`, {
          data: { email, firstName, lastName, role },
        })
      ).ok(),
    ).toBeTruthy();
  const officer = await signIn(browser, request, "chinedu@example.test");
  const admin = await signIn(browser, request, "funmi@example.test");
  const student = await signIn(browser, request, "ada@example.test");
  await student.getByLabel("First name").fill("Ada");
  await student.getByLabel("Last name").fill("Okafor");
  await student.getByRole("radio", { name: /Student/ }).check();
  await student
    .getByRole("button", { name: "Finish sign-up", exact: true })
    .click();
  await expect(student).toHaveURL(/\/dashboard$/);
  return { student, admin, officer };
}
async function report(page: Page, title = "Leaking pipe under the sink") {
  await page.goto("/requests/new");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("radio", { name: "Plumbing", exact: true }).check();
  await page.getByLabel("Location").fill("Hostel B, room 214");
  await page
    .getByLabel("Description")
    .fill("Water drips from the pipe and collects on the floor.");
  await page.getByRole("button", { name: "Submit Service Request" }).click();
  await expect(page).toHaveURL(/\/requests\/SR-PLUMB-\d+$/);
}
async function capture(page: Page, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/close-the-loop/${name}.png`,
    fullPage: true,
  });
}
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${controls}/reset`)).ok()).toBeTruthy();
});

test("edit, correct, set Priority, Not fixed and Fixed work against the real server on desktop and phone", async ({
  browser,
  request,
}) => {
  const { student, admin, officer } = await accounts(browser, request);
  await report(student);
  await student
    .getByRole("link", { name: "Edit details", exact: true })
    .click();
  await expect(student.getByLabel("Title")).toHaveValue(
    "Leaking pipe under the sink",
  );
  await student.getByLabel("Title").fill("Dripping pipe under the sink");
  await capture(student, "edit-desktop");
  await student.setViewportSize({ width: 390, height: 844 });
  await capture(student, "edit-mobile");
  await student.setViewportSize({ width: 320, height: 844 });
  await capture(student, "edit-small-phone");
  await student.setViewportSize({ width: 390, height: 844 });
  await student.getByRole("button", { name: "Save changes" }).click();
  await expect(
    student.getByText("Details saved. The Reference stays SR-PLUMB-1."),
  ).toBeVisible();

  await admin.goto("/requests/SR-PLUMB-1");
  const manage = admin.getByRole("region", { name: "Manage", exact: true });
  await manage.getByRole("radio", { name: "High", exact: true }).check();
  await manage.getByRole("button", { name: "Set Priority" }).click();
  await expect(admin.getByText("Priority set to High.")).toBeVisible();
  await manage
    .getByRole("button", { name: "Correct Request Category or location" })
    .click();
  const corrections = manage.getByRole("form", {
    name: "Correct Request Category or location",
  });
  await corrections.getByLabel("Request Category").selectOption("electrical");
  await corrections.getByLabel("Location").fill("Hostel B, room 215");
  await capture(admin, "corrections-desktop");
  await admin.setViewportSize({ width: 390, height: 844 });
  await capture(admin, "corrections-mobile");
  await corrections.getByRole("button", { name: "Save corrections" }).click();
  await expect(
    admin.getByText("Details corrected. The Reference stays SR-PLUMB-1."),
  ).toBeVisible();
  await admin
    .getByRole("button", { name: "Assign a Maintenance Officer" })
    .click();
  const picker = admin.getByRole("dialog", { name: "Assign SR-PLUMB-1" });
  await picker.getByRole("radio", { name: /Chinedu Eze/ }).check();
  await picker.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(picker).toBeHidden();
  await officer.goto("/requests/SR-PLUMB-1");
  await officer.getByRole("button", { name: "Start work" }).click();
  await officer.getByRole("button", { name: "Complete", exact: true }).click();
  await officer.getByRole("button", { name: "Mark as Completed" }).click();
  await expect(officer.getByText("SR-PLUMB-1 is Completed.")).toBeVisible();
  await student.reload();
  await expect(
    student.getByRole("heading", { name: "Is the fault fixed?" }),
  ).toBeVisible();
  await student.getByRole("button", { name: "Not fixed", exact: true }).click();
  await student.getByLabel("Reason").fill("It still leaks when the tap runs.");
  await capture(student, "not-fixed-mobile");
  await student.setViewportSize({ width: 1280, height: 900 });
  await capture(student, "not-fixed-desktop");
  await student.getByRole("button", { name: "Send Not fixed" }).click();
  await expect(
    student.getByText("SR-PLUMB-1 is Assigned again."),
  ).toBeVisible();
  await expect(student.getByRole("region", { name: "Timeline" })).toContainText(
    "It still leaks when the tap runs.",
  );
  await officer.reload();
  await officer.getByRole("button", { name: "Start work" }).click();
  await officer.getByRole("button", { name: "Complete", exact: true }).click();
  await officer.getByLabel(/Note for the Requester/).fill("Replaced the pipe.");
  await officer.getByRole("button", { name: "Mark as Completed" }).click();
  await expect(officer.getByText("SR-PLUMB-1 is Completed.")).toBeVisible();
  await student.reload();
  await student.getByRole("button", { name: "Fixed", exact: true }).click();
  await expect(student.getByText("SR-PLUMB-1 is Verified.")).toBeVisible();
  await expect(
    student.getByRole("button", { name: "Not fixed", exact: true }),
  ).toHaveCount(0);
  await admin.reload();
  await expect(
    admin.getByRole("region", { name: "Manage", exact: true }),
  ).toHaveCount(0);

  await report(student, "Duplicate report");
  await student.getByRole("button", { name: "Cancel request" }).click();
  await student.getByRole("button", { name: "Cancel Service Request" }).click();
  await expect(student.getByText("Enter a reason.")).toBeVisible();
  await student.getByLabel("Reason").fill("Reported twice by mistake.");
  await student.setViewportSize({ width: 390, height: 844 });
  await capture(student, "cancel-mobile");
  await student.getByRole("button", { name: "Cancel Service Request" }).click();
  await expect(student.getByText("SR-PLUMB-2 is Cancelled.")).toBeVisible();
  await student.goto("/requests/SR-PLUMB-2/edit");
  await expect(
    student.getByRole("heading", { name: "These details can’t be edited" }),
  ).toBeVisible();
});

test("an Administrator cancels In Progress work with a reason and verifies another completed report", async ({
  browser,
  request,
}) => {
  const { student, admin, officer } = await accounts(browser, request);
  const officerId = (await (await officer.request.get("/api/auth/me")).json())
    .id;
  const refs: string[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await student.request.post("/api/service-requests", {
      data: {
        title: "Leaking tap",
        categoryId: "plumbing",
        location: "Room 101",
        description: "The tap is dripping onto the floor.",
      },
    });
    expect(response.status()).toBe(201);
    const { reference } = await response.json();
    refs.push(reference);
    expect(
      (
        await admin.request.put(
          `/api/service-requests/${reference}/assignment`,
          { data: { officerId } },
        )
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await officer.request.post(`/api/service-requests/${reference}/start`)
      ).ok(),
    ).toBeTruthy();
  }
  await admin.goto(`/requests/${refs[0]}`);
  await admin.getByRole("button", { name: "Cancel request" }).click();
  await admin
    .getByLabel("Reason")
    .fill("Duplicate report; work continues on the earlier request.");
  await capture(admin, "admin-cancel-desktop");
  await admin.getByRole("button", { name: "Cancel Service Request" }).click();
  await expect(admin.getByText(`${refs[0]} is Cancelled.`)).toBeVisible();
  expect(
    (
      await officer.request.post(`/api/service-requests/${refs[1]}/complete`)
    ).ok(),
  ).toBeTruthy();
  await admin.goto(`/requests/${refs[1]}`);
  await expect(
    admin.getByRole("button", { name: "Not fixed", exact: true }),
  ).toHaveCount(0);
  await admin.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(admin.getByText(`${refs[1]} is Verified.`)).toBeVisible();
});

test("Progress Notes remain readable through reassignment and closure against the real API", async ({
  browser,
  request,
}) => {
  const { student, admin, officer } = await accounts(browser, request);
  await report(student);
  const path = "/requests/SR-PLUMB-1";
  const apiPath = "/api/service-requests/SR-PLUMB-1";
  async function note(page: Page, text: string) {
    const field = page.getByRole("textbox", { name: "Add a Progress Note" });
    await field.fill(text);
    await page
      .getByRole("button", { name: "Add Progress Note", exact: true })
      .click();
    await expect(
      page.getByText("Progress Note added.", { exact: true }),
    ).toBeVisible();
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
  }
  await note(student, "  Room open after noon.\nPlease knock.  ");
  const read = await student.request.get(apiPath);
  expect((await read.json()).status).toBe("submitted");
  await admin.goto(path);
  await note(admin, "The store has a replacement part.");
  const officerId = (await (await officer.request.get("/api/auth/me")).json())
    .id;
  expect(
    (
      await admin.request.put(`${apiPath}/assignment`, { data: { officerId } })
    ).status(),
  ).toBe(200);
  await officer.goto(path);
  await note(officer, "Checked the joint.\nWaiting for a replacement part.");
  await capture(officer, "progress-notes-desktop");
  await officer.setViewportSize({ width: 390, height: 844 });
  await capture(officer, "progress-notes-mobile");
  await officer.setViewportSize({ width: 320, height: 844 });
  await capture(officer, "progress-notes-small-phone");
  await student.reload();
  const timeline = student.getByRole("region", { name: "Timeline" });
  await expect(timeline).toContainText("The store has a replacement part.");
  await expect(timeline).toContainText("Checked the joint.");
  await expect(timeline.locator("ol > li").first()).toContainText(
    "Fault reported",
  );
  expect((await admin.request.delete(`${apiPath}/assignment`)).status()).toBe(
    200,
  );
  await officer.reload();
  await expect(
    officer.getByRole("form", { name: "Add a Progress Note" }),
  ).toHaveCount(0);
  await expect(officer.getByRole("region", { name: "Timeline" })).toContainText(
    "Checked the joint.",
  );
  expect(
    (
      await officer.request.post(`${apiPath}/progress-notes`, {
        data: { text: "No longer allowed" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await admin.request.put(`${apiPath}/assignment`, { data: { officerId } })
    ).status(),
  ).toBe(200);
  expect((await officer.request.post(`${apiPath}/start`)).status()).toBe(200);
  expect((await officer.request.post(`${apiPath}/complete`)).status()).toBe(
    200,
  );
  await student.reload();
  await note(student, "Water is running clearly now.");
  await student.getByRole("button", { name: "Fixed", exact: true }).click();
  await expect(student.getByText("SR-PLUMB-1 is Verified.")).toBeVisible();
  await expect(
    student.getByRole("form", { name: "Add a Progress Note" }),
  ).toHaveCount(0);
  await expect(student.getByRole("region", { name: "Timeline" })).toContainText(
    "Water is running clearly now.",
  );
  expect(
    (
      await student.request.post(`${apiPath}/progress-notes`, {
        data: { text: "Too late" },
      })
    ).status(),
  ).toBe(409);
  await report(student, "Duplicate pipe report");
  await note(student, "This duplicates the earlier report.");
  expect(
    (
      await student.request.post("/api/service-requests/SR-PLUMB-2/cancel", {
        data: { reason: "Duplicate report" },
      })
    ).status(),
  ).toBe(200);
  await student.reload();
  await expect(
    student.getByRole("form", { name: "Add a Progress Note" }),
  ).toHaveCount(0);
  await expect(student.getByRole("region", { name: "Timeline" })).toContainText(
    "This duplicates the earlier report.",
  );
});
