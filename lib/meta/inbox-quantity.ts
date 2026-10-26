import { normalizeLocation } from "./inbox-location";

const phone = /(?<!\d)(?:\+?964|00964|0)7\d(?:[\s-]?\d){8}(?!\d)/g;
const priceOrQuestion = /[؟?$]|شكد|بكم|سعر|الف|دينار|توصيل|عرض|خصم|https?:\/\//iu;
const label = /^(?:الكمية|الكميه|العدد|عدد القطع|عدد)\s*[:：\-]?\s*/u;
const numeric = /^(\d+)\s*(?:قطعه|قطع|قطعتين|قطعتان|حبه|حبات)?\s*$/u;
const one = /^(?:قطعه\s+(?:وحده|واحده)|حبه\s+(?:وحده|واحده)|قطعه|وحده|واحده|واحد)$/u;
const two = /^(?:قطعتين|قطعتان|حبتين|حبتان|اثنين|ثنين)$/u;
const request = /(?:^|[^\p{L}])(?:اريد(?:ها|ه)?|رايد(?:ها|ه)?|احجز(?:لي)?|محتاج|احتاج|نريد)(?=$|[^\p{L}])/u;
const units = /(?:^|[^\p{L}\p{N}])(?:(\d+)\s*(?:قطعه|قطع|حبه|حبات)|(قطعتين|قطعتان|حبتين|حبتان)|(قطعه\s+(?:وحده|واحده)|حبه\s+(?:وحده|واحده)|وحده|واحده))(?=$|[^\p{L}\p{N}])/gu;

/** Latest explicit customer quantity wins; prices, phones, and dates are not quantities. */
export function extractInboxQuantity(lines: string[]) {
  let quantity = 1;
  for (const raw of lines) {
    const text = normalizeLocation(raw.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= "۰" ? 1776 : 1632))))
      .replace(phone, " ").replace(/\s+/g, " ").trim();
    if (!text || priceOrQuestion.test(text)) continue;
    const labelled = label.test(text);
    const value = labelled ? text.replace(label, "") : text;
    // "العدد 2 قطعتين" repeats the same value in words.
    const repeated = value.match(/^(\d+)\s+(قطعتين|قطعتان|حبتين|حبتان)$/u);
    if (labelled && repeated && Number(repeated[1]) === 2) { quantity = 2; continue; }
    const digits = value.match(numeric);
    if (digits && (labelled || /\p{L}/u.test(value))) { quantity = Number(digits[1]); continue; }
    if (two.test(value)) { quantity = 2; continue; }
    if (one.test(value)) { quantity = 1; continue; }
    if (!request.test(value)) continue;
    const mentions = [...value.matchAll(units)].map(match => match[1] ? Number(match[1]) : match[2] ? 2 : 1);
    if (mentions.length && new Set(mentions).size === 1) quantity = mentions[0];
  }
  return quantity;
}
