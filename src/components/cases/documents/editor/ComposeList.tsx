"use client";

import { useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { isOurDrag, readDragData, setDragData, type DragData, type EditorPage, type EditorSource } from "./model";
import { PageCanvas } from "./PageCanvas";
import styles from "./Editor.module.css";

type ComposeListProps = {
  pages: EditorPage[];
  sources: ReadonlyMap<string, EditorSource>;
  /** Where the side column's "add" buttons put pages; null means at the end. */
  insertAt: number | null;
  onSetInsertAt: (index: number | null) => void;
  onDrop: (data: DragData, index: number) => void;
  onRemove: (key: string) => void;
  onRotate: (key: string, by: 90 | -90) => void;
  onMove: (key: string, by: 1 | -1) => void;
};

/** The new document: its pages in rows, in order, to reorder, turn, remove, or drop more pages between. */
export function ComposeList({ pages, sources, insertAt, onSetInsertAt, onDrop, onRemove, onRotate, onMove }: ComposeListProps) {
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function overPage(event: React.DragEvent<HTMLElement>, index: number) {
    if (!isOurDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    // Pages run in rows, from the right in Hebrew: the half nearer the row's start means "before".
    const box = event.currentTarget.getBoundingClientRect();
    const rightToLeft = getComputedStyle(event.currentTarget).direction === "rtl";
    const middle = box.left + box.width / 2;
    const before = rightToLeft ? event.clientX > middle : event.clientX < middle;
    setDropIndex(before ? index : index + 1);
  }

  function overList(event: React.DragEvent<HTMLElement>) {
    if (!isOurDrag(event)) return;
    event.preventDefault();
    if (event.target === event.currentTarget) setDropIndex(pages.length);
  }

  function leaveList(event: React.DragEvent<HTMLElement>) {
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDropIndex(null);
  }

  function drop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const data = readDragData(event);
    const index = dropIndex ?? pages.length;
    setDropIndex(null);
    if (data) onDrop(data, index);
  }

  return (
    <section
      className={clsx(styles.compose, dropIndex !== null && styles.composeDragging)}
      aria-label="הקובץ החדש"
      onDragOver={overList}
      onDragLeave={leaveList}
      onDrop={drop}
    >
      <p className={styles.previewNote}>תצוגה מקדימה באיכות מוקטנת. הקובץ שנשמר יהיה באיכות המקורית.</p>
      {pages.length === 0 ? (
        <p className={clsx(styles.dropHere, dropIndex !== null && styles.dropHereActive)}>
          גררו לכאן מסמך מהשורה שלמעלה, או דפים מהעמודה שבצד.
          <br />
          אפשר גם ללחוץ על מסמך ואז על &quot;הוספה&quot;.
        </p>
      ) : (
        <ol className={styles.composeList}>
          {pages.map((page, index) => {
            const source = sources.get(page.documentId);
            if (!source) return null;
            return (
              <li
                key={page.key}
                className={clsx(styles.composePage, dropIndex === index && styles.dropBefore, dropIndex === pages.length && index === pages.length - 1 && styles.dropAfter)}
                draggable
                onDragStart={(event) => setDragData(event, { kind: "move", key: page.key })}
                onDragOver={(event) => overPage(event, index)}
              >
                <InsertGap index={index} active={insertAt === index} onSet={onSetInsertAt} />
                <PageCanvas
                  documentId={page.documentId}
                  contentType={source.contentType}
                  page={page.page}
                  rotation={page.rotation}
                  size="small"
                  label={`עמוד ${index + 1} בקובץ החדש`}
                />
                <span className={styles.pageCaption}>
                  <span className={styles.pageNumber}>{index + 1}</span>
                  <span className={styles.pageSource}>
                    {source.title}
                    {source.contentType === "application/pdf" && `, עמ' ${page.page + 1}`}
                  </span>
                </span>
                <span className={styles.pageTools}>
                  <IconButton label="סיבוב שמאלה" onClick={() => onRotate(page.key, -90)} icon={<RotateCcw aria-hidden="true" />} />
                  <IconButton label="סיבוב ימינה" onClick={() => onRotate(page.key, 90)} icon={<RotateCw aria-hidden="true" />} />
                  <IconButton label="הזזה אחורה (דף קודם)" onClick={() => onMove(page.key, -1)} disabled={index === 0} icon={<ArrowRight aria-hidden="true" />} />
                  <IconButton label="הזזה קדימה (דף הבא)" onClick={() => onMove(page.key, 1)} disabled={index === pages.length - 1} icon={<ArrowLeft aria-hidden="true" />} />
                  <IconButton label="הסרת הדף מהקובץ החדש" onClick={() => onRemove(page.key)} icon={<Trash2 aria-hidden="true" />} danger />
                </span>
              </li>
            );
          })}
          <li className={styles.endGap}>
            <InsertGap index={null} active={insertAt === null} onSet={onSetInsertAt} />
          </li>
        </ol>
      )}
    </section>
  );
}

function InsertGap({ index, active, onSet }: { index: number | null; active: boolean; onSet: (index: number | null) => void }) {
  return (
    <button type="button" className={clsx(styles.gap, active && styles.gapActive)} aria-pressed={active} onClick={() => onSet(index)}>
      {active ? "דפים חדשים ייכנסו כאן" : index === null ? "הוספה בסוף" : "הוספה לפני הדף"}
    </button>
  );
}

function IconButton({ label, onClick, icon, disabled = false, danger = false }: { label: string; onClick: () => void; icon: React.ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" className={clsx(styles.iconButton, danger && styles.iconDanger)} onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      {icon}
    </button>
  );
}
