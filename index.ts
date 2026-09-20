/**
 * Sub2API provider for pi.
 *
 * Connects a self-hosted Sub2API instance with a single login: `/login sub2api`
 * prompts for the base URL and the API key, and pi persists both in auth.json
 * (key as the credential, URL in the credential's provider-scoped env bag).
 * The provider then imports the models visible to that key via
 * `GET /v1/models`, enriched with models.dev metadata.
 *
 * This entry file holds every import of the host-bundled peer packages; the
 * peers are absent locally, so their surface is narrowed by
 * types/peer-shims.d.ts. src/ stays peer-free.
 */

import { createProvider, openAICompletionsApi, type Sub2apiModel } from "@earendil-works/pi-ai"
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { join } from "node:path"

import {
  baseUrlFromEnv,
  normalizeBaseUrl,
  redactDiagnosticText,
  SUB2API_BASE_URL_ENV,
} from "./src/config.ts"
import { fetchSub2apiModelIds } from "./src/sub2api-models.ts"
import { loadModelsDevIndex } from "./src/models-dev.ts"
import { toSub2apiModelDefs } from "./src/catalog.ts"
import { formatSub2apiStatus, refreshNotification } from "./src/commands.ts"

const PROVIDER_ID = "sub2api"
const PROVIDER_NAME = "Sub2API"
const API_KEY_ENV = "SUB2API_API_KEY"
const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export default function (pi: ExtensionAPI): void {
  const modelsDevCachePath = join(getAgentDir(), "sub2api-models-dev.json")

  let lastSuccess: number | undefined
  let lastError: string | undefined

  /**
   * The base URL lives inside the credential (`env.SUB2API_BASE_URL`) so URL and
   * key are entered and changed together via `/login sub2api`. `resolve()` returns
   * it as `auth.baseUrl`, which pi applies to every request (models.js `applyAuth`
   * overrides the model baseUrl), so a URL change takes effect without re-fetching.
   */
  function buildProvider() {
    return createProvider({
      id: PROVIDER_ID,
      name: PROVIDER_NAME,
      auth: {
        apiKey: {
          name: "Sub2API",
          async login(interaction) {
            const urlInput = await interaction.prompt({
              type: "text",
              message: "Sub2API base URL",
              placeholder: "http://127.0.0.1:8080",
            })
            const baseUrl = normalizeBaseUrl(urlInput)
            if (!baseUrl) {
              throw new Error(
                "Invalid Sub2API base URL: use an http(s) URL without credentials, query or fragment.",
              )
            }

            const key = (
              await interaction.prompt({
                type: "secret",
                message: "Sub2API API key (sk-...)",
              })
            ).trim()
            if (!key) throw new Error("Sub2API API key must not be empty")

            return { type: "api_key", key, env: { [SUB2API_BASE_URL_ENV]: baseUrl } }
          },
          async resolve({ credential, ctx }) {
            const key = credential?.key ?? (await ctx.env(API_KEY_ENV))
            const baseUrl =
              baseUrlFromEnv(credential?.env) ||
              normalizeBaseUrl((await ctx.env(SUB2API_BASE_URL_ENV)) ?? "")
            if (!key || !baseUrl) return undefined
            return {
              auth: { apiKey: key, baseUrl },
              env: { [SUB2API_BASE_URL_ENV]: baseUrl },
              source: "Sub2API login",
            }
          },
        },
      },
      models: [],
      async fetchModels(ctx) {
        const credential = ctx.credential?.type === "api_key" ? ctx.credential : undefined
        const key = credential?.key
        const baseUrl = baseUrlFromEnv(credential?.env)
        if (!key || !baseUrl || !ctx.allowNetwork) return ctx.stored?.models ?? []

        const ids = await fetchSub2apiModelIds({ baseUrl, apiKey: key, signal: ctx.signal })
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
              baseUrl,
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

  // Register unconditionally so `sub2api` is discoverable in /login (and so the
  // session_start auto-refresh has a provider to target) before the first login.
  pi.registerProvider(buildProvider())

  pi.registerCommand("sub2api-refresh", {
    description: "Refresh the Sub2API model list",
    async handler(_args, ctx) {
      await ctx.waitForIdle()
      const auth = await ctx.modelRegistry.getProviderAuth(PROVIDER_ID)
      if (!auth) {
        ctx.ui.notify("Sub2API is not configured. Run /login sub2api first.", "warning")
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
      const auth = await ctx.modelRegistry.getProviderAuth(PROVIDER_ID)
      const count = ctx.modelRegistry.getProvider(PROVIDER_ID)?.getModels().length ?? 0
      const baseUrl = auth?.auth.baseUrl
      const text = formatSub2apiStatus({
        baseUrl: baseUrl ? redactDiagnosticText(baseUrl) : "",
        hasKey: auth?.auth.apiKey !== undefined,
        modelCount: count,
        lastSuccess,
        lastError,
      })
      ctx.ui.notify(text, lastError ? "warning" : "info")
    },
  })

  pi.on("session_start", (_event, ctx) => {
    void ctx.modelRegistry
      .getProviderAuth(PROVIDER_ID)
      .then((auth) => {
        if (!auth) return
        return ctx.modelRegistry.refresh({ providers: [PROVIDER_ID] }).catch((error: unknown) => {
          lastError = redactDiagnosticText(error instanceof Error ? error.message : String(error))
        })
      })
      .catch((error: unknown) => {
        lastError = redactDiagnosticText(error instanceof Error ? error.message : String(error))
      })
  })
}