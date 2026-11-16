import { z } from "zod";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const inputSchema = z.string().trim().min(1).max(2048);

/** מחזיר כתובת בטוחה או null. חוסם javascript:, data:, vbscript: וכו'. */
export function safeHref(input: unknown): string | null {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return null;
  const value = parsed.data;

  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return value;
  }
  try {
    const url = new URL(value);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** להפניות אחרי login – רק נתיבים פנימיים (מונע Open Redirect). */
export function safeRedirect(input: unknown, fallback = "/"): string {
  const href = safeHref(input);
  return href !== null && href.startsWith("/") ? href : fallback;
}
