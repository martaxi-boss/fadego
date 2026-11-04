import assert from "node:assert/strict"
import { test } from "node:test"
import { asJsonObject, JSON_BODY_MAX_BYTES, readBoundedJsonObject } from "../lib/http-json"

const jsonRequest = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://fadego.example/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  })

test("bounded JSON accepts a valid object and a nested customer", async () => {
  const result = await readBoundedJsonObject(
    jsonRequest('{"serviceId":"abc","customer":{"name":"Ana"}}'),
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.serviceId, "abc")
  assert.equal(asJsonObject(result.value.customer).name, "Ana")
})

test("bounded JSON rejects null, arrays, primitives and malformed JSON", async () => {
  for (const payload of [
    "null",
    "[]",
    "42",
    '"texto"',
    "true",
    "{",
    "",
  ]) {
    const result = await readBoundedJsonObject(jsonRequest(payload))
    assert.deepEqual(result, { ok: false, status: 400 }, payload)
  }
  assert.deepEqual(asJsonObject(null), {})
  assert.deepEqual(asJsonObject([]), {})
  assert.deepEqual(asJsonObject("text"), {})
})

test("bounded JSON rejects bodies exceeding the actual byte limit", async () => {
  const oversized = '{"data":"' + "x".repeat(JSON_BODY_MAX_BYTES) + '"}'
  const result = await readBoundedJsonObject(jsonRequest(oversized))
  assert.deepEqual(result, { ok: false, status: 413 })
})

test("bounded JSON never trusts a small declared content-length", async () => {
  const oversized = '{"data":"' + "x".repeat(JSON_BODY_MAX_BYTES) + '"}'
  const result = await readBoundedJsonObject(jsonRequest(oversized, {
    "content-length": "3",
  }))
  assert.deepEqual(result, { ok: false, status: 413 })
})

test("bounded JSON rejects invalid UTF-8 and accepts Portuguese text", async () => {
  const invalid = new Request("https://fadego.example/api/test", {
    method: "POST",
    body: Uint8Array.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]),
  })
  assert.deepEqual(await readBoundedJsonObject(invalid), { ok: false, status: 400 })
  const valid = await readBoundedJsonObject(jsonRequest('{"nome":"José"}'))
  assert.equal(valid.ok, true)
  if (valid.ok) assert.equal(valid.value.nome, "José")
})

test("bounded JSON supports a custom tighter maximum", async () => {
  const result = await readBoundedJsonObject(jsonRequest('{"value":1}'), 9)
  assert.deepEqual(result, { ok: false, status: 413 })
})
