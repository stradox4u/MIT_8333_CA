import { expect, test } from "vitest";
import { screen, waitFor } from "@testing-library/vue";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import {
  api,
  open,
  signedIn,
  summary,
  withCategories,
  withRequests,
} from "./support";

const officerId = "88888888-8888-4888-8888-888888888888";
const exportPath = "/api/service-requests/export.csv";

/** The Export CSV link's path and query, as the browser will request them. */
async function exportLink() {
  const link = await screen.findByRole("link", { name: "Export CSV" });
  const href = link.getAttribute("href") ?? "";
  const url = new URL(href, "http://localhost:5173");
  return {
    link,
    href,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
  };
}

function withOfficers() {
  server.use(
    http.get(`${api}/maintenance-officers`, () =>
      HttpResponse.json([
        { id: officerId, name: "Chinedu Eze", openAssignments: 2 },
      ]),
    ),
  );
}

const items = Array.from({ length: 27 }, (_, index) =>
  summary(`SR-PLUMB-${index + 1}`, `Leaking pipe ${index + 1}`),
);

test("with no filters, Export CSV is a same-origin download of every Service Request", async () => {
  signedIn("administrator");
  withRequests(items);
  const { runtime } = open("/admin/requests");
  const { link, href } = await exportLink();
  expect(href).toBe(exportPath);
  expect(link.hasAttribute("download")).toBe(true);
  await screen.findByText("All 27 matching requests, not just this page");
  runtime.queryClient.clear();
});

test("Export CSV carries every list filter from the URL, Open included, but never the page", async () => {
  signedIn("administrator");
  withCategories();
  withOfficers();
  withRequests(items);
  const { runtime } = open(
    `/admin/requests?search=Hostel&status=open&category=plumbing&priority=urgent&officerId=${officerId}&submittedFrom=2026-11-01&submittedTo=2026-11-12&sort=priority&page=2`,
  );
  await waitFor(async () =>
    expect((await exportLink()).query).toEqual({
      search: "Hostel",
      status: "open",
      category: "plumbing",
      priority: "urgent",
      officerId,
      submittedFrom: "2026-11-01",
      submittedTo: "2026-11-12",
      sort: "priority",
    }),
  );
  expect((await exportLink()).path).toBe(exportPath);
  runtime.queryClient.clear();
});

test("Export CSV leaves out invalid filters and pagination from a shared link", async () => {
  signedIn("administrator");
  withRequests(items);
  const { runtime } = open(
    "/admin/requests?status=in_progress&category=bad&priority=highest&officerId=unknown&submittedFrom=2026-11-12&submittedTo=2026-11-01&sort=oldest&page=3&pageSize=100",
  );
  await waitFor(async () =>
    expect((await exportLink()).href).toBe(`${exportPath}?status=in_progress`),
  );
  runtime.queryClient.clear();
});

test("Export CSV follows each filter change and page, without page or pageSize", async () => {
  signedIn("administrator");
  withCategories();
  withOfficers();
  withRequests(items);
  const { runtime, user } = open("/admin/requests");
  await screen.findByText("Leaking pipe 1", { selector: "table a" });
  await user.selectOptions(screen.getByLabelText("Status"), "completed");
  await waitFor(async () =>
    expect((await exportLink()).query).toEqual({ status: "completed" }),
  );
  await screen.findByRole("option", { name: "Plumbing" });
  await user.selectOptions(
    screen.getByLabelText("Request Category"),
    "plumbing",
  );
  await user.selectOptions(screen.getByLabelText("Priority"), "high");
  await screen.findByRole("option", { name: "Chinedu Eze" });
  await user.selectOptions(
    screen.getByLabelText("Maintenance Officer"),
    officerId,
  );
  await user.type(screen.getByLabelText("Submitted from"), "2026-11-01");
  await user.tab();
  await user.selectOptions(screen.getByLabelText("Sort"), "priority");
  await waitFor(async () =>
    expect((await exportLink()).query).toEqual({
      status: "completed",
      category: "plumbing",
      priority: "high",
      officerId,
      submittedFrom: "2026-11-01",
      sort: "priority",
    }),
  );
  await user.click(
    screen.getByRole("button", { name: /Remove filter Status/ }),
  );
  await waitFor(async () =>
    expect((await exportLink()).query.status).toBeUndefined(),
  );
  await user.click(screen.getByRole("button", { name: "Clear all filters" }));
  await waitFor(async () =>
    expect((await exportLink()).query).toEqual({ sort: "priority" }),
  );
  await user.click(await screen.findByRole("link", { name: "Next" }));
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.query.page).toBe("2"),
  );
  expect((await exportLink()).href).toBe(`${exportPath}?sort=priority`);
  runtime.queryClient.clear();
});

test("a pending Search stays out of Export CSV until the list commits it", async () => {
  signedIn("administrator");
  withRequests(items);
  const { runtime, user } = open("/admin/requests?status=open");
  const search = await screen.findByRole("searchbox", { name: "Search" });
  await waitFor(async () =>
    expect((await exportLink()).query).toEqual({ status: "open" }),
  );
  await user.type(search, "Leaking");
  expect((await exportLink()).query).toEqual({ status: "open" });
  await user.keyboard("{Enter}");
  await waitFor(async () =>
    expect((await exportLink()).query).toEqual({
      status: "open",
      search: "Leaking",
    }),
  );
  runtime.queryClient.clear();
});

test("Export CSV picks up a Search once its pause commits it", async () => {
  signedIn("administrator");
  withRequests(items);
  const { runtime, user } = open("/admin/requests");
  const search = await screen.findByRole("searchbox", { name: "Search" });
  await user.type(search, "Leaking");
  expect((await exportLink()).href).toBe(exportPath);
  await waitFor(async () =>
    expect((await exportLink()).query).toEqual({ search: "Leaking" }),
  );
  runtime.queryClient.clear();
});

test("Export CSV picks up a pending Search committed with the next filter change", async () => {
  signedIn("administrator");
  withRequests(items);
  const { runtime, user } = open("/admin/requests");
  const search = await screen.findByRole("searchbox", { name: "Search" });
  await user.type(search, "pipe");
  await user.selectOptions(screen.getByLabelText("Sort"), "priority");
  await waitFor(async () =>
    expect((await exportLink()).query).toEqual({
      search: "pipe",
      sort: "priority",
    }),
  );
  runtime.queryClient.clear();
});

test("the export hint reuses the list's request for each filter state", async () => {
  signedIn("administrator");
  const queries = withRequests(items);
  const { runtime, user } = open("/admin/requests?status=open");
  await screen.findByText("All 27 matching requests, not just this page");
  await user.selectOptions(screen.getByLabelText("Priority"), "high");
  await waitFor(async () =>
    expect((await exportLink()).query).toEqual({
      status: "open",
      priority: "high",
    }),
  );
  await screen.findByText("All 27 matching requests, not just this page");
  await waitFor(() => expect(runtime.queryClient.isFetching()).toBe(0));
  expect(queries.map((query) => query.get("priority"))).toEqual([null, "high"]);
  runtime.queryClient.clear();
});

test("Export CSV says when no Service Requests match", async () => {
  signedIn("administrator");
  withRequests(items);
  const { runtime } = open("/admin/requests?status=verified");
  await screen.findByText("No matching requests to export");
  expect((await exportLink()).href).toBe(`${exportPath}?status=verified`);
  runtime.queryClient.clear();
});

test("My requests and My assignments offer no CSV export", async () => {
  signedIn("maintenance_officer", {
    id: officerId,
    firstName: "Chinedu",
    lastName: "Eze",
  });
  withRequests(items);
  const { runtime } = open("/assignments");
  await screen.findByText("Leaking pipe 1", { selector: "table a" });
  expect(screen.queryByRole("link", { name: "Export CSV" })).toBeNull();
  await runtime.router.push("/requests");
  await screen.findByRole("heading", { name: "My requests" });
  expect(screen.queryByRole("link", { name: "Export CSV" })).toBeNull();
  runtime.queryClient.clear();
});
