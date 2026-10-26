import { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-guard";
import {
  getWaInbox,
  isWhatsAppConfigured,
} from "@/lib/actions/whatsapp.actions";
import ChatsClient from "./chats-client";

export const metadata: Metadata = {
  title: "المحادثات",
};

const AdminChatsPage = async ({ searchParams }: {
  searchParams: Promise<{ query?: string; template?: string; filter?: string }>;
}) => {
  await requireAdmin();
  const params = await searchParams;
  const [inbox, configured] = await Promise.all([
    getWaInbox(params.query, params.template, params.filter),
    isWhatsAppConfigured(),
  ]);

  return (
    <ChatsClient key={JSON.stringify(inbox.selection)} initialInbox={inbox} configured={configured} />
  );
};

export default AdminChatsPage;
