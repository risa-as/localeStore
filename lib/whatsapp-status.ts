/** Late callbacks cannot turn a read/delivered message back into a failure. */
export function advanceWaStatus(current: string, incoming: string): string {
  const rank: Record<string, number> = { queued: 0, sending: 0, accepted: 1, sent: 1, failed: 1, delivered: 2, read: 3 };
  if (!(incoming in rank)) return current;
  if (incoming === "failed" && (rank[current] ?? 0) < 2) return incoming;
  return (rank[incoming] ?? 0) > (rank[current] ?? 0) ? incoming : current;
}
