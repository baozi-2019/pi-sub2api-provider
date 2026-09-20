import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  loadConfig,
  modelsUrl,
  normalizeBaseUrl,
  redactDiagnosticText,
  saveConfig,
} from "../src/config.ts"

describe("normalizeBaseUrl", () => {
  it("trims surrounding whitespace and trailing slashes", () => {
    assert.equal(normalizeBaseUrl("  http://127.0.0.1:8080/  "), "http://127.0.0.1:8080")
    assert.equal(
      normalizeBaseUrl("https://sub2api.example.com/v1/"),
      "https://sub2api.example.com/v1",
    )
  })

  it("rejects non-http(s) input", () => {
    assert.equal(normalizeBaseUrl("ftp://example.com"), "")
    assert.equal(normalizeBaseUrl("127.0.0.1:8080"), "")
    assert.equal(normalizeBaseUrl(""), "")
  })
})

describe("modelsUrl", () => {
  it("appends /v1/models when the version segment is missing", () => {
    assert.equal(modelsUrl("http://h:1"), "http://h:1/v1/models")
  })

  it("keeps a single /v1 segment", () => {
    assert.equal(modelsUrl("http://h:1/v1"), "http://h:1/v1/models")
    assert.equal(modelsUrl("http://h:1/v1/"), "http://h:1/v1/models")
  })
})

describe("loadConfig / saveConfig", () => {
  it("prefers the env override and falls back to the persisted file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sub2api-config-"))
    const configPath = join(dir, "config.json")
    try {
      assert.equal(
        loadConfig({ configPath, env: { SUB2API_BASE_URL: "http://env:1/" } })?.baseUrl,
        "http://env:1",
      )

      saveConfig(configPath, { baseUrl: "http://file:2" })
      assert.equal(loadConfig({ configPath, env: {} })?.baseUrl, "http://file:2")

      // Malformed file => undefined, not a throw.
      saveConfig(configPath, { baseUrl: "not-a-url" })
      assert.equal(loadConfig({ configPath, env: {} }), undefined)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns undefined when nothing is configured", () => {
    assert.equal(loadConfig({ configPath: "/nonexistent/sub2api-config.json", env: {} }), undefined)
  })
})

describe("redactDiagnosticText", () => {
  it("redacts URLs, Bearer tokens and sk- keys", () => {
    const out = redactDiagnosticText(
      "GET http://user:pass@host:1/v1/models failed with Bearer abc123 and sk-secretkey",
    )
    assert.ok(!out.includes("user:pass"))
    assert.ok(!out.includes("abc123"))
    assert.ok(!out.includes("sk-secretkey"))
    assert.ok(out.includes("[redacted]"))
    assert.ok(out.includes("http://host:1/v1/models"))
  })
})
