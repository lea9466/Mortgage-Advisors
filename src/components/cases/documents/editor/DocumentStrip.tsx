"use client";

import clsx from "clsx";
import { setDragData, type EditorSource } from "./model";
import { PageCanvas } from "./PageCanvas";
import styles from "./Editor.module.css";

type DocumentStripProps = {
  sources: EditorSource[];
  openId: string | null;
  onOpen: (id: string) => void;
};

/** All the case's PDFs and pictures, small, along the top. Drag one into the new document, or click to see its pages. */
export function DocumentStrip({ sources, openId, onOpen }: DocumentStripProps) {
  return (
    <section className={styles.strip} aria-labelledby="strip-title">
      <h2 id="strip-title" className={styles.stripHeading}>
        מסמכי התיק <span className={styles.stripHint}>לחצו על מסמך לפתיחת כל הדפים שלו, או גררו אותו לקובץ החדש</span>
      </h2>
      <ul className={styles.stripList}>
        {sources.map((source) => (
          <li key={source.id}>
            <button
              type="button"
              draggable
              onDragStart={(event) => setDragData(event, { kind: "document", documentId: source.id })}
              onClick={() => onOpen(source.id)}
              aria-pressed={openId === source.id}
              className={clsx(styles.stripItem, openId === source.id && styles.stripItemOpen)}
            >
              <PageCanvas documentId={source.id} contentType={source.contentType} page={0} size="small" label={`הדף הראשון של ${source.title}`} />
              <span className={styles.stripTitle}>{source.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
