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
    // نُعيد post_id (معرّف المنشور {pageId}_{postId}) لأنه ما يعمل مع
    // object_story_id عند تعزيز المنشور. res.id هنا معرّف الصورة لا المنشور،
    // فإن غاب post_id لن يصلح للإعلان — نعتمد post_id عند توفّره.
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
 * فيديو صفحة فيسبوك من رابط عام. يعيد معرّف الفيديو.
 * ملاحظة: هذا معرّف فيديو وليس منشوراً قابلاً للتعزيز عبر object_story_id.
 */
export async function publishFacebookVideo(params: {
  pageId: string;
  pageToken: string;
  caption: string;
  videoUrl: string;
}): Promise<string> {
  const { pageId, pageToken, caption, videoUrl } = params;
  // Meta تعالج الفيديو خادمياً وترجع فوراً — لا حاجة لاستطلاع.
  const res = await graphPost<{ id: string; video_id?: string }>(
    `${pageId}/videos`,
    pageToken,
    { file_url: videoUrl, description: caption },
  );
  return res.video_id ?? res.id;
}

/** نشر صورة إنستغرام (خطوتان). يتطلب رابط JPEG عام وحساب أعمال مرتبطاً بالصفحة. */
export async function publishInstagramImage(params: {
  igUserId: string;
  pageToken: string;
  caption: string;
  imageUrl: string;
}): Promise<string> {
  const { igUserId, pageToken, caption, imageUrl } = params;
  const container = await graphPost<{ id: string }>(
    `${igUserId}/media`,
    pageToken,
    { image_url: imageUrl, caption },
  );
  // الصور تجهز بسرعة — استطلاع قصير آمن ضمن مهلة الدالة الخادمية.
  await waitForContainer(container.id, pageToken, 4, 2000);
  const published = await graphPost<{ id: string }>(
    `${igUserId}/media_publish`,
    pageToken,
    { creation_id: container.id },
  );
  return published.id;
}

/**
 * ينشئ حاوية فيديو (Reel) لإنستغرام ويحاول نشرها ضمن نافذة قصيرة.
 * الفيديو يُعالَج غير متزامن وقد يستغرق دقائق، ولا يمكن الانتظار الطويل داخل
 * دالة خادمية. فإن لم يجهز سريعاً نعيد الحاوية لإنهائها لاحقاً عبر إجراء منفصل.
 */
export async function startInstagramVideo(params: {
  igUserId: string;
  pageToken: string;
  caption: string;
  videoUrl: string;
}): Promise<{ published: true; mediaId: string } | { published: false; containerId: string }> {
  const { igUserId, pageToken, caption, videoUrl } = params;
  const container = await graphPost<{ id: string }>(
    `${igUserId}/media`,
    pageToken,
    { media_type: "REELS", video_url: videoUrl, caption },
  );

  // استطلاع قصير (بضع ثوانٍ فقط) — لا نتجاوز مهلة الدالة.
  const ready = await isContainerFinished(container.id, pageToken, 3, 2500);
  if (!ready) return { published: false, containerId: container.id };

  const mediaId = await publishInstagramContainer(igUserId, pageToken, container.id);
  return { published: true, mediaId };
}

/** ينشر حاوية جاهزة — يُستخدم من إجراء الإنهاء بعد اكتمال معالجة الفيديو. */
export async function publishInstagramContainer(
  igUserId: string,
  pageToken: string,
  containerId: string,
): Promise<string> {
  const published = await graphPost<{ id: string }>(
    `${igUserId}/media_publish`,
    pageToken,
    { creation_id: containerId },
  );
  return published.id;
}

/** يستعلم حالة حاوية: FINISHED جاهزة، ERROR/EXPIRED فشل، غيرها قيد المعالجة. */
export async function getContainerStatus(
  containerId: string,
  token: string,
): Promise<"FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED"> {
  const res = await graphGet<{ status_code?: string }>(containerId, token, {
    fields: "status_code",
  });
  return (res.status_code as never) ?? "IN_PROGRESS";
}

async function isContainerFinished(
  containerId: string,
  token: string,
  attempts: number,
  delayMs: number,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const code = await getContainerStatus(containerId, token);
    if (code === "FINISHED") return true;
    if (code === "ERROR" || code === "EXPIRED")
      throw new Error(`تعذّرت معالجة فيديو إنستغرام (${code})`);
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** استطلاع قصير لحاويات الصور قبل النشر. */
async function waitForContainer(
  containerId: string,
  token: string,
  attempts: number,
  delayMs: number,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const code = await getContainerStatus(containerId, token);
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED")
      throw new Error(`تعذّر تجهيز صورة إنستغرام (${code})`);
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  // لم تصل FINISHED — نحاول النشر (الصور غالباً جاهزة).
}
