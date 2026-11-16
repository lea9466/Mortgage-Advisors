import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/PagePlaceholder/PagePlaceholder";

export const metadata: Metadata = { title: "יומן פגישות" };

export default function CalendarPage() {
  return (
    <PagePlaceholder
      title="יומן פגישות"
      summary="פגישות בתצוגה יומית, שבועית וחודשית, עם תזכורות וסיכומים."
      stage="שלב 5"
    />
  );
}
