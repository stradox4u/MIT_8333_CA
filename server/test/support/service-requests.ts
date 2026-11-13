import type { TestApp } from './test-app.js';

type Browser = ReturnType<TestApp['browser']>;

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
