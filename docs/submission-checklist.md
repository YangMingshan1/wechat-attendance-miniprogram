# 提交清单 · 对照任务书逐条核对

> 依据 `Task11.md` 重新梳理。分两部分：**需要准备什么**（软硬件与账号）、**需要提交什么**（作业内容）。
> 核对时间：当前仓库状态（14 次提交、131 个跟踪文件、工作区干净）。

---

## 第一部分：需要准备的东西

### 1. 账号与环境（缺一不可）

| # | 准备项 | 说明 | 状态 |
|---|---|---|---|
| 1 | **已注册的小程序 AppID** | `wx` 开头 18 位。测试号不支持云开发 | ✅ 已具备 |
| 2 | **微信开发者工具**（稳定版） | 编译、预览、部署云函数 | ✅ 已具备 |
| 3 | **云开发环境** | 已创建，7 个云函数已部署 | ✅ 已具备 |
| 4 | **云开发数据库** | 5 个集合 + 7 个索引（含 4 个唯一索引） | ✅ 已具备 |
| 5 | **管理员账号** | `admins` 集合中有你的 openid 记录 | ✅ 已认领成功 |
| 6 | **GitHub 账号** | 用于托管仓库、提交地址 | 需确认 |

### 2. 定位相关（本次作业暂不要求）

| # | 准备项 | 状态 |
|---|---|---|
| 7 | 小程序后台申请 `wx.getLocation` / `wx.chooseLocation` | ⏸ 按你的决定，暂不申请 |
| 8 | 声明用户隐私保护指引（位置信息） | ⏸ 同上 |
| 9 | 小程序备案 | ⏸ 同上 |

> **说明**：第 7–9 项不做，只影响"真机上的实时定位"这一处。**设计类交付物（ER 图、数据库设计、交互原型）与其余全部业务逻辑都不依赖它**，已通过测试验证。

### 3. 提交前建议清理

| # | 事项 | 怎么做 |
|---|---|---|
| 10 | 云函数环境变量 | 确认 `login` / `init` 上**没有** `ADMIN_OPENIDS`（有就删掉，避免别人拿到代码后困惑） |
| 11 | 调试入口 | 目前程序里**没有**残留的调试开关，无需处理 |
| 12 | 测试数据 | 云端 `records` / `users` 里的测试记录**不用清理**——它们不在仓库里，不影响交付 |

---

## 第二部分：需要提交的东西

任务书明确列了 **4 项交付物**。逐条对照如下。

### 交付物 1 · ER 图 ✅ 已完成

| 要求 | 对应文件 |
|---|---|
| 提交 ER 图 | [`docs/er-diagram.md`](../docs/er-diagram.md)（Mermaid 源码，GitHub 可直接渲染）<br>[`docs/er-diagram.svg`](../docs/er-diagram.svg)（静态图，不装环境也能看）<br>[`docs/er-diagram.mmd`](../docs/er-diagram.mmd)（独立 Mermaid 文件） |

**内容完整性**：5 个实体（COURSES / USERS / RECORDS / ADMINS / DEVICES）、主键(PK)、外键(FK)、唯一键(UK)、关系基数（1:N、M:N 约束为 1:1）、实体识别过程、关系说明。

---

### 交付物 2 · 数据库表与字段设计 ✅ 已完成

| 要求 | 对应文件 |
|---|---|
| 根据 ER 图设计数据库表与字段 | [`docs/database-design.md`](../docs/database-design.md) |

**内容完整性**：5 张表的字段级定义（字段名/类型/必填/默认值/约束/说明）、JSON 示例、7 个索引清单、集合权限配置、初始化脚本说明、**字段 ↔ 任务书业务规则逐条对照表**。

---

### 交付物 3 · 交互原型（所有界面 + 页面跳转流转逻辑）✅ 已完成

| 要求 | 对应文件 |
|---|---|
| 所有界面 | [`prototypes/screens.html`](../prototypes/screens.html)（12 屏可交互，浏览器直接打开）<br>[`prototypes/screens.png`](../prototypes/screens.png)（静态截图） |
| 页面跳转流转逻辑 | [`prototypes/flow.md`](../prototypes/flow.md)（含 Mermaid 流程图） |

**内容完整性**：12 屏界面（首页 + 管理员端 7 屏 + 学生端 4 屏）、正常流程与阻断态（超范围、已签到、定位异常）、总体流转图、逐屏跳转规则表（含失败分支）、云端返回码映射、页面栈策略。

---

### 交付物 4 · GitHub 仓库（源码 + 文档）⬜ 待完成

| 任务书要求 | 对应内容 | 状态 |
|---|---|---|
| 源码放入仓库 | `miniprogram/`（57 文件）+ `cloudfunctions/`（47 文件） | ✅ 已提交 |
| ER 图放入仓库 | `docs/er-diagram.*` | ✅ 已提交 |
| 数据库文档放入仓库 | `docs/database-design.md` | ✅ 已提交 |
| 交互原型放入仓库 | `prototypes/` | ✅ 已提交 |
| 仓库目录结构合理 | 见下方目录树 | ✅ |
| 添加 README.md（项目介绍 + 部署方式） | [`README.md`](../README.md)（22.9 KB） | ✅ |
| **提交最终仓库地址** | — | ⬜ **还没推送到 GitHub** |

**当前仓库状态**：14 次提交、131 个跟踪文件、工作区干净、**未配置远程仓库**。

---

## 附加材料（任务书没要求，但交上去是加分项）

| 文件 | 内容 |
|---|---|
| [`docs/design-decisions.md`](../docs/design-decisions.md) | 10 项关键设计决策与取舍（设备 ID 方案、云端算距离、数据库权限、唯一索引兜底等） |
| [`docs/deployment-guide.md`](../docs/deployment-guide.md) | 8 步部署流程，含每步判断标准与报错排查表 |
| [`docs/test-cases.md`](../docs/test-cases.md) | 90 条测试用例，明确区分"已自动验证"与"待人工验证" |
| [`docs/remaining-verification.md`](../docs/remaining-verification.md) | 按 P0/P1/P2 分级的验证清单，含可粘贴的测试代码 |
| [`test-data/`](../test-data/) | 学生名单测试 Excel + 预期结果（由真实导入代码生成） |
| [`scripts/test-core.js`](../scripts/test-core.js) | 42 项核心算法断言，`node scripts/test-core.js` 可复现 |
| [`scripts/check-wxml.js`](../scripts/check-wxml.js) | WXML 标签配对与数据绑定静态校验 |
| [`PUSH-GUIDE.md`](../PUSH-GUIDE.md) | 推送操作步骤与常见报错处理 |

---

## 现在只剩一件事：推送到 GitHub

### 步骤

```powershell
cd "C:\Users\杨明山\Desktop\Task11"

# 1. 在 https://github.com/new 建空仓库（不要勾 README / .gitignore / License）
# 2. 关联并推送（把用户名换成你的）
git remote add origin https://github.com/YangMingshan1/wechat-attendance-miniprogram.git
git push -u origin main
```

详细步骤与报错处理见 [`PUSH-GUIDE.md`](../PUSH-GUIDE.md)。

### 推送后必须验证

| 检查项 | 怎么验 |
|---|---|
| **公开可访问** | 用**浏览器无痕窗口**打开仓库地址，能打开才算数 |
| ER 图能渲染 | 打开 `docs/er-diagram.md`，GitHub 应显示为图形而非代码块 |
| 原型能用 | 点 `prototypes/screens.html` → 右侧「Raw」或下载后本地打开 |
| 没有杂项 | 仓库里**不应**出现 `node_modules`、`.tools`、`.npm-cache` |
| 文件完整 | 至少包含 `docs/`、`prototypes/`、`miniprogram/`、`cloudfunctions/`、`README.md` |

### 最终提交内容（作业系统里填写的）

```
仓库地址：https://github.com/<你的用户名>/wechat-attendance-miniprogram
```

---

## 验收要点自检

对照任务书第四部分：

| # | 验收要点 | 自检结果 |
|---|---|---|
| 1 | 文档齐全：ER图、数据库表结构、交互原型完整 | ✅ 三者齐备，见交付物 1/2/3 |
| 2 | 功能满足需求，严格遵守业务约束 | ✅ 管理员 4 项 + 学生 4 项已实现并测试；边界约束逐条核对见下表 |
| 3 | GitHub 仓库可正常访问，文件完整 | ⬜ 待推送后验证 |
| 4 | 代码可运行，云开发环境配置正确 | ✅ 已在你本机跑通（登录、导入、签到逻辑、导出均验证通过） |

### 业务约束逐条核对

| 任务书约束 | 实现方式 | 状态 |
|---|---|---|
| 同一课程同设备只能签到 1 次，**无例外** | `records` 复合唯一索引 `courseId + deviceId`（并发安全） | ✅ 含并发测试 |
| 超出阈值禁止签到 | 云端 Haversine 计算裁决，客户端只上报坐标 | ✅ 已测 |
| 不支持一门课程多个签到点位 | `latitude`/`longitude` 为标量字段，结构上无法表达多点位 | ✅ |
| 不设置签到起止时间 | `courses` 表无 `startTime`/`endTime` 字段 | ✅ |
| 不区分迟到/缺勤 | `records` 表无 `status` 字段 | ✅ |
| 无消息推送 | 全局无 `requestSubscribeMessage` 调用（已搜索确认） | ✅ |
| 无操作日志 | 无独立日志集合，仅记录行内溯源字段 | ✅ |
| 学生不需要密码 | `users` 表无 `password` 字段 | ✅ |
| 学生不绑定 openid | `users` 与 `records` 表均无 openid 字段 | ✅ |

---

## 仓库目录结构（供核对）

```
.
├── README.md                    ← 项目介绍 + 部署方式（交付物 4 要求）
├── LICENSE
├── PUSH-GUIDE.md                ← 推送操作清单
├── Task11.md                    ← 原始任务书
├── project.config.json          ← 微信开发者工具项目配置
│
├── docs/                        ← 交付物 1、2
│   ├── er-diagram.md               ER 图（Mermaid）
│   ├── er-diagram.svg              ER 图（静态）
│   ├── er-diagram.mmd              ER 图（独立 Mermaid）
│   ├── database-design.md          数据库表与字段设计
│   ├── design-decisions.md         设计决策说明
│   ├── deployment-guide.md         部署指南
│   ├── test-cases.md               测试用例与结果
│   └── remaining-verification.md   剩余验证清单
│
├── prototypes/                  ← 交付物 3
│   ├── screens.html                12 屏可交互原型
│   ├── screens.png                 原型静态截图
│   ├── flow.md                     页面跳转流转逻辑
│   └── README.md                   原型说明
│
├── miniprogram/                 ← 交付物 4（小程序前端）
│   ├── app.js / app.json / app.wxss
│   ├── pages/                      12 个页面
│   └── utils/                      5 个工具模块
│
├── cloudfunctions/              ← 交付物 4（云函数后端）
│   ├── _common/                    公共模块
│   ├── init/ login/ course/ student/ record/ signIn/ export/
│
├── test-data/                   测试数据
└── scripts/                     辅助脚本
```

---

## 一句话总结

**所有要提交的东西都已经在仓库里准备好了，目录结构、README、三份核心文档、源码全部齐备。唯一没做的是把本地仓库推到 GitHub 并把地址填进作业系统。**

按照你的决定，定位接口申请、隐私声明、备案都不做——这**不影响 4 项交付物中的任何一项**，因为 ER 图、数据库设计、交互原型都是设计文档，而代码里的签到逻辑已通过直接调用云函数的方式验证过（绕过了定位 API）。
