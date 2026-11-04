"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { decodeCommentReplies, type CommentReply } from "@/lib/meta/comment-replies";

const CHANGE_EVENT = "social-inbox:comment-replies-changed";
const serverSnapshot = () => undefined;

/** A JSON value in this browser's storage, shared live between components and tabs. */
function useStored(key: string) {
  const read = useCallback(() => {
    try { return localStorage.getItem(key); } catch { return null; }
  }, [key]);
  const subscribe = useCallback((notify: () => void) => {
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) notify(); };
    const local = (event: Event) => { if ((event as CustomEvent<string>).detail === key) notify(); };
    window.addEventListener("storage", storage);
    window.addEventListener(CHANGE_EVENT, local);
    return () => { window.removeEventListener("storage", storage); window.removeEventListener(CHANGE_EVENT, local); };
  }, [key]);
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, read, serverSnapshot);
  const write = useCallback((value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
      return true;
    } catch { return false; }
  }, [key]);
  return { raw, write };
}

export type CommentReplyLibrary = { replies: CommentReply[]; loaded: boolean; save: (next: CommentReply[]) => boolean };

/** The admin's comment replies (buttons, keywords, private messages), per account and browser. */
export function useSocialCommentReplies(userId: string): CommentReplyLibrary {
  const { raw, write } = useStored(`social-inbox:comment-replies:v1:${userId}`);
  const replies = useMemo(() => raw === undefined ? [] : decodeCommentReplies(raw), [raw]);
  return { replies, loaded: raw !== undefined, save: write };
}

/** Product the admin chose for a post, by post id. Only the product id is kept, so prices stay current. */
export function usePostProductChoice(userId: string, pageId: string, postId: string | undefined) {
  const { raw, write } = useStored(`social-inbox:post-products:v1:${userId}:${pageId}`);
  const map = useMemo<Record<string, string>>(() => {
    try {
      const value: unknown = JSON.parse(raw || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : {};
    } catch { return {}; }
  }, [raw]);
  const choice = postId && typeof map[postId] === "string" ? map[postId] : null;
  const choose = useCallback((productId: string | null) => {
    if (!postId) return false;
    const next = { ...map };
    if (productId) next[postId] = productId; else delete next[postId];
    // Keep the most recent 300 posts.
    return write(Object.fromEntries(Object.entries(next).slice(-300)));
  }, [map, postId, write]);
  return { choice, choose };
}
