import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const SUB2API_BASE_URL_ENV = "SUB2API_BASE_URL"

export interface Sub2apiConfig {
  baseUrl: string
}

/**
 * Normalize a user-supplied base URL: trim whitespace and trailing slashes.
 * Returns "" for non-http(s) inputs so callers fail closed.
 */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(trimmed)) return ""
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return ""
  }
  // Reject URLs carrying credentials or query/hash so embedded secrets are
  // never persisted to sub2api-config.json.
  if (url.username || url.password || url.search || url.hash) return ""
  return trimmed
}

/**
 * Build the sub2api OpenAI-compatible model listing endpoint from a normalized
 * base URL. sub2api exposes `/v1/models`; avoid double-`/v1` when the user
 * already included the version segment.
 */
export function modelsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "")
  return base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function configBaseUrlFrom(raw: unknown): string {
  if (!isRecord(raw)) return ""
  const value = raw.baseUrl
  return typeof value === "string" ? value : ""
}

export interface LoadConfigOptions {
  configPath: string
  env?: NodeJS.ProcessEnv
}

export function loadConfig(options: LoadConfigOptions): Sub2apiConfig | undefined {
  const env = options.env ?? process.env
  const fromEnv = env[SUB2API_BASE_URL_ENV]
  if (fromEnv) {
    const normalized = normalizeBaseUrl(fromEnv)
    if (normalized) return { baseUrl: normalized }
  }

  if (!existsSync(options.configPath)) return undefined
  try {
    const raw: unknown = JSON.parse(readFileSync(options.configPath, "utf-8"))
    const normalized = normalizeBaseUrl(configBaseUrlFrom(raw))
    return normalized ? { baseUrl: normalized } : undefined
  } catch {
    return undefined
  }
}

export function saveConfig(configPath: string, config: Sub2apiConfig): void {
  mkdirSync(dirname(configPath), { recursive: true })
  const tmp = `${configPath}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ baseUrl: config.baseUrl }, null, 2)}\n`, "utf-8")
  renameSync(tmp, configPath)
}

// ---- redaction -------------------------------------------------------------

const REDACTED = "[redacted]"

export function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, "")
  } catch {
    return REDACTED
  }
}

export function redactDiagnosticText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s)]+/gi, (match) => redactUrl(match))
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\bsk-[A-Za-z0-9._~+/=-]+/gi, REDACTED)
    .replace(/\b(?:api[-_ ]?key|key|token|secret|password)\s*[=:]\s*[^\s,;)]+/gi, (match) => {
      const separator = match.match(/\s*[=:]\s*/)?.[0] ?? "="
      return `${match.slice(0, match.indexOf(separator))}${separator}${REDACTED}`
    })
}
