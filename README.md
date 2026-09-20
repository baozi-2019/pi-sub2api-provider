# pi-sub2api-provider

一个 pi 扩展：连接自托管的 [Sub2API](https://github.com/Wei-Shaw/sub2api) 实例，填写 URL、用掩码录入 API Key，自动把该 Key 分组可见的模型导入为 pi 的 `sub2api` provider。

模型能力元数据（context window / max tokens / 推理 / 输入模态）来自 [models.dev](https://models.dev/api.json) 快照补全；未命中的模型用默认值兜底。

## 安装

用 pi 的包管理命令安装（git 源，主分支 `dev`）：

```bash
pi install git:github.com/baozi-2019/pi-sub2api-provider@dev
```

其它来源等价写法：

```bash
# SSH 源（按 ~/.ssh/config 自动选密钥）
pi install git:git@github.com:baozi-2019/pi-sub2api-provider@dev
# 本地源码路径
pi install /absolute/path/to/pi-sub2api-provider
# 仅本次运行试用，不写入配置
pi -e git:github.com/baozi-2019/pi-sub2api-provider@dev
```

`package.json` 已声明 `"pi": { "extensions": ["./index.ts"] }`，安装后下次启动 pi 即自动加载。核心包是 optional peerDependencies，运行时由宿主 pi 提供，扩展侧无需安装。

查看 / 卸载 / 更新：

```bash
pi list                                            # 查看已安装包
pi remove git:github.com/baozi-2019/pi-sub2api-provider
pi update --extensions                             # 更新扩展并核对锁定的 ref
```

> `@dev` 是当前主分支；正式发版打 tag 后建议把 ref 改成对应 tag（如 `@v0.1.0`）以固定版本。

## 使用

只需**一次登录**：`/login sub2api` 会依次询问 **base URL** 与 **API Key**，两者一起存入 pi 的 `auth.json`（Key 作为凭证、URL 存在凭证的 env 里）。

```text
/login sub2api     # 录入 Sub2API 地址 + API Key（一次完成）
/sub2api-refresh   # 重新拉取 /v1/models + models.dev，热更新
/sub2api-status    # 查看脱敏状态（URL / Key / 模型数 / 最近错误）
```

也支持环境变量（免交互，适合 CI 或终端环境）：`SUB2API_BASE_URL` + `SUB2API_API_KEY`。

> ⚠️ pi TUI 的 `/login` 输入框**不做掩码**（登录 Input 组件没有 password 模式），Key 会明文显示；介意时可用 `SUB2API_API_KEY` 环境变量代替。

## 实现说明

- 动态模型目录走 pi 原生 `createProvider({ fetchModels })`，刷新由 `ctx.modelRegistry.refresh({ providers: ["sub2api"], force: true })` 触发。
- **URL 与 Key 绑定在同一个凭证**：`/login sub2api` 用 `interaction.prompt` 依次取 URL（`text`）与 Key（`secret`），返回 `{ type: "api_key", key, env: { SUB2API_BASE_URL } }`；`resolve()` 把 URL 作为 `auth.baseUrl` 返回，pi 每个请求都用它覆盖 `model.baseUrl`（`applyAuth`），因此改 URL 只需重新 `/login`。
- 插件不再有独立配置文件；`/sub2api-status` 通过 `modelRegistry.getProviderAuth("sub2api")` 读取脱敏后的 URL 与 Key 状态。
- 入口 `index.ts` 持有全部 peer 包 import（从 `@earendil-works/pi-ai` **根路径**导入，运行时被 alias 到 compat 入口），其用到的主机导出由 `types/peer-shims.d.ts` 窄化声明，因此也纳入本地 typecheck；`src/` 为纯逻辑。

## 已知限制

- URL 与凭证绑定：改地址需要重新 `/login sub2api`（或设置 `SUB2API_BASE_URL` 环境变量覆盖）。
- sub2api `/v1/models` 只返回模型 ID，能力元数据依赖 models.dev 快照；聚合商条目（如 `deepseek-chat`、`grok-4`、`kimi-k2.5`）可能与官方口径有偏差，必要时在 `src/models-dev.ts` 的 `aliases` 里人工覆盖。
- 图像/音频生成类模型（models.dev 中 `limit.context`/`limit.output` 为 0）无法从快照区分，会以文本模型默认值兜底进入目录。
