"use client";

import { useActionState } from "react";
import clsx from "clsx";
import { startMfaEnrollmentAction, type EnrollmentState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { MfaCodeForm } from "./MfaCodeForm";
import styles from "./MfaEnrollment.module.css";

const initialState: EnrollmentState = {};

/** Supabase returns the QR code as an SVG data URL; anything else is not shown. */
function isSvgDataUrl(value: string): boolean {
  return value.startsWith("data:image/svg+xml");
}

export function MfaEnrollment() {
  const [state, startAction, isPending] = useActionState(startMfaEnrollmentAction, initialState);
  const enrollment = state.enrollment;

  if (!enrollment) {
    return (
      <form action={startAction} className="stack">
        <ol className={clsx("stack", styles.steps)}>
          <li>התקינו בטלפון אפליקציית אימות, למשל Google Authenticator או Microsoft Authenticator.</li>
          <li>לחצו על הכפתור כדי לקבל קוד QR לסריקה.</li>
          <li>הזינו את הקוד שהאפליקציה מציגה.</li>
        </ol>
        <FormMessage message={state.error} />
        <Button type="submit" disabled={isPending}>
          {isPending ? "מכין..." : "התחלת הגדרה"}
        </Button>
      </form>
    );
  }

  return (
    <div className={clsx("stack", styles.enrollment)}>
      <p>סרקו את הקוד באפליקציית האימות:</p>
      {isSvgDataUrl(enrollment.qrCode) && (
        // eslint-disable-next-line @next/next/no-img-element -- inline data URL, nothing to optimize
        <img src={enrollment.qrCode} alt="קוד QR להגדרת אפליקציית האימות" className={styles.qr} />
      )}
      <p className={styles.secretLine}>
        אם אי אפשר לסרוק, הקלידו באפליקציה את המפתח:
        <code dir="ltr" className={clsx("ltr", styles.secret)}>
          {enrollment.secret}
        </code>
      </p>
      <MfaCodeForm factorId={enrollment.factorId} submitLabel="אישור והפעלה" />
    </div>
  );
}
