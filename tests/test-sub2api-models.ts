import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fetchSub2apiModelIds, parseSub2apiModelIds } from "../src/sub2api-models.ts"

describe("parseSub2apiModelIds", () => {
  it("extracts trimmed, non-empty ids from data[]", () => {
    const payload = {
      object: "list",
      data: [
        { id: "gpt-4o" },
        { id: "  claude-3-5-sonnet  " },
        { id: "" },
        { id: 42 },
        { other: true },
      ],
    }
    assert.deepEqual(parseSub2apiModelIds(payload), ["gpt-4o", "claude-3-5-sonnet"])
  })

  it("rejects non-object payloads and missing data arrays", () => {
    assert.throws(() => parseSub2apiModelIds(null))
    assert.throws(() => parseSub2apiModelIds("nope"))
    assert.throws(() => parseSub2apiModelIds({}))
    assert.throws(() => parseSub2apiModelIds({ data: {} }))
  })

  it("returns an empty list for an empty data array", () => {
    assert.deepEqual(parseSub2apiModelIds({ data: [] }), [])
  })
})

describe("fetchSub2apiModelIds", () => {
  it("sends the bearer key to the models URL and parses ids", async () => {
    let capturedUrl = ""
    let capturedAuth = ""
    const fetchImpl: typeof fetch = async (url, init) => {
      capturedUrl = String(url)
      capturedAuth = new Headers(init?.headers).get("Authorization") ?? ""
      return new Response(JSON.stringify({ data: [{ id: "a" }, { id: "b" }] }), { status: 200 })
    }

    const ids = await fetchSub2apiModelIds({
      baseUrl: "http://h:1",
      apiKey: "sk-test",
      fetchImpl,
    })

    assert.deepEqual(ids, ["a", "b"])
    assert.equal(capturedUrl, "http://h:1/v1/models")
    assert.equal(capturedAuth, "Bearer sk-test")
  })

  it("throws on non-2xx responses", async () => {
    const fetchImpl: typeof fetch = async () => new Response("{}", { status: 401 })
    await assert.rejects(
      fetchSub2apiModelIds({ baseUrl: "http://h:1", apiKey: "sk-test", fetchImpl }),
      /responded 401/,
    )
  })

  it("throws when the network call fails", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("connection refused")
    }
    await assert.rejects(
      fetchSub2apiModelIds({ baseUrl: "http://h:1", apiKey: "sk-test", fetchImpl }),
      /failed to reach sub2api \/v1\/models/,
    )
  })

  it("returns an empty list when the response data array is empty", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    const ids = await fetchSub2apiModelIds({ baseUrl: "http://h:1", apiKey: "sk-test", fetchImpl })
    assert.deepEqual(ids, [])
  })

  it("times out when the upstream never responds", async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
      })
    await assert.rejects(
      fetchSub2apiModelIds({ baseUrl: "http://h:1", apiKey: "sk-test", timeoutMs: 1, fetchImpl }),
      /failed to reach sub2api \/v1\/models/,
    )
  })

  it("wraps invalid JSON body errors", async () => {
    const fetchImpl: typeof fetch = async () => new Response("{not json", { status: 200 })
    await assert.rejects(
      fetchSub2apiModelIds({ baseUrl: "http://h:1", apiKey: "sk-test", fetchImpl }),
      /failed to parse sub2api \/v1\/models/,
    )
  })
})
