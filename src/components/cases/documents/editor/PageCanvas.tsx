"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { loadSource, renderPage, SourceLoadError } from "@/lib/pdf/browser";
import type { PageRotation } from "@/lib/validation/document";
import styles from "./Editor.module.css";

type PageCanvasProps = {
  documentId: string;
  contentType: string;
  page: number;
  rotation?: PageRotation;
  /** "large" fills the column so the page can be read; "small" is a thumbnail. */
  size: "large" | "small";
  label: string;
};

const SMALL_WIDTH = 180;
const LARGE_MAX_WIDTH = 900;

/** One page of a document, drawn only once it scrolls near the screen. */
export function PageCanvas({ documentId, contentType, page, rotation = 0, size, label }: PageCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "locked" | "error">("loading");

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!near || !canvas) return;
    let stopped = false;
    let cancel = () => {};
    loadSource(documentId, contentType)
      .then((source) => {
        if (stopped) return;
        // Small pages always get the same drawing width, so every page of the same direction looks the same size.
        const width = size === "small" ? SMALL_WIDTH : Math.min(frameRef.current?.clientWidth || LARGE_MAX_WIDTH, LARGE_MAX_WIDTH);
        const job = renderPage(canvas, source, page, rotation, width);
        cancel = job.cancel;
        return job.done;
      })
      .then(() => {
        if (!stopped) setState("ready");
      })
      .catch((error: unknown) => {
        if (!stopped) setState(error instanceof SourceLoadError && error.reason === "locked" ? "locked" : "error");
      });
    return () => {
      stopped = true;
      cancel();
    };
  }, [near, documentId, contentType, page, rotation, size]);

  return (
    <div ref={frameRef} className={clsx(styles.sheet, size === "small" ? styles.sheetSmall : styles.sheetLarge, state !== "ready" && styles.sheetWaiting)}>
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />
      {state === "loading" && <span className={styles.sheetNote}>טוען...</span>}
      {state === "locked" && <span className={styles.sheetNote}>הקובץ מוגן בסיסמה</span>}
      {state === "error" && <span className={styles.sheetNote}>הדף לא נפתח</span>}
    </div>
  );
}
