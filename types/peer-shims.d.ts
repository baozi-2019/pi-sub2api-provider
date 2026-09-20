/**
 * Ambient shims for the host-bundled optional peerDependencies, which this repo
 * does not install locally (enforced by tests/test-package-manifest.ts). Keep
 * this file a global script so `declare module` stays an ambient declaration,
 * not an augmentation. Signatures are narrowed to exactly the surface
 * `index.ts` uses; resync the used face from the host d.ts on pi upgrade.
 *
 * Host snapshot: @earendil-works/pi-coding-agent 0.86.0 (bundles
 * @earendil-works/pi-ai 0.86.0).
 */

declare module "@earendil-works/pi-ai" {
  export type Sub2apiInputType = "text" | "image"

  export interface ModelCost {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }

  /** Full `Model<"openai-completions">` view required by `createProvider`. */
  export interface Sub2apiModel {
    id: string
    name: string
    api: "openai-completions"
    provider: string
    baseUrl: string
    reasoning: boolean
    input: Sub2apiInputType[]
    cost: ModelCost
    contextWindow: number
    maxTokens: number
  }

  export interface AssistantMessageEventStream {
    [Symbol.asyncIterator](): AsyncIterator<unknown>
  }

  export interface ProviderStreams {
    stream(...args: unknown[]): AssistantMessageEventStream
    streamSimple(...args: unknown[]): AssistantMessageEventStream
  }

  export interface ApiKeyCredential {
    type: "api_key"
    key?: string
  }

  export interface AuthResult {
    auth: { apiKey?: string }
    source?: string
  }

  export interface ProviderAuthInteraction {
    signal: AbortSignal
    prompt(prompt: { type: "secret"; message: string; placeholder?: string }): Promise<string>
  }

  export interface StoredModelsEntry {
    models: readonly Sub2apiModel[]
  }

  export interface RefreshModelsContext {
    credential?: ApiKeyCredential
    stored?: Readonly<StoredModelsEntry>
    publish(publication: { persist?: StoredModelsEntry | null }): Promise<boolean>
    allowNetwork: boolean
    force?: boolean
    signal: AbortSignal
  }

  export interface ApiKeyAuth {
    name: string
    login?(interaction: ProviderAuthInteraction): Promise<ApiKeyCredential>
    resolve(input: {
      ctx: { env(name: string): Promise<string | undefined> }
      credential?: ApiKeyCredential
      signal: AbortSignal
    }): Promise<AuthResult | undefined>
  }

  export interface CreateProviderOptions {
    id: string
    name?: string
    baseUrl?: string
    auth: { apiKey?: ApiKeyAuth }
    models: readonly Sub2apiModel[]
    fetchModels?: (context: RefreshModelsContext) => Promise<readonly Sub2apiModel[]>
    api: ProviderStreams
  }

  export interface Provider {
    getModels(): readonly Sub2apiModel[]
  }

  export function createProvider(input: CreateProviderOptions): Provider
}

declare module "@earendil-works/pi-ai/api/openai-completions.lazy" {
  type ProviderStreams = import("@earendil-works/pi-ai").ProviderStreams
  export function openAICompletionsApi(): ProviderStreams
}

declare module "@earendil-works/pi-coding-agent" {
  export function getAgentDir(): string

  export interface Sub2apiCommandContext {
    ui: {
      input(title: string, placeholder?: string): Promise<string | undefined>
      notify(message: string, type?: "info" | "warning" | "error"): void
    }
    waitForIdle(): Promise<void>
    modelRegistry: {
      refresh(options: {
        providers: readonly string[]
        force?: boolean
      }): Promise<{ aborted: boolean; errors: ReadonlyMap<string, Error> }>
      getProvider(id: string): { getModels(): readonly unknown[] } | undefined
      getApiKeyForProvider(provider: string): Promise<string | undefined>
    }
  }

  export interface ExtensionAPI {
    registerProvider(provider: unknown): void
    registerCommand(
      name: string,
      options: {
        description?: string
        handler(args: string, ctx: Sub2apiCommandContext): Promise<void> | void
      },
    ): void
    on(
      event: "session_start",
      handler: (event: unknown, ctx: Sub2apiCommandContext) => void | Promise<void>,
    ): void
  }
}
