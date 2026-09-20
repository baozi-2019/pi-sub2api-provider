/** Provider-scoped env key that carries the Sub2API base URL inside the credential. */
export const SUB2API_BASE_URL_ENV = "SUB2API_BASE_URL"

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
  // Reject URLs carrying credentials or query/hash so embedded secrets never
  // end up in the credential's env bag.
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

/**
 * Read the Sub2API base URL out of a credential's provider-scoped env bag
 * (`ApiKeyCredential.env`). Returns "" when unset or invalid so callers fail
 * closed instead of issuing a request against the wrong host.
 */
export function baseUrlFromEnv(env: Record<string, string> | undefined): string {
  const raw = env?.[SUB2API_BASE_URL_ENV]
  return typeof raw === "string" ? normalizeBaseUrl(raw) : ""
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