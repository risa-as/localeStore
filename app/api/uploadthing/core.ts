import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { auth } from "@/auth";
import { z } from "zod";
import { getSocialInboxUploadScope } from "@/lib/actions/social-inbox.actions";
import { inboxMediaKind } from "@/lib/meta/inbox-media";
import { signInboxMedia } from "@/lib/meta/inbox-media-ticket";
import { getMetaConfig } from "@/lib/meta/config";
const f = createUploadthing();

export const ourFileRouter = {
  inboxMediaUploader: f({ image: { maxFileSize: "8MB", maxFileCount: 1, minFileCount: 0 },
    video: { maxFileSize: "32MB", maxFileCount: 1, minFileCount: 0 } })
    .input(z.object({ pageId: z.string().min(1).max(200), platform: z.enum(["facebook", "instagram"]), handle: z.string().min(1).max(6000) }))
    .middleware(async ({ input, files }) => {
      try {
        const scope = await getSocialInboxUploadScope(input);
        if (files.length !== 1) throw new Error("اختر ملفاً واحداً في كل مرة");
        inboxMediaKind(files[0]);
        return scope;
      } catch (err) { throw new UploadThingError(err instanceof Error ? err.message : "تعذر التصريح برفع المرفق"); }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const config = getMetaConfig();
      if (!config) throw new UploadThingError("إعداد Meta غير مكتمل");
      const media = { kind: inboxMediaKind(file), url: file.ufsUrl, name: file.name, size: file.size };
      return { ...media, ticket: signInboxMedia(metadata, media, config.appSecret) };
    }),
  imageUploader: f({
    image: {
      maxFileSize: "16MB",
      maxFileCount: 5,
    },
  })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user?.id) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata }) => {
      return { uploadedBy: metadata.userId };
    }),

  // منشورات التسويق: صور وفيديو. الرفع للأدمن فقط. الروابط عامة كي تجلبها Meta.
  mediaUploader: f({
    image: {
      maxFileSize: "16MB",
      maxFileCount: 10,
    },
    video: {
      maxFileSize: "512MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const session = await auth();
      if (session?.user?.role !== "admin")
        throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata }) => {
      return { uploadedBy: metadata.userId };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
