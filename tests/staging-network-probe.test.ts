import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("read-only staging probe targets only the approved hostname", () => {
  const source = readFileSync("scripts/check-staging-host.mjs", "utf8")
  assert.match(source, /const hostname = "fadego\.duckdns\.org"/)
  assert.match(source, /redirect: "manual"/)
  assert.match(source, /AbortSignal\.timeout\(9000\)/)
  assert.match(source, /HTTP_200_WITHOUT_TEST_GATE_CHECK_CONFIGURATION/)
  assert.doesNotMatch(source, /execSync|spawn\(|POST|PUT|PATCH|DELETE|password|Authorization/)
})
