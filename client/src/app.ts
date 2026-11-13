import { createPinia } from "pinia";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createRouter, createWebHistory, type RouterHistory } from "vue-router";
import type { App } from "vue";
import { h } from "vue";
import FinishSignupPage from "./pages/FinishSignupPage.vue";
import { meOptions, type User } from "./auth/identity";
import SignInPage from "./pages/SignInPage.vue";
import CheckEmailPage from "./pages/CheckEmailPage.vue";
import LinkPage from "./pages/LinkPage.vue";
import ConnectionPage from "./pages/ConnectionPage.vue";
import { authNavigationKey, type AuthNavigation } from "./auth/navigation";
import { useUiStore } from "./stores/ui";
import {
  clearReturnContext,
  rememberDestination,
  takeDestination,
} from "./auth/return-context";
import { api, ApiError } from "./lib/api";
import PasswordPage from "./pages/PasswordPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";
import DashboardPage from "./pages/DashboardPage.vue";
import { meKey } from "./auth/identity";

export function createClientRuntime(
  history: RouterHistory = createWebHistory(),
) {
  const pinia = createPinia();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  const ui = useUiStore(pinia);
  const router = createRouter({
    history,
    routes: [
      {
        path: "/",
        name: "complete",
        component: { render: () => h("p", "Checking your sign-in…") },
      },
      {
        path: "/auth/complete",
        name: "auth-complete",
        component: { render: () => h("p", "Checking your sign-in…") },
      },
      { path: "/sign-in", name: "sign-in", component: SignInPage },
      { path: "/sign-in/password", name: "password", component: PasswordPage },
      { path: "/recover", name: "recover", component: SignInPage },
      {
        path: "/sign-up",
        alias: "/register",
        name: "sign-up",
        component: SignInPage,
      },
      {
        path: "/check-email",
        name: "check-email",
        meta: { skipIdentity: true },
        component: CheckEmailPage,
      },
      {
        path: "/sign-in/link",
        name: "link",
        meta: { skipIdentity: true },
        component: LinkPage,
      },
      {
        path: "/finish-sign-up",
        name: "finish-sign-up",
        component: FinishSignupPage,
      },
      {
        path: "/account/settings",
        name: "settings",
        meta: { requiresUser: true },
        component: SettingsPage,
      },
      {
        path: "/dashboard",
        name: "dashboard",
        meta: { requiresUser: true },
        component: DashboardPage,
      },
      { path: "/connection", name: "connection", component: ConnectionPage },
    ],
  });
  const navigation: AuthNavigation = {
    async completeAuthentication() {
      await queryClient.cancelQueries();
      queryClient.clear();
      ui.notice = "";
      await router.replace("/auth/complete");
    },
    async retryIdentity(isCurrent) {
      await queryClient.fetchQuery({ ...meOptions, staleTime: 0 });
      if (!isCurrent()) return;
      await router.replace(ui.retryTarget || "/");
    },
    async signOut(everywhere = false) {
      try {
        await api<void>(
          everywhere ? "/auth/sign-out-everywhere" : "/auth/sign-out",
          { method: "POST" },
        );
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
      await navigation.finishSignOut();
    },
    async finishSignOut() {
      await queryClient.cancelQueries();
      queryClient.clear();
      ui.reset();
      clearReturnContext();
      await router.replace("/sign-in");
    },
    async expire() {
      const previous = queryClient.getQueryData<User | null>(meKey);
      rememberDestination(router.currentRoute.value.fullPath, previous?.id);
      await queryClient.cancelQueries();
      queryClient.clear();
      ui.reset();
      ui.notice = "Your session has ended. Please sign in again.";
      await router.replace("/sign-in");
    },
    async identityChanged() {
      await queryClient.cancelQueries();
      queryClient.clear();
      ui.reset();
      clearReturnContext();
      ui.notice =
        "You signed in with a different email. Your previous change was not made.";
      await router.replace("/auth/complete");
    },
  };
  router.beforeEach(async (to) => {
    if (to.name === "connection" || to.meta.skipIdentity) return true;
    if (to.name === "sign-in" && typeof to.query.error === "string")
      ui.notice =
        to.query.error === "account_deactivated"
          ? "Your access is deactivated. Contact a university Administrator."
          : "Google sign-in couldn’t be completed. Try again or use a Sign-in Link.";
    let user;
    try {
      user = await queryClient.fetchQuery(meOptions);
    } catch {
      ui.retryTarget = to.fullPath;
      return { name: "connection" };
    }
    if (user && !user.signUpComplete) {
      if (to.meta.requiresUser) rememberDestination(to.fullPath, user.id);
      return to.name === "finish-sign-up" || { name: "finish-sign-up" };
    }
    if (
      !user &&
      (to.meta.requiresUser ||
        ["finish-sign-up", "complete", "auth-complete"].includes(
          String(to.name),
        ))
    ) {
      if (to.meta.requiresUser) rememberDestination(to.fullPath);
      return { name: "sign-in" };
    }
    if (
      user &&
      [
        "finish-sign-up",
        "complete",
        "auth-complete",
        "sign-in",
        "sign-up",
        "password",
        "recover",
      ].includes(String(to.name)) &&
      !(to.name === "sign-in" && to.query.error)
    ) {
      const next = takeDestination(user);
      if (next.notice) ui.notice = next.notice;
      return next.path;
    }
    return true;
  });
  const plugin = {
    install(app: App) {
      app.use(pinia);
      app.use(VueQueryPlugin, { queryClient });
      app.provide(authNavigationKey, navigation);
      app.use(router);
    },
  };
  return { plugin, router, queryClient, pinia };
}
