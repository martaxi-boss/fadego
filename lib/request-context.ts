const MAX_SOURCE_IP_LENGTH = 128

const boundedSignal = (value: string | null) => {
  const candidate = value?.trim()
  if (!candidate) return null
  return candidate.slice(0, MAX_SOURCE_IP_LENGTH)
}

export const sourceIpFromHeaders = (headers: Headers) => {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const first = boundedSignal(forwarded.split(",")[0] ?? null)
    if (first) return first
  }

  return boundedSignal(headers.get("x-real-ip")) ?? "unknown"
}
