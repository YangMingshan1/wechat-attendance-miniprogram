# 推送到 GitHub 操作清单

本地仓库已经准备就绪（分支 `main`，含 2 个提交，工作区干净）。请按下面步骤操作即可完成交付物第 4 项。

---

## 一、确认本地仓库状态

```powershell
cd "C:\Users\杨明山\Desktop\Task11"
git log --oneline
git status
```

预期看到：

```
3c661be chore: 增加 WXML 静态校验脚本并在 README 中补充验证命令
f6d6cb6 feat: 微信小程序定位签到系统（完整交付）
```

以及 `nothing to commit, working tree clean`。

> 建议的仓库名：`wechat-attendance-miniprogram`

---

## 二、在 GitHub 上创建空仓库

打开 <https://github.com/new>：

| 选项 | 填写 |
|---|---|
| Repository name | `wechat-attendance-miniprogram` |
| Description | 微信小程序定位签到系统（管理员+学生双角色，微信云开发） |
| 可见性 | Public（**作业提交必须是公开仓库，否则老师打不开**） |
| Initialize this repository with | **全部不要勾选**（不要 README、不要 .gitignore、不要 License） |

> 如果勾选了 README 或 .gitignore，GitHub 会先产生一个提交，本地推送时会报
> `Updates were rejected because the remote contains work that you do not have locally`。
> 那时需要先 `git pull --rebase origin main` 再推。所以**最省事的做法是全部不勾**。

---

## 三、关联远程仓库并推送

把下面的 `YangMingshan1` 换成你的 GitHub 用户名：

```powershell
cd "C:\Users\杨明山\Desktop\Task11"

git remote add origin https://github.com/YangMingshan1/wechat-attendance-miniprogram.git
git branch -M main
git push -u origin main
```

推送时会弹出浏览器窗口让你登录 GitHub 授权（Git Credential Manager），按提示完成即可。

### 如果 push 报错

| 报错 | 原因 | 解决 |
|---|---|---|
| `remote: Repository not found` | 仓库名或用户名拼错，或仓库没建 | 回到第二步核对 |
| `Updates were rejected... remote contains work` | 建仓库时勾选了 README/.gitignore | `git pull --rebase origin main` 然后重新 `git push` |
| `Permission denied (publickey)` | 走的是 SSH 但公钥没配 | 改用上面的 HTTPS 地址，或把 `~/.ssh/id_ed25519.pub` 加到 GitHub → Settings → SSH keys |
| `Authentication failed` | 密码认证已被 GitHub 停用 | 用浏览器授权，或改用 Personal Access Token 作为密码 |
| `src refspec main does not match any` | 不在仓库目录或分支名不对 | `git branch` 确认分支是 `main` |

---

## 四、推送后验证（很重要，别跳过）

1. **用浏览器无痕窗口**打开仓库地址：

   ```
   https://github.com/YangMingshan1/wechat-attendance-miniprogram
   ```

   无痕窗口能打开，才说明**未登录的人也能访问**，老师才看得到。

2. **逐项核对文件是否都在**：

   | 检查项 | 位置 |
   |---|---|
   | ER 图（GitHub 可直接渲染） | `docs/er-diagram.md` |
   | ER 图（静态图） | `docs/er-diagram.svg` |
   | 数据库设计 | `docs/database-design.md` |
   | 设计决策说明 | `docs/design-decisions.md` |
   | 测试用例与结果 | `docs/test-cases.md` |
   | 交互原型 | `prototypes/screens.html`、`prototypes/screens.png` |
   | 流转逻辑 | `prototypes/flow.md` |
   | 源码 | `miniprogram/`、`cloudfunctions/` |
   | 部署说明 | `README.md` |

3. **点开 `docs/er-diagram.md`**，确认 GitHub 把 Mermaid 代码块渲染成了图形（不是一堆代码）。如果显示为代码，说明 Mermaid 语法有问题 —— 但本项目已用 Mermaid CLI 渲染验证过，应能正常显示。

4. **确认没有提交依赖目录**：仓库里**不应该**出现 `node_modules`。

---

## 五、提交作业时填写的仓库地址

```
https://github.com/YangMingshan1/wechat-attendance-miniprogram
```

---

## 六、后续如有修改

```powershell
cd "C:\Users\杨明山\Desktop\Task11"
git add -A
git commit -m "docs: 补充 xx 说明"
git push
```

如果修改了 `cloudfunctions/_common/` 下的公共模块，记得先同步再提交：

```powershell
node scripts/sync-common.js
```

---

## 附：推送前后建议跑一遍的验证命令

```powershell
cd "C:\Users\杨明山\Desktop\Task11"

# 核心算法与逻辑（42 项断言）
node scripts/test-core.js

# WXML 标签配对与数据绑定
node scripts/check-wxml.js
```
