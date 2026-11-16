import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthCard/AuthCard";
import { AuthSwitch } from "@/components/auth/AuthSwitch";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "פתיחת חשבון" };

export default function SignupPage() {
  return (
    <AuthCard
      title="פתיחת חשבון"
      description="חשבון ליועץ משכנתאות. אחרי האישור במייל תגדירו אימות דו-שלבי ותתנו שם לחשבון."
    >
      <SignupForm />
      <AuthSwitch question="כבר יש לכם חשבון?" href="/login" label="כניסה" />
    </AuthCard>
  );
}
