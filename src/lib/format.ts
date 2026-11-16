const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Jerusalem",
});

/** "2026-03-14" (or a timestamp) as 14.03.2026. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

/** Full years between a birth date and today. */
export function ageFromBirthDate(birthDate: string | null | undefined, now = new Date()): number | null {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  let age = now.getFullYear() - year;
  const beforeBirthday =
    now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/** 0521234567 as 052-123-4567; other formats are shown as stored. */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  if (/^05\d{8}$/.test(value)) return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`;
  if (/^0[2-9]\d{7}$/.test(value)) return `${value.slice(0, 2)}-${value.slice(2)}`;
  return value;
}

export function maskedIdNumber(last4: string | null | undefined): string {
  return last4 ? `•••••${last4}` : "";
}
