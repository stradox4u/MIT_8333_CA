import { beforeEach, expect, test } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/vue";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { api, open, signedIn, summary, withCategories } from "./support";
import type {
  ServiceRequestDetails,
  RequestPhoto,
} from "../src/service-requests/api";

const cors = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Methods": "PUT",
  "Access-Control-Allow-Headers": "content-type,x-amz-meta-example",
};
beforeEach(() => {
  server.use(
    http.options(
      "https://storage.example.test/*",
      () => new HttpResponse(null, { headers: cors }),
    ),
  );
});

const detail = (photos: RequestPhoto[] = []): ServiceRequestDetails => ({
  ...summary("SR-PLUMB-1", "Leaking tap"),
  status: "submitted",
  priority: undefined,
  description: "The tap drips onto the floor.",
  timeline: [],
  photos,
});
function tracked(data = detail()) {
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
      HttpResponse.json(data),
    ),
  );
  return data;
}
async function fillReport(user: ReturnType<typeof open>["user"]) {
  await user.type(await screen.findByLabelText("Title"), "Leaking tap");
  await user.click(await screen.findByRole("radio", { name: "Plumbing" }));
  await user.type(screen.getByLabelText("Location"), "Hostel B");
  await user.type(
    screen.getByLabelText("Description"),
    "The tap drips onto the floor.",
  );
}

test("a report waits for a direct signed upload and submits its server-issued object key", async () => {
  signedIn();
  withCategories();
  tracked();
  const signed: unknown[] = [],
    sent: unknown[] = [];
  let finish!: () => void;
  let stored: Request | undefined;
  server.use(
    http.post(`${api}/photo-uploads`, async ({ request }) => {
      signed.push(await request.json());
      return HttpResponse.json(
        {
          objectKey: "local/uploads/server-key",
          url: "https://storage.example.test/unrelated-signed-path",
          method: "PUT",
          headers: {
            "Content-Type": "image/png",
            "x-amz-meta-example": "signed",
          },
          expiresAt: "2026-11-14T10:00:00Z",
        },
        { status: 201 },
      );
    }),
    http.put(
      "https://storage.example.test/unrelated-signed-path",
      async ({ request }) => {
        stored = request;
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return new HttpResponse(null, { status: 200, headers: cors });
      },
    ),
    http.post(`${api}/service-requests`, async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json({ reference: "SR-PLUMB-1" }, { status: 201 });
    }),
  );
  const { user, runtime } = open("/requests/new");
  await fillReport(user);
  await user.upload(
    screen.getByLabelText("Add photos"),
    new File(["png-bytes"], "leak.png", { type: "image/png" }),
  );
  await waitFor(() => expect(stored).toBeDefined());
  expect(signed).toEqual([{ contentType: "image/png", contentLength: 9 }]);
  expect(stored!.headers.get("content-type")).toBe("image/png");
  expect(stored!.headers.get("x-amz-meta-example")).toBe("signed");
  expect(stored!.headers.get("cookie")).toBeNull();
  expect(await stored!.text()).toBe("png-bytes");
  expect(
    screen.getByRole("progressbar", { name: "leak.png upload" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Submit Service Request" })
      .hasAttribute("disabled"),
  ).toBe(true);
  finish();
  await screen.findByText("Uploaded");
  await user.click(
    screen.getByRole("button", { name: "Submit Service Request" }),
  );
  await waitFor(() =>
    expect(sent).toEqual([
      {
        title: "Leaking tap",
        categoryId: "plumbing",
        location: "Hostel B",
        description: "The tap drips onto the floor.",
        photoKeys: ["local/uploads/server-key"],
      },
    ]),
  );
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.path).toBe("/requests/SR-PLUMB-1"),
  );
  runtime.queryClient.clear();
});

test("photo validation rejects unsupported, empty and oversized files before signing and caps the selection at three", async () => {
  signedIn();
  withCategories();
  let signed = 0;
  server.use(
    http.post(`${api}/photo-uploads`, () => {
      signed++;
      return HttpResponse.json(
        {
          objectKey: `uploads/${signed}`,
          url: `https://storage.example.test/${signed}`,
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          expiresAt: "2026-11-14T10:00:00Z",
        },
        { status: 201 },
      );
    }),
    http.put(
      "https://storage.example.test/*",
      () => new HttpResponse(null, { headers: cors }),
    ),
  );
  const { runtime } = open("/requests/new");
  const input = await screen.findByLabelText("Add photos");
  await fireEvent.change(input, {
    target: {
      files: [
        new File(["gif"], "animation.gif", { type: "image/gif" }),
        new File([], "empty.png", { type: "image/png" }),
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", {
          type: "image/png",
        }),
      ],
    },
  });
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain(
    "animation.gif: Choose a JPEG, PNG or WebP photo.",
  );
  expect(alert.textContent).toContain(
    "empty.png: Choose a nonempty photo up to 5 MiB.",
  );
  expect(alert.textContent).toContain(
    "large.png: Choose a nonempty photo up to 5 MiB.",
  );
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(signed).toBe(0);
  await fireEvent.change(input, {
    target: {
      files: [1, 2, 3, 4].map(
        (i) => new File(["image"], `${i}.png`, { type: "image/png" }),
      ),
    },
  });
  await waitFor(() => expect(screen.getAllByText("Uploaded")).toHaveLength(3));
  expect(screen.getByRole("alert").textContent).toContain(
    "Choose up to 3 photos.",
  );
  expect(signed).toBe(3);
  expect(screen.queryByText("4.png")).toBeNull();
  runtime.queryClient.clear();
});

test("a failed upload keeps the report fields and can be retried or removed before submission", async () => {
  signedIn();
  withCategories();
  tracked();
  let attempt = 0;
  const sent: unknown[] = [];
  server.use(
    http.post(`${api}/photo-uploads`, () => {
      attempt++;
      return HttpResponse.json(
        {
          objectKey: `issued/${attempt}`,
          url: "https://storage.example.test/leak",
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          expiresAt: "2026-11-14T10:00:00Z",
        },
        { status: 201 },
      );
    }),
    http.put(
      "https://storage.example.test/leak",
      () =>
        new HttpResponse(null, {
          status: attempt === 1 ? 503 : 200,
          headers: cors,
        }),
    ),
    http.post(`${api}/service-requests`, async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json({ reference: "SR-PLUMB-1" }, { status: 201 });
    }),
  );
  const { user, runtime } = open("/requests/new");
  await fillReport(user);
  await user.upload(
    screen.getByLabelText("Add photos"),
    new File(["png"], "leak.png", { type: "image/png" }),
  );
  await screen.findByText("Upload failed");
  await user.click(
    screen.getByRole("button", { name: "Submit Service Request" }),
  );
  expect(sent).toEqual([]);
  expect(screen.getByLabelText("Title")).toHaveProperty("value", "Leaking tap");
  await user.click(screen.getByRole("button", { name: "Retry leak.png" }));
  await screen.findByText("Uploaded");
  expect(attempt).toBe(2);
  await user.click(screen.getByRole("button", { name: "Remove leak.png" }));
  expect(screen.queryByText("leak.png")).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Submit Service Request" }),
  );
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).not.toHaveProperty("photoKeys");
  runtime.queryClient.clear();
});

test.each(["remove", "leave"])(
  "%s cancels an unfinished photo without attaching its late result",
  async (action) => {
    signedIn();
    withCategories();
    let signing: Request | undefined;
    let finish!: () => void;
    let putCount = 0;
    server.use(
      http.post(`${api}/photo-uploads`, async ({ request }) => {
        signing = request;
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return HttpResponse.json(
          {
            objectKey: "late/key",
            url: "https://storage.example.test/late",
            method: "PUT",
            headers: { "Content-Type": "image/png" },
            expiresAt: "2026-11-14T10:00:00Z",
          },
          { status: 201 },
        );
      }),
      http.put("https://storage.example.test/late", () => {
        putCount++;
        return new HttpResponse(null, { headers: cors });
      }),
    );
    const { user, runtime } = open("/requests/new");
    await user.upload(
      await screen.findByLabelText("Add photos"),
      new File(["png"], "late.png", { type: "image/png" }),
    );
    await waitFor(() => expect(signing).toBeDefined());
    if (action === "remove")
      await user.click(screen.getByRole("button", { name: "Remove late.png" }));
    else
      await user.click(
        within(screen.getByRole("navigation", { name: "Main" })).getByRole(
          "link",
          { name: "My Requests" },
        ),
      );
    await waitFor(() => expect(signing!.signal.aborted).toBe(true));
    finish();
    if (action === "leave") await runtime.router.push("/requests/new");
    await screen.findByLabelText("Add photos");
    expect(screen.queryByText("late.png")).toBeNull();
    expect(putCount).toBe(0);
    expect(
      screen
        .getByRole("button", { name: "Submit Service Request" })
        .hasAttribute("disabled"),
    ).toBe(false);
    runtime.queryClient.clear();
  },
);

const reportPhoto: RequestPhoto = {
  id: "photo-1",
  objectKey: "issued/report-key",
  stage: "report",
  contentType: "image/png",
  size: 3,
  attachedAt: "2026-11-14T09:00:00Z",
  url: "https://storage.example.test/private-photo?signature=old",
  expiresAt: "2026-11-14T09:15:00Z",
};
test.each(["keep", "remove"])(
  "editing can %s existing report photos using their opaque object keys",
  async (action) => {
    signedIn();
    withCategories();
    const data = tracked(
      detail([
        reportPhoto,
        {
          ...reportPhoto,
          id: "completion",
          objectKey: "issued/completion",
          stage: "completion",
        },
      ]),
    );
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${api}/service-requests/SR-PLUMB-1`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(data);
      }),
    );
    const { user, runtime } = open("/requests/SR-PLUMB-1/edit");
    const remove = await screen.findByRole("button", {
      name: "Remove Report photo 1",
    });
    expect(screen.queryByText("Completion photo 1")).toBeNull();
    if (action === "remove") await user.click(remove);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(sent?.photoKeys).toEqual(
        action === "keep" ? ["issued/report-key"] : [],
      ),
    );
    await waitFor(() =>
      expect(runtime.router.currentRoute.value.path).toBe(
        "/requests/SR-PLUMB-1",
      ),
    );
    runtime.queryClient.clear();
  },
);

test("the current officer completes with new uploaded evidence while earlier completion photos remain read-only", async () => {
  signedIn("maintenance_officer", {
    id: "chinedu",
    firstName: "Chinedu",
    lastName: "Eze",
  });
  const data = tracked({
    ...detail(
      Array.from({ length: 6 }, (_, i) => ({
        ...reportPhoto,
        id: `old-${i}`,
        stage: "completion" as const,
        objectKey: `old/${i}`,
      })),
    ),
    status: "in_progress",
    assignment: {
      officer: { id: "chinedu", name: "Chinedu Eze" },
      assignedAt: "2026-11-14T08:00:00Z",
    },
  });
  let finish!: () => void;
  let sent: unknown;
  server.use(
    http.post(`${api}/photo-uploads`, () =>
      HttpResponse.json(
        {
          objectKey: "issued/new-evidence",
          url: "https://storage.example.test/evidence",
          method: "PUT",
          headers: { "Content-Type": "image/webp" },
          expiresAt: "2026-11-14T10:00:00Z",
        },
        { status: 201 },
      ),
    ),
    http.put("https://storage.example.test/evidence", async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return new HttpResponse(null, { headers: cors });
    }),
    http.post(
      `${api}/service-requests/SR-PLUMB-1/complete`,
      async ({ request }) => {
        sent = await request.json();
        data.status = "completed";
        return HttpResponse.json(data);
      },
    ),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await user.click(await screen.findByRole("button", { name: "Complete" }));
  const form = screen.getByRole("form", { name: "Complete SR-PLUMB-1" });
  await user.type(
    within(form).getByLabelText("Note for the Requester (optional)"),
    "Replaced the pipe.",
  );
  await user.upload(
    within(form).getByLabelText("Add photos"),
    new File(["webp"], "finished.webp", { type: "image/webp" }),
  );
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(
    within(form)
      .getByRole("button", { name: "Mark as Completed" })
      .hasAttribute("disabled"),
  ).toBe(true);
  finish();
  await within(form).findByText("Uploaded");
  await user.click(
    within(form).getByRole("button", { name: "Mark as Completed" }),
  );
  await waitFor(() =>
    expect(sent).toEqual({
      note: "Replaced the pipe.",
      photoKeys: ["issued/new-evidence"],
    }),
  );
  await screen.findByText("SR-PLUMB-1 is Completed.");
  runtime.queryClient.clear();
});

test.each(["requester", "administrator", "officer", "former"])(
  "the %s can open signed report and retained completion photos from tracking",
  async (viewer) => {
    signedIn(
      viewer === "administrator"
        ? "administrator"
        : viewer === "requester"
          ? "student"
          : "maintenance_officer",
      {
        id:
          viewer === "requester"
            ? "ada"
            : viewer === "officer"
              ? "chinedu"
              : "other",
        firstName: "Ada",
        lastName: "Okafor",
      },
    );
    tracked({
      ...detail([
        reportPhoto,
        {
          ...reportPhoto,
          id: "finished",
          objectKey: "issued/finished",
          stage: "completion",
          url: "https://storage.example.test/finished?signed=private",
        },
      ]),
      status: "assigned",
      assignment: {
        officer: { id: "chinedu", name: "Chinedu Eze" },
        assignedAt: "2026-11-14T08:00:00Z",
      },
    });
    const { runtime } = open("/requests/SR-PLUMB-1");
    const report = await screen.findByRole("link", {
      name: "Open Report photo 1 in a new tab",
    });
    expect(report.getAttribute("href")).toBe(reportPhoto.url);
    expect(report.getAttribute("rel")).toContain("noreferrer");
    expect(
      screen
        .getByRole("link", { name: "Open Completion photo 1 in a new tab" })
        .getAttribute("href"),
    ).toBe("https://storage.example.test/finished?signed=private");
    expect(screen.getByAltText("Report photo 1").getAttribute("src")).toBe(
      reportPhoto.url,
    );
    runtime.queryClient.clear();
  },
);

test("an expired image refreshes signed details once and offers a bounded manual retry when replacement also fails", async () => {
  signedIn();
  let reads = 0;
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () => {
      reads++;
      return HttpResponse.json(
        detail([
          {
            ...reportPhoto,
            url: `https://storage.example.test/photo?signature=${reads}`,
          },
        ]),
      );
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1");
  await fireEvent.error(await screen.findByAltText("Report photo 1"));
  await waitFor(() =>
    expect(screen.getByAltText("Report photo 1").getAttribute("src")).toBe(
      "https://storage.example.test/photo?signature=2",
    ),
  );
  await fireEvent.error(screen.getByAltText("Report photo 1"));
  await screen.findByText("This photo couldn’t load.");
  expect(reads).toBe(2);
  await user.click(screen.getByRole("button", { name: "Refresh photo links" }));
  await waitFor(() =>
    expect(screen.getByAltText("Report photo 1").getAttribute("src")).toBe(
      "https://storage.example.test/photo?signature=3",
    ),
  );
  await fireEvent.error(screen.getByAltText("Report photo 1"));
  expect(reads).toBe(3);
  runtime.queryClient.clear();
});

test.each(["report", "completion"])(
  "%s attachment validation appears beside photos and retry retains uploaded keys and text",
  async (screenName) => {
    if (screenName === "completion")
      signedIn("maintenance_officer", {
        id: "chinedu",
        firstName: "Chinedu",
        lastName: "Eze",
      });
    else signedIn();
    withCategories();
    const data = tracked({
      ...detail(),
      status: screenName === "completion" ? "in_progress" : "submitted",
      assignment: {
        officer: { id: "chinedu", name: "Chinedu Eze" },
        assignedAt: "2026-11-14T08:00:00Z",
      },
    });
    let attempts = 0;
    let release!: () => void;
    const sent: Record<string, unknown>[] = [];
    const path =
      screenName === "report"
        ? `${api}/service-requests`
        : `${api}/service-requests/SR-PLUMB-1/complete`;
    server.use(
      http.post(`${api}/photo-uploads`, () =>
        HttpResponse.json(
          {
            objectKey: "issued/kept",
            url: "https://storage.example.test/kept",
            method: "PUT",
            headers: { "Content-Type": "image/png" },
            expiresAt: "2026-11-14T10:00:00Z",
          },
          { status: 201 },
        ),
      ),
      http.put(
        "https://storage.example.test/kept",
        () => new HttpResponse(null, { headers: cors }),
      ),
      http.post(path, async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        attempts++;
        if (attempts === 1)
          return HttpResponse.json(
            {
              issues: [
                {
                  path: ["photoKeys"],
                  message:
                    "This photo is no longer available. Remove it and add it again.",
                },
              ],
            },
            { status: 400 },
          );
        if (attempts === 2)
          return HttpResponse.json(
            {
              message:
                "Photo storage is temporarily unavailable. Please try again.",
            },
            { status: 503 },
          );
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return screenName === "report"
          ? HttpResponse.json({ reference: "SR-PLUMB-1" }, { status: 201 })
          : HttpResponse.json({ ...data, status: "completed" });
      }),
    );
    const { user, runtime } = open(
      screenName === "report" ? "/requests/new" : "/requests/SR-PLUMB-1",
    );
    if (screenName === "report") await fillReport(user);
    else {
      await user.click(await screen.findByRole("button", { name: "Complete" }));
      await user.type(
        screen.getByLabelText("Note for the Requester (optional)"),
        "New pipe fitted.",
      );
    }
    await user.upload(
      screen.getByLabelText("Add photos"),
      new File(["png"], "keep.png", { type: "image/png" }),
    );
    await screen.findByText("Uploaded");
    const submit = screen.getByRole("button", {
      name:
        screenName === "report"
          ? "Submit Service Request"
          : "Mark as Completed",
    });
    await user.click(submit);
    await screen.findByText(
      "This photo is no longer available. Remove it and add it again.",
    );
    const input = screen.getByLabelText("Add photos");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("photo-error");
    await user.click(submit);
    await screen.findByText(
      "Photo storage is temporarily unavailable. Please try again.",
    );
    await user.click(submit);
    await waitFor(() => expect(release).toBeTypeOf("function"));
    expect(input.hasAttribute("disabled")).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Remove keep.png" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(sent.map((body) => body.photoKeys)).toEqual([
      ["issued/kept"],
      ["issued/kept"],
      ["issued/kept"],
    ]);
    expect(sent[2]).toHaveProperty(
      screenName === "report" ? "title" : "note",
      screenName === "report" ? "Leaking tap" : "New pipe fitted.",
    );
    release();
    await waitFor(() =>
      expect(screen.queryByLabelText("Add photos")).toBeNull(),
    );
    runtime.queryClient.clear();
  },
);

test("an ended session while signing a photo follows the existing Sign in flow", async () => {
  signedIn();
  withCategories();
  server.use(
    http.post(`${api}/photo-uploads`, () => {
      server.use(
        http.get(
          `${api}/auth/me`,
          () => new HttpResponse(null, { status: 401 }),
        ),
      );
      return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
    }),
  );
  const { user, runtime } = open("/requests/new");
  await user.upload(
    await screen.findByLabelText("Add photos"),
    new File(["png"], "leak.png", { type: "image/png" }),
  );
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.path).toBe("/sign-in"),
  );
  runtime.queryClient.clear();
});

test("refreshing expired edit previews preserves dirty fields and selected report keys with bounded retry", async () => {
  signedIn();
  withCategories();
  let reads = 0;
  let sent: Record<string, unknown> | undefined;
  server.use(
    http.get(`${api}/service-requests/SR-PLUMB-1`, () => {
      reads++;
      return HttpResponse.json(
        detail([
          {
            ...reportPhoto,
            url: `https://storage.example.test/report?signature=${reads}`,
          },
        ]),
      );
    }),
    http.patch(`${api}/service-requests/SR-PLUMB-1`, async ({ request }) => {
      sent = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(detail());
    }),
  );
  const { user, runtime } = open("/requests/SR-PLUMB-1/edit");
  const title = await screen.findByLabelText("Title");
  await user.clear(title);
  await user.type(title, "New details still here");
  await fireEvent.error(screen.getByAltText("Report photo 1 preview"));
  await waitFor(() =>
    expect(
      screen.getByAltText("Report photo 1 preview").getAttribute("src"),
    ).toBe("https://storage.example.test/report?signature=2"),
  );
  await fireEvent.error(screen.getByAltText("Report photo 1 preview"));
  await screen.findByText("This photo couldn’t load.");
  expect(reads).toBe(2);
  await user.click(screen.getByRole("button", { name: "Refresh photo links" }));
  await waitFor(() =>
    expect(
      screen.getByAltText("Report photo 1 preview").getAttribute("src"),
    ).toBe("https://storage.example.test/report?signature=3"),
  );
  expect(title).toHaveProperty("value", "New details still here");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(sent).toHaveProperty("photoKeys", ["issued/report-key"]),
  );
  expect(sent).toHaveProperty("title", "New details still here");
  runtime.queryClient.clear();
});

test.each([
  { mode: "edit", failure: "503" },
  { mode: "edit", failure: "network" },
  { mode: "completion", failure: "503" },
  { mode: "completion", failure: "network" },
])(
  "a transient $failure photo refresh preserves the $mode draft and its selected keys",
  async ({ mode, failure }) => {
    if (mode === "completion")
      signedIn("maintenance_officer", {
        id: "chinedu",
        firstName: "Chinedu",
        lastName: "Eze",
      });
    else signedIn();
    withCategories();
    const data: ServiceRequestDetails = {
      ...detail([
        reportPhoto,
        {
          ...reportPhoto,
          id: "photo-2",
          objectKey: "issued/second",
          url: "https://storage.example.test/second",
        },
      ]),
      status: mode === "completion" ? "in_progress" : "submitted",
      assignment: {
        officer: { id: "chinedu", name: "Chinedu Eze" },
        assignedAt: "2026-11-14T08:00:00Z",
      },
    };
    let reads = 0;
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.get(`${api}/service-requests/SR-PLUMB-1`, () => {
        reads++;
        return reads === 2
          ? failure === "network"
            ? HttpResponse.error()
            : HttpResponse.json(
                { message: "Storage unavailable" },
                { status: 503 },
              )
          : HttpResponse.json({
              ...data,
              photos: data.photos!.map((photo) => ({
                ...photo,
                url: `https://storage.example.test/${photo.id}?signature=${reads}`,
              })),
            });
      }),
      http.post(`${api}/photo-uploads`, () =>
        HttpResponse.json(
          {
            objectKey: "issued/new",
            url: "https://storage.example.test/new",
            method: "PUT",
            headers: { "Content-Type": "image/png" },
            expiresAt: "2026-11-14T10:00:00Z",
          },
          { status: 201 },
        ),
      ),
      http.put(
        "https://storage.example.test/new",
        () => new HttpResponse(null, { headers: cors }),
      ),
      http.patch(`${api}/service-requests/SR-PLUMB-1`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(data);
      }),
      http.post(
        `${api}/service-requests/SR-PLUMB-1/complete`,
        async ({ request }) => {
          sent = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ...data, status: "completed" });
        },
      ),
    );
    const { user, runtime } = open(
      mode === "edit" ? "/requests/SR-PLUMB-1/edit" : "/requests/SR-PLUMB-1",
    );
    if (mode === "completion")
      await user.click(await screen.findByRole("button", { name: "Complete" }));
    const text = await screen.findByLabelText(
      mode === "edit" ? "Title" : "Note for the Requester (optional)",
    );
    await user.clear(text);
    await user.type(text, "Keep my latest changes");
    if (mode === "edit")
      await user.click(
        screen.getByRole("button", { name: "Remove Report photo 1" }),
      );
    await user.upload(
      screen.getByLabelText("Add photos"),
      new File(["png"], "new.png", { type: "image/png" }),
    );
    await waitFor(() =>
      expect(screen.getAllByText("Uploaded")).toHaveLength(
        mode === "edit" ? 2 : 1,
      ),
    );
    await fireEvent.error(
      screen.getByAltText(
        mode === "edit" ? "Report photo 2 preview" : "Report photo 1",
      ),
    );
    await screen.findByText(
      "Photo links couldn’t refresh. Your changes are still here. Try again.",
    );
    expect(
      screen.getByLabelText(
        mode === "edit" ? "Title" : "Note for the Requester (optional)",
      ),
    ).toHaveProperty("value", "Keep my latest changes");
    expect(screen.getByText("new.png")).toBeTruthy();
    if (mode === "edit")
      expect(
        screen.queryByRole("button", { name: "Remove Report photo 1" }),
      ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Refresh photo links" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(
          "Photo links couldn’t refresh. Your changes are still here. Try again.",
        ),
      ).toBeNull(),
    );
    await user.click(
      screen.getByRole("button", {
        name: mode === "edit" ? "Save changes" : "Mark as Completed",
      }),
    );
    await waitFor(() =>
      expect(sent?.photoKeys).toEqual(
        mode === "edit" ? ["issued/second", "issued/new"] : ["issued/new"],
      ),
    );
    expect(sent).toHaveProperty(
      mode === "edit" ? "title" : "note",
      "Keep my latest changes",
    );
    runtime.queryClient.clear();
  },
);

test.each([
  ["edit", 403],
  ["edit", 404],
  ["completion", 403],
  ["completion", 404],
] as const)(
  "%s removes cached actions after an authoritative %s photo refresh denial",
  async (mode, status) => {
    if (mode === "completion")
      signedIn("maintenance_officer", {
        id: "chinedu",
        firstName: "Chinedu",
        lastName: "Eze",
      });
    else signedIn();
    withCategories();
    let reads = 0;
    const data = {
      ...detail([reportPhoto]),
      status: mode === "completion" ? "in_progress" : "submitted",
      assignment: {
        officer: { id: "chinedu", name: "Chinedu Eze" },
        assignedAt: "2026-11-14T08:00:00Z",
      },
    };
    server.use(
      http.get(`${api}/service-requests/SR-PLUMB-1`, () =>
        ++reads === 1
          ? HttpResponse.json(data)
          : new HttpResponse(null, { status }),
      ),
    );
    const { user, runtime } = open(
      mode === "edit" ? "/requests/SR-PLUMB-1/edit" : "/requests/SR-PLUMB-1",
    );
    if (mode === "completion")
      await user.click(await screen.findByRole("button", { name: "Complete" }));
    await screen.findByLabelText("Add photos");
    await fireEvent.error(
      screen.getByAltText(
        mode === "edit" ? "Report photo 1 preview" : "Report photo 1",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Add photos")).toBeNull(),
    );
    expect(
      screen.queryByRole("button", {
        name: mode === "edit" ? "Save changes" : "Mark as Completed",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Open Report photo 1 in a new tab" }),
    ).toBeNull();
    runtime.queryClient.clear();
  },
);
