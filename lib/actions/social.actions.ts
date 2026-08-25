"use server";

import { prisma } from "@/db/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import {
  publishToFacebook,
  publishFacebookVideo,
  publishInstagramImage,
  startInstagramVideo,
  publishInstagramContainer,
  getContainerStatus,
} from "@/lib/meta/publish";
import {
  launchAdFromPagePost,
  AD_OBJECTIVES,
  type AdObjective,
} from "@/lib/meta/ads";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
  return session;
}

/** يحمّل صف الاتصال بالتوكنات — للاستخدام داخل السيرفر فقط. */
async function loadConnection() {
  const conn = await prisma.metaConnection.findUnique({
    where: { id: "default" },
  });
  if (!conn || !conn.userAccessToken) return null;
  return conn;
}

// ─── قراءة: لوحة النشر ───────────────────────────────────────────────────────

export async function getSocialFeed() {
  await requireAdmin();
  const conn = await prisma.metaConnection.findUnique({
    where: { id: "default" },
  });

  const [posts, products] = await Promise.all([
    prisma.socialPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        adLaunches: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            objective: true,
            dailyBudget: true,
            currency: true,
            adId: true,
            error: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.product.findMany({
      select: { id: true, name: true, images: true, description: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    ready: {
      facebook: !!conn?.selectedPageId,
      instagram: !!conn?.selectedIgId,
      ads: !!conn?.selectedAdAccountId,
    },
    selected: {
      pageName: conn?.selectedPageName ?? null,
      igUsername: conn?.selectedIgUsername ?? null,
      adAccountName: conn?.selectedAdAccountName ?? null,
    },
    posts: posts.map((p) => ({
      id: p.id,
      caption: p.caption,
      imageUrls: p.imageUrls,
      videoUrls: p.videoUrls,
      platforms: p.platforms,
      status: p.status,
      fbPostId: p.fbPostId,
      igPostId: p.igPostId,
      error: p.error,
      // فيديو إنستغرام قيد المعالجة: حاوية موجودة بلا نشر بعد.
      needsIgFinish: !!p.igContainerId && !p.igPostId,
      createdAt: p.createdAt.toISOString(),
      launches: p.adLaunches.map((a) => ({
        id: a.id,
        status: a.status,
        objective: a.objective,
        dailyBudget: Number(a.dailyBudget),
        currency: a.currency,
        adId: a.adId,
        error: a.error,
        createdAt: a.createdAt.toISOString(),
      })),
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      images: p.images,
      description: p.description,
    })),
  };
}

// ─── نشر منشور ───────────────────────────────────────────────────────────────

const JPEG_RE = /\.jpe?g($|\?)/i;

export async function publishPost(input: {
  caption: string;
  imageUrls: string[];
  videoUrls: string[];
  platforms: string[]; // ["facebook","instagram"]
  productId?: string | null;
}) {
  await requireAdmin();

  const caption = (input.caption ?? "").trim();
  const imageUrls = (input.imageUrls ?? []).filter(Boolean);
  const videoUrls = (input.videoUrls ?? []).filter(Boolean);
  const platforms = (input.platforms ?? []).filter((p) =>
    ["facebook", "instagram"].includes(p),
  );
  const hasVideo = videoUrls.length > 0;

  if (platforms.length === 0)
    return { success: false, message: "اختر منصة واحدة على الأقل" };
  if (!caption && imageUrls.length === 0 && !hasVideo)
    return { success: false, message: "أضِف نصاً أو صورة أو فيديو" };
  // منع دمج فيديو وصور — لا يُدعم في منشور واحد.
  if (hasVideo && imageUrls.length > 0)
    return {
      success: false,
      message: "لا يمكن دمج فيديو وصور في منشور واحد — اختر أحدهما",
    };

  const conn = await loadConnection();
  if (!conn) return { success: false, message: "لا يوجد اتصال بـ Meta" };

  if (platforms.includes("facebook") && !conn.selectedPageToken)
    return { success: false, message: "لم يتم اختيار صفحة فيسبوك" };
  if (platforms.includes("instagram")) {
    if (!conn.selectedIgId)
      return { success: false, message: "لا يوجد حساب إنستغرام مرتبط بالصفحة" };
    if (imageUrls.length === 0 && !hasVideo)
      return { success: false, message: "إنستغرام يتطلب صورة أو فيديو" };
    // إنستغرام يقبل JPEG فقط للصور.
    if (!hasVideo && !imageUrls.every((u) => JPEG_RE.test(u)))
      return {
        success: false,
        message: "إنستغرام يقبل صور JPEG فقط — أزِل صور PNG/WEBP أو انشر على فيسبوك فقط",
      };
  }

  let fbPostId: string | null = null;
  let fbVideoId: string | null = null;
  let igPostId: string | null = null;
  let igContainerId: string | null = null;
  let igPending = false;
  const errors: string[] = [];

  if (platforms.includes("facebook")) {
    try {
      if (hasVideo) {
        fbVideoId = await publishFacebookVideo({
          pageId: conn.selectedPageId!,
          pageToken: conn.selectedPageToken!,
          caption,
          videoUrl: videoUrls[0],
        });
      } else {
        fbPostId = await publishToFacebook({
          pageId: conn.selectedPageId!,
          pageToken: conn.selectedPageToken!,
          caption,
          imageUrls,
        });
      }
    } catch (err) {
      errors.push(`فيسبوك: ${(err as Error).message}`);
    }
  }

  if (platforms.includes("instagram")) {
    try {
      if (hasVideo) {
        const r = await startInstagramVideo({
          igUserId: conn.selectedIgId!,
          pageToken: conn.selectedPageToken!,
          caption,
          videoUrl: videoUrls[0],
        });
        if (r.published) igPostId = r.mediaId;
        else {
          igContainerId = r.containerId;
          igPending = true;
        }
      } else {
        igPostId = await publishInstagramImage({
          igUserId: conn.selectedIgId!,
          pageToken: conn.selectedPageToken!,
          caption,
          imageUrl: imageUrls[0],
        });
      }
    } catch (err) {
      errors.push(`إنستغرام: ${(err as Error).message}`);
    }
  }

  const anyOk = !!fbPostId || !!fbVideoId || !!igPostId;
  const status =
    igPending && errors.length === 0
      ? "pending_ig"
      : errors.length === 0
        ? "published"
        : anyOk || igPending
          ? "partial"
          : "failed";

  await prisma.socialPost.create({
    data: {
      productId: input.productId || null,
      caption: caption || null,
      imageUrls,
      videoUrls,
      platforms,
      status,
      fbPostId,
      fbVideoId,
      igPostId,
      igContainerId,
      error: errors.length ? errors.join(" | ") : null,
      publishedAt: anyOk ? new Date() : null,
    },
  });

  revalidatePath("/admin/marketing");

  if (status === "pending_ig")
    return {
      success: true,
      message:
        "نُشر على فيسبوك؛ فيديو إنستغرام قيد المعالجة — اضغط «إنهاء نشر إنستغرام» بعد دقيقة.",
    };
  if (status === "published") return { success: true, message: "تم النشر" };
  if (status === "partial")
    return { success: true, message: `نُشر جزئياً — ${errors.join(" | ")}` };
  return { success: false, message: errors.join(" | ") || "فشل النشر" };
}

/** يُنهي نشر فيديو إنستغرام بعد اكتمال معالجته (استُدعي من زر «إنهاء»). */
export async function finishInstagramVideo(postId: string) {
  await requireAdmin();
  const post = await prisma.socialPost.findUnique({ where: { id: postId } });
  if (!post) return { success: false, message: "المنشور غير موجود" };
  if (post.igPostId)
    return { success: true, message: "سبق نشره على إنستغرام" };
  if (!post.igContainerId)
    return { success: false, message: "لا توجد حاوية إنستغرام لإنهائها" };

  const conn = await loadConnection();
  if (!conn?.selectedIgId || !conn.selectedPageToken)
    return { success: false, message: "لا يوجد اتصال بإنستغرام" };

  try {
    const code = await getContainerStatus(
      post.igContainerId,
      conn.selectedPageToken,
    );
    if (code === "IN_PROGRESS")
      return {
        success: false,
        message: "الفيديو لا يزال قيد المعالجة — أعد المحاولة بعد قليل",
      };
    if (code === "ERROR" || code === "EXPIRED") {
      await prisma.socialPost.update({
        where: { id: postId },
        data: { status: "failed", error: `فيديو إنستغرام: ${code}` },
      });
      revalidatePath("/admin/marketing");
      return { success: false, message: `تعذّرت معالجة الفيديو (${code})` };
    }

    const mediaId = await publishInstagramContainer(
      conn.selectedIgId,
      conn.selectedPageToken,
      post.igContainerId,
    );
    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        igPostId: mediaId,
        igContainerId: null,
        status: post.error ? "partial" : "published",
        publishedAt: post.publishedAt ?? new Date(),
      },
    });
    revalidatePath("/admin/marketing");
    return { success: true, message: "تم نشر فيديو إنستغرام" };
  } catch (err) {
    const msg = (err as Error).message;
    // نُثبّت الخطأ على المنشور حتى يظهر بدل أن يختفي مع التوست.
    await prisma.socialPost
      .update({
        where: { id: postId },
        data: { error: `إنهاء إنستغرام: ${msg}` },
      })
      .catch(() => null);
    revalidatePath("/admin/marketing");
    return { success: false, message: `فشل إنهاء إنستغرام: ${msg}` };
  }
}

export async function deleteSocialPost(id: string) {
  await requireAdmin();
  // نحذف السجل المحلي فقط — المنشور يبقى على المنصة (الحذف من هناك يدوي).
  await prisma.socialPost.delete({ where: { id } }).catch(() => null);
  revalidatePath("/admin/marketing");
  return { success: true, message: "تم حذف السجل" };
}

// ─── إطلاق إعلان من منشور ─────────────────────────────────────────────────────

export async function launchAd(input: {
  postId: string;
  objective: AdObjective;
  dailyBudget: number; // بوحدة العملة الكاملة
}) {
  await requireAdmin();

  if (!AD_OBJECTIVES[input.objective])
    return { success: false, message: "هدف إعلاني غير صالح" };
  if (!(input.dailyBudget > 0))
    return { success: false, message: "أدخل ميزانية يومية صحيحة" };

  const conn = await loadConnection();
  if (!conn) return { success: false, message: "لا يوجد اتصال بـ Meta" };
  if (!conn.selectedAdAccountId)
    return { success: false, message: "لم يتم اختيار حساب إعلاني" };
  if (!conn.selectedPageId)
    return { success: false, message: "لم يتم اختيار صفحة" };

  const post = await prisma.socialPost.findUnique({
    where: { id: input.postId },
  });
  if (!post) return { success: false, message: "المنشور غير موجود" };
  // تعزيز الفيديو غير مدعوم: fbVideoId معرّف فيديو لا منشور قابل للتعزيز عبر
  // object_story_id — نمنعه هنا خادمياً لا في الواجهة فقط.
  if (!post.fbPostId && (post.videoUrls.length > 0 || post.fbVideoId))
    return {
      success: false,
      message: "تعزيز منشورات الفيديو غير مدعوم بعد — استخدم منشور صور/نص",
    };
  if (!post.fbPostId)
    return {
      success: false,
      message:
        "الإعلان يُطلق من منشور فيسبوك — انشر هذا المنتج على فيسبوك أولاً (مواضع الإعلان قد تشمل إنستغرام تلقائياً)",
    };

  // بلا جدولة زمنية مطلقة: الإعلان يُنشأ موقوفاً وقد يُفعَّل بعد أيام. تحديد
  // start_time/end_time الآن قد يجعل الإعلان منتهياً قبل التفعيل. نتركها مفتوحة،
  // ويضبط المستخدم المدّة في مدير الإعلانات عند التفعيل.
  try {
    const result = await launchAdFromPagePost({
      adAccountId: conn.selectedAdAccountId,
      token: conn.userAccessToken!,
      pageId: conn.selectedPageId,
      postId: post.fbPostId,
      objective: input.objective,
      dailyBudgetWhole: input.dailyBudget,
      campaignName: `${post.caption?.slice(0, 30) || "إعلان"} — ${new Date().toISOString().slice(0, 10)}`,
    });

    await prisma.metaAdLaunch.create({
      data: {
        postId: post.id,
        adAccountId: conn.selectedAdAccountId,
        campaignId: result.campaignId,
        adSetId: result.adSetId,
        creativeId: result.creativeId,
        adId: result.adId,
        objective: input.objective,
        dailyBudget: input.dailyBudget,
        currency: result.currency,
        status: "PAUSED",
      },
    });

    revalidatePath("/admin/marketing");
    return {
      success: true,
      message:
        "أُنشئ الإعلان بحالة (موقوف). راجعه في مدير إعلانات Meta وفعّله من هناك بعد التأكد من الميزانية.",
    };
  } catch (err) {
    await prisma.metaAdLaunch
      .create({
        data: {
          postId: post.id,
          adAccountId: conn.selectedAdAccountId,
          objective: input.objective,
          dailyBudget: input.dailyBudget,
          currency: "IQD",
          status: "failed",
          error: (err as Error).message,
        },
      })
      .catch(() => null);
    revalidatePath("/admin/marketing");
    return { success: false, message: `فشل إطلاق الإعلان: ${(err as Error).message}` };
  }
}

/** قائمة الأهداف الإعلانية للواجهة. */
export async function getAdMeta() {
  await requireAdmin();
  return {
    objectives: Object.entries(AD_OBJECTIVES).map(([key, v]) => ({
      key,
      label: v.label,
    })),
  };
}
