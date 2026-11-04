import { money } from "./inbox-tools";

/**
 * Placeholders filled from the order registered from a comment, on the server,
 * so a confirmation always states what was actually saved.
 */
export const ORDER_FIELDS = ["منتجات الطلب", "مجموع الطلب", "العنوان", "رقم الهاتف", "المحافظة"];

const GOVERNORATE_AR: Record<string, string> = {
  Baghdad: "بغداد", Basra: "البصرة", Nineveh: "نينوى", Erbil: "أربيل", Kirkuk: "كركوك", Sulaymaniyah: "السليمانية",
  Diyala: "ديالى", Babylon: "بابل", Anbar: "الأنبار", "Dhi Qar": "ذي قار", Karbala: "كربلاء", Najaf: "النجف",
  Wasit: "واسط", Qadisiyah: "القادسية", Maysan: "ميسان", Muthanna: "المثنى", Saladin: "صلاح الدين", Dohuk: "دهوك",
};

const tokens = (text: string) => [...text.matchAll(/\{([^{}]+)\}/g)].map(match => match[1].trim());

export function usesOrderFields(text: string) {
  return tokens(text).some(token => ORDER_FIELDS.includes(token));
}

export type RegisteredOrder = {
  phoneNumber: string | null; governorate: string; address: string; totalPrice: number;
  items: { name: string; qty: number }[];
};

/** Fill the order placeholders; prices are in thousands of dinars like the rest of the store. */
export function fillOrderFields(text: string, order: RegisteredOrder) {
  const governorate = GOVERNORATE_AR[order.governorate] || order.governorate;
  const values: Record<string, string> = {
    "منتجات الطلب": order.items.map(item => item.qty > 1 ? `${item.name} × ${item.qty}` : item.name).join("، "),
    "مجموع الطلب": money(order.totalPrice),
    "العنوان": [governorate, order.address.trim()].filter(Boolean).join(" - "),
    "رقم الهاتف": order.phoneNumber || "",
    "المحافظة": governorate,
  };
  return text.replace(/\{([^{}]+)\}/g, (token, key: string) => values[key.trim()] ?? token);
}
