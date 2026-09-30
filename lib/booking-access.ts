import { createHash, randomBytes } from "node:crypto"
import type { Prisma } from "@prisma/client"

export const ACCESS_CODE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" as const
export const ACCESS_CODE_LENGTH = 8
export const ACCESS_CODE_RETRY_LIMIT = 5

const accessCodePattern = new RegExp(
  `^[${ACCESS_CODE_ALPHABET}]{${ACCESS_CODE_LENGTH}}$`,
)

export type AccessCodeGenerator = () => string

export class BookingAccessError extends Error {
  constructor(public readonly code: "TOKEN_UNAVAILABLE") {
    super("Private booking access could not be issued.")
    this.name = "BookingAccessError"
  }
}

export const generateAccessCode: AccessCodeGenerator = () => {
  const bytes = randomBytes(ACCESS_CODE_LENGTH)
  let code = ""

  for (const byte of bytes) {
    code += ACCESS_CODE_ALPHABET[byte & 31]
  }

  return code
}

export const canonicalizeAccessCode = (value: string) => {
  const canonical = value.trim().toUpperCase()
  return accessCodePattern.test(canonical) ? canonical : null
}

export const hashAccessCode = (canonicalCode: string) =>
  createHash("sha256").update(canonicalCode, "utf8").digest("hex")

export const bookingAccessPath = (canonicalCode: string) =>
  `/r/${canonicalCode}`

export const issueBookingAccessToken = async (
  tx: Prisma.TransactionClient,
  input: {
    barbershopId: string
    bookingId: string
    generator?: AccessCodeGenerator
  },
) => {
  const generator = input.generator ?? generateAccessCode

  for (let attempt = 0; attempt < ACCESS_CODE_RETRY_LIMIT; attempt += 1) {
    const candidate = canonicalizeAccessCode(generator())
    if (!candidate) {
      continue
    }

    const inserted = await tx.bookingAccessToken.createMany({
      data: {
        barbershopId: input.barbershopId,
        bookingId: input.bookingId,
        tokenHash: hashAccessCode(candidate),
      },
      skipDuplicates: true,
    })

    if (inserted.count === 1) {
      return candidate
    }
  }

  throw new BookingAccessError("TOKEN_UNAVAILABLE")
}
