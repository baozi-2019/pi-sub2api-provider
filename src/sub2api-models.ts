import { modelsUrl as defaultModelsUrl } from "./config.ts"

export const DEFAULT_SUB2API_MODELS_TIMEOUT_MS = 10_000

export interface FetchSub2apiModelIdsOptions {
  baseUrl: string
  apiKey: string
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
  modelsUrlFor?: (base: string) => string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Extract non-empty model ids from a sub2api `/v1/models` response payload. */
export function parseSub2apiModelIds(payload: unknown): string[] {
  if (!isRecord(payload)) throw new Error("sub2api /v1/models returned a non-object payload")
  if (!Array.isArray(payload.data)) throw new Error("sub2api /v1/models response has no data array")

  const ids: string[] = []
  for (const entry of payload.data) {
    if (!isRecord(entry)) continue
    const id = entry.id
    if (typeof id === "string" && id.trim() !== "") ids.push(id.trim())
  }
  return ids
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function fetchSub2apiModelIds(
  options: FetchSub2apiModelIdsOptions,
): Promise<string[]> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SUB2API_MODELS_TIMEOUT_MS
  const fetchImpl = options.fetchImpl ?? fetch
  const url = (options.modelsUrlFor ?? defaultModelsUrl)(options.baseUrl)

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error("sub2api /v1/models request timed out")),
    timeoutMs,
  )
  const onExternalAbort = () =>
    controller.abort(options.signal ? options.signal.reason : new Error("aborted"))
  if (options.signal) {
    if (options.signal.aborted) controller.abort(options.signal.reason)
    else options.signal.addEventListener("abort", onExternalAbort, { once: true })
  }

  let response: Response
  try {
    response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${options.apiKey}`, Accept: "application/json" },
    })
  } catch (error) {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", onExternalAbort)
    throw new Error(`failed to reach sub2api /v1/models: ${errorMessage(error)}`)
  }

  if (!response.ok) {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", onExternalAbort)
    throw new Error(`sub2api /v1/models responded ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new Error(`failed to parse sub2api /v1/models: ${errorMessage(error)}`)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", onExternalAbort)
  }
  return parseSub2apiModelIds(payload)
}
