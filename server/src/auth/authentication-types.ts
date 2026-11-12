import type { User } from '../users/user.js';

/** Types `@CurrentUser()`, `request.user` and session reads across the app. */
declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
    /** What `DrizzleAuthStore.getSession()` reads alongside each session. */
    sessionExtra: {
      /** Last activity as stored, before the package records this request's. */
      lastActiveAt: Date;
    };
  }
}
