obsidian-project: pi-sub2api-provider

# 工程协作规则

## 工程事实

- 本工程是 pi 的 Sub2API provider 扩展：连接自托管 sub2api 实例，`/login sub2api` 一次录入 base URL 与 API Key（URL 存在凭证的 `env.SUB2API_BASE_URL`），自动拉取 `/v1/models` 并注册为 `sub2api` provider，提供 `/sub2api-refresh`、`/sub2api-status` 命令。
- 运行时复用宿主 pi 打包的核心包 `@earendil-works/pi-ai` 与 `@earendil-works/pi-coding-agent`：只能以 optional peerDependencies 声明，禁止写入 `dependencies`/`devDependencies`（`tests/test-package-manifest.ts` 校验）。
- 凡 import 这两个 peer 包的代码只允许出现在入口 `index.ts`（宿主加载期解析）；`types/peer-shims.d.ts` 用 ambient `declare module` 窄化 shim 出 `index.ts` 用到的 peer 导出，使 `index.ts` 也纳入 typecheck。`src/` 必须保持零 peer 依赖，只 import 相对模块与 `node:` 内建。
- `openAIResponsesApi`（provider 请求走 OpenAI **Responses** API，\( {baseUrl}/responses \)，与 Codex `wire_api = "responses"` 一致）与 `createProvider` 都**从根包 `@earendil-works/pi-ai` 导入**（pi 运行时把扩展的根包 alias 到 compat 入口，二者均有值导出）；**禁止**导入 `@earendil-works/pi-ai/api/*` 子路径——运行时 jiti alias 只覆盖根路径、`/compat`、`/oauth`、`/providers/all`，子路径会报 Cannot find module。
- URL 与 Key 都由 pi `~/.pi/agent/auth.json` 托管（`/login sub2api` 依次录入）：Key 存 `credential.key`，URL 存 `credential.env.SUB2API_BASE_URL`；插件的 `resolve()` 把 URL 作为 `auth.baseUrl` 返回，pi 每请求用它覆盖 model.baseUrl。**插件无独立配置文件**。⚠️ pi TUI 登录输入框不掩码（`InputOptions` 无 mask）。
- models.dev 快照缓存于 `~/.pi/agent/sub2api-models-dev.json`（TTL 24h，`/sub2api-refresh` 强制刷新）。

## 开发与验证

- 改动前阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；发版流程见 [RELEASE.md](RELEASE.md)。
- 交付前至少运行 `npm run typecheck` 与 `npm test`。
- peer 包本地不安装，靠 `types/peer-shims.d.ts` 提供窄化声明；pi 升级后需按宿主 d.ts 复核 shim 面。不得为消除 peer 报错安装 peer 包或写入 dependencies。LSP「改动文件无 error 级诊断」的有效范围同 `npm run typecheck`（覆盖 index/src/tests/types）。
- 脱敏不变量：URL 仅保留 host+path，任何 `Bearer *` / `sk-*` / 形如 `key=...` 的串在下沉到 notify/日志前必须脱敏。

## 版本控制

- 主开发分支为 `dev`（远程 `origin` 待定，初始化为 git 后按需确认）。
- 未获明确授权不执行 `git commit`、`git push`、打 tag 或发布 npm。
- 提交信息遵循 Conventional Commits（见 CONTRIBUTING.md）。

## 文档

- Obsidian 工程文档由全局 AGENTS.md 第 3 节规则自动维护；工程内开发过程文档放 `.project/plans/`，不写入 Obsidian 文档区。
