/** Match common Iraqi spellings without changing the customer's original address. */
export const normalizeLocation = (text: string) => text
  .replace(/[\u064B-\u065F\u0670\u0640\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/[ىیێ]/g, "ي").replace(/ک/g, "ك").replace(/ة/g, "ه");

const GOVERNORATES: Record<string, string[]> = {
  Baghdad: ["بغداد"], Basra: ["بصره"], Nineveh: ["نينوي", "نينوا", "موصل"],
  Erbil: ["اربيل", "هولير"], Kirkuk: ["كركوك"], Sulaymaniyah: ["سليمانيه", "سليماني"],
  Diyala: ["ديالي", "بعقوبه"], Babylon: ["بابل", "حله"],
  Anbar: ["انبار", "رمادي", "فلوجه"], "Dhi Qar": ["ذي قار", "ذيقار", "ناصريه"],
  Karbala: ["كربلاء", "كربلا"], Najaf: ["نجف"], Wasit: ["واسط", "كوت"],
  Qadisiyah: ["قادسيه", "ديوانيه"], Maysan: ["ميسان", "عماره"],
  Muthanna: ["مثني", "سماوه"], Saladin: ["صلاح الدين", "صلاحالدين", "تكريت"],
  Dohuk: ["دهوك"],
};
const boundary = "(^|[^\\p{L}\\p{N}])";
const end = "(?=$|[^\\p{L}\\p{N}])";
const aliases = Object.entries(GOVERNORATES).flatMap(([key, names]) =>
  [...new Set([key.toLowerCase(), ...names.map(normalizeLocation)])].map(name => ({ key,
    pattern: new RegExp(`${boundary}${/[a-z]/.test(name) ? "" : "(?:لل|(?:[بل])?(?:ال)?)"}${name.replace(/ /g, "\\s+")}${end}`, "giu") })));
const cue = new RegExp(`${boundary}(?:ال)?(?:شارع|حي|منطقه|محله|زقاق|قرب|مقابل|جانب|ساحه|قضاء|ناحيه|مجمع|دور|عماره|مستشفي|مستوصف)${end}`, "u");
// Infer only from recognized areas in the selected address. Repeated names need
// distinctive context: اليرموك alone is not enough to select Baghdad.
const areaRules = [
  { governorate: "Baghdad", label: "بغداد", pattern: new RegExp(`${boundary}(?:ال)?(?:جادريه|كراده|اعظميه)(?:\\s+(?:داخل|خارج))?${end}`, "u") },
  { governorate: "Baghdad", label: "بغداد", pattern: new RegExp(`${boundary}نفق\\s+(?:ال)?شرطه${end}`, "u") },
  { governorate: "Baghdad", label: "بغداد", pattern: new RegExp(`${boundary}(?:ال)?يرموك\\s+(?:اربع|4)\\s+شوارع${end}`, "u") },
  // Store delivery categories use Sulaymaniyah for Kalar/Garmian; keep it a
  // reviewable suggestion, not an explicit province supplied by the customer.
  { governorate: "Sulaymaniyah", label: "السليمانية", pattern: new RegExp(`${boundary}(?:كەلار|كلار)${end}`, "u") },
];
const knownAreas = (text: string) => areaRules.filter(rule => rule.pattern.test(text));
const businessContinuation = /^(?:خدمات|ورشه|محل|كراج|شركه|(?:ال)?مركز|مول)\s+\p{L}/u;
const neighborhood = /(?:^|\s)(?:ال)?(?:حي|شارع|منطقه|محله|جامعه|مستشفي|جسر|مدرسه|جامع|مطعم|مول|شركه|محل|كراج)\s*$/u;
// Questions and transaction chatter are not delivery addresses, including joined words.
const chatter = /[؟?]|https?:\/\/|شكد|بكم|السعر|التوصيل|متوفر|عندكم|عندك|شلون/iu;
const deliveryQuestion = new RegExp(`${boundary}(?:(?:ايش|اي|شنو|وش|يا)\\s+(?:وقت|وكت|موعد)|شوكت|شوقت|اشوكت|اشوقت|متي|يمتي|امتي)${end}`, "u");
const transaction = new RegExp(`${boundary}(?:سعر|توصيل|هل|اريد|اريدها|اريده|شكرا|شكراً|تم|نعم|لا|الف|قطعه|قطع|سيت)${end}`, "u");
const phone = /(?<!\d)(?:\+?964|00964|0)7\d(?:[\s-]?\d){8}(?!\d)/g;
// Remove the contact label only when it is immediately followed by a phone,
// so address letters/words are not trimmed accidentally.
const labelledPhone = new RegExp(`${boundary}(?:رقم الهاتف|رقم الموبايل|الهاتف|هاتف|الموبايل|موبايل|تلفون|تليفون|رقمي|ت)\\s*[:：\\-]?\\s*${phone.source}`, "gu");
const labelled = /^\s*(?:العنوان|عنوان|عنواني|المنطقة|المنطقه)\s*(?:[:：\-]\s*|\s+)(.+)$/u;
const greeting = /^(?:(?:ال)?سلام\s+عليكم|و?عليكم\s+(?:ال)?سلام)(?:\s+و?رحم[ةه]\s+الله)?(?:\s+وبركاته)?(?=$|[\s،,:؛.!🌷])(?:[\s،,:؛.!🌷])*/u;
const courtesy = /^(?:(?:اخي|أخي|اخوي|اخويه|حبيبي|عزيزي|لو سمحت)[\s،,:]+)+/u;
// A purchase request may precede a real address in the same sentence.
// Strip only a recognized opening, then apply the usual location/question checks.
const requestOpening = /^(?:[اأإ]ريد(?:ها|ه)?|رايد(?:ها|ه)?|نريد|محتاج|[اأإ]حتاج|[اأإ]حجز(?:لي)?)\s+(?:(?:وحد[ةه]|واحد[ةه]?|قطعتين|قطعتان|قطعة|قطعه|حبة|حبه|\d+\s*(?:قطع|قطعة|قطعه)?)\s+)?(?:من\s+|في\s+)?/u;

function places(text: string) {
  const matches: { key: string; start: number; end: number }[] = [];
  for (const alias of aliases) {
    for (const match of text.matchAll(alias.pattern)) {
      const start = match.index! + match[1].length;
      // "حي القادسية" and "شارع فلسطين" describe neighborhoods, not provinces.
      if (neighborhood.test(text.slice(0, start))) continue;
      if (alias.key === "Maysan" && /عماره/u.test(match[0]) && /^\s*\d/.test(text.slice(match.index! + match[0].length))) continue;
      matches.push({ key: alias.key, start, end: match.index! + match[0].length });
    }
  }
  return matches;
}

export function extractInboxLocation(lines: string[]) {
  const governorates = new Set<string>();
  const candidates: { index: number; text: string; explicit: boolean; keys: string[] }[] = [];
  let provinceLine: { index: number; text: string; keys: string[] } | undefined;
  lines.forEach((raw, index) => {
    let clean = raw.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= "۰" ? 1776 : 1632)))
      .replace(labelledPhone, "$1").replace(phone, "").trim()
      .replace(greeting, "").replace(courtesy, "").replace(requestOpening, "").replace(courtesy, "").replace(/\s+/g, " ").trim();
    if (clean.startsWith("لل") && places(normalizeLocation(clean)).some(place => place.start === 0))
      clean = `ا${clean.slice(1)}`; // "للبصره" → "البصره", only for a recognized destination.
    const text = normalizeLocation(clean);
    if (!text || chatter.test(text) || deliveryQuestion.test(text) || transaction.test(text)) return;
    const found = places(text);
    const keys = [...new Set(found.map(item => item.key))];
    keys.forEach(key => governorates.add(key));
    let details = text;
    for (const match of [...found].sort((a, b) => b.start - a.start))
      details = details.slice(0, match.start) + " " + details.slice(match.end);
    details = details.replace(/(^|[^\p{L}])(?:انا|اني|من|في|(?:ال)?محافظه|(?:ال)?مدينه|العنوان|عنواني|عنوان)(?=$|[^\p{L}])/gu, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const explicit = clean.match(labelled);
    const previous = candidates.at(-1);
    const area = knownAreas(text).length > 0;
    const continuation = previous?.index === index - 1 && businessContinuation.test(text);
    const location = !!explicit || area || continuation || (cue.test(text) && text.trim().split(/\s+/).length >= 2) || (keys.length > 0 && !!details);
    if (location && (explicit?.[1] || clean).length >= 3 && details) {
      let address = explicit?.[1].trim() || clean;
      if (!explicit && provinceLine?.index === index - 1 && !keys.length) address = `${provinceLine.text}، ${address}`;
      // A fresh address label or province starts a new address, even for the same
      // destination. Only append unlabelled location/landmark continuations.
      if (!explicit && !keys.length && previous?.index === index - 1) {
        address = `${previous.text}، ${address}`;
        candidates.pop();
        candidates.push({ index, text: address, explicit: !!explicit || previous.explicit, keys: [...new Set([...previous.keys, ...keys])] });
      } else candidates.push({ index, text: address, explicit: !!explicit, keys });
    } else if (keys.length === 1 && !details) provinceLine = { index, text: clean, keys };
  });
  const chosen = candidates.filter(item => item.explicit).at(-1) || candidates.at(-1);
  const areas = chosen ? knownAreas(normalizeLocation(chosen.text)) : [];
  const inferred = !governorates.size ? [...new Map(areas.map(rule => [rule.governorate, rule])).values()] : [];
  inferred.forEach(rule => governorates.add(rule.governorate));
  return { governorates: [...governorates], address: chosen?.text || "", explicitAddress: !!chosen?.explicit,
    inferredGovernorate: inferred.length > 0, inferredGovernorateLabel: inferred.length === 1 ? inferred[0].label : "" };
}
