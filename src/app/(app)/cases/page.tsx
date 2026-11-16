import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/PagePlaceholder/PagePlaceholder";

export const metadata: Metadata = { title: "תיקי משכנתאות" };

export default function CasesPage() {
  return (
    <PagePlaceholder
      title="תיקי משכנתאות"
      summary="תיק לכל עסקה: לווים, נכס, הכנסות, התחייבויות, מסמכים ותיעוד."
      stage="שלב 2"
    />
  );
}
