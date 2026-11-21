"use client";

import { useEffect, useState } from "react";
import { loadSource, SourceLoadError } from "@/lib/pdf/browser";
import type { EditorSource } from "./model";

export type SourceInfo = { status: "loading" } | { status: "ready"; pageCount: number } | { status: "locked" | "error" };

/** How many pages a document has, once it has been opened in the browser. */
export function useSourceInfo(source: EditorSource | null): SourceInfo {
  const [info, setInfo] = useState<{ id: string; value: SourceInfo } | null>(null);

  useEffect(() => {
    if (!source) return;
    let stopped = false;
    loadSource(source.id, source.contentType)
      .then((loaded) => {
        if (!stopped) setInfo({ id: source.id, value: { status: "ready", pageCount: loaded.pageCount } });
      })
      .catch((error: unknown) => {
        if (!stopped) setInfo({ id: source.id, value: { status: error instanceof SourceLoadError && error.reason === "locked" ? "locked" : "error" } });
      });
    return () => {
      stopped = true;
    };
  }, [source]);

  return info && source && info.id === source.id ? info.value : { status: "loading" };
}
