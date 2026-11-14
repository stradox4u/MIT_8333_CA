import { expect, test } from "@playwright/test";

test("all font families load from the application without third-party requests", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const externalRequests: string[] = [];
  const fontResponses: { url: string; status: number }[] = [];
  let signedIn = false;
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== origin) {
      externalRequests.push(url);
      return route.abort();
    }
    if (new URL(url).pathname === "/api/auth/me")
      return route.fulfill(
        signedIn
          ? {
              json: {
                id: "ada",
                email: "ada@example.test",
                firstName: "Ada",
                lastName: "Okafor",
                role: "student",
                signUpComplete: true,
                hasPassword: false,
              },
            }
          : { status: 401, json: {} },
      );
    if (new URL(url).pathname === "/api/service-requests")
      return route.fulfill({
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
          page: 1,
          pageSize: 20,
          total: 1,
        },
      });
    return route.continue();
  });
  page.on("response", (response) => {
    if (response.request().resourceType() === "font")
      fontResponses.push({ url: response.url(), status: response.status() });
  });

  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  const weights = await page.evaluate(async () => {
    await document.fonts.ready;
    return Promise.all(
      [400, 550, 650, 700].map(async (weight) => {
        const faces = await document.fonts.load(`${weight} 16px "Inter"`);
        return faces.some((face) => face.status === "loaded");
      }),
    );
  });
  expect(weights).toEqual([true, true, true, true]);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toHaveCSS(
    "font-family",
    "Inter, sans-serif",
  );
  await expect(page.getByText("M", { exact: true })).toHaveCSS(
    "font-family",
    '"Source Serif 4", serif',
  );

  signedIn = true;
  await page.goto("/requests");
  await expect(
    page.getByRole("link", { name: "Leaking pipe under the sink" }),
  ).toBeVisible();
  await expect(page.locator(".font-mono").first()).toHaveCSS(
    "font-family",
    '"Roboto Mono", monospace',
  );
  await page.evaluate(() => document.fonts.ready);
  for (const family of ["Inter", "Source Serif 4", "Roboto Mono"]) {
    expect(
      await page.evaluate(
        (name) =>
          [...document.fonts].some(
            (face) => face.family === name && face.status === "loaded",
          ),
        family,
      ),
    ).toBe(true);
  }
  expect(
    fontResponses.some((response) => response.url.includes("inter-latin-")),
  ).toBe(true);
  expect(
    fontResponses.some((response) =>
      response.url.includes("source-serif-4-latin-"),
    ),
  ).toBe(true);
  expect(
    fontResponses.some((response) =>
      response.url.includes("roboto-mono-latin-"),
    ),
  ).toBe(true);
  for (const response of fontResponses) {
    expect(new URL(response.url).origin).toBe(origin);
    expect(response.status).toBe(200);
  }
  expect(externalRequests).toEqual([]);
});
