import { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-guard";
import {
  getWaConversations,
  isWhatsAppConfigured,
} from "@/lib/actions/whatsapp.actions";
import ChatsClient from "./chats-client";

export const metadata: Metadata = {
  title: "المحادثات",
};

const AdminChatsPage = async () => {
  await requireAdmin();

  const [conversations, configured] = await Promise.all([
    getWaConversations(),
    isWhatsAppConfigured(),
  ]);

  return (
    <ChatsClient initialConversations={conversations} configured={configured} />
  );
};

export default AdminChatsPage;
