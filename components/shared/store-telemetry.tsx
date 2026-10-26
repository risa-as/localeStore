"use client";
import { useEffect } from "react";
import { recordStoreEvent } from "@/lib/actions/store-events.actions";
export default function StoreTelemetry({ name, productId }: { name: string; productId?: string }) {
  useEffect(() => { recordStoreEvent(name, productId).catch(() => {}); }, [name, productId]);
  return null;
}
