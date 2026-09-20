import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { toSub2apiModelDefs } from "../src/catalog.ts"
import { flattenModelsDev } from "../src/models-dev.ts"

const fixture = {
  openai: {
    id: "openai",
    name: "OpenAI",
    models: {
      "gpt-5-nano": {
        id: "gpt-5-nano",
        name: "GPT-5 Nano",
        reasoning: true,
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        limit: { context: 400000, output: 128000 },
      },
    },
  },
}

describe("toSub2apiModelDefs", () => {
  const index = flattenModelsDev(fixture)

  it("maps ids onto defs and drops non text/image modalities", () => {
    const defs = toSub2apiModelDefs(["gpt-5-nano"], index)
    assert.deepEqual(defs, [
      {
        id: "gpt-5-nano",
        name: "GPT-5 Nano",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 400000,
        maxTokens: 128000,
      },
    ])
  })

  it("dedupes ids and applies defaults on miss", () => {
    const defs = toSub2apiModelDefs(["  unknown  ", "unknown", "", "unknown"], index)
    assert.equal(defs.length, 1)
    assert.deepEqual(defs[0], {
      id: "unknown",
      name: "unknown",
      reasoning: false,
      input: ["text"],
      contextWindow: 128000,
      maxTokens: 4096,
    })
  })

  it("returns an empty list for an empty id list", () => {
    assert.deepEqual(toSub2apiModelDefs([], index), [])
  })
})
