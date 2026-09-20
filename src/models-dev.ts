import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export const MODELS_DEV_URL = "https://models.dev/api.json"
export const MODELS_DEV_TTL_MS = 24 * 60 * 60 * 1000
export const MODELS_DEV_TIMEOUT_MS = 30_000

export const DEFAULT_CONTEXT_WINDOW = 128_000
export const DEFAULT_MAX_TOKENS = 4096

export interface ModelDevMeta {
  name: string
  reasoning: boolean
  input: string[]
  contextWindow: number // 0 = missing
  maxTokens: number // 0 = missing
  provider: string
}

export type ModelDevIndex = Map<string, ModelDevMeta>

const PRIORITY_SLUGS: readonly string[] = [
  "openai",
  "anthropic",
  "google",
  "google-vertex",
  "deepseek",
  "xai",
  "minimax",
  "zhipuai",
  "moonshotai",
  "alibaba",
  "meta",
  "mistral",
  "mistralai",
  "amazon",
  "aws",
  "cohere",
  "perplexity",
  "nvidia",
]

function slugPriority(slug: string): number {
  const index = PRIORITY_SLUGS.indexOf(slug)
  return index === -1 ? 0 : PRIORITY_SLUGS.length - index
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function inputModalities(model: Record<string, unknown>): string[] {
  const modalities = model.modalities
  if (!isRecord(modalities)) return []
  const input = modalities.input
  if (!Array.isArray(input)) return []
  return input.filter((value): value is string => typeof value === "string")
}

function limitValue(model: Record<string, unknown>, key: "context" | "output"): number {
  const limit = model.limit
  if (!isRecord(limit)) return 0
  return asNumber(limit[key]) ?? 0
}

/**
 * Flatten models.dev's `{ providerSlug: { models: { modelKey: {...} } } }`
 * into an id -> metadata index. Later, higher-value (official) provider entries
 * win over aggregator entries; equal-priority ties keep the first write.
 */
export function flattenModelsDev(raw: unknown): ModelDevIndex {
  const index: ModelDevIndex = new Map()
  if (!isRecord(raw)) return index

  for (const [slug, providerValue] of Object.entries(raw)) {
    if (!isRecord(providerValue)) continue
    const models = providerValue.models
    if (!isRecord(models)) continue
    const priority = slugPriority(slug)

    for (const [key, modelValue] of Object.entries(models)) {
      if (!isRecord(modelValue)) continue
      const meta: ModelDevMeta = {
        name: asString(modelValue.name) ?? key,
        reasoning: modelValue.reasoning === true,
        input: inputModalities(modelValue),
        contextWindow: limitValue(modelValue, "context"),
        maxTokens: limitValue(modelValue, "output"),
        provider: slug,
      }

      const candidates = key.includes("/") ? [key, key.slice(key.lastIndexOf("/") + 1)] : [key]
      for (const candidate of candidates) {
        const existing = index.get(candidate)
        if (!existing || priority > slugPriority(existing.provider)) {
          index.set(candidate, meta)
        }
      }
    }
  }
  return index
}

function stripDateSuffix(id: string): string {
  return id.replace(/-\d{8}$/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "")
}

/**
 * 官方近似值优先于 models.dev 聚合商条目（后者常把 reasoning/limit 记错）。
 * 待按官方文档复验后微调。
 */
const DEFAULT_ALIASES: Record<string, Partial<ModelDevMeta>> = {
  "deepseek-chat": {
    name: "DeepSeek Chat",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 8192,
  },
  "deepseek-reasoner": {
    name: "DeepSeek Reasoner",
    reasoning: true,
    input: ["text"],
    contextWindow: 64_000,
    maxTokens: 65_536,
  },
  "grok-4": {
    name: "Grok 4",
    reasoning: true,
    input: ["text"],
    contextWindow: 256_000,
    maxTokens: 256_000,
  },
  "kimi-k2.5": {
    name: "Kimi K2.5",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 262_144,
    maxTokens: 262_144,
  },
}

export function lookupModelMeta(
  id: string,
  index: ModelDevIndex,
  aliases: Record<string, Partial<ModelDevMeta>> = DEFAULT_ALIASES,
): ModelDevMeta {
  const alias = aliases[id]
  if (alias) {
    return {
      name: alias.name ?? id,
      reasoning: alias.reasoning ?? false,
      input: alias.input ?? [],
      contextWindow: alias.contextWindow ?? 0,
      maxTokens: alias.maxTokens ?? 0,
      provider: alias.provider ?? "alias",
    }
  }

  const exact = index.get(id)
  if (exact) return exact
  const stripped = stripDateSuffix(id)
  if (stripped !== id) {
    const byStripped = index.get(stripped)
    if (byStripped) return byStripped
  }
  return { name: "", reasoning: false, input: [], contextWindow: 0, maxTokens: 0, provider: "" }
}

// ---- snapshot cache --------------------------------------------------------

interface SnapshotCacheFile {
  fetchedAt: number
  models: Record<string, unknown>
}

function parseModelDevMeta(value: unknown): ModelDevMeta | undefined {
  if (!isRecord(value)) return undefined
  return {
    name: asString(value.name) ?? "",
    reasoning: value.reasoning === true,
    input: Array.isArray(value.input)
      ? value.input.filter((v): v is string => typeof v === "string")
      : [],
    contextWindow: asNumber(value.contextWindow) ?? 0,
    maxTokens: asNumber(value.maxTokens) ?? 0,
    provider: asString(value.provider) ?? "",
  }
}

function readSnapshotCache(cachePath: string): SnapshotCacheFile | undefined {
  try {
    if (!existsSync(cachePath)) return undefined
    const parsed: unknown = JSON.parse(readFileSync(cachePath, "utf-8"))
    if (!isRecord(parsed)) return undefined
    const fetchedAt = asNumber(parsed.fetchedAt)
    const models = parsed.models
    if (fetchedAt === undefined || !isRecord(models)) return undefined
    return { fetchedAt, models }
  } catch {
    return undefined
  }
}

function writeSnapshotCache(cachePath: string, value: SnapshotCacheFile): void {
  mkdirSync(dirname(cachePath), { recursive: true })
  const tmp = `${cachePath}.tmp`
  writeFileSync(tmp, JSON.stringify(value), "utf-8")
  renameSync(tmp, cachePath)
}

function indexToSnapshot(index: ModelDevIndex): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {}
  for (const [id, meta] of index) snapshot[id] = meta
  return snapshot
}

function indexFromSnapshot(cache: SnapshotCacheFile): ModelDevIndex {
  const index: ModelDevIndex = new Map()
  for (const [id, value] of Object.entries(cache.models)) {
    const meta = parseModelDevMeta(value)
    if (meta) index.set(id, meta)
  }
  return index
}

// ---- loader ----------------------------------------------------------------

export interface LoadModelsDevIndexOptions {
  url?: string
  cachePath?: string
  force?: boolean
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  timeoutMs?: number
  ttlMs?: number
  now?: () => number
}

export interface LoadModelsDevIndexResult {
  index: ModelDevIndex
  source: "live" | "cache" | "empty"
  fetchedAt?: number
}

export async function loadModelsDevIndex(
  options: LoadModelsDevIndexOptions = {},
): Promise<LoadModelsDevIndexResult> {
  const url = options.url ?? MODELS_DEV_URL
  const ttlMs = options.ttlMs ?? MODELS_DEV_TTL_MS
  const timeoutMs = options.timeoutMs ?? MODELS_DEV_TIMEOUT_MS
  const now = options.now ?? Date.now
  const fetchImpl = options.fetchImpl ?? fetch
  const cachePath = options.cachePath

  if (cachePath && options.force !== true) {
    const cached = readSnapshotCache(cachePath)
    if (cached && now() - cached.fetchedAt < ttlMs) {
      return { index: indexFromSnapshot(cached), source: "cache", fetchedAt: cached.fetchedAt }
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error("models.dev request timed out")),
    timeoutMs,
  )
  const onExternalAbort = () =>
    controller.abort(options.signal ? options.signal.reason : new Error("aborted"))
  if (options.signal) {
    if (options.signal.aborted) controller.abort(options.signal.reason)
    else options.signal.addEventListener("abort", onExternalAbort, { once: true })
  }

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
    if (!response.ok) throw new Error(`models.dev responded ${response.status}`)
    const raw: unknown = await response.json()
    const index = flattenModelsDev(raw)
    if (index.size === 0) throw new Error("models.dev returned an empty catalog")
    if (cachePath) {
      writeSnapshotCache(cachePath, { fetchedAt: now(), models: indexToSnapshot(index) })
    }
    return { index, source: "live", fetchedAt: now() }
  } catch {
    if (cachePath) {
      const stale = readSnapshotCache(cachePath)
      if (stale)
        return { index: indexFromSnapshot(stale), source: "cache", fetchedAt: stale.fetchedAt }
    }
    return { index: new Map(), source: "empty" }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", onExternalAbort)
  }
}
