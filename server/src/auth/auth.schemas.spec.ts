import { newPassword } from './auth.schemas.js';

describe('password rules', () => {
  it.each([
    ['all four kinds, 12 characters', 'Abcdefgh12!x'],
    ['spaces count as special characters', 'Correct horse 9'],
    ['128 characters', `Aa1!${'x'.repeat(124)}`],
    ['non-ASCII letters', 'Ünïcödé-Pass1'],
  ])('accepts %s', (_, candidate) => {
    expect(newPassword.safeParse(candidate).success).toBe(true);
  });

  it.each([
    ['11 characters', 'Abcdefg12!x'],
    ['129 characters', `Aa1!${'x'.repeat(125)}`],
    ['no uppercase letter', 'abcdefgh12!x'],
    ['no lowercase letter', 'ABCDEFGH12!X'],
    ['no digit', 'Abcdefghij!x'],
    ['no special character', 'Abcdefgh12xy'],
  ])('refuses %s', (_, candidate) => {
    expect(newPassword.safeParse(candidate).success).toBe(false);
  });
});
