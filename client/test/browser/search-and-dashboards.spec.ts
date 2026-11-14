import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
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
  expect(mail.ok()).toBeTruthy();
  const link = (await mail.json()).link as string;
  expect(new URL(link).origin).toBe(new URL(page.url()).origin);
  await page.goto(link);
  await page.getByRole("button", { name: "Continue signing in" }).click();
  await expect(
    page.getByRole("heading", { name: /^Welcome back,|^Finish sign-up/ }),
  ).toBeVisible();
  return page;
}
async function invite(
  request: APIRequestContext,
  role: string,
  email: string,
  firstName: string,
  lastName: string,
) {
  expect(
    (
      await request.post(`${controls}/invite`, {
        data: { role, email, firstName, lastName },
      })
    ).status(),
  ).toBe(201);
}
async function created(
  page: Page,
  title: string,
  categoryId = "plumbing",
  location = "Hostel B, room 214",
) {
  const response = await page.context().request.post("/api/service-requests", {
    data: {
      title,
      categoryId,
      location,
      description: "Water drips from the pipe and collects on the floor.",
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).reference as string;
}

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${controls}/reset`)).ok()).toBeTruthy();
});

test("real API lists retain search, filters, sort and page through shared URLs and Back", async ({
  browser,
  request,
}) => {
  await invite(
    request,
    "administrator",
    "funmi@example.test",
    "Funmi",
    "Adeyemi",
  );
  await invite(
    request,
    "maintenance_officer",
    "chinedu@example.test",
    "Chinedu",
    "Eze",
  );
  const officer = await signIn(browser, request, "chinedu@example.test");
  const admin = await signIn(browser, request, "funmi@example.test");
  const refs: string[] = [];
  for (let n = 1; n <= 22; n++)
    refs.push(await created(admin, `Leaking pipe ${n}`));
  const classroom = await created(
    admin,
    "Faulty projector",
    "classroom_equipment",
    "Arts faculty room 12",
  );
  const officers = await (
    await admin.context().request.get("/api/maintenance-officers")
  ).json();
  const officerId = officers[0].id as string;
  expect(
    (
      await admin
        .context()
        .request.put(`/api/service-requests/${refs[0]}/priority`, {
          data: { priority: "urgent" },
        })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await admin
        .context()
        .request.put(`/api/service-requests/${refs[0]}/assignment`, {
          data: { officerId },
        })
    ).ok(),
  ).toBeTruthy();
  await admin.goto("/requests?search=pipe&status=open&page=2");
  await expect(admin.getByText(/Showing 21–22 of 22/)).toBeVisible();
  await expect(
    admin.getByRole("columnheader", { name: "Priority" }),
  ).toHaveCount(0);
  await expect(admin.getByLabel("Search", { exact: true })).toHaveValue("pipe");
  await admin.getByLabel("Search", { exact: true }).fill("Leaking pipe 22");
  await admin.getByLabel("Status", { exact: true }).selectOption("submitted");
  await expect
    .poll(() => Object.fromEntries(new URL(admin.url()).searchParams))
    .toEqual({ search: "Leaking pipe 22", status: "submitted" });
  await expect(admin.getByText(/Showing 1–1 of 1/)).toBeVisible();
  await admin.goBack();
  await expect(admin.getByText(/Showing 21–22 of 22/)).toBeVisible();
  await admin.getByLabel("Search", { exact: true }).fill("Faulty projector");
  await admin.getByLabel("Search", { exact: true }).press("Enter");
  await expect
    .poll(() => Object.fromEntries(new URL(admin.url()).searchParams))
    .toEqual({ search: "Faulty projector", status: "open" });
  await expect(
    admin.getByRole("table").getByRole("link", { name: "Faulty projector" }),
  ).toBeVisible();
  await admin.goBack();
  await expect(admin.getByText(/Showing 21–22 of 22/)).toBeVisible();
  await admin.reload();
  await expect(admin.getByLabel("Search", { exact: true })).toHaveValue("pipe");

  await admin.goto(
    `/admin/requests?search=Hostel&status=open&category=plumbing&priority=urgent&officerId=${officerId}&submittedFrom=2026-11-12&submittedTo=2026-11-12&sort=priority`,
  );
  await expect(
    admin.getByRole("row", { name: new RegExp(refs[0]!) }),
  ).toContainText("Chinedu Eze");
  await expect(admin.getByText(/Showing 1–1 of 1/)).toBeVisible();
  await expect(admin.getByLabel("Sort", { exact: true })).toHaveValue(
    "priority",
  );
  await expect(
    admin.getByLabel("Maintenance Officer", { exact: true }),
  ).toHaveValue(officerId);
  await admin.getByRole("button", { name: /Remove filter Priority/ }).click();
  await expect(admin).not.toHaveURL(/priority=urgent/);
  await expect(admin.getByLabel("Status", { exact: true })).toHaveValue("open");
  await admin.getByLabel("Sort", { exact: true }).selectOption("newest");
  await expect(admin).not.toHaveURL(/sort=priority/);
  await admin.goto(`/admin/requests?search=${classroom}`);
  await expect(admin.getByText(/Showing 1–1 of 1/)).toBeVisible();
  await expect(
    admin.getByRole("table").getByRole("link", { name: "Faulty projector" }),
  ).toBeVisible();

  await officer.goto("/assignments?search=pipe&status=open");
  await expect(
    officer
      .getByRole("table")
      .getByRole("link", { name: "Leaking pipe 1", exact: true }),
  ).toBeVisible();
  await expect(officer.getByRole("table").getByText("Urgent")).toBeVisible();
  await officer.getByLabel("Search", { exact: true }).fill("no match");
  await officer.getByLabel("Search", { exact: true }).press("Enter");
  await expect(
    officer.getByRole("heading", { name: "No Service Requests match" }),
  ).toBeVisible();
  await officer
    .getByRole("button", { name: "Clear search and filters" })
    .click();
  await expect(officer).toHaveURL(/\/assignments$/);
  await expect(
    officer
      .getByRole("table")
      .getByRole("link", { name: "Leaking pipe 1", exact: true }),
  ).toBeVisible();
});

test("real API Role dashboards refresh assignment counts and provide the Requester’s Completed answer", async ({
  browser,
  request,
}) => {
  await invite(
    request,
    "administrator",
    "funmi@example.test",
    "Funmi",
    "Adeyemi",
  );
  await invite(
    request,
    "maintenance_officer",
    "chinedu@example.test",
    "Chinedu",
    "Eze",
  );
  const officer = await signIn(browser, request, "chinedu@example.test");
  const admin = await signIn(browser, request, "funmi@example.test");
  const student = await signIn(browser, request, "ada@example.test");
  await student.getByLabel("First name").fill("Ada");
  await student.getByLabel("Last name").fill("Okafor");
  await student.getByRole("radio", { name: /Student/ }).check();
  await student
    .getByRole("button", { name: "Finish sign-up", exact: true })
    .click();
  await expect(
    student.getByRole("heading", { name: "Nothing reported yet" }),
  ).toBeVisible();
  const reference = await created(student, "Urgent leaking pipe");
  expect(
    (
      await admin
        .context()
        .request.put(`/api/service-requests/${reference}/priority`, {
          data: { priority: "urgent" },
        })
    ).ok(),
  ).toBeTruthy();
  await admin.goto("/dashboard");
  await expect(
    admin.getByRole("link", { name: "Submitted 1", exact: true }),
  ).toBeVisible();
  await expect(
    admin
      .getByRole("region", { name: "Urgent Open requests" })
      .getByRole("link", { name: "Urgent leaking pipe" }),
  ).toBeVisible();
  await admin
    .getByRole("button", { name: `Assign ${reference}`, exact: true })
    .click();
  const picker = admin.getByRole("dialog", { name: `Assign ${reference}` });
  await picker.getByRole("radio", { name: /Chinedu Eze/ }).check();
  await picker.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(
    admin.getByRole("link", { name: "Submitted 0", exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByRole("link", { name: "Assigned 1", exact: true }),
  ).toBeVisible();
  await officer.goto("/dashboard");
  const current = officer.getByRole("region", { name: "Current Assignments" });
  await expect(current.getByText("Urgent", { exact: true })).toBeVisible();
  await current.getByRole("link", { name: `Start ${reference}` }).click();
  await officer.getByRole("button", { name: "Start work" }).click();
  await expect(
    officer.getByRole("region", { name: "Finished the work?" }),
  ).toBeVisible();
  await officer.getByRole("button", { name: "Complete", exact: true }).click();
  await officer.getByRole("button", { name: "Mark as Completed" }).click();
  await expect(
    officer.getByText(`${reference} is Completed.`, { exact: true }),
  ).toBeVisible();
  await student.goto("/dashboard");
  await expect(
    student.getByRole("link", { name: "Waiting for your answer 1" }),
  ).toBeVisible();
  await expect(student.getByText("Urgent", { exact: true })).toHaveCount(0);
  await student.getByRole("link", { name: `Answer for ${reference}` }).click();
  await student.getByRole("button", { name: "Fixed", exact: true }).click();
  await student
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Dashboard", exact: true })
    .click();
  await expect(
    student.getByRole("link", { name: "Waiting for your answer 0" }),
  ).toBeVisible();
  await expect(student.getByRole("link", { name: "Verified 1" })).toBeVisible();
  await student.getByRole("link", { name: "Open requests 0" }).click();
  await expect(student).toHaveURL(/\/requests\?status=open$/);
  await expect(
    student.getByRole("heading", { name: "No Service Requests match" }),
  ).toBeVisible();
});
