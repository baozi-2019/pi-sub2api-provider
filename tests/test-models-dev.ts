import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  flattenModelsDev,
  loadModelsDevIndex,
  lookupModelMeta,
} from "../src/models-dev.ts"

const fixture = {
  openai: {
    id: "openai",
    name: "OpenAI",
    models: {
      "gpt-5-nano": {
        id: "gpt-5-nano",
        name: "GPT-5 Nano",
        reasoning: true,
        modalities: { input: ["text", "image"], output: ["text"] },
        limit: { context: 400000, output: 128000 },
      },
    },
  },
  "some-router": {
    id: "some-router",
    name: "Router",
    models: {
      "gpt-5-nano": {
        id: "gpt-5-nano",
        name: "Router GPT-5 Nano",
        reasoning: false,
        modalities: { input: ["text"], output: ["text"] },
        limit: { context: 1000, output: 200 },
      },
      "openai/gpt-whatever": {
        id: "gpt-whatever",
        name: "Whatever",
        reasoning: true,
        modalities: { input: ["text"], output: ["text"] },
        limit: { context: 30000, output: 1000 },
      },
    },
  },
}

describe("flattenModelsDev", () => {
  it("flattens to an id index, preferring official providers on conflict", () => {
    const index = flattenModelsDev(fixture)

    // Official openai entry wins over the later router entry (same id).
    assert.equal(index.get("gpt-5-nano")?.provider, "openai")
    assert.equal(index.get("gpt-5-nano")?.contextWindow, 400000)

    // Prefixed keys are indexed under both the full and bare id.
    assert.equal(index.get("gpt-whatever")?.name, "Whatever")
    assert.equal(index.get("openai/gpt-whatever")?.name, "Whatever")
  })

  it("returns an empty index for non-object input", () => {
    assert.equal(flattenModelsDev(null).size, 0)
    assert.equal(flattenModelsDev("x").size, 0)
  })
})

describe("lookupModelMeta", () => {
  const index = flattenModelsDev(fixture)

  it("resolves exact matches", () => {
    assert.equal(lookupModelMeta("gpt-5-nano", index).contextWindow, 400000)
  })

  it("falls back to stripping a trailing date snapshot suffix", () => {
    assert.equal(lookupModelMeta("gpt-whatever-20260908", index).contextWindow, 30000)
  })

  it("returns a zeroed fallback on miss", () => {
    const meta = lookupModelMeta("does-not-exist", index)
    assert.equal(meta.contextWindow, 0)
    assert.equal(meta.maxTokens, 0)
    assert.equal(meta.name, "")
  })

  it("prefers an explicit alias over the index", () => {
    const meta = lookupModelMeta("custom", index, {
      custom: { name: "Custom", reasoning: true, contextWindow: 123, maxTokens: 456 },
    })
    assert.equal(meta.name, "Custom")
    assert.equal(meta.reasoning, true)
    assert.equal(meta.contextWindow, 123)
    assert.equal(meta.maxTokens, 456)
  })

  it("applies built-in official approximations for known aggregator ids", () => {
    const chat = lookupModelMeta("deepseek-chat", index)
    assert.equal(chat.reasoning, false)
    assert.equal(chat.contextWindow, 128_000)

    const reasoner = lookupModelMeta("deepseek-reasoner", index)
    assert.equal(reasoner.reasoning, true)
    assert.equal(reasoner.contextWindow, 64_000)
  })
})

describe("constants", () => {
  it("exposes sane defaults", () => {
    assert.ok(DEFAULT_CONTEXT_WINDOW > 0)
    assert.ok(DEFAULT_MAX_TOKENS > 0)
  })
})

describe("loadModelsDevIndex", () => {
  it("serves a fresh cache without hitting the network", async () => {
    // Seed a cache via a live fetch, then read it back.
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      return new Response(JSON.stringify(fixture), { status: 200 })
    }

    const first = await loadModelsDevIndex({
      url: "https://models.dev/api.json",
      fetchImpl,
      force: true,
      now: () => 1_000_000,
      cachePath: undefined,
    })
    assert.equal(first.source, "live")
    assert.equal(first.index.get("gpt-5-nano")?.contextWindow, 400000)
    assert.equal(calls, 1)
  })

  it("falls back to an empty index when the network fails and there is no cache", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("boom")
    }
    const result = await loadModelsDevIndex({ url: "https://x", fetchImpl, force: true })
    assert.equal(result.source, "empty")
    assert.equal(result.index.size, 0)
  })
})
