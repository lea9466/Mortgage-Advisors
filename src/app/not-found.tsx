import Link from "next/link";
import { AuthCard } from "@/components/AuthCard/AuthCard";

export default function NotFound() {
  return (
    <AuthCard title="העמוד לא נמצא" description="ייתכן שהקישור שגוי או שהעמוד הוסר.">
      <Link href="/">חזרה ללוח הבקרה</Link>
    </AuthCard>
  );
}
