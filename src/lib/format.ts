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

const timeFormatter = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });

/** A timestamp as "היום 11:40", "אתמול 19:05" or "10.11.2026 · 20:00", in Israel time. */
export function formatLogTime(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = dayKeyFormatter.format(date);
  const time = timeFormatter.format(date);
  if (day === dayKeyFormatter.format(now)) return `היום ${time}`;
  if (day === dayKeyFormatter.format(new Date(now.getTime() - 86_400_000))) return `אתמול ${time}`;
  return `${dateFormatter.format(date)} · ${time}`;
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

const shekelFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 1780000 as ₪1,780,000. Shown inside dir="ltr" so the sign stays before the digits. */
export function formatShekels(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : `₪${shekelFormatter.format(value)}`;
}

/** 1780000 as 1,780,000, for amount inputs. */
export function formatAmountInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : shekelFormatter.format(value);
}

export function maskedIdNumber(last4: string | null | undefined): string {
  return last4 ? `•••••${last4}` : "";
}
