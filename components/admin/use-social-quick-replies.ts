"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { decodeQuickReplies, type QuickReply } from "@/lib/meta/inbox-tools";

export type QuickReplyLibrary = { templates: QuickReply[]; loaded: boolean; save: (next: QuickReply[]) => boolean };
const CHANGE_EVENT = "social-inbox:quick-replies-changed";
const serverSnapshot = () => undefined;

/** One library shared by the composer and its editor; preserves existing saved replies. */
export function useSocialQuickReplies(userId: string): QuickReplyLibrary {
  const key = `social-inbox:quick-replies:v1:${userId}`;
  const read = useCallback(() => {
    try { return localStorage.getItem(key); } catch { return null; }
  }, [key]);
  const subscribe = useCallback((notify: () => void) => {
    const update = (event: StorageEvent) => {
      if (event.key === key || event.key === null) notify();
    };
    const localUpdate = (event: Event) => { if ((event as CustomEvent<string>).detail === key) notify(); };
    window.addEventListener("storage", update);
    window.addEventListener(CHANGE_EVENT, localUpdate);
    return () => { window.removeEventListener("storage", update); window.removeEventListener(CHANGE_EVENT, localUpdate); };
  }, [key]);
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, read, serverSnapshot);
  const templates = useMemo(() => raw === undefined ? [] : decodeQuickReplies(raw), [raw]);
  const save = useCallback((next: QuickReply[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
      return true;
    }
    catch { return false; }
  }, [key]);
  return { templates, loaded: raw !== undefined, save };
}
