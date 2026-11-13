import { inject, type InjectionKey } from "vue";

export interface AuthNavigation {
  completeAuthentication(): Promise<void>;
  retryIdentity(isCurrent: () => boolean): Promise<void>;
  signOut(everywhere?: boolean): Promise<void>;
  expire(): Promise<void>;
  identityChanged(): Promise<void>;
  finishSignOut(): Promise<void>;
}
export const authNavigationKey: InjectionKey<AuthNavigation> =
  Symbol("auth-navigation");
export function useAuthNavigation() {
  const navigation = inject(authNavigationKey);
  if (!navigation)
    throw new Error("Authentication navigation is not installed");
  return navigation;
}
