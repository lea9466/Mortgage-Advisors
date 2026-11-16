import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthCard/AuthCard";

export const metadata: Metadata = { title: "הגדרה ראשונית" };

export default function SetupPage() {
  return (
    <AuthCard
      title="המערכת עדיין לא מחוברת"
      description="חסרים פרטי החיבור ל-Supabase. העתיקו את הקובץ .env.example לקובץ בשם .env.local, מלאו את הערכים לפי ההוראות ב-README, והפעילו את השרת מחדש."
    >
      <p>אחרי ההגדרה העמוד הזה יוחלף במסך הכניסה.</p>
    </AuthCard>
  );
}
