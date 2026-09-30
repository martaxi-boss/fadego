import { createHash } from "node:crypto"
import {
  RateLimiterMemory,
  RateLimiterPostgres,
  RateLimiterRes,
  type RateLimiterAbstract,
} from "rate-limiter-flexible"
import { getPool } from "@/lib/prisma"

export const RATE_LIMITS = {
  authAttempt: { points: 5, duration: 60 },
  privilegedWrite: { points: 30, duration: 60 },
  publicBookingCreate: { points: 6, duration: 5 * 60 },
  privateBookingLookup: { points: 20, duration: 60 },
} as const

export type RateLimitName = keyof typeof RATE_LIMITS

const limiters = new Map<RateLimitName, RateLimiterAbstract>()

const createLimiter = (name: RateLimitName): RateLimiterAbstract => {
  const { points, duration } = RATE_LIMITS[name]

  return new RateLimiterPostgres({
    storeClient: getPool(),
    storeType: "pool",
    tableName: "RateLimit",
    tableCreated: true,
    keyPrefix: name,
    points,
    duration,
    insuranceLimiter: new RateLimiterMemory({ points, duration }),
  })
}

const getLimiter = (name: RateLimitName) => {
  const existing = limiters.get(name)
  if (existing) return existing

  const limiter = createLimiter(name)
  limiters.set(name, limiter)
  return limiter
}

export const hashRateLimitKey = (...parts: string[]) =>
  createHash("sha256")
    .update(parts.map((part) => part.trim().toLowerCase()).join("\u001f"))
    .digest("hex")

export const consumeRateLimit = async (name: RateLimitName, key: string) => {
  try {
    await getLimiter(name).consume(key)
    return { allowed: true as const, retryAfterSeconds: 0 }
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      return {
        allowed: false as const,
        retryAfterSeconds: Math.max(1, Math.ceil(error.msBeforeNext / 1000)),
      }
    }

    console.error("[rate-limit] storage failure", name)
    return { allowed: false as const, retryAfterSeconds: 60 }
  }
}
