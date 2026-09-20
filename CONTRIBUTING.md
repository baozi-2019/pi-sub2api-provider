# Contributing

## 环境

- Node ≥ 24（宿主 pi 运行时），本地验证用 `npm install` 安装 devDependencies（tsx/tsc/prettier/@types/node）。
- `@earendil-works/pi-ai` 与 `@earendil-works/pi-coding-agent` 不本地安装，由宿主提供。

## 验证

```bash
npm install
npm run typecheck   # 覆盖 index/src/tests/types
npm test            # typecheck + 各单测
npm run format:check
```

## 代码约定

- `index.ts`：唯一允许 import peer 包的胶水层（createProvider/auth/fetchModels/命令注册），靠 `types/peer-shims.d.ts` 窄化声明后纳入 typecheck。
- `src/`：纯逻辑，零 peer 依赖；纯函数优先，便于测试。
- 测试用 `node:test` + `node:assert/strict`，从 `../src/xxx.ts` 相对导入；不依赖网络（fetch 用可注入的 `fetchImpl` stub）。

## 提交信息

Conventional Commits：`feat:` / `fix:` / `docs:` / `chore:` / `test:` / `refactor:`。

## 安全红线

- 不得把真实 URL/Key 写进文档、测试或提交信息。
- Key 只允许经 pi `auth.json` 管理，代码中不落盘、不打日志、不回显。
