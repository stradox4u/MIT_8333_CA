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
