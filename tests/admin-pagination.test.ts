import assert from "node:assert/strict"
import { test } from "node:test"
import { DIRECTORY_PAGE_SIZE, resolveDirectoryPage } from "../lib/admin-pagination"

test("directory pagination never accepts unbounded, negative or malformed offsets", () => {
  assert.equal(DIRECTORY_PAGE_SIZE, 60)
  const one = resolveDirectoryPage(undefined, 0)
  assert.deepEqual({ page: one.page, skip: one.skip, first: one.first, last: one.last },
    { page: 1, skip: 0, first: 0, last: 0 })
  for (const input of ["-1", "abc", "1;DROP", "100000", [], {}, null]) {
    assert.equal(resolveDirectoryPage(input, 120).page, 1)
  }
})

test("directory pagination supports intermediate and final result pages", () => {
  const second = resolveDirectoryPage("2", 123)
  assert.equal(second.skip, 60)
  assert.equal(second.first, 61)
  assert.equal(second.last, 120)
  assert.equal(second.hasPrevious, true)
  assert.equal(second.hasNext, true)

  const final = resolveDirectoryPage("99", 123)
  assert.equal(final.page, 3)
  assert.equal(final.first, 121)
  assert.equal(final.last, 123)
  assert.equal(final.hasNext, false)
})
