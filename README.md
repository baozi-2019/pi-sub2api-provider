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

```text
/sub2api-setup http://127.0.0.1:8080   # 设置 Sub2API 地址（只存 URL）
/login sub2api                          # 掩码录入 API Key（pi 存 auth.json）
/sub2api-refresh                        # 重新拉取 /v1/models + models.dev，热更新
/sub2api-status                         # 查看脱敏状态
```

也支持环境变量：`SUB2API_BASE_URL`（覆盖配置文件的 URL）、`SUB2API_API_KEY`（`/login` 之外的 Key 回退）。

## 实现说明

- 动态模型目录走 pi 原生 `createProvider({ fetchModels })`，刷新由 `ctx.modelRegistry.refresh({ providers: ["sub2api"], force: true })` 触发。
- Key 存 pi `auth.json`（`/login sub2api` 掩码录入），插件文件不存 Key。
- 入口 `index.ts` 持有全部 peer 包 import，其用到的主机导出由 `types/peer-shims.d.ts` 窄化声明，因此也纳入本地 typecheck；`src/` 为纯逻辑。

## 已知限制

- sub2api `/v1/models` 只返回模型 ID，能力元数据依赖 models.dev 快照；聚合商条目（如 `deepseek-chat`、`grok-4`、`kimi-k2.5`）可能与官方口径有偏差，必要时在 `src/models-dev.ts` 的 `aliases` 里人工覆盖。
- 图像/音频生成类模型（models.dev 中 `limit.context`/`limit.output` 为 0）无法从快照区分，会以文本模型默认值兜底进入目录。
