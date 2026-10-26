"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InboxItem } from "@/lib/meta/inbox";
import { advanceDelivery, createInboxSendQueue, type OutboxEntry } from "@/lib/meta/inbox-outbox";

export class InboxSendFailure extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}
export type OutboxExecution = { item: InboxItem; previousMessageIds: string[] };
export function useSocialOutbox() {
  const [entries, setEntries] = useState<Record<string, OutboxEntry[]>>({});
  const queue = useRef(createInboxSendQueue());
  const confirmedTail = useRef(new Map<string, string>());
  const previews = useRef(new Set<string>());
  useEffect(() => () => { previews.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  useEffect(() => {
    const used = new Set(Object.values(entries).flatMap(items => items.flatMap(entry => entry.item.attachments?.map(item => item.url) || [])));
    for (const url of previews.current) if (!used.has(url)) { URL.revokeObjectURL(url); previews.current.delete(url); }
    const pending = Object.values(entries).some(items => items.some(entry => ["queued", "sending"].includes(entry.item.deliveryStatus || "")));
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    if (pending) window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [entries]);
  const enqueue = useCallback((scope: string, conversationId: string, item: InboxItem, previousMessageIds: string[],
    execute: () => Promise<OutboxExecution>) => {
    const localId = item.id;
    if (item.attachments?.[0]?.url.startsWith("blob:")) previews.current.add(item.attachments[0].url);
    const change = (update: (entry: OutboxEntry) => OutboxEntry) => setEntries(prev => ({ ...prev,
      [scope]: (prev[scope] || []).map(entry => entry.localId === localId ? update(entry) : entry) }));
    setEntries(prev => ({ ...prev, [scope]: [...(prev[scope] || []), { localId, conversationId, item: { ...item, deliveryStatus: "queued" }, previousMessageIds }] }));
    return queue.current(`${scope}:${conversationId}`, async () => {
      change(entry => ({ ...entry, item: { ...entry.item, deliveryStatus: "sending" } }));
      try {
        const confirmed = await execute();
        const key = `${scope}:${conversationId}`;
        const previous = confirmedTail.current.get(key);
        const previousMessageIds = [...new Set([...confirmed.previousMessageIds, ...(previous ? [previous] : [])])];
        confirmedTail.current.set(key, confirmed.item.id);
        change(entry => ({ ...entry, ...confirmed, previousMessageIds, item: { ...confirmed.item, deliveryStatus: "sent" } }));
        return;
      } catch (error) {
        change(entry => ({ ...entry, item: { ...entry.item,
          deliveryStatus: error instanceof InboxSendFailure && !error.uncertain ? "failed" : "uncertain",
          sendError: error instanceof InboxSendFailure ? error.message : "لم نستلم تأكيد الإرسال؛ تحقّق في Meta قبل إعادة الإرسال." } }));
      }
    });
  }, []);
  const updateStatuses = useCallback((scope: string, conversationId: string, updates: Pick<InboxItem, "id" | "time" | "deliveryStatus">[]) => {
    const byId = new Map(updates.map(item => [item.id, item]));
    setEntries(prev => {
      let changed = false;
      const items = (prev[scope] || []).map(entry => {
        const update = entry.conversationId === conversationId ? byId.get(entry.item.id) : undefined;
        if (!update) return entry;
        const deliveryStatus = advanceDelivery(entry.item.deliveryStatus, update.deliveryStatus);
        if (deliveryStatus === entry.item.deliveryStatus && update.time === entry.item.time) return entry;
        changed = true;
        return { ...entry, item: { ...entry.item, time: update.time, deliveryStatus } };
      });
      return changed ? { ...prev, [scope]: items } : prev;
    });
  }, []);
  return { entries, enqueue, updateStatuses };
}
