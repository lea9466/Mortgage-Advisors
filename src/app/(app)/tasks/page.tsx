import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/PagePlaceholder/PagePlaceholder";

export const metadata: Metadata = { title: "משימות" };

export default function TasksPage() {
  return (
    <PagePlaceholder
      title="משימות"
      summary="משימות להיום, באיחור וקרובות, כלליות או משויכות לתיק."
      stage="שלב 5"
    />
  );
}
