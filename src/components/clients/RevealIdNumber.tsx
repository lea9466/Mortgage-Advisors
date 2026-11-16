"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { revealIdNumberAction } from "@/app/(app)/clients/actions";
import styles from "./RevealIdNumber.module.css";

const HIDE_AFTER_MS = 60_000;

type RevealIdNumberProps = { clientId: string; masked: string };

/** Masked ID number with a "show" button. Each reveal is logged on the server and hides again after a minute. */
export function RevealIdNumber({ clientId, masked }: RevealIdNumberProps) {
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (shown === null) return;
    const timer = setTimeout(() => setShown(null), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  function reveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealIdNumberAction(clientId);
      if (result.idNumber) setShown(result.idNumber);
      else setError(result.error ?? "לא ניתן להציג");
    });
  }

  return (
    <span className={styles.wrap}>
      <span dir="ltr" className={styles.value}>
        {shown ?? masked}
      </span>
      {shown === null ? (
        <button type="button" className={styles.toggle} onClick={reveal} disabled={isPending}>
          <Eye aria-hidden="true" className={styles.icon} />
          {isPending ? "רגע..." : "הצגה"}
        </button>
      ) : (
        <button type="button" className={styles.toggle} onClick={() => setShown(null)}>
          <EyeOff aria-hidden="true" className={styles.icon} />
          הסתרה
        </button>
      )}
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </span>
  );
}
