const SUPER_ADMIN_EMAILS = new Set([
  'bone.ak103@gmail.com',
  'lucasmartinsa3009@gmail.com',
]);

const ADMIN_CARGOS = new Set([
  'Leader',
  'High Warden',
  'Blade Master',
  'Sub-Leader',
  'Officer',
]);

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.has(email.trim().toLowerCase());
}

export function isAdminCargo(cargo?: string | null): boolean {
  if (!cargo) return false;
  return ADMIN_CARGOS.has(cargo.trim());
}
