import type { AuthOptions } from "next-auth"
import { getServerSession } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { authenticateCredentialCandidate } from "@/lib/credential-policy"
import { db } from "@/lib/prisma"
import { verifyPassword } from "@/lib/password"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"
import { credentialsSchema } from "@/lib/validation"

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "FADEGO",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Palavra-passe", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data
        const rateLimit = await consumeRateLimit(
          "authAttempt",
          hashRateLimitKey("admin-login", email),
        )

        if (!rateLimit.allowed) return null

        const record = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            active: true,
          },
        })

        return authenticateCredentialCandidate(record, password, verifyPassword)
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
        return token
      }

      if (token.userId) {
        const activeUser = await db.user.findUnique({
          where: { id: token.userId },
          select: { active: true },
        })

        if (!activeUser?.active) {
          delete token.userId
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export const auth = () => getServerSession(authOptions)
