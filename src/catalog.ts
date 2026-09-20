import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  lookupModelMeta,
  type ModelDevIndex,
  type ModelDevMeta,
} from "./models-dev.ts"

export type Sub2apiInputType = "text" | "image"

export interface Sub2apiModelDef {
  id: string
  name: string
  reasoning: boolean
  input: Sub2apiInputType[]
  contextWindow: number
  maxTokens: number
}

/** Map sub2api model ids onto pi-ready model defs, deduping and applying defaults. */
export function toSub2apiModelDefs(
  ids: readonly string[],
  index: ModelDevIndex,
  aliases?: Record<string, Partial<ModelDevMeta>>,
): Sub2apiModelDef[] {
  const seen = new Set<string>()
  const defs: Sub2apiModelDef[] = []

  for (const rawId of ids) {
    const id = rawId.trim()
    if (id === "" || seen.has(id)) continue
    seen.add(id)

    const meta = lookupModelMeta(id, index, aliases)
    const input = (meta.input ?? []).filter(
      (value): value is Sub2apiInputType => value === "text" || value === "image",
    )

    defs.push({
      id,
      name: meta.name.trim() || id,
      reasoning: meta.reasoning,
      input: input.length > 0 ? input : ["text"],
      contextWindow: meta.contextWindow > 0 ? meta.contextWindow : DEFAULT_CONTEXT_WINDOW,
      maxTokens: meta.maxTokens > 0 ? meta.maxTokens : DEFAULT_MAX_TOKENS,
    })
  }
  return defs
}
