import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

const KEY_LENGTH = 64
const DEFAULT_N = 16384
const DEFAULT_R = 8
const DEFAULT_P = 1
const MAX_MEMORY = 64 * 1024 * 1024

const derive = (
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: MAX_MEMORY },
      (error, derivedKey) => {
        if (error) {
          reject(error)
          return
        }
        resolve(derivedKey)
      },
    )
  })

export const hashPassword = async (password: string) => {
  if (password.length < 12) {
    throw new Error("Administrative passwords must contain at least 12 characters.")
  }

  const salt = randomBytes(16)
  const hash = await derive(password, salt, DEFAULT_N, DEFAULT_R, DEFAULT_P)

  return [
    "scrypt",
    DEFAULT_N,
    DEFAULT_R,
    DEFAULT_P,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$")
}

export const verifyPassword = async (password: string, encoded: string) => {
  const parts = encoded.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false

  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n < 2 ||
    n > DEFAULT_N ||
    r < 1 ||
    r > DEFAULT_R ||
    p < 1 ||
    p > DEFAULT_P
  ) {
    return false
  }

  try {
    const salt = Buffer.from(parts[4], "base64")
    const expected = Buffer.from(parts[5], "base64")
    if (salt.length < 16 || expected.length !== KEY_LENGTH) return false

    const actual = await derive(password, salt, n, r, p)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
