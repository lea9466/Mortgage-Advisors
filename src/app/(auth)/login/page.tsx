import type { Metadata } from "next";
import { z } from "zod";
import { AuthCard } from "@/components/AuthCard/AuthCard";
import { AuthSwitch } from "@/components/auth/AuthSwitch";
import { LoginForm } from "@/components/auth/LoginForm";
import { FormMessage } from "@/components/ui/FormMessage";

export const metadata: Metadata = { title: "כניסה" };

const NOTICES = {
  "link-invalid":
    "קישור האישור לא תקין או שפג תוקפו. אם כבר אישרתם את המייל, היכנסו כאן. אחרת הירשמו שוב.",
} as const;

const searchSchema = z.object({ notice: z.enum(["link-invalid"]).optional() });

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = searchSchema.safeParse(await searchParams);
  const notice = search.success && search.data.notice ? NOTICES[search.data.notice] : undefined;

  return (
    <AuthCard title="כניסה למערכת" description="הזינו את האימייל והסיסמה של החשבון.">
      <FormMessage message={notice} />
      <LoginForm />
      <AuthSwitch question="אין לכם חשבון עדיין?" href="/signup" label="פתיחת חשבון" />
    </AuthCard>
  );
}
