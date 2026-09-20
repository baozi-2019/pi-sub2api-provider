export interface Sub2apiStatusInput {
  /** Redacted before passing in. */
  baseUrl: string
  hasKey: boolean
  modelCount: number
  lastSuccess?: number
  /** Redacted before passing in. */
  lastError?: string
}

function formatTimestamp(timestamp: number | undefined): string {
  return timestamp === undefined ? "never" : new Date(timestamp).toISOString()
}

export function formatSub2apiStatus(status: Sub2apiStatusInput): string {
  return [
    `base URL: ${status.baseUrl || "(not set)"}`,
    `api key: ${status.hasKey ? "configured" : "not configured (run /login sub2api)"}`,
    `models: ${status.modelCount}`,
    `last success: ${formatTimestamp(status.lastSuccess)}`,
    `last error: ${status.lastError ?? "none"}`,
  ].join("\n")
}

export interface RefreshOutcome {
  ok: boolean
  modelCount: number
  message?: string
}

export function refreshNotification(outcome: RefreshOutcome): {
  text: string
  type: "info" | "error"
} {
  if (outcome.ok) {
    return { text: `Sub2API models refreshed (${outcome.modelCount} models).`, type: "info" }
  }
  return {
    text: `Sub2API refresh failed${outcome.message ? `: ${outcome.message}` : ""}.`,
    type: "error",
  }
}
