/** Limit untrusted JSON before parsing to avoid oversized API requests. */
export const JSON_BODY_MAX_BYTES = 8 * 1024

export type JsonObject = Record<string, unknown>

export const asJsonObject = (value: unknown): JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {}

type JsonReadResult =
  | { ok: true; value: JsonObject }
  | { ok: false; status: 400 | 413 }

export const readBoundedJsonObject = async (
  request: Request,
  maxBytes = JSON_BODY_MAX_BYTES,
): Promise<JsonReadResult> => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 2 || maxBytes > 65536) {
    throw new Error("Invalid JSON body size limit")
  }

  const declaredLength = request.headers.get("content-length")
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBytes
  ) {
    return { ok: false, status: 413 }
  }

  if (!request.body) return { ok: false, status: 400 }

  let reader: ReadableStreamDefaultReader<Uint8Array>
  try {
    reader = request.body.getReader()
  } catch {
    return { ok: false, status: 400 }
  }

  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, status: 413 }
      }
      chunks.push(value)
    }

    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }

    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    )
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, status: 400 }
    }

    return { ok: true, value: value as JsonObject }
  } catch {
    return { ok: false, status: 400 }
  } finally {
    reader.releaseLock()
  }
}
