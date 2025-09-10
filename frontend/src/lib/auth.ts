import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "~/server/db"

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql"
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,     // 7 days
    updateAge: 60 * 60 * 24,         // 1 day
  },
  rateLimit: {
    window: 10000,    // 10s
    max: 100          // 1000 requests per window
  }
});