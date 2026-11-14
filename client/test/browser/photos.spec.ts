import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";

const controls = process.env.BROWSER_CONTROLS_URL ?? "http://127.0.0.1:4175";
const png = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082",
  "hex",
);
const photo = (name: string) => ({ name, mimeType: "image/png", buffer: png });
async function signIn(
  browser: Browser,
  request: APIRequestContext,
  email: string,
  role: string,
) {
  expect(
    (
      await request.post(`${controls}/invite`, {
        data: {
          email,
          role,
          firstName: role === "maintenance_officer" ? "Chinedu" : "Ada",
          lastName: "Okafor",
        },
      })
    ).status(),
  ).toBe(201);
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
  await page.goto((await mail.json()).link);
  await page.getByRole("button", { name: "Continue signing in" }).click();
  await expect(
    page.getByRole("heading", { name: /^Welcome back,/ }),
  ).toBeVisible();
  return page;
}
async function capture(page: Page, name: string) {
  for (const [size, width, height] of [
    ["desktop", 1280, 900],
    ["mobile", 390, 844],
    ["small-phone", 320, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      window.scrollTo(0, 0);
      await Promise.all(
        Array.from(document.images, (image) => image.decode().catch(() => {})),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/photos/${name}-${size}.png`,
      fullPage: true,
    });
  }
}
async function loadedPhotos(page: Page, stage: string, count: number) {
  const images = page.getByRole("img", {
    name: new RegExp(`^${stage} photo \\d+$`),
  });
  await expect(images).toHaveCount(count);
  for (const image of await images.all())
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1);
}

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${controls}/reset`)).ok()).toBeTruthy();
});

test("private photos upload directly, survive report edits and remain after Not fixed and a second completion", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const officer = await signIn(
    browser,
    request,
    "photos-officer@example.test",
    "maintenance_officer",
  );
  const admin = await signIn(
    browser,
    request,
    "photos-admin@example.test",
    "administrator",
  );
  const student = await signIn(
    browser,
    request,
    "photos-student@example.test",
    "student",
  );
  await student.goto("/requests/new");
  await student.getByLabel("Title").fill("Leaking pipe under the sink");
  await student.getByRole("radio", { name: "Plumbing" }).check();
  await student.getByLabel("Location").fill("Hostel B, room 214");
  await student
    .getByLabel("Description")
    .fill("The pipe drips when the tap runs.");
  const [upload] = await Promise.all([
    student.waitForRequest(
      (req) => req.method() === "PUT" && req.url().includes("/__test/photos"),
    ),
    student
      .getByLabel("Add photos")
      .setInputFiles([
        photo("leak.png"),
        photo("joint.png"),
        photo("floor.png"),
      ]),
  ]);
  expect(new URL(upload.url()).port).toBe("4174");
  expect((await upload.allHeaders())["cookie"]).toBeUndefined();
  expect(upload.headers()["content-type"]).toBe("image/png");
  expect((await upload.allHeaders())["content-length"]).toBe(
    String(png.length),
  );
  await expect(student.getByText("Uploaded", { exact: true })).toHaveCount(3);
  await capture(student, "report-uploaded");
  await student.getByRole("button", { name: "Submit Service Request" }).click();
  await expect(student).toHaveURL(/\/requests\/SR-PLUMB-1$/);
  await loadedPhotos(student, "Report", 3);
  const link = await student
    .getByRole("link", { name: "Open Report photo 1 in a new tab" })
    .getAttribute("href");
  const downloaded = await request.get(link!);
  expect(downloaded.ok()).toBeTruthy();
  expect(await downloaded.body()).toEqual(png);
  await student
    .getByRole("link", { name: "Edit details", exact: true })
    .click();
  await student.getByRole("button", { name: "Remove Report photo 1" }).click();
  await student
    .getByLabel("Add photos")
    .setInputFiles(photo("replacement.png"));
  await expect(student.getByText("Uploaded", { exact: true })).toHaveCount(3);
  await capture(student, "edit-uploaded");
  await student.getByRole("button", { name: "Save changes" }).click();
  await loadedPhotos(student, "Report", 3);
  await admin.goto("/requests/SR-PLUMB-1");
  await admin
    .getByRole("button", { name: "Assign a Maintenance Officer", exact: true })
    .click();
  const picker = admin.getByRole("dialog", { name: "Assign SR-PLUMB-1" });
  await picker.getByRole("radio", { name: /Chinedu/ }).check();
  await picker.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(picker).toBeHidden();
  await officer.goto("/requests/SR-PLUMB-1");
  await officer.getByRole("button", { name: "Start work" }).click();
  await officer.getByRole("button", { name: "Complete", exact: true }).click();
  await officer.getByLabel(/Note for the Requester/).fill("Replaced the pipe.");
  await officer
    .getByLabel("Add photos")
    .setInputFiles([
      photo("fixed.png"),
      photo("seal.png"),
      photo("dry-floor.png"),
    ]);
  await expect(officer.getByText("Uploaded", { exact: true })).toHaveCount(3);
  await capture(officer, "completion-uploaded");
  await officer.getByRole("button", { name: "Mark as Completed" }).click();
  await expect(officer.getByText("SR-PLUMB-1 is Completed.")).toBeVisible();
  await student.reload();
  await loadedPhotos(student, "Report", 3);
  await loadedPhotos(student, "Completion", 3);
  await student.getByRole("button", { name: "Not fixed", exact: true }).click();
  await student.getByLabel("Reason").fill("It still leaks when the tap runs.");
  await student.getByRole("button", { name: "Send Not fixed" }).click();
  await expect(
    student.getByText("SR-PLUMB-1 is Assigned again."),
  ).toBeVisible();
  await loadedPhotos(student, "Completion", 3);
  await officer.reload();
  await officer.getByRole("button", { name: "Start work" }).click();
  await officer.getByRole("button", { name: "Complete", exact: true }).click();
  await officer
    .getByLabel("Add photos")
    .setInputFiles(photo("second-repair.png"));
  await expect(officer.getByText("Uploaded", { exact: true })).toHaveCount(1);
  await officer.getByRole("button", { name: "Mark as Completed" }).click();
  await expect(officer.getByText("SR-PLUMB-1 is Completed.")).toBeVisible();
  await student.reload();
  await loadedPhotos(student, "Completion", 4);
  await capture(student, "tracking-retained-evidence");
  await student.getByRole("button", { name: "Fixed", exact: true }).click();
  await expect(student.getByText("SR-PLUMB-1 is Verified.")).toBeVisible();
  await loadedPhotos(student, "Completion", 4);
  await admin.reload();
  await loadedPhotos(admin, "Report", 3);
  await loadedPhotos(admin, "Completion", 4);
  await Promise.all([
    student.context().close(),
    officer.context().close(),
    admin.context().close(),
  ]);
});

test("photo controls retain the approved palette and fit phones through upload failures and expired links", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const details = {
    reference: "SR-PLUMB-1",
    title: "Leaking pipe under the sink",
    category: { id: "plumbing", name: "Plumbing", code: "PLUMB" },
    location: "Hostel B, room 214",
    status: "submitted",
    requester: { id: "ada", name: "Ada Okafor" },
    submittedAt: "2026-11-12T09:00:00Z",
    assignment: null,
    description: "Water drips from the pipe.",
    timeline: [],
  };
  let reads = 0,
    attempt = 0,
    failImages = true;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          id: "ada",
          email: "ada@example.test",
          firstName: "Ada",
          lastName: "Okafor",
          role: "student",
          signUpComplete: true,
          hasPassword: false,
        },
      });
    if (path.endsWith("/request-categories"))
      return route.fulfill({ json: [details.category] });
    if (path.endsWith("/photo-uploads")) {
      attempt++;
      return route.fulfill({
        status: 201,
        json: {
          objectKey: `issued/${attempt}`,
          url: "https://storage.example.test/ui-upload",
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          expiresAt: "2026-11-14T10:00:00Z",
        },
      });
    }
    if (path.endsWith("/SR-PLUMB-1")) {
      reads++;
      if (reads === 2) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({
        json: {
          ...details,
          photos: [
            {
              id: "photo",
              objectKey: "issued/existing",
              stage: "report",
              contentType: "image/png",
              size: png.length,
              attachedAt: details.submittedAt,
              url: `https://storage.example.test/private?signature=${reads}`,
              expiresAt: "2026-11-14T10:00:00Z",
            },
          ],
        },
      });
    }
    return route.fulfill({
      json: { items: [], total: 0, page: 1, pageSize: 20 },
    });
  });
  await page.route("https://storage.example.test/**", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "PUT,GET",
      "Access-Control-Allow-Headers": "content-type",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (route.request().method() === "PUT") {
      if (attempt === 1) await gate;
      return route.fulfill({ status: attempt === 1 ? 503 : 200, headers });
    }
    return failImages
      ? route.fulfill({ status: 403, headers })
      : route.fulfill({ body: png, contentType: "image/png", headers });
  });
  await page.goto("/requests/new");
  const fileName = "leaking-pipe-" + "long-filename-".repeat(8) + ".png";
  await page.getByLabel("Add photos").setInputFiles(photo(fileName));
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit Service Request" }),
  ).toBeDisabled();
  const chooser = page
    .locator("label")
    .filter({ has: page.getByLabel("Add photos") });
  await expect(chooser).toHaveCSS("border-top-color", "rgb(10, 16, 69)");
  await expect(chooser).toHaveCSS("border-radius", "7px");
  await capture(page, "uploading");
  release();
  await expect(page.getByText("Upload failed", { exact: true })).toBeVisible();
  await capture(page, "upload-failure");
  await page.getByRole("button", { name: `Retry ${fileName}` }).click();
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByAltText(`${fileName} preview`)
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(1);
  await capture(page, "upload-retried");
  await page.goto("/requests/SR-PLUMB-1");
  await expect(page.getByText("This photo couldn’t load.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh photo links" }),
  ).toBeEnabled();
  expect(reads).toBe(2);
  await expect(
    page.getByText(
      "Photo links couldn’t refresh. Your changes are still here. Try again.",
    ),
  ).toBeVisible();
  await capture(page, "expired-links");
  failImages = false;
  await page.getByRole("button", { name: "Refresh photo links" }).click();
  await loadedPhotos(page, "Report", 1);
  await capture(page, "refreshed-links");
});
