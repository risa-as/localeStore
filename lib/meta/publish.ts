import { graphPost, graphGet } from "./graph";

/**
 * نشر المحتوى على فيسبوك وإنستغرام عبر Graph API.
 *
 * الصور تُمرَّر كروابط عامة (كلا المنصتين تجلب الصورة بنفسها من رابط) —
 * نستخدم روابط UploadThing الموجودة أصلاً لصور المنتجات.
 */

/** منشور صفحة فيسبوك: صورة واحدة أو أكثر، أو نص فقط. يعيد معرّف المنشور. */
export async function publishToFacebook(params: {
  pageId: string;
  pageToken: string;
  caption: string;
  imageUrls: string[];
}): Promise<string> {
  const { pageId, pageToken, caption, imageUrls } = params;

  // بلا صور → منشور نصّي على الـ feed.
  if (imageUrls.length === 0) {
    const res = await graphPost<{ id: string }>(`${pageId}/feed`, pageToken, {
      message: caption,
    });
    return res.id;
  }

  // صورة واحدة → منشور صورة مباشر.
  if (imageUrls.length === 1) {
    const res = await graphPost<{ id: string; post_id?: string }>(
      `${pageId}/photos`,
      pageToken,
      { url: imageUrls[0], caption, published: true },
    );
    return res.post_id ?? res.id;
  }

  // عدة صور → ارفع كل صورة كغير منشورة، ثم أنشئ منشور feed يربطها.
  const mediaIds: { media_fbid: string }[] = [];
  for (const url of imageUrls) {
    const up = await graphPost<{ id: string }>(`${pageId}/photos`, pageToken, {
      url,
      published: false,
    });
    mediaIds.push({ media_fbid: up.id });
  }
  const res = await graphPost<{ id: string }>(`${pageId}/feed`, pageToken, {
    message: caption,
    attached_media: mediaIds,
  });
  return res.id;
}

/**
 * نشر إنستغرام (خطوتان): إنشاء حاوية الوسائط ثم نشرها.
 * يتطلب حساب أعمال/منشئ مرتبطاً بالصفحة، ورابط JPEG عام.
 * الصورة الأولى تُنشر؛ (الكاروسيل متعدد الصور مرحلة لاحقة).
 */
export async function publishToInstagram(params: {
  igUserId: string;
  pageToken: string; // توكن الصفحة المرتبطة يعمل لنشر إنستغرام
  caption: string;
  imageUrls: string[];
}): Promise<string> {
  const { igUserId, pageToken, caption, imageUrls } = params;
  if (imageUrls.length === 0) {
    throw new Error("إنستغرام يتطلب صورة واحدة على الأقل");
  }

  // 1) إنشاء الحاوية
  const container = await graphPost<{ id: string }>(
    `${igUserId}/media`,
    pageToken,
    { image_url: imageUrls[0], caption },
  );

  // 2) بعض الحاويات تحتاج لحظات لتجهز — نتحقق من الحالة قبل النشر.
  await waitForContainer(container.id, pageToken);

  // 3) النشر
  const published = await graphPost<{ id: string }>(
    `${igUserId}/media_publish`,
    pageToken,
    { creation_id: container.id },
  );
  return published.id;
}

/** ينتظر جهوز حاوية إنستغرام (FINISHED) قبل النشر — مهلة قصيرة للصور. */
async function waitForContainer(
  containerId: string,
  token: string,
  attempts = 5,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const res = await graphGet<{ status_code?: string }>(
      containerId,
      token,
      { fields: "status_code" },
    );
    const code = res.status_code;
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`تعذّر تجهيز صورة إنستغرام (${code})`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  // لم تصل FINISHED خلال المهلة — نحاول النشر على أي حال (الصور غالباً جاهزة).
}
