import { expect, it } from 'vitest';

it('serves the browser API fixture while Vitest watches', async () => {
  const response = await fetch('http://127.0.0.1:4175/health');
  expect(response.ok).toBe(true);
  expect(await response.json()).toMatchObject({ ok: true });
});
