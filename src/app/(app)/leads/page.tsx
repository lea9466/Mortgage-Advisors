import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/PagePlaceholder/PagePlaceholder";

export const metadata: Metadata = { title: "לידים" };

export default function LeadsPage() {
  return (
    <PagePlaceholder
      title="לידים"
      summary="פונים שעוד לא הפכו ללקוחות, עם מעקב והמרה ללקוח בלחיצה."
      stage="שלב 5"
    />
  );
}
