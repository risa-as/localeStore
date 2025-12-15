// import NextAuth from 'next-auth';
// import { PrismaAdapter } from "@auth/prisma-adapter"
// import {prisma} from "./db/prisma"
// import CredentialsProvider from "next-auth/providers/credentials"
// import { compareSync } from 'bcrypt-ts-edge';
// import type { NextAuthConfig } from 'next-auth';

// export const config = {
//     pages: {
//         signIn: "/sign-in",
//         error: "/sign-in"
//     },
//     session: {
//         strategy: "jwt",
//         maxAge: 30 * 24 * 60 * 60,
//     },
//     adapter: PrismaAdapter(prisma),
//     providers: [
//         CredentialsProvider({
//             credentials: {
//                 email: {type: "email"},
//                 password: {type: "password"}
//             },
//             async authorize(credentials) {
//                 if(credentials == null) return null;
//                 // Find User In Database
//                 const user = await prisma.user.findUnique({
//                     where: {
//                         email: credentials.email as string
//                     }
//                 })
//                 // Chech If User Exiss And If The Password Matches
//                 if(user && user.password) {
//                     const isMatch = compareSync(credentials.password as string, user.password);

//                     // If Password Is Correct, Return User
//                     if(isMatch) {
//                         return {
//                             id: user.id,
//                             name: user.name,
//                             email: user.email,
//                             role: user.role
//                         }
//                     }
//                 }
//                 // If User Does Not Exist Or Password Not Match Return Null
//                 return null;
//             }
//         })
//     ],
//     callbacks: {
//         // eslint-disable-next-line @typescript-eslint/no-explicit-any
//         async session({session, user, trigger, token} : any) {
//             // Set The User ID From The Token
//             // session.user.id = token.id
//             session.user.id = token.sub;
//             session.user.role = token.role
//             session.user.name = token.name
//             console.log("token",token)
//             // If There Is An Update , Set The User Name
//             if(trigger === 'update') {
//                 session.user.name = user.name
//             }
//             return session;
//         },
//         // eslint-disable-next-line @typescript-eslint/no-explicit-any
//         async jwt({token, user, trigger, session}: any) {
//             if (user) {
//                 // // another way
//                 // token.id = user.id
//                 // // end
//                 token.role = user.role

//                 // if user has no name then use the email
//                 if(user.name === "NO_NAME") {
//                     token.name = user.email.split("@")[0];
//                 }
//                 // update database to reflect the token name
//                 await prisma.user.update({
//                     where: { id: user.id},
//                     data: {name: token.name}
//                 })
//             }
//             return token;
//         }
//     },
// } satisfies NextAuthConfig;

// export const {handlers, auth, signIn, signOut} = NextAuth(config);
import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "./db/prisma"
import { compareSync } from "bcrypt-ts-edge"
import type { NextAuthConfig } from "next-auth"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    role?: string
  }
  interface Session {
    user: {
      id?: string
      role?: string
    } & DefaultSession["user"]
  }
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },

  providers: [
    CredentialsProvider({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string},
        })

        if (!user || !user.password) return null

        const isValid = compareSync(
          credentials.password as string,
          user.password
        )

        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.role = user.role
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.role = token.role as string
      }
      return session
    },
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
