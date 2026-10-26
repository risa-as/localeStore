import type { InboxItem } from "./inbox";
import type { DeliveryStatus } from "./inbox-delivery";

export type OutboxEntry = { localId: string; conversationId: string; item: InboxItem; previousMessageIds: string[] };
const rank: Partial<Record<DeliveryStatus, number>> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 };
export function advanceDelivery(current: DeliveryStatus | undefined, incoming: DeliveryStatus | undefined): DeliveryStatus | undefined {
  if (!incoming) return current;
  if (!current) return incoming;
  return (rank[current] ?? -1) > (rank[incoming] ?? -1) ? current : incoming;
}
export function mergeOutbox(remote: InboxItem[], entries: OutboxEntry[]): InboxItem[] {
  const items = new Map(remote.map(item => [item.id, item]));
  for (const entry of entries) {
    const existing = items.get(entry.item.id);
    items.set(entry.item.id, existing ? { ...entry.item, ...existing,
      deliveryStatus: advanceDelivery(entry.item.deliveryStatus, existing.deliveryStatus) } : entry.item);
  }
  return [...items.values()];
}

/** Each conversation sends in order; another conversation remains independent. */
export function createInboxSendQueue() {
  const tails = new Map<string, Promise<void>>();
  return (key: string, task: () => Promise<void>) => {
    const run = (tails.get(key) || Promise.resolve()).catch(() => {}).then(task);
    const tail = run.catch(() => {});
    tails.set(key, tail);
    void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
    return run;
  };
}
