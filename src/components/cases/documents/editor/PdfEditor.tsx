"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ComposeResult } from "@/app/(app)/cases/document-actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { loadSource, SourceLoadError } from "@/lib/pdf/browser";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, MAX_COMPOSE_PAGES, type ComposeInput, type DocumentCategory } from "@/lib/validation/document";
import { ComposeList } from "./ComposeList";
import { DocumentStrip } from "./DocumentStrip";
import { newKey, turn, type DragData, type EditorPage, type EditorSource } from "./model";
import { SourcePages } from "./SourcePages";
import styles from "./Editor.module.css";

type PdfEditorProps = {
  sources: EditorSource[];
  save: (input: ComposeInput) => Promise<ComposeResult>;
  cancelHref: string;
};

const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({ value, label: DOCUMENT_CATEGORY_LABELS[value] }));

/**
 * Builds a new PDF from pages of the case's documents: drag documents and
 * pages in, reorder, turn and remove pages, then save. The sources never change.
 */
export function PdfEditor({ sources, save, cancelHref }: PdfEditorProps) {
  const byId = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory | null>(null);
  const [message, setMessage] = useState<string | undefined>();
  const [isSaving, startSaving] = useTransition();

  // Ask before leaving with unsaved work, but not on the way out after saving.
  const saving = useRef(false);
  const unsaved = pages.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!saving.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function insert(documentId: string, pageNumbers: number[], index: number) {
    const source = byId.get(documentId);
    if (!source || pageNumbers.length === 0) return;
    if (pages.length + pageNumbers.length > MAX_COMPOSE_PAGES) {
      setMessage("אפשר עד 500 דפים בקובץ אחד");
      return;
    }
    const added = pageNumbers.map((page) => ({ key: newKey(), documentId, page, rotation: 0 as const }));
    setPages((current) => [...current.slice(0, index), ...added, ...current.slice(index)]);
    setInsertAt((current) => (current !== null && current >= index ? current + added.length : current));
    if (!title) setTitle(source.title);
    if (!category) setCategory(source.category);
    setMessage(undefined);
  }

  async function insertDocument(documentId: string, index: number) {
    const source = byId.get(documentId);
    if (!source) return;
    try {
      const loaded = await loadSource(source.id, source.contentType);
      insert(documentId, Array.from({ length: loaded.pageCount }, (_, page) => page), index);
    } catch (error) {
      setMessage(error instanceof SourceLoadError && error.reason === "locked" ? `"${source.title}" מוגן בסיסמה, ולכן אי אפשר לקחת ממנו דפים` : `"${source.title}" לא נפתח`);
    }
  }

  function drop(data: DragData, index: number) {
    if (data.kind === "document") void insertDocument(data.documentId, index);
    else if (data.kind === "page") insert(data.documentId, [data.page], index);
    else {
      const from = pages.findIndex((page) => page.key === data.key);
      const moving = pages[from];
      if (!moving) return;
      const target = from < index ? index - 1 : index;
      const rest = pages.filter((page) => page.key !== data.key);
      setPages([...rest.slice(0, target), moving, ...rest.slice(target)]);
    }
  }

  function remove(key: string) {
    const index = pages.findIndex((page) => page.key === key);
    setPages((current) => current.filter((page) => page.key !== key));
    setInsertAt((current) => (current !== null && current > index ? current - 1 : current));
  }

  function rotate(key: string, by: 90 | -90) {
    setPages((current) => current.map((page) => (page.key === key ? { ...page, rotation: turn(page.rotation, by) } : page)));
  }

  function move(key: string, by: 1 | -1) {
    setPages((current) => {
      const index = current.findIndex((page) => page.key === key);
      const other = current[index + by];
      const page = current[index];
      if (!page || !other) return current;
      const next = [...current];
      next[index] = other;
      next[index + by] = page;
      return next;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: ComposeInput = {
      pages: pages.map(({ documentId, page, rotation }) => ({ documentId, page, rotation })),
      title: title.trim(),
      category: category ?? "other",
    };
    saving.current = true;
    startSaving(async () => {
      const result = await save(input);
      if (result?.error) {
        saving.current = false;
        setMessage(result.error);
      }
    });
  }

  const openSource = openId ? byId.get(openId) : undefined;

  return (
    <div className={styles.editor}>
      <form className={styles.saveBar} onSubmit={submit}>
        <TextField id="title" label="שם הקובץ החדש" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required />
        <SelectField
          id="category"
          label="קטגוריה"
          options={CATEGORY_OPTIONS}
          value={category ?? "other"}
          onChange={(event) => setCategory(DOCUMENT_CATEGORIES.find((value) => value === event.target.value) ?? "other")}
        />
        <div className={styles.saveActions}>
          <Button type="submit" disabled={isSaving || pages.length === 0}>
            {isSaving ? "שומר..." : pages.length === 0 ? "שמירה" : `שמירת ${pages.length === 1 ? "דף אחד" : `${pages.length} דפים`}`}
          </Button>
          <ButtonLink href={cancelHref} variant="quiet">ביטול</ButtonLink>
        </div>
        <FormMessage message={message} />
      </form>

      <DocumentStrip sources={sources} openId={openId} onOpen={(id) => setOpenId((current) => (current === id ? null : id))} />

      <div className={styles.workspace}>
        {openSource && (
          <SourcePages
            key={openSource.id}
            source={openSource}
            onAdd={(pageNumbers) => insert(openSource.id, pageNumbers, insertAt ?? pages.length)}
            onClose={() => setOpenId(null)}
          />
        )}
        <ComposeList
          pages={pages}
          sources={byId}
          insertAt={insertAt}
          onSetInsertAt={setInsertAt}
          onDrop={drop}
          onRemove={remove}
          onRotate={rotate}
          onMove={move}
        />
      </div>
      <p className={styles.note}>המסמכים המקוריים נשארים בתיק כמו שהם. הקובץ החדש נשמר כמסמך נוסף.</p>
    </div>
  );
}
