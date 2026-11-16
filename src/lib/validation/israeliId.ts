/** Removes spaces and dashes that people type inside ID numbers. */
export function normalizeIsraeliId(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/**
 * Checks an Israeli ID number (teudat zehut) against its check digit.
 * Accepts 5 to 9 digits; shorter numbers are padded with leading zeros.
 */
export function isValidIsraeliId(raw: string): boolean {
  const value = normalizeIsraeliId(raw);
  if (!/^\d{5,9}$/.test(value)) return false;
  const id = value.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = Number(id.charAt(i)) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

/** The canonical 9-digit form, used for encryption and the search fingerprint. */
export function canonicalIsraeliId(raw: string): string {
  return normalizeIsraeliId(raw).padStart(9, "0");
}
