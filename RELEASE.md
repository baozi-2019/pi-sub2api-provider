# Release

## 发布前

```bash
npm run typecheck
npm test
npm run format:check
```

## 流程

1. 在 `dev` 分支确定版本（`package.json` 与 `CHANGELOG.md`）。
2. 打 tag：`git tag vX.Y.Z`。
3. 发布 npm（可选）：`npm publish`。

未经明确授权不执行 `git push`/`git tag`/`npm publish`。
