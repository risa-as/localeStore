import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getToken } from "next-auth/jwt";
const f = createUploadthing();

export const ourFileRouter = {
  imageUploader: f({
    image: {
      maxFileSize: "16MB",
      maxFileCount: 5,
    },
  })
    .middleware(async ({ req }) => {
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
      });
      if (!token) throw new UploadThingError("Unauthorized");
      return { userId: token.sub ?? "" };
    })
    .onUploadComplete(async ({ metadata }) => {
      return { uploadedBy: metadata.userId };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
