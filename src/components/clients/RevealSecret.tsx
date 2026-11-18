"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { RevealState } from "@/app/(app)/clients/actions";
import styles from "./RevealSecret.module.css";

const HIDE_AFTER_MS = 60_000;

type RevealSecretProps = {
  masked: string;
  /** A server action bound to the record; it logs the reveal and returns the full value. */
  reveal: () => Promise<RevealState>;
};

/** A masked sensitive number (ID, bank account) with a "show" button. Hides again after a minute. */
export function RevealSecret({ masked, reveal }: RevealSecretProps) {
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (shown === null) return;
    const timer = setTimeout(() => setShown(null), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  function onReveal() {
    setError(null);
    startTransition(async () => {
      const result = await reveal();
      if (result.value) setShown(result.value);
      else setError(result.error ?? "לא ניתן להציג");
    });
  }

  return (
    <span className={styles.wrap}>
      <span dir="ltr" className={styles.value}>
        {shown ?? masked}
      </span>
      {shown === null ? (
        <button type="button" className={styles.toggle} onClick={onReveal} disabled={isPending}>
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
