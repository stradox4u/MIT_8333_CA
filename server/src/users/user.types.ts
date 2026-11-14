export const ROLE_IDS = [
  'student',
  'staff',
  'maintenance_officer',
  'administrator',
] as const;
export type RoleId = (typeof ROLE_IDS)[number];
