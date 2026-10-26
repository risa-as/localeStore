import { reconcileConversation, type ConversationReceipt } from "./inbox-state";
import type { InboxItem } from "./inbox";

const incoming: InboxItem = { id: "thread", handle: "handle", title: "Customer", text: "Question",
  time: "2026-10-23T10:00:00Z", outgoing: false, unread: 2, lastMessageId: "incoming1" };
const reply: InboxItem = { id: "sent1", handle: "", title: "Page", text: "Confirmed reply",
  time: "2026-10-23T10:01:00Z", outgoing: true };
const receipt: ConversationReceipt = { readMessageId: "incoming1", reply, previousMessageIds: ["incoming1"] };

it("keeps a confirmed reply and read receipt when Meta returns the pre-send summary", () => {
  const item = reconcileConversation(incoming, receipt);
  expect(item).toMatchObject({ outgoing: true, unread: 0, text: reply.text, lastMessageId: reply.id });
  expect(reconcileConversation(item, receipt)).toEqual(item);
});
it("keeps a new customer message unread and awaiting a reply, even with the same timestamp", () => {
  const newMessage = { ...incoming, lastMessageId: "incoming2", time: reply.time, text: "New question", unread: 1 };
  expect(reconcileConversation(newMessage, receipt)).toEqual(newMessage);
});
it("only clears unread for the specific acknowledged snapshot", () => {
  expect(reconcileConversation(incoming, { readMessageId: "incoming1" }).unread).toBe(0);
  expect(reconcileConversation({ ...incoming, lastMessageId: "incoming2" }, { readMessageId: "incoming1" }).unread).toBe(2);
});
it("does not claim Meta marked a conversation read just because sending succeeded", () => {
  expect(reconcileConversation(incoming, { reply, previousMessageIds: ["incoming1"] }))
    .toMatchObject({ outgoing: true, unread: 2 });
});
it("applies the local sent receipt without waiting for another Meta read acknowledgement", () => {
  const sentReceipt = { readMessageId: reply.id, reply, previousMessageIds: [incoming.lastMessageId!] };
  const updated = reconcileConversation(incoming, sentReceipt);
  expect(updated).toMatchObject({ outgoing: true, unread: 0, text: reply.text, lastMessageId: reply.id });
  expect(reconcileConversation(updated, sentReceipt)).toEqual(updated);
  const newInbound = { ...incoming, lastMessageId: "arrived-during-send", unread: 1 };
  expect(reconcileConversation(newInbound, sentReceipt)).toEqual(newInbound);
});
it("does not overwrite an unknown message without an ID", () => {
  const unknown = { ...incoming, lastMessageId: undefined };
  expect(reconcileConversation(unknown, receipt)).toEqual(unknown);
});
