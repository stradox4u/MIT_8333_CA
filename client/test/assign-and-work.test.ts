import { expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/vue";
import { open, signedIn, withRequests, type Role } from "./support";

const navLinks = () =>
  within(screen.getByRole("navigation", { name: "Main" }))
    .getAllByRole("link")
    .map((link) => link.textContent?.trim());

test.each<[Role, string[]]>([
  ["student", ["Dashboard", "My requests", "Account settings"]],
  ["staff", ["Dashboard", "My requests", "Account settings"]],
  [
    "maintenance_officer",
    ["Dashboard", "My assignments", "My requests", "Account settings"],
  ],
  ["administrator", ["Dashboard", "Requests", "My requests", "Account settings"]],
])("a %s sees the navigation for their Role", async (role, links) => {
  signedIn(role);
  const { runtime } = open("/dashboard");
  await screen.findByRole("navigation", { name: "Main" });
  expect(navLinks()).toEqual(links);
  runtime.queryClient.clear();
});

test.each<[string, Role]>([
  ["/assignments", "student"],
  ["/assignments", "administrator"],
  ["/admin/requests", "staff"],
  ["/admin/requests", "maintenance_officer"],
])("%s is closed to a %s, who lands on the dashboard", async (path, role) => {
  signedIn(role);
  withRequests([]);
  const { runtime } = open(path);
  await screen.findByRole("heading", { name: "Your campus workspace" });
  await waitFor(() =>
    expect(runtime.router.currentRoute.value.path).toBe("/dashboard"),
  );
  runtime.queryClient.clear();
});
