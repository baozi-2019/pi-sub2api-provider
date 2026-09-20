import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  baseUrlFromEnv,
  modelsUrl,
  normalizeBaseUrl,
  redactDiagnosticText,
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

  it("rejects URLs carrying credentials or query/hash", () => {
    assert.equal(normalizeBaseUrl("https://user:pass@host"), "")
    assert.equal(normalizeBaseUrl("https://host/?api_key=abc"), "")
    assert.equal(normalizeBaseUrl("https://host/#frag"), "")
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

describe("baseUrlFromEnv", () => {
  it("reads and normalizes the credential env value", () => {
    assert.equal(
      baseUrlFromEnv({ SUB2API_BASE_URL: " http://127.0.0.1:8080/ " }),
      "http://127.0.0.1:8080",
    )
  })

  it("fails closed on missing or invalid values", () => {
    assert.equal(baseUrlFromEnv(undefined), "")
    assert.equal(baseUrlFromEnv({}), "")
    assert.equal(baseUrlFromEnv({ SUB2API_BASE_URL: "not-a-url" }), "")
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

  it("redacts bare sk- keys with dots and key= forms", () => {
    const out = redactDiagnosticText("key=sk-abc.def and bare sk-xyz.123")
    assert.ok(!out.includes("sk-abc.def"))
    assert.ok(!out.includes("sk-xyz.123"))
  })
})