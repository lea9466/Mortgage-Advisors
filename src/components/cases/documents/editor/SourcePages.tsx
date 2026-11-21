"use client";

import { Plus, X } from "lucide-react";
import { setDragData, type EditorSource } from "./model";
import { PageCanvas } from "./PageCanvas";
import { useSourceInfo } from "./useSourceInfo";
import styles from "./Editor.module.css";

type SourcePagesProps = {
  source: EditorSource;
  onAdd: (pages: number[]) => void;
  onClose: () => void;
};

/** The pages of one document, small, in a side column. Drag a page into the new document, or add it with the button. */
export function SourcePages({ source, onAdd, onClose }: SourcePagesProps) {
  const info = useSourceInfo(source);
  const pages = info.status === "ready" ? Array.from({ length: info.pageCount }, (_, index) => index) : [];

  return (
    <aside className={styles.side} aria-label={`הדפים של ${source.title}`}>
      <div className={styles.sideHeader}>
        <h2 className={styles.sideTitle}>{source.title}</h2>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="סגירת העמודה">
          <X aria-hidden="true" />
        </button>
      </div>
      {info.status === "loading" && <p className={styles.note}>פותח את המסמך...</p>}
      {info.status === "locked" && <p className={styles.note}>הקובץ מוגן בסיסמה, ולכן אי אפשר לקחת ממנו דפים.</p>}
      {info.status === "error" && <p className={styles.note}>המסמך לא נפתח.</p>}
      {info.status === "ready" && (
        <>
          <button type="button" className={styles.addAll} onClick={() => onAdd(pages)}>
            <Plus aria-hidden="true" className={styles.smallIcon} />
            {info.pageCount === 1 ? "הוספת הדף" : `הוספת כל ${info.pageCount} הדפים`}
          </button>
          <ol className={styles.sideList}>
            {pages.map((page) => (
              <li
                key={page}
                className={styles.sidePage}
                draggable
                onDragStart={(event) => setDragData(event, { kind: "page", documentId: source.id, page })}
              >
                <PageCanvas documentId={source.id} contentType={source.contentType} page={page} size="small" label={`עמוד ${page + 1} של ${source.title}`} />
                <span className={styles.sidePageBar}>
                  <span>עמוד {page + 1}</span>
                  <button type="button" className={styles.textButton} onClick={() => onAdd([page])}>
                    הוספה
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
