# 交互原型说明

本目录包含定位签到系统的交互原型，交付形式为**可交互的 HTML 线框原型**，浏览器直接打开即可查看，无需安装任何环境。

## 文件清单

| 文件 | 说明 |
|---|---|
| `screens.html` | **主交付物**。12 屏高保真线框界面 + 页面跳转流转逻辑说明 |
| `screens.png` | `screens.html` 的静态截图（全页），便于插入文档或报告 |
| `flow.md` | 页面跳转流转逻辑的 Markdown 版（含 Mermaid 流程图） |

## 如何查看

**方式一（推荐）**：直接双击 `screens.html`，用 Chrome / Edge 打开。

**方式二**：命令行启动一个本地服务后访问，避免个别浏览器对本地文件的限制：

```bash
# 在项目根目录执行
npx serve .
# 然后访问 http://localhost:3000/prototypes/screens.html
```

**方式三**：直接看 `screens.png` 静态图。

页面顶部工具条提供：缩放滑块、阈值联动输入框（修改后 P05 表单与 P13 提示中的"允许范围"数值会同步变化，可用于演示阈值可配置）。

## 界面清单（12 屏）

### 流程一 · 入口与身份选择

| 屏号 | 界面 | 页面路径 |
|---|---|---|
| P01 | 首页 · 身份选择 | `pages/index/index` |

### 流程二 · 管理员端

| 屏号 | 界面 | 页面路径 |
|---|---|---|
| P02 | 管理员授权登录 | `pages/admin/login/login` |
| P03 | 管理员工作台 | `pages/admin/home/home` |
| P04 | 课程列表 | `pages/admin/course/list/list` |
| P05 | 新增 / 编辑课程（含地图选点） | `pages/admin/course/edit/edit` |
| P06 | 学生名单（含 Excel 导入入口） | `pages/admin/student/list/list` |
| P07 | 签到记录列表（含导出入口） | `pages/admin/record/list/list` |
| P08 | 修改签到记录 | `pages/admin/record/edit/edit` |

### 流程三 · 学生端

| 屏号 | 界面 | 页面路径 |
|---|---|---|
| P09 | 学生登录（学号 + 姓名） | `pages/student/login/login` |
| P10 | 学生首页 · 课程选择 | `pages/student/home/home` |
| P11 | 签到页 · 定位中 | `pages/student/signin/signin` |
| P12 | 签到成功 | `pages/student/signin/result` |
| P13 | 签到页 · 超出范围（阻断态） | `pages/student/signin/signin` |
| P14 | 签到页 · 已签到拦截（阻断态） | `pages/student/signin/signin` |

> P11、P13、P14 是同一个页面的三种状态，P12 是独立的成功结果页。原型中分屏展示是为了把每个分支都画清楚。

## 设计说明

### 状态覆盖

原型不只画正常流程，还覆盖了必要的异常与边界状态：

- **定位中 / 定位失败**（P11）
- **超出距离阈值**（P13）——任务书要求的核心阻断逻辑
- **已签到拦截**（P14）——任务书"无例外"约束的界面体现
- **空状态**：无启用课程、名单为空、无签到记录
- **权限拒绝**：拒绝定位授权后引导 `wx.openSetting`
- **二次确认**：删除课程 / 学生 / 记录、退出登录

### 与数据结构的一致性

原型中出现的每一个数据字段，都能在 [`../docs/database-design.md`](../docs/database-design.md) 中找到对应定义：

| 原型中展示 | 字段来源 |
|---|---|
| 课程名称、任课教师 | `courses.name`、`courses.teacher` |
| 签到地点 | `courses.locationName` |
| 阈值（50 米 / 80 米） | `courses.radius` |
| 启用 / 停用 | `courses.status` |
| 班级、姓名、学号 | `users.className`、`users.name`、`users.sno` |
| 距离 | `records.distance`（云端计算） |
| 签到时间 | `records.signTime` |
| 设备 ID | `records.deviceId` |

### 刻意不出现的元素

为严格贴合任务书"边界约束"一节，原型界面中**不存在**以下元素：

- 签到开始 / 结束时间设置项
- 迟到 / 缺勤 / 正常的状态标签
- 多点位配置（地图上只有一个点位标记）
- 消息通知 / 订阅消息授权入口
- 操作日志 / 审计日志界面
- 密码输入框（学生登录无密码）
- 学生与微信账号绑定的入口

## 跳转流转逻辑

完整的页面跳转流转图、逐屏跳转规则表、云端返回码与界面映射，见：

- 本文档同目录 [`flow.md`](./flow.md)
- 或 `screens.html` 页面底部「页面跳转流转逻辑」章节

## 说明：原型与最终实现的差异

原型绘制于编码之前，用于确认需求理解。实现过程中若发现个别交互细节需要调整，以代码为准并会在提交说明中标注。核心流程、页面数量与字段设计与原型保持一致。
