import { extractInboxOrder } from "./inbox-order";
import type { InboxItem } from "./inbox";

const message = (text: string, extra: Partial<InboxItem> = {}): InboxItem => ({ id: "m", handle: "", title: "اسم العميل", text, outgoing: false, time: "2026-10-24T08:00:00Z", ...extra });
it("uses a fixed customer name and parses labelled Arabic contact details", () => {
  expect(extractInboxOrder([message("الاسم: أحمد\nالهاتف: +٩٦٤٧٧٠١٢٣٤٥٦٧\nالمحافظة: بغداد\nالعنوان: المنصور قرب الجامع\nالكمية: ٢")]))
    .toMatchObject({ fullName: "زبون", phoneNumber: "07701234567", governorate: "Baghdad", address: "المنصور قرب الجامع", quantity: 2 });
});
it("combines fragmented incoming messages but excludes staff and system messages", () => {
  expect(extractInboxOrder([message("هاتفنا 07801234567 في البصرة", { outgoing: true }), message("07701234567"), message("بغداد"), message("العنوان: الكرادة قرب المستشفى"), message("نينوى", { system: "comment-origin" })]))
    .toMatchObject({ phoneNumber: "07701234567", governorate: "Baghdad", address: "الكرادة قرب المستشفى", quantity: 1 });
});
it("leaves conflicting phones and governorates to review instead of choosing silently", () => {
  const result = extractInboxOrder([message("07701234567 بغداد\n07801234567 البصرة")]);
  expect(result.phoneNumber).toBe(""); expect(result.governorate).toBe(""); expect(result.warnings.length).toBeGreaterThanOrEqual(2);
});
it("normalizes repeats of the same phone and does not infer quantity from a price", () => {
  expect(extractInboxOrder([message("07701234567\n+9647701234567\nالسعر 30 الف")])).toMatchObject({ phoneNumber: "07701234567", quantity: 1 });
});
it("suggests a free-text address with a location cue and keeps it marked for review", () => {
  const result = extractInboxOrder([message("07701234567\nبغداد حي الجامعة قرب الجامع")]);
  expect(result.address).toBe("بغداد حي الجامعة قرب الجامع");
  expect(result.warnings.join(" ")).toContain("اقتُرح العنوان");
});
it("does not mistake a delivery question for a free-text address", () => {
  expect(extractInboxOrder([message("بغداد حي الجامعة التوصيل شكد؟")]).address).toBe("");
});
it("collects only product/landing links, keeping host information for server validation", () => {
  const result = extractInboxOrder([message("https://store.example/ar/landing/example https://other.example/ar/product/untrusted https://store.example/ar/search", { outgoing: true })]);
  expect(result.slugs).toEqual([{ host: "store.example", slug: "example" }, { host: "other.example", slug: "untrusted" }]);
});

it("extracts the customer's Babylon address across price negotiation and a later phone message", () => {
  const result = extractInboxOrder([
    message("بابل المحاويل الحي الصناعي"), message("شكدالسعرمع التوصيل"),
    message("سعر السيت ب27 الف و3 توصيل", { outgoing: true }), message("تم"), message("07801234567"),
  ]);
  expect(result).toMatchObject({ fullName: "زبون", governorate: "Babylon", address: "بابل المحاويل الحي الصناعي", phoneNumber: "07801234567", quantity: 1 });
});

it.each([
  ["بصرة", "Basra"], ["بصره", "Basra"], ["البصرة", "Basra"], ["بالبصره", "Basra"],
  ["بابل", "Babylon"], ["حلة", "Babylon"], ["حله", "Babylon"], ["الحلة", "Babylon"],
  ["قادسية", "Qadisiyah"], ["قادسيه", "Qadisiyah"], ["ديوانية", "Qadisiyah"], ["ديوانيه", "Qadisiyah"],
  ["بغداد", "Baghdad"], ["نينوى", "Nineveh"], ["موصل", "Nineveh"], ["أربيل", "Erbil"],
  ["كركوك", "Kirkuk"], ["سليمانية", "Sulaymaniyah"], ["دیالى", "Diyala"], ["بعقوبه", "Diyala"],
  ["أنبار", "Anbar"], ["فلوجه", "Anbar"], ["رمادي", "Anbar"], ["ذي قار", "Dhi Qar"],
  ["ذيقار", "Dhi Qar"], ["ناصريه", "Dhi Qar"], ["كربلا", "Karbala"], ["كربلاء", "Karbala"],
  ["نجف", "Najaf"], ["واسط", "Wasit"], ["كوت", "Wasit"], ["ميسان", "Maysan"], ["عمارة", "Maysan"],
  ["مثنى", "Muthanna"], ["سماوه", "Muthanna"], ["صلاح الدين", "Saladin"], ["صلاحالدين", "Saladin"],
  ["تكريت", "Saladin"], ["دهوك", "Dohuk"], ["‏بَصْرَة‏", "Basra"],
])("recognizes %s without inventing an address from a province/city alone", (name, expected) => {
  expect(extractInboxOrder([message(name)])).toMatchObject({ governorate: expected, address: "" });
});

it.each(["بصرة الزبير", "حله نادر", "ديوانية حي العروبة", "الحي الصناعي", "بابل / المحاويل / الحي الصناعي"])("keeps useful location details: %s", address => {
  expect(extractInboxOrder([message(address)])).toMatchObject({ address });
});
it("combines adjacent location fragments and strips the phone from the suggested address", () => {
  expect(extractInboxOrder([message("بابل"), message("الحي الصناعي"), message("قرب الجامع 07801234567")]))
    .toMatchObject({ governorate: "Babylon", address: "بابل، الحي الصناعي، قرب الجامع", phoneNumber: "07801234567" });
});
it("does not classify neighborhood names as other provinces", () => {
  expect(extractInboxOrder([message("بغداد حي القادسية شارع بابل عمارة 15")]))
    .toMatchObject({ governorate: "Baghdad", address: "بغداد حي القادسية شارع بابل عمارة 15" });
});
it("does not infer another province from a landmark name or invent details from an unfinished cue", () => {
  expect(extractInboxOrder([message("بغداد قرب جامع بابل")])).toMatchObject({ governorate: "Baghdad", address: "بغداد قرب جامع بابل" });
  expect(extractInboxOrder([message("بابل"), message("قرب")])).toMatchObject({ governorate: "Babylon", address: "" });
});
it.each(["شكدالسعرمع التوصيل", "اكو توصيل للبصرة", "بابل اريد واحد", "العنوان وين؟", "رابط https://example.com/بابل"])("does not turn chatter into an address: %s", text => {
  expect(extractInboxOrder([message(text)]).address).toBe("");
});
it("supports labels without colons and preserves a later landmark", () => {
  expect(extractInboxOrder([message("المحافظة حله\nعنواني نادر\nقرب المستشفى")]))
    .toMatchObject({ governorate: "Babylon", address: "نادر، قرب المستشفى" });
});
it("keeps conflicting destinations unresolved rather than joining their addresses", () => {
  const result = extractInboxOrder([message("بصرة الزبير"), message("بابل المحاويل")]);
  expect(result.governorate).toBe("");
  expect(result.address).toBe("بابل المحاويل");
  expect(result.warnings).toContain("وردت أكثر من محافظة؛ اختر محافظة التوصيل.");
});

it("extracts an address after a purchase request and flags the later cancellation without changing orders", () => {
  const result = extractInboxOrder([
    message("المنتج عبارة عن فقط قاعدة كوسرة", { outgoing: true }),
    message("سعره ب20 الف والتوصيل مجاني", { outgoing: true }),
    message("اريد وحدة بغداد قرب الجزيرة السياحية"), message("07701234567"),
    message("تم الحجز خلال يومين", { outgoing: true }), message("الغي الحجز اخي"),
  ]);
  expect(result).toMatchObject({ governorate: "Baghdad", address: "بغداد قرب الجزيرة السياحية", phoneNumber: "07701234567", fullName: "زبون", quantity: 1 });
  expect(result.warnings.join(" ")).not.toContain("لم أجد عنواناً");
  expect(result.warnings.join(" ")).toContain("تطلب إلغاء الحجز");
});
it.each([
  ["أريد واحد بصره الزبير", "Basra", "بصره الزبير", 1],
  ["اريدها بابل المحاويل الحي الصناعي", "Babylon", "بابل المحاويل الحي الصناعي", 1],
  ["احجزلي قطعة من حله نادر", "Babylon", "حله نادر", 1],
  ["اريد ٢ قطع بغداد قرب الجامع", "Baghdad", "بغداد قرب الجامع", 2],
])("extracts only the location after the request opening: %s", (text, governorate, address, quantity) => {
  expect(extractInboxOrder([message(text)])).toMatchObject({ governorate, address, quantity });
});
it.each(["اريد وحدة", "اريد سعر بغداد", "اريد وحدة بغداد التوصيل شكد؟", "اريد اعرف عندكم توصيل لبغداد"])("does not turn an incomplete request or question into an address: %s", text => {
  expect(extractInboxOrder([message(text)]).address).toBe("");
});
it.each(["لا تلغي الحجز", "لا اريد الغاء الطلب"])("does not flag a negated cancellation: %s", text => {
  expect(extractInboxOrder([message(text)]).warnings.join(" ")).not.toContain("تطلب إلغاء الحجز");
});
it("ignores staff cancellation text when extracting the customer's intent", () => {
  expect(extractInboxOrder([message("الغي الحجز", { outgoing: true })]).warnings.join(" ")).not.toContain("تطلب إلغاء الحجز");
});

it("extracts a greeted Iraqi purchase request with a contracted province and phone label despite later chatter/media", () => {
  const result = extractInboxOrder([
    message("سلام عليكم رايد قطعه للبصره الفيحاء الفيروزية ت 07701234567"),
    message("ألو الو الو الو الو الو الو"),
    message("وعليكم السلام ورحمة الله وبركاته 🌷", { outgoing: true }),
    message("تم الحجز خلال يومين ان شاء الله يوصلكم الطلب", { outgoing: true }),
    message("", { attachments: [{ name: "صورة مرفقة", kind: "image", url: "https://example.com/photo.jpg" }] }),
  ]);
  expect(result).toMatchObject({ fullName: "زبون", governorate: "Basra", address: "البصره الفيحاء الفيروزية", phoneNumber: "07701234567", quantity: 1 });
  expect(result.warnings.join(" ")).not.toContain("لم أجد عنواناً");
});
it.each([
  "سلام عليكم رايد قطعه", "السلام عليكم ورحمة الله وبركاته، اريد قطعة",
  "وعليكم السلام، احجزلي وحدة", "اخي محتاج وحدة", "سلام عليكم اخوي رايد حبه",
])("separates greeting/request language from the destination: %s", prefix => {
  expect(extractInboxOrder([message(`${prefix} للبصرة الفيحاء الفيروزية ت: ٠٧٧٠١٢٣٤٥٦٧`)]))
    .toMatchObject({ governorate: "Basra", address: "البصرة الفيحاء الفيروزية", phoneNumber: "07701234567" });
});
it.each(["ت", "تلفون", "رقمي", "رقم الموبايل"])("removes only a phone-adjacent contact label: %s", label => {
  expect(extractInboxOrder([message(`بابل المحاويل ${label}:07701234567 قرب الجامع`)]))
    .toMatchObject({ governorate: "Babylon", address: "بابل المحاويل قرب الجامع", phoneNumber: "07701234567" });
});
it.each(["للبصره", "للحله", "للديوانيه"])("does not invent address details from a contracted province alone: %s", province => {
  expect(extractInboxOrder([message(`سلام عليكم رايد قطعة ${province} ت 07701234567`)]).address).toBe("");
});
it.each(["سلام عليكم رايد قطعه للبصره شكد السعر؟", "رايد اعرف التوصيل للبصرة", "سلام عليكم رايد قطعة", "ألو الو الو"])("keeps incomplete/question messages out of addresses: %s", text => {
  expect(extractInboxOrder([message(text)]).address).toBe("");
});

it("uses the later explicit address without joining the earlier delivery-time question", () => {
  const result = extractInboxOrder([
    message("بيت سعرها وش وقت توصل رحمه لوالديك"),
    message("شنو سعرها هاي بروح ابيك"),
    message("سعر قاعدة الكوسرة فقط ب20 الف والتوصيل مجاني", { outgoing: true }),
    message("ايش وقت توصل ان شاء الله عنوان الديوانيه"),
    message("العنوان الديوانيه خيري مقابل باب اددواجن"),
    message("٠٧٨٠١٢٣٤٥٦٧رقم الموبايل"),
    message("باجر ان شاء الله يوصلك الطلب", { outgoing: true }),
    message("", { attachments: [{ name: "ملصق", kind: "sticker", url: "https://example.com/sticker.png" }] }),
  ]);
  expect(result).toMatchObject({ governorate: "Qadisiyah", address: "الديوانيه خيري مقابل باب اددواجن", phoneNumber: "07801234567" });
});
it.each(["ايش وقت", "اي وكت", "شنو موعد", "وش وقت", "شوكت", "شوقت", "متى", "يمتى"])("rejects delivery-time questions without punctuation: %s", question => {
  expect(extractInboxOrder([message(`${question} توصل ان شاء الله عنوان الديوانيه`)]).address).toBe("");
});
it("starts a new address at an explicit label and appends only its subsequent landmark", () => {
  expect(extractInboxOrder([message("الديوانيه حي العروبة"), message("العنوان الديوانيه خيري"), message("مقابل باب الدواجن")]))
    .toMatchObject({ governorate: "Qadisiyah", address: "الديوانيه خيري، مقابل باب الدواجن" });
});
it("does not concatenate two complete addresses in the same province", () => {
  expect(extractInboxOrder([message("بغداد المنصور"), message("بغداد الكرادة قرب الجامع")]))
    .toMatchObject({ governorate: "Baghdad", address: "بغداد الكرادة قرب الجامع" });
});

it("recognizes a hospital address and suggests Baghdad for Jadriya/Karrada while flagging an existing-order follow-up", () => {
  const result = extractInboxOrder([message("عيني حجزت وحدة قبل كم يوم\nوبعد ما وصلت\nباسم اسم تجريبي\nمستشفى الجادرية كرادة خارج\n07701234567")]);
  expect(result).toMatchObject({ fullName: "زبون", phoneNumber: "07701234567", governorate: "Baghdad", address: "مستشفى الجادرية كرادة خارج" });
  expect(result.warnings.join(" ")).toContain("لم يذكر الزبون المحافظة صراحةً");
  expect(result.warnings.join(" ")).toContain("متابعة لحجز سابق");
  expect(result.warnings.join(" ")).not.toContain("لم أجد عنواناً");
});
it.each(["كرادة خارج", "الكرادة داخل", "الجادرية قرب الجامعة", "مستشفى الجادريه"])("suggests Baghdad from a distinctive address area: %s", address => {
  const result = extractInboxOrder([message(address)]);
  expect(result).toMatchObject({ governorate: "Baghdad", address });
  expect(result.warnings.join(" ")).toContain("اقتُرحت بغداد");
});
it.each(["حي الجامعة", "شارع المنصور", "مستشفى المدينة"])("keeps ambiguous area/hospital names without a guessed province: %s", address => {
  expect(extractInboxOrder([message(address)])).toMatchObject({ governorate: "", address });
});
it("preserves an explicitly stated province even if an area has the same name as one in Baghdad", () => {
  const result = extractInboxOrder([message("البصرة حي الكرادة قرب المستشفى")]);
  expect(result.governorate).toBe("Basra");
  expect(result.warnings.join(" ")).not.toContain("اقتُرحت بغداد");
});
it("does not infer a province from an earlier question when the chosen address is elsewhere", () => {
  const result = extractInboxOrder([message("الجادرية شكد التوصيل؟"), message("العنوان حي الجامعة قرب الجامع")]);
  expect(result.governorate).toBe("");
  expect(result.address).toBe("حي الجامعة قرب الجامع");
});

it("recognizes Kurdish Kaf in a Kalar delivery address and suggests the store's Sulaymaniyah category", () => {
  const result = extractInboxOrder([message("07701234567"), message("کلار صمود")]);
  expect(result).toMatchObject({ phoneNumber: "07701234567", governorate: "Sulaymaniyah", address: "کلار صمود" });
  expect(result.warnings.join(" ")).toContain("اقتُرحت السليمانية");
});
it("retains a standalone distinctive area as an address and suggests Baghdad", () => {
  const result = extractInboxOrder([message("قاعدة منشار"), message("الاعظمية\n07701234567")]);
  expect(result).toMatchObject({ governorate: "Baghdad", address: "الاعظمية", phoneNumber: "07701234567" });
});
it("reads repeated quantity labels without colons and ignores staff confirmation/media", () => {
  const result = extractInboxOrder([
    message("العدد 2   قطعتين"), message("بصرة شط ألعرب قرب مدرسة البيارق القديمة"), message("07801234567"),
    message("تم الحجز", { outgoing: true }), message("", { attachments: [{ name: "صورة", kind: "image", url: "https://example.com/image.jpg" }] }),
    message("السلام عليكم"), message("العدد 2"),
  ]);
  expect(result).toMatchObject({ governorate: "Basra", address: "بصرة شط ألعرب قرب مدرسة البيارق القديمة", phoneNumber: "07801234567", quantity: 2 });
});
it("uses the latest requested pair and the full police-tunnel address rather than an earlier mixed price question", () => {
  const result = extractInboxOrder([
    message("اخي السلام عليكم اريد مخناطيز مال عدد المسطره قطعه وحده"),
    message("عنواني نفق الشرطه وشكد سعرهه؟"),
    message("سعر القطعة ب15 الف و5 توصيل وسعر القطعتين ب25 الف و5 توصيل", { outgoing: true }),
    message("07801234567قطعتين اريد"),
    message("نفق الشرطه المركز الالماني مجاورمول سلوان"), message("تم الحجز", { outgoing: true }),
  ]);
  expect(result).toMatchObject({ governorate: "Baghdad", address: "نفق الشرطه المركز الالماني مجاورمول سلوان", phoneNumber: "07801234567", quantity: 2 });
});
it.each(["سليماني", "سلیمانی", "سلێمانی"])("recognizes abbreviated Sulaimani spelling: %s", city => {
  expect(extractInboxOrder([message(`${city} رابرين`), message("٠٧٧٠١٢٣٤٥٦٧")]))
    .toMatchObject({ governorate: "Sulaymaniyah", address: `${city} رابرين`, phoneNumber: "07701234567" });
});
it("includes a business landmark continuation and infers Baghdad from the compound Yarmouk/four streets address", () => {
  const result = extractInboxOrder([message("ثبت"), message("العنوان اليرموك اربع شوارع شارع المركز\nخدمات زيوت بترومين"), message("07801234567")]);
  expect(result).toMatchObject({ governorate: "Baghdad", address: "اليرموك اربع شوارع شارع المركز، خدمات زيوت بترومين", phoneNumber: "07801234567" });
});
it("does not guess Baghdad from the ambiguous Yarmouk name alone", () => {
  expect(extractInboxOrder([message("العنوان اليرموك قرب الجامع")])).toMatchObject({ governorate: "", address: "اليرموك قرب الجامع" });
});
it("does not treat a business label alone as a delivery address or infer from an older Kalar question", () => {
  expect(extractInboxOrder([message("خدمات زيوت بترومين")]).address).toBe("");
  expect(extractInboxOrder([message("كلار شكد التوصيل؟"), message("العنوان حي الجامعة")]).governorate).toBe("");
});
