import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db/prisma";
import CredentialsProvider from "next-auth/providers/credentials";
import { compareSync } from "bcrypt-ts-edge";
// import type { NextAuthConfig } from "next-auth";
import { cookies } from "next/headers";
// import { NextResponse } from "next/server";
import { authConfig } from "./auth.config"; // استيراد الإعدادات الخفيفة

// تعريف الإعدادات الكاملة
export const config = {
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60,
  },
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      async authorize(credentials) {
        if (credentials == null) return null;
        // Find User In Database
        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email as string,
          },
        });
        // Chech If User Exiss And If The Password Matches
        if (user && user.password) {
          const isMatch = compareSync(
            credentials.password as string,
            user.password
          );

          // If Password Is Correct, Return User
          if (isMatch) {
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
            };
          }
        }
        // If User Does Not Exist Or Password Not Match Return Null
        return null;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks, // دمج الـ authorized callback من الملف الخفيف
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, user, trigger, token }: any) {
      try {
        // Set The User ID From The Token
        // session.user.id = token.id
        if (token && token.sub) {
          session.user.id = token.sub;
        }
        if (token && token.role) {
          session.user.role = token.role;
        }
        if (token && token.name) {
          session.user.name = token.name;
        }
        // console.log("token",token)
        // If There Is An Update , Set The User Name
        if (trigger === "update" && user) {
          session.user.name = user.name;
        }
        return session;
      } catch (error) {
        // Log the error safely
        console.error("DEBUG: Auth Session Error", error);

        // Return session with partial data if possible, or just the original session
        return session;
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user, trigger, session }: any) {
      try {
        if (user) {
          token.id = user.id;
          token.role = user.role;

          if (user && trigger === "signIn") {
            // if user has no name then use the email
            if (user.name === "NO_NAME") {
              token.name = user.email.split("@")[0];
              // update database to reflect the token name
              // تنبيه: عمليات قاعدة البيانات هنا تبطئ الأداء
              try {
                await prisma.user.update({
                  where: { id: user.id },
                  data: { name: token.name },
                });
              } catch (dbError) {
                console.error("Auth JWT DB Update Error", dbError);
              }
            }
          }
          if (trigger === "signIn" || trigger === "signUp") {
            const cookiesObject = await cookies();
            const sessionCartId = cookiesObject.get("sessionCartId")?.value;
            if (sessionCartId) {
              const sessionCart = await prisma.cart.findFirst({
                where: {
                  sessionCartId,
                },
              });
              if (sessionCart) {
                // Delete current user cart
                await prisma.cart.deleteMany({
                  where: { userId: user.id },
                });
                // Assign new cart
                await prisma.cart.update({
                  where: { id: sessionCart.id },
                  data: { userId: user.id },
                });
              }
            }
          }
        }
        // handle session update
        if (session?.user?.name && trigger === "update") {
          token.name = session.user.name;
        }
        return token;
      } catch (error) {
        console.error("DEBUG: Auth JWT Error", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        return token;
      }
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
