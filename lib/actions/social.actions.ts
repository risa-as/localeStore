"use server";

import { prisma } from "@/db/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { publishToFacebook, publishToInstagram } from "@/lib/meta/publish";
import {
  launchAdFromPagePost,
  currencyOffset,
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
      select: { id: true, name: true, images: true, offers: true },
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
      platforms: p.platforms,
      status: p.status,
      fbPostId: p.fbPostId,
      igPostId: p.igPostId,
      error: p.error,
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
      offers: p.offers,
    })),
  };
}

// ─── نشر منشور ───────────────────────────────────────────────────────────────

export async function publishPost(input: {
  caption: string;
  imageUrls: string[];
  platforms: string[]; // ["facebook","instagram"]
  productId?: string | null;
}) {
  await requireAdmin();

  const caption = (input.caption ?? "").trim();
  const imageUrls = (input.imageUrls ?? []).filter(Boolean);
  const platforms = (input.platforms ?? []).filter((p) =>
    ["facebook", "instagram"].includes(p),
  );

  if (platforms.length === 0)
    return { success: false, message: "اختر منصة واحدة على الأقل" };
  if (!caption && imageUrls.length === 0)
    return { success: false, message: "أضِف نصاً أو صورة على الأقل" };

  const conn = await loadConnection();
  if (!conn) return { success: false, message: "لا يوجد اتصال بـ Meta" };

  if (platforms.includes("facebook") && !conn.selectedPageToken)
    return { success: false, message: "لم يتم اختيار صفحة فيسبوك" };
  if (platforms.includes("instagram")) {
    if (!conn.selectedIgId)
      return { success: false, message: "لا يوجد حساب إنستغرام مرتبط بالصفحة" };
    if (imageUrls.length === 0)
      return { success: false, message: "إنستغرام يتطلب صورة واحدة على الأقل" };
  }

  let fbPostId: string | null = null;
  let igPostId: string | null = null;
  const errors: string[] = [];

  if (platforms.includes("facebook")) {
    try {
      fbPostId = await publishToFacebook({
        pageId: conn.selectedPageId!,
        pageToken: conn.selectedPageToken!,
        caption,
        imageUrls,
      });
    } catch (err) {
      errors.push(`فيسبوك: ${(err as Error).message}`);
    }
  }

  if (platforms.includes("instagram")) {
    try {
      igPostId = await publishToInstagram({
        igUserId: conn.selectedIgId!,
        pageToken: conn.selectedPageToken!,
        caption,
        imageUrls,
      });
    } catch (err) {
      errors.push(`إنستغرام: ${(err as Error).message}`);
    }
  }

  const anyOk = !!fbPostId || !!igPostId;
  const status = errors.length === 0 ? "published" : anyOk ? "partial" : "failed";

  await prisma.socialPost.create({
    data: {
      productId: input.productId || null,
      caption: caption || null,
      imageUrls,
      platforms,
      status,
      fbPostId,
      igPostId,
      error: errors.length ? errors.join(" | ") : null,
      publishedAt: anyOk ? new Date() : null,
    },
  });

  revalidatePath("/admin/marketing");

  if (status === "published") return { success: true, message: "تم النشر" };
  if (status === "partial")
    return { success: true, message: `نُشر جزئياً — ${errors.join(" | ")}` };
  return { success: false, message: errors.join(" | ") || "فشل النشر" };
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
  days?: number; // عدد أيام التشغيل (اختياري)
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
  if (!post.fbPostId)
    return {
      success: false,
      message:
        "الإعلان يُطلق من منشور فيسبوك — انشر هذا المنتج على فيسبوك أولاً (مواضع الإعلان قد تشمل إنستغرام تلقائياً)",
    };

  const startTime = new Date(Date.now() + 5 * 60 * 1000); // بعد 5 دقائق
  const endTime = input.days
    ? new Date(startTime.getTime() + input.days * 24 * 3600 * 1000)
    : undefined;

  try {
    const result = await launchAdFromPagePost({
      adAccountId: conn.selectedAdAccountId,
      token: conn.userAccessToken!,
      pageId: conn.selectedPageId,
      postId: post.fbPostId,
      objective: input.objective,
      dailyBudgetWhole: input.dailyBudget,
      startTime,
      endTime,
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
        startTime,
        endTime,
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

/** ثابت يُستهلك في الواجهة لعرض قائمة الأهداف مع تحويل الميزانية. */
export async function getAdMeta() {
  await requireAdmin();
  return {
    objectives: Object.entries(AD_OBJECTIVES).map(([key, v]) => ({
      key,
      label: v.label,
    })),
    // نعرض للمستخدم كم وحدة صغرى ستُرسل (شفافية تجنّب خطأ ×1000/×100).
    iqdOffset: currencyOffset("IQD"),
  };
}
