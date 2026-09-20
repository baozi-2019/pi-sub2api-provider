# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循语义化版本。

## [Unreleased]

### Added

- `sub2api` provider 扩展：`/sub2api-setup` 填 URL、`/login sub2api` 掩码录入 Key、`/sub2api-refresh` 刷新、`/sub2api-status` 状态。
- `fetchModels` 动态拉取 `/v1/models` 并用 models.dev 快照补全能力元数据。
- URL 归一化、脱敏、`/v1/models` 解析、models.dev 扁平化与匹配、catalog 映射的单元测试。
