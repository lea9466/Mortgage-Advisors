"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload, X } from "lucide-react";
import type { FinishUploadResult, StartUploadResult } from "@/app/(app)/cases/document-actions";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import {
  ACCEPT_ATTRIBUTE,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  formatFileSize,
  titleFromFileName,
  type DocumentCategory,
} from "@/lib/validation/document";
import styles from "./Documents.module.css";

type StartAction = (file: { fileName: string; size: number; contentType: string }) => Promise<StartUploadResult>;
type FinishAction = (input: { token: string; title: string; category: DocumentCategory; clientId?: string }) => Promise<FinishUploadResult>;

type Item = { key: number; file: File; title: string; state: "waiting" | "uploading" | "checking" | "done" | "error"; progress: number; error?: string };

const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({ value, label: DOCUMENT_CATEGORY_LABELS[value] }));

/** Browsers sometimes leave the type empty; fall back to the extension. The server checks the real content anyway. */
function contentTypeOf(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExtension: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    doc: "application/msword",
    xls: "application/vnd.ms-excel",
  };
  return byExtension[extension] ?? "application/octet-stream";
}

/** Sends the raw file to the one-time link, reporting progress. */
function putFile(url: string, headers: Record<string, string>, file: File, onProgress: (share: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`status ${request.status}`)));
    request.onerror = () => reject(new Error("network"));
    request.send(file);
  });
}

type DocumentUploaderProps = {
  borrowers: { value: string; label: string }[];
  start: StartAction;
  finish: FinishAction;
};

export function DocumentUploader({ borrowers, start, finish }: DocumentUploaderProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [category, setCategory] = useState<DocumentCategory>("other");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (key: number, change: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));

  function add(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files).map((file) => ({ key: nextKey.current++, file, title: titleFromFileName(file.name), state: "waiting" as const, progress: 0 }));
    setItems((current) => [...current.filter((item) => item.state !== "done"), ...added]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadAll() {
    setBusy(true);
    for (const item of items.filter((candidate) => candidate.state === "waiting" || candidate.state === "error")) {
      update(item.key, { state: "uploading", progress: 0, error: undefined });
      const started = await start({ fileName: item.file.name, size: item.file.size, contentType: contentTypeOf(item.file) });
      if ("error" in started) {
        update(item.key, { state: "error", error: started.error });
        continue;
      }
      try {
        await putFile(started.url, started.headers, item.file, (share) => update(item.key, { progress: share }));
      } catch {
        update(item.key, { state: "error", error: "ההעלאה נקטעה. בדקו את החיבור ונסו שוב" });
        continue;
      }
      update(item.key, { state: "checking", progress: 1 });
      const finished = await finish({ token: started.token, title: item.title.trim() || titleFromFileName(item.file.name), category, clientId: clientId || undefined });
      update(item.key, "error" in finished ? { state: "error", error: finished.error } : { state: "done" });
    }
    setBusy(false);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    add(event.dataTransfer.files);
  }

  const pending = items.some((item) => item.state === "waiting" || item.state === "error");

  return (
    <section className={styles.uploader} aria-labelledby="upload-title">
      <h3 id="upload-title" className={styles.uploaderTitle}>העלאת מסמכים</h3>
      <label className={styles.drop} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <Upload aria-hidden="true" className={styles.dropIcon} />
        <span>גררו לכאן קבצים, או לחצו לבחירה</span>
        <span className={styles.hint}>PDF, תמונה או Office, עד 25MB לקובץ</span>
        <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTRIBUTE} onChange={(event) => add(event.target.files)} className="visually-hidden" />
      </label>

      {items.length > 0 && (
        <>
          <div className={styles.uploadOptions}>
            <SelectField id="upload-category" label="קטגוריה" options={CATEGORY_OPTIONS} value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)} disabled={busy} />
            {borrowers.length > 0 && (
              <SelectField id="upload-client" label="של מי המסמך" options={borrowers} placeholder="כל התיק" value={clientId} onChange={(event) => setClientId(event.target.value)} disabled={busy} />
            )}
          </div>
          <ul className={styles.queue}>
            {items.map((item) => (
              <li key={item.key} className={styles.queueItem}>
                <input
                  aria-label={`שם המסמך ${item.file.name}`}
                  value={item.title}
                  maxLength={200}
                  disabled={item.state !== "waiting" && item.state !== "error"}
                  onChange={(event) => update(item.key, { title: event.target.value })}
                  className={styles.titleInput}
                />
                <span className={styles.size}>{formatFileSize(item.file.size)}</span>
                <span className={styles.state} role="status">
                  {item.state === "waiting" && "ממתין"}
                  {item.state === "uploading" && `מעלה ${Math.round(item.progress * 100)}%`}
                  {item.state === "checking" && "בודק את הקובץ..."}
                  {item.state === "done" && "נשמר ✓"}
                  {item.state === "error" && <span className={styles.error}>{item.error}</span>}
                </span>
                {(item.state === "waiting" || item.state === "error") && !busy && (
                  <button type="button" className={styles.remove} aria-label={`הסרת ${item.file.name} מהרשימה`} onClick={() => setItems((current) => current.filter((other) => other.key !== item.key))}>
                    <X aria-hidden="true" />
                  </button>
                )}
                <progress className={styles.progress} max={1} value={item.progress} aria-hidden="true" />
              </li>
            ))}
          </ul>
          <div className={styles.uploadActions}>
            <Button onClick={uploadAll} disabled={busy || !pending}>
              {busy ? "מעלה..." : "העלאה"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
