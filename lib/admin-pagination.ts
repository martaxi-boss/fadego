export const DIRECTORY_PAGE_SIZE = 60
export const MAX_DIRECTORY_PAGE = 1000

export const resolveDirectoryPage = (value: unknown, total: number) => {
  const raw = typeof value === "string" && /^\d{1,4}$/.test(value)
    ? Number(value)
    : 1
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / DIRECTORY_PAGE_SIZE))
  const lastPage = Math.min(totalPages, MAX_DIRECTORY_PAGE)
  const page = Math.min(Math.max(raw, 1), lastPage)

  return {
    page,
    totalPages,
    lastPage,
    skip: (page - 1) * DIRECTORY_PAGE_SIZE,
    take: DIRECTORY_PAGE_SIZE,
    first: total === 0 ? 0 : (page - 1) * DIRECTORY_PAGE_SIZE + 1,
    last: Math.min(page * DIRECTORY_PAGE_SIZE, total),
    hasPrevious: page > 1,
    hasNext: page < lastPage,
  }
}
