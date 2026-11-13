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
