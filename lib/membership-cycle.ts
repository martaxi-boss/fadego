export type MembershipClock = {
  now(): Date
}

export const systemMembershipClock: MembershipClock = {
  now: () => new Date(),
}

const assertValidInstant = (value: Date) => {
  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid membership instant.")
  }
}

export const addCalendarMonthClamped = (start: Date) => {
  assertValidInstant(start)

  const result = new Date(start.getTime())
  const originalDay = result.getUTCDate()

  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + 1)

  const targetYear = result.getUTCFullYear()
  const targetMonth = result.getUTCMonth()
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate()

  result.setUTCDate(Math.min(originalDay, lastDay))
  return result
}

export const isInsideHalfOpenCycle = (
  instant: Date,
  cycleStartsAt: Date,
  cycleEndsAt: Date,
) => {
  assertValidInstant(instant)
  assertValidInstant(cycleStartsAt)
  assertValidInstant(cycleEndsAt)

  return (
    instant.getTime() >= cycleStartsAt.getTime() &&
    instant.getTime() < cycleEndsAt.getTime()
  )
}
