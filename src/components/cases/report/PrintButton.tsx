"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import styles from "./BankReport.module.css";

/** Opens the browser's print dialog, where "Save as PDF" creates the file. */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer aria-hidden="true" className={styles.icon} />
      הדפסה או שמירה כ-PDF
    </Button>
  );
}
