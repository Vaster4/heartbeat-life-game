# Git 提交规范

## Commit Message 格式

```
<type>(<scope>): <描述>

Change-Id: I<40位随机hex>
```

## Type 前缀

- `feat:` 新功能（feature 用 `(feature#NNN)` 标注 scope）
- `fix:` 修复 bug
- `chore:` 杂项维护
- `docs:` 文档变更
- `ci:` CI/CD 配置变更

## Change-Id

每次提交必须在 commit message 末尾附带 `Change-Id`，格式为 Gerrit 风格：

```
Change-Id: I<40位hex字符串>
```

示例：`Change-Id: Ia1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0`

每次提交生成一个唯一的随机 ID。

## Signed-off-by

所有提交必须使用 `git commit -s` 添加 Signed-off-by 行。

## 其它规则

- 提交前必须确保所有测试通过
- feature 相关变更需要创建 `features/NNN-<名称>.md` 文档
- 提交后回填 commit hash 到相关文档
- bash shell 环境，git 命令前不需要 UTF-8 编码设置
- 终端类型为 cmd，多行 commit message 必须用多个 `-m` 参数，不要在 `-m "..."` 内换行（cmd 不支持引号内换行，会截断）
- 示例：`git commit -s -m "docs: 更新文档" -m "Change-Id: Ia1b2c3..."`

## 分支与推送规则

- `dev` 分支仅用于本地开发，**不推送到远程**
- 只有 `master` 分支可以推送到远程（`git push origin master`）
- 推送流程：在 `dev` 上开发完成后，切换到 `master` 合并 `dev`，再推送 `master`
