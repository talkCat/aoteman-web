# aoteman-web 项目约定

> 本文件是 **aoteman-web** 前端仓库的协作约定。凡涉及 Git 提交、推送、合并、凭证管理之前，**必须先读本文件**。

---

## Git 管理准则：统一使用 GitHub CLI（gh）

### 1. 认证（一次性配置）

用 GitHub CLI 登录，**不要**把 token 写进 remote URL 或 `.git/config`，也**不要**复用后端 `aoteman-agent` 的 PAT：

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh auth status
```

- 登录默认申请 `repo` 权限，覆盖本仓库（public）及名下私有仓库的读写。
- `gh auth setup-git` 会让 `git pull / push` 自动复用 gh 凭据，无需再手动粘贴 token。

### 2. 日常操作

```powershell
git pull
git add -A
git commit -m "标题：一句话说明改了什么"   # 描述用中文
git push                                # 凭据自动注入，无需 token
```

快捷操作：

```powershell
gh repo view talkCat/aoteman-web
gh pr create --title "..." --body "..."
gh pr status
```

### 3. 安全红线

- 禁止把 token 写进 remote URL（形如 `https://TOKEN@github.com/...`）。
- 禁止提交 `.env(.local)`、`key.txt`、日志、`node_modules/`、`.next/` 等敏感或生成物（`.gitignore` 已覆盖，提交前用 `git status` 复核）。
- 若 token 曾被写进 URL 或命令历史，视为已泄露，去 GitHub 后台撤销重建。

### 4. 提交前自检

```powershell
git remote -v   # 应为 https://github.com/talkCat/aoteman-web.git，不含 token
git status      # 无 .env(.local) / key.txt / node_modules / .next
```
