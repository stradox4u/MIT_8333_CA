import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";

const controls = "http://127.0.0.1:4175";

async function mailedLink(request: APIRequestContext, email: string) {
  const mail = await request.get(
    `${controls}/mail?email=${encodeURIComponent(email)}`,
  );
  expect(mail.ok()).toBeTruthy();
  return (await mail.json()).link as string;
}

/** Signs in through a Sign-in Link in a fresh browser context. */
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
  await page.goto(await mailedLink(request, email));
  await page.getByRole("button", { name: "Continue signing in" }).click();
  return page;
}

async function invite(
  request: APIRequestContext,
  invitee: { email: string; firstName: string; lastName: string; role: string },
) {
  const invited = await request.post(`${controls}/invite`, { data: invitee });
  expect(invited.status()).toBe(201);
}

async function capture(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/assign-and-work/${name}.png`,
    fullPage: true,
  });
}

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${controls}/reset`)).ok()).toBeTruthy();
});

test("a fault is reported, assigned, started and completed, and its Requester reads the timeline", async ({
  browser,
  request,
}) => {
  await invite(request, {
    email: "funmi@example.test",
    firstName: "Funmi",
    lastName: "Adeyemi",
    role: "administrator",
  });
  await invite(request, {
    email: "chinedu@example.test",
    firstName: "Chinedu",
    lastName: "Eze",
    role: "maintenance_officer",
  });
  // Officers are active, and can be assigned, once they've signed in.
  const officer = await signIn(browser, request, "chinedu@example.test");

  // A Student reports a fault.
  const student = await signIn(browser, request, "ada@example.test");
  await student.getByLabel("First name").fill("Ada");
  await student.getByLabel("Last name").fill("Okafor");
  await student.getByRole("radio", { name: /Student/ }).check();
  await student
    .getByRole("button", { name: "Finish sign-up", exact: true })
    .click();
  await student
    .getByRole("banner")
    .getByRole("link", { name: "Report a fault" })
    .click();
  await student.getByLabel("Title").fill("Leaking pipe under the sink");
  await student.getByRole("radio", { name: "Plumbing" }).check();
  await student.getByLabel("Location").fill("Hostel B, room 214");
  await student
    .getByLabel("Description")
    .fill("Water drips from the pipe and collects on the floor.");
  await student.getByRole("button", { name: "Submit Service Request" }).click();
  await expect(student).toHaveURL(/\/requests\/SR-PLUMB-1$/);
  await expect(
    student.getByRole("region", { name: "Waiting for an Assignment" }),
  ).toBeVisible();

  // An Administrator assigns it from Request management.
  const admin = await signIn(browser, request, "funmi@example.test");
  await admin
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Requests", exact: true })
    .click();
  await expect(
    admin.getByRole("heading", { name: "Request management" }),
  ).toBeVisible();
  await capture(admin, "request-management-desktop");
  await admin
    .getByRole("table")
    .getByRole("button", { name: "Assign SR-PLUMB-1" })
    .click();
  const picker = admin.getByRole("dialog", { name: "Assign SR-PLUMB-1" });
  await expect(picker.getByText("0 Open Assignments")).toBeVisible();
  await capture(admin, "assign-picker-desktop");
  await picker.getByRole("radio", { name: /Chinedu Eze/ }).check();
  await picker.getByRole("button", { name: "Assign" }).click();
  await expect(
    admin.getByText("SR-PLUMB-1 assigned to Chinedu Eze. It’s now Assigned."),
  ).toBeVisible();
  await expect(
    admin.getByRole("row", { name: /SR-PLUMB-1/ }).getByText("Chinedu Eze"),
  ).toBeVisible();

  // The officer starts it, then completes it with a note.
  await officer
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "My Assignments" })
    .click();
  await capture(officer, "my-assignments-desktop");
  await officer
    .getByRole("link", { name: "Leaking pipe under the sink" })
    .click();
  await expect(
    officer.locator("section").filter({ hasText: "SR-PLUMB-1" }).first(),
  ).toContainText("Normal");
  await officer.getByRole("button", { name: "Start work" }).click();
  await expect(
    officer.getByText("Started. SR-PLUMB-1 is In Progress."),
  ).toBeVisible();
  await officer.getByRole("button", { name: "Complete" }).click();
  await officer
    .getByLabel(/Note for the Requester/)
    .fill("Replaced the washer and resealed the joint.");
  await capture(officer, "tracking-officer-complete-desktop");
  await officer.getByRole("button", { name: "Mark as Completed" }).click();
  await expect(officer.getByText("SR-PLUMB-1 is Completed.")).toBeVisible();

  // The Student sees the whole timeline, oldest first, and no Priority.
  await student.reload();
  const timeline = student.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByRole("listitem")).toHaveCount(4);
  await expect(timeline.getByRole("listitem").nth(0)).toContainText(
    "Fault reported",
  );
  await expect(timeline.getByRole("listitem").nth(1)).toContainText(
    "Assigned to Chinedu Eze",
  );
  await expect(timeline.getByRole("listitem").nth(1)).toContainText(
    "Status Update: Submitted → Assigned",
  );
  await expect(timeline.getByRole("listitem").nth(2)).toContainText(
    "Work started",
  );
  await expect(timeline.getByRole("listitem").nth(3)).toContainText(
    "Completion noteReplaced the washer and resealed the joint.",
  );
  await expect(student.getByText("Priority")).toHaveCount(0);
  await capture(student, "tracking-requester-desktop");

  // On a phone, the officer's list is cards and the Administrator's card stacks.
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto("/admin/requests");
  await expect(admin.getByRole("table")).toBeHidden();
  await capture(admin, "request-management-mobile");
  await officer.setViewportSize({ width: 390, height: 844 });
  await officer.goto("/assignments");
  await capture(officer, "my-assignments-mobile");
  await student.setViewportSize({ width: 390, height: 844 });
  await capture(student, "tracking-requester-mobile");
  for (const page of [admin, officer, student])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
});

test("an Administrator reassigns and unassigns from the Manage card", async ({
  browser,
  request,
}) => {
  for (const [first, last] of [
    ["Chinedu", "Eze"],
    ["Tunde", "Bakare"],
  ])
    await invite(request, {
      email: `${first.toLowerCase()}@example.test`,
      firstName: first,
      lastName: last,
      role: "maintenance_officer",
    });
  await invite(request, {
    email: "funmi@example.test",
    firstName: "Funmi",
    lastName: "Adeyemi",
    role: "administrator",
  });
  const chinedu = await signIn(browser, request, "chinedu@example.test");
  await signIn(browser, request, "tunde@example.test");
  const admin = await signIn(browser, request, "funmi@example.test");
  await admin.goto("/requests/new");
  await admin.getByLabel("Title").fill("Projector won’t turn on");
  await admin.getByRole("radio", { name: "Classroom equipment" }).check();
  await admin.getByLabel("Location").fill("Faculty of Arts, room 12");
  await admin
    .getByLabel("Description")
    .fill("The ceiling projector shows no light at all.");
  await admin.getByRole("button", { name: "Submit Service Request" }).click();
  await expect(admin).toHaveURL(/\/requests\/SR-CLASS-1$/);

  await admin
    .getByRole("button", { name: "Assign a Maintenance Officer" })
    .click();
  const picker = admin.getByRole("dialog", { name: "Assign SR-CLASS-1" });
  await picker.getByRole("radio", { name: /Chinedu Eze/ }).check();
  await picker.getByRole("button", { name: "Assign" }).click();
  const manage = admin.getByRole("region", { name: "Manage" });
  await expect(manage).toContainText("Chinedu Eze");
  await expect(manage).toContainText("1 Open Assignment");
  await capture(admin, "tracking-admin-desktop");

  await manage.getByRole("button", { name: "Reassign" }).click();
  const reassign = admin.getByRole("dialog", { name: "Reassign SR-CLASS-1" });
  await expect(
    reassign.getByRole("radio", { name: /Chinedu Eze/ }),
  ).toBeDisabled();
  await reassign.getByRole("radio", { name: /Tunde Bakare/ }).check();
  await reassign.getByRole("button", { name: "Reassign" }).click();
  await expect(
    admin.getByText(
      "SR-CLASS-1 reassigned to Tunde Bakare. It’s now Assigned.",
    ),
  ).toBeVisible();

  await manage.getByRole("button", { name: "Unassign" }).click();
  await manage
    .getByRole("group", { name: "Unassign Tunde Bakare?" })
    .getByRole("button", { name: "Unassign" })
    .click();
  await expect(
    admin.getByText("Tunde Bakare unassigned. SR-CLASS-1 is Submitted again."),
  ).toBeVisible();
  await admin.setViewportSize({ width: 390, height: 844 });
  // On a phone the Manage card stacks, full width, above the description.
  const card = (await manage.boundingBox())!;
  const description = (await admin
    .getByRole("region", { name: "Description" })
    .boundingBox())!;
  expect(card.width).toBeGreaterThan(330);
  expect(description.x).toBe(card.x);
  expect(description.width).toBe(card.width);
  expect(description.y).toBeGreaterThan(card.y);
  await capture(admin, "tracking-admin-mobile");

  // Chinedu, reassigned away, reads it without acting.
  await chinedu.goto("/assignments");
  await expect(chinedu.getByRole("row", { name: /SR-CLASS-1/ })).toContainText(
    "Reassigned · read only",
  );
  await chinedu.getByRole("link", { name: "Projector won’t turn on" }).click();
  await expect(
    chinedu.getByText("You’re no longer assigned to this Service Request."),
  ).toBeVisible();
  await expect(chinedu.getByRole("button", { name: "Start work" })).toHaveCount(
    0,
  );
  await capture(chinedu, "tracking-former-officer-desktop");
});
