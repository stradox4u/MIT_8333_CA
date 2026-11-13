import type { Browser, TestApp } from './test-app.js';

/** The Roles that raise requests without managing them. */
export const REQUESTER_ROLES = [
  'student',
  'staff',
  'maintenance_officer',
] as const;

/** A new browser, signed in as a User of one of the `REQUESTER_ROLES`. */
export function signInWithRole(
  app: TestApp,
  email: string,
  role: (typeof REQUESTER_ROLES)[number],
): Promise<Browser> {
  return role === 'maintenance_officer'
    ? app.signInAsMaintenanceOfficer(email)
    : app.signUp(email, { role });
}

/** A valid body for `POST /api/service-requests`, to override field by field. */
export const aServiceRequest = (
  overrides: Partial<{
    title: string;
    categoryId: string;
    location: string;
    description: string;
  }> = {},
) => ({
  title: 'Leaking tap',
  categoryId: 'plumbing',
  location: 'Block C, ground floor toilets',
  description: 'The cold tap drips constantly and the sink is overflowing.',
  ...overrides,
});

/** Submits a Service Request from a signed-in browser, and returns its Reference. */
export async function submitServiceRequest(
  browser: Browser,
  body: object = aServiceRequest(),
): Promise<string> {
  const submitted = await browser
    .post('/api/service-requests')
    .send(body)
    .expect(201);
  return submitted.body.reference;
}

/** The id of the User a browser is signed in as. */
export async function idOf(browser: Browser): Promise<string> {
  const me = await browser.get('/api/auth/me').expect(200);
  return me.body.id;
}

/** An Administrator gives a Service Request to a Maintenance Officer. */
export async function assign(
  admin: Browser,
  reference: string,
  officerId: string,
) {
  return admin
    .put(`/api/service-requests/${reference}/assignment`)
    .send({ officerId })
    .expect(200);
}

/** Builds a request's Status through public actions for permission and lifecycle checks. */
export async function requestInStatus(
  app: TestApp,
  status:
    | 'submitted'
    | 'assigned'
    | 'in_progress'
    | 'completed'
    | 'verified'
    | 'cancelled',
) {
  const requester = await app.signUp('requester@example.com');
  const admin = await app.signInAsAdministrator();
  const officer = await app.signInAsMaintenanceOfficer();
  const requesterId = await idOf(requester);
  const officerId = await idOf(officer);
  const reference = await submitServiceRequest(requester);
  if (status !== 'submitted') {
    await assign(admin, reference, officerId);
    if (status === 'cancelled')
      await admin
        .post(`/api/service-requests/${reference}/cancel`)
        .send({ reason: 'Duplicate report.' })
        .expect(200);
    else if (status !== 'assigned') {
      await officer
        .post(`/api/service-requests/${reference}/start`)
        .expect(200);
      if (status !== 'in_progress') {
        await officer
          .post(`/api/service-requests/${reference}/complete`)
          .send({ note: 'Replaced the washer.' })
          .expect(200);
        if (status === 'verified')
          await requester
            .post(`/api/service-requests/${reference}/verify`)
            .expect(200);
      }
    }
  }
  return { requester, requesterId, admin, officer, officerId, reference };
}
