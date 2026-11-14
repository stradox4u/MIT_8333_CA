import { readFile } from "node:fs/promises";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
const controls = process.env.BROWSER_CONTROLS_URL ?? "http://127.0.0.1:4175";
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
  await page.goto((await mail.json()).link as string);
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
async function created(page: Page, title: string, categoryId = "plumbing") {
  const response = await page.context().request.post("/api/service-requests", {
    data: {
      title,
      categoryId,
      location: "Hostel B, room 214",
      description: "Water drips from the pipe and collects on the floor.",
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).reference as string;
}
async function urgent(page: Page, reference: string) {
  const response = await page
    .context()
    .request.put(`/api/service-requests/${reference}/priority`, {
      data: { priority: "urgent" },
    });
  expect(response.ok()).toBeTruthy();
}

/** Parses the export's RFC 4180 rows. */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  // Keep a final row that has no line break after it.
  if (cell || row.length) rows.push([...row, cell.replace(/\r$/, "")]);
  return rows;
}

/** Follows Export CSV and answers the downloaded file's name and rows. */
async function exportCsv(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  const [header, ...rows] = parseCsv(
    await readFile((await download.path())!, "utf8"),
  );
  return { name: download.suggestedFilename(), header: header!, rows };
}
async function listedReferences(page: Page) {
  return page
    .getByRole("table")
    .locator("tbody tr td:first-child")
    .allTextContents();
}

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${controls}/reset`)).ok()).toBeTruthy();
});

test("an Administrator exports exactly the filtered list as CSV", async ({
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
  const admin = await signIn(browser, request, "funmi@example.test");
  const first = await created(admin, "Leaking pipe in the kitchen");
  const second = await created(admin, "Burst pipe, ground floor");
  await created(admin, "Dripping pipe in the lab");
  await created(admin, "Faulty projector", "classroom_equipment");
  await created(admin, "Sparking socket", "electrical");
  await urgent(admin, first);
  await urgent(admin, second);

  await admin.goto("/admin/requests");
  await expect(admin.getByText(/Showing 1–5 of 5/)).toBeVisible();
  await admin.getByLabel("Search", { exact: true }).fill("pipe");
  await admin.getByLabel("Search", { exact: true }).press("Enter");
  await admin
    .getByLabel("Request Category", { exact: true })
    .selectOption("plumbing");
  await admin.getByLabel("Status", { exact: true }).selectOption("open");
  await admin.getByLabel("Priority", { exact: true }).selectOption("urgent");
  await admin.getByLabel("Sort", { exact: true }).selectOption("priority");
  await expect(admin.getByText(/Showing 1–2 of 2/)).toBeVisible();
  await expect(
    admin.getByText("All 2 matching requests, not just this page"),
  ).toBeVisible();
  const href = await admin
    .getByRole("link", { name: "Export CSV" })
    .getAttribute("href");
  expect(new URL(href!, admin.url()).pathname).toBe(
    "/api/service-requests/export.csv",
  );
  expect(Object.fromEntries(new URL(href!, admin.url()).searchParams)).toEqual({
    search: "pipe",
    category: "plumbing",
    status: "open",
    priority: "urgent",
    sort: "priority",
  });

  const filtered = await exportCsv(admin);
  expect(filtered.name).toBe("service-requests.csv");
  expect(filtered.header[0]).toBe("Reference");
  expect(filtered.rows.map((row) => row[0])).toEqual(
    await listedReferences(admin),
  );
  expect(filtered.rows.map((row) => row[0]).sort()).toEqual(
    [first, second].sort(),
  );
  expect(filtered.rows.every((row) => row[4] === "Urgent")).toBe(true);
  expect(filtered.rows[0]![3]).toBe("Hostel B, room 214");

  await admin.getByRole("button", { name: /Remove filter Priority/ }).click();
  await expect(admin.getByText(/Showing 1–3 of 3/)).toBeVisible();
  const wider = await exportCsv(admin);
  expect(wider.rows.map((row) => row[0])).toEqual(
    await listedReferences(admin),
  );
  expect(wider.rows).toHaveLength(3);
});
