/**
 * Sub2API provider for pi.
 *
 * Connects a self-hosted Sub2API instance: the user sets the base URL with
 * /sub2api-setup, enters the API key through /login sub2api (masked prompt,
 * persisted by pi in auth.json), and the provider imports the models visible
 * to that key via GET /v1/models, enriched with models.dev metadata.
 *
 * This entry file holds every import of the host-bundled peer packages; the
 * peers are absent locally, so their surface is narrowed by
 * types/peer-shims.d.ts. src/ stays peer-free.
 */

import { createProvider, openAICompletionsApi, type Sub2apiModel } from "@earendil-works/pi-ai"
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { join } from "node:path"

import { loadConfig, normalizeBaseUrl, redactDiagnosticText, saveConfig } from "./src/config.ts"
import { fetchSub2apiModelIds } from "./src/sub2api-models.ts"
import { loadModelsDevIndex } from "./src/models-dev.ts"
import { toSub2apiModelDefs } from "./src/catalog.ts"
import { formatSub2apiStatus, refreshNotification } from "./src/commands.ts"

const PROVIDER_ID = "sub2api"
const PROVIDER_NAME = "Sub2API"
const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export default function (pi: ExtensionAPI): void {
  const configPath = join(getAgentDir(), "sub2api-config.json")
  const modelsDevCachePath = join(getAgentDir(), "sub2api-models-dev.json")

  let baseUrl: string | undefined = loadConfig({ configPath })?.baseUrl
  let lastSuccess: number | undefined
  let lastError: string | undefined

  function buildProvider(base: string | undefined) {
    return createProvider({
      id: PROVIDER_ID,
      name: PROVIDER_NAME,
      baseUrl: base,
      auth: {
        apiKey: {
          name: "Sub2API API Key",
          async login(interaction) {
            const key = await interaction.prompt({
              type: "secret",
              message: "Sub2API API key (sk-...)",
            })
            return { type: "api_key", key }
          },
          async resolve({ credential, ctx }) {
            const key = credential?.key ?? (await ctx.env("SUB2API_API_KEY"))
            return key ? { auth: { apiKey: key }, source: "Sub2API API key" } : undefined
          },
        },
      },
      models: [],
      async fetchModels(ctx) {
        const key = ctx.credential?.type === "api_key" ? ctx.credential.key : undefined
        if (!key) return ctx.stored?.models ?? []
        if (!ctx.allowNetwork) return ctx.stored?.models ?? []
        if (!base) return ctx.stored?.models ?? []

        const ids = await fetchSub2apiModelIds({ baseUrl: base, apiKey: key, signal: ctx.signal })
        if (ids.length === 0) {
          throw new Error("sub2api /v1/models returned an empty model list")
        }

        const { index } = await loadModelsDevIndex({
          cachePath: modelsDevCachePath,
          force: ctx.force === true,
          signal: ctx.signal,
        })
        const defs = toSub2apiModelDefs(ids, index)
        const models = defs.map(
          (def) =>
            ({
              id: def.id,
              name: def.name,
              api: "openai-completions",
              provider: PROVIDER_ID,
              baseUrl: base,
              reasoning: def.reasoning,
              input: def.input,
              cost: ZERO_COST,
              contextWindow: def.contextWindow,
              maxTokens: def.maxTokens,
            }) satisfies Sub2apiModel,
        )
        lastSuccess = Date.now()
        lastError = undefined
        return models
      },
      api: openAICompletionsApi(),
    })
  }

  function registerCurrentProvider(): void {
    // Always register (baseUrl may be unset) so `sub2api` shows up in /login and
    // the API key can be entered before the URL is configured.
    pi.registerProvider(buildProvider(baseUrl))
  }

  registerCurrentProvider()

  pi.registerCommand("sub2api-setup", {
    description: "Set the Sub2API base URL",
    async handler(args, ctx) {
      await ctx.waitForIdle()
      const input =
        args.trim() === ""
          ? ((await ctx.ui.input("Sub2API base URL:", "http://127.0.0.1:8080")) ?? "")
          : args
      const normalized = normalizeBaseUrl(input)
      if (!normalized) {
        ctx.ui.notify("Invalid Sub2API URL. Provide an http(s) URL.", "error")
        return
      }

      saveConfig(configPath, { baseUrl: normalized })
      baseUrl = normalized
      pi.registerProvider(buildProvider(normalized))

      const result = await ctx.modelRegistry.refresh({ providers: [PROVIDER_ID], force: true })
      const error = result.errors.get(PROVIDER_ID)
      if (result.aborted || error) {
        lastError = error ? redactDiagnosticText(error.message) : "aborted"
        ctx.ui.notify(`Sub2API URL saved; model refresh failed: ${lastError}`, "warning")
      } else {
        const count = ctx.modelRegistry.getProvider(PROVIDER_ID)?.getModels().length ?? 0
        ctx.ui.notify(
          `Sub2API configured at ${redactDiagnosticText(normalized)} (${count} models).`,
          "info",
        )
      }
    },
  })

  pi.registerCommand("sub2api-refresh", {
    description: "Refresh the Sub2API model list",
    async handler(_args, ctx) {
      await ctx.waitForIdle()
      if (!baseUrl) {
        ctx.ui.notify("Sub2API is not configured. Run /sub2api-setup <url> first.", "warning")
        return
      }

      const result = await ctx.modelRegistry.refresh({ providers: [PROVIDER_ID], force: true })
      const error = result.errors.get(PROVIDER_ID)
      if (result.aborted || error) {
        lastError = error ? redactDiagnosticText(error.message) : "aborted"
        ctx.ui.notify(
          refreshNotification({ ok: false, modelCount: 0, message: lastError }).text,
          "error",
        )
        return
      }

      const count = ctx.modelRegistry.getProvider(PROVIDER_ID)?.getModels().length ?? 0
      lastSuccess = Date.now()
      lastError = undefined
      ctx.ui.notify(refreshNotification({ ok: true, modelCount: count }).text, "info")
    },
  })

  pi.registerCommand("sub2api-status", {
    description: "Show Sub2API provider status (redacted)",
    async handler(_args, ctx) {
      const key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID)
      const count = ctx.modelRegistry.getProvider(PROVIDER_ID)?.getModels().length ?? 0
      const text = formatSub2apiStatus({
        baseUrl: baseUrl ? redactDiagnosticText(baseUrl) : "",
        hasKey: key !== undefined,
        modelCount: count,
        lastSuccess,
        lastError,
      })
      ctx.ui.notify(text, lastError ? "warning" : "info")
    },
  })

  pi.on("session_start", (_event, ctx) => {
    if (!baseUrl) return
    void ctx.modelRegistry
      .getApiKeyForProvider(PROVIDER_ID)
      .then((hasKey) => {
        if (!hasKey) return
        return ctx.modelRegistry.refresh({ providers: [PROVIDER_ID] }).catch((error: unknown) => {
          lastError = redactDiagnosticText(error instanceof Error ? error.message : String(error))
        })
      })
      .catch((error: unknown) => {
        lastError = redactDiagnosticText(error instanceof Error ? error.message : String(error))
      })
  })
}
