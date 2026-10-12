# 数据库表与字段设计

> 依据 [`er-diagram.md`](./er-diagram.md) 中的 ER 图设计。数据库采用**微信云开发数据库**（文档型 NoSQL，类 MongoDB）。
>
> 重要提醒：部分业务约束（唯一性、去重）**不是**由应用层 if 判断保证的，而是由**数据库索引**强制。部署时**必须**按第 4 节建立索引，否则"同课程同设备仅签到 1 次"的规则在并发场景下会被破坏。

## 1. 集合总览

| # | 集合名 | 中文名 | 对应 ER 实体 | 预估数据量 | 客户端可读 | 客户端可写 |
|---|---|---|---|---|---|---|
| 1 | `courses` | 课程 | COURSES | 十~百级 | ❌ | ❌ |
| 2 | `users` | 学生名单 | USERS | 百~千级 | ❌ | ❌ |
| 3 | `records` | 签到记录 | RECORDS | 千~万级 | ❌ | ❌ |
| 4 | `admins` | 管理员 | ADMINS | 个位数 | ❌ | ❌ |
| 5 | `devices` | 设备（可选） | DEVICES | 百~千级 | ❌ | ❌ |

所有集合**均不允许客户端直连读写**，小程序端只能通过云函数访问。原因见 [`design-decisions.md` D3](./design-decisions.md#d3--数据库权限关闭客户端直连全部走云函数)。

编号章节与 ER 图实体一一对应，便于交叉核对。

---

## 2. `courses` 课程表

一个管理员可创建多门课程。每门课程包含**唯一一个**签到点位（经纬度），不支持多点位。

| 字段名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|---|---|---|---|---|---|
| `_id` | string | ✅ | 系统生成 | 主键 | 云开发自动生成，作为 `records.courseId` 的引用目标 |
| `name` | string | ✅ | — | 长度 1~50，同名课程由云函数提示但允许 | 课程名称 |
| `teacher` | string | ❌ | `""` | 长度 ≤ 20 | 任课教师，仅用于展示 |
| `locationName` | string | ❌ | `""` | 长度 ≤ 50 | 签到地点名称，如"第三教学楼 302" |
| `latitude` | number | ✅ | — | `-90 ~ 90`，浮点 | **签到点位纬度（单值）** |
| `longitude` | number | ✅ | — | `-180 ~ 180`，浮点 | **签到点位经度（单值）** |
| `radius` | number | ✅ | `50` | 整数，`1 ~ 10000` | 定位距离阈值（米）。**默认 50 米**，管理员可自定义 |
| `status` | number | ✅ | `1` | `0` 或 `1` | `1`=启用（学生端可选），`0`=停用（学生端不显示） |
| `creatorOpenid` | string | ✅ | 调用者 openid | 逻辑外键 → `admins.openid` | 创建者，由云函数从上下文注入，客户端不可伪造 |
| `createTime` | date | ✅ | 服务端当前时间 | — | 创建时间，由云函数用 `new Date()` 写入 |
| `updateTime` | date | ✅ | 服务端当前时间 | — | 最后修改时间 |

**JSON 示例**

```json
{
  "_id": "course_a1b2c3d4e5f6",
  "name": "软件工程",
  "teacher": "张老师",
  "locationName": "第三教学楼 302",
  "latitude": 30.512345,
  "longitude": 114.365432,
  "radius": 50,
  "status": 1,
  "creatorOpenid": "oXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "createTime": "2025-03-01T02:00:00.000Z",
  "updateTime": "2025-03-01T02:00:00.000Z"
}
```

**字段 ↔ 业务规则对照**

| 任务书原文 | 落点 |
|---|---|
| "为课程设置单个签到点位经纬度" | `latitude` / `longitude` 为**标量**字段，结构上无法表达多点位 |
| "自定义定位距离阈值（默认 50 米）" | `radius`，默认值 50 |
| "不支持多点位" | 无 `points` 数组字段，无关联点位表 |

---

## 3. `users` 学生名单表

由管理员通过 Excel 批量导入，作为**学生登录的凭据来源**。

| 字段名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|---|---|---|---|---|---|
| `_id` | string | ✅ | 系统生成 | 主键 | 云开发自动生成 |
| `sno` | string | ✅ | — | **唯一索引**，长度 1~30 | 学号。**同时是学生登录凭证** |
| `name` | string | ✅ | — | 长度 1~30 | 姓名。**同时是学生登录凭证** |
| `className` | string | ✅ | — | 长度 1~50 | 班级。Excel 导入的必需字段 |
| `importBatch` | string | ❌ | `""` | — | 导入批次标识（时间戳字符串），便于按批排查 |
| `createTime` | date | ✅ | 服务端当前时间 | — | 导入时间 |

**JSON 示例**

```json
{
  "_id": "user_9f8e7d6c5b4a",
  "sno": "20230101001",
  "name": "李小明",
  "className": "软件工程 2301 班",
  "importBatch": "20250301120000",
  "createTime": "2025-03-01T02:00:00.000Z"
}
```

**设计要点**

- **不存储 `openid` 字段**。任务书明确要求"学生登录不需要密码，不绑定微信 openid"，因此学生身份完全由 `sno + name` 二元组确定，与微信账号无关。
- `sno` 建唯一索引，防止 Excel 重复导入产生同一学号的多条记录，也保证登录匹配结果唯一。
- **登录匹配规则**：`sno` 与 `name` **同时**相等才允许登录（两者都做全等比较，姓名不做模糊匹配，避免同名顶替）。

---

## 4. `records` 签到记录表 ★ 核心表

记录每一次成功的签到。**不存储任何"迟到/缺勤"状态字段**（任务书边界约束）。

| 字段名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|---|---|---|---|---|---|
| `_id` | string | ✅ | 系统生成 | 主键 | 云开发自动生成 |
| `courseId` | string | ✅ | — | 逻辑外键 → `courses._id`；**参与复合唯一索引** | 签到的课程 |
| `sno` | string | ✅ | — | 逻辑外键 → `users.sno` | 学号 |
| `name` | string | ✅ | — | 长度 1~30 | **冗余快照**：签到时的学生姓名 |
| `className` | string | ✅ | — | 长度 ≤ 50 | **冗余快照**：签到时的班级 |
| `deviceId` | string | ✅ | — | **参与复合唯一索引**，长度 ≤ 64 | 设备 ID（小程序端本地持久化 UUID） |
| `deviceFingerprint` | string | ❌ | `""` | — | 硬件指纹哈希。**仅作审计展示，不参与任何准入判定** |
| `latitude` | number | ✅ | — | `-90 ~ 90` | 签到上报的纬度 |
| `longitude` | number | ✅ | — | `-180 ~ 180` | 签到上报的经度 |
| `distance` | number | ✅ | — | ≥ 0，保留 2 位小数 | **云端计算**的学生与点位距离（米）。冗余存储以便导出与事后复核 |
| `signTime` | date | ✅ | 服务端当前时间 | — | 签到时间。**仅用于记录与导出，不参与任何准入判定** |
| `operator` | string | ❌ | `""` | — | 最后修改该记录的管理员 openid（新增时为空） |
| `updateTime` | date | ❌ | `null` | — | 最后修改时间（未被修改过则为 `null`） |

**JSON 示例**

```json
{
  "_id": "record_1122334455aa",
  "courseId": "course_a1b2c3d4e5f6",
  "sno": "20230101001",
  "name": "李小明",
  "className": "软件工程 2301 班",
  "deviceId": "d9f8a7b6-1c2d-4e3f-9a8b-7c6d5e4f3a2b",
  "deviceFingerprint": "3f7a1c9e",
  "latitude": 30.512444,
  "longitude": 114.365501,
  "distance": 13.42,
  "signTime": "2025-03-01T02:15:30.000Z",
  "operator": "",
  "updateTime": null
}
```

**关键约束说明**

| 约束 | 实现方式 | 为什么必须是数据库级 |
|---|---|---|
| 同课程 + 同设备仅 1 条记录 | **复合唯一索引** `courseId + deviceId` | 见下方"并发竞态"说明 |
| 未绑定 openid | 表中**无 openid 字段** | 结构上即满足任务书要求 |
| 无迟到/缺勤 | 表中**无 status 字段** | 结构上无法产生该标记 |
| 无时间段 | 表中**无 startTime/endTime 字段**，`signTime` 不参与判定 | 结构上无时间段概念 |

**为什么必须有唯一索引（并发竞态）**

签到云函数的执行顺序是"先查是否已签到，再插入"。当同一设备的两次请求几乎同时到达时：

```
请求 A: 查询 -> 未签到 ┐
请求 B: 查询 -> 未签到 ┘  两次查询都返回"未签到"
请求 A: 插入 -> 成功
请求 B: 插入 -> 若无唯一索引，也成功  ❌ 规则被破坏，同一设备签到了 2 次
```

加了复合唯一索引后，请求 B 的插入会被数据库**原子性**地拒绝，云函数捕获重复键错误后返回 `ALREADY_SIGNED`。这才是任务书所说"**无例外**"的真正兑现点，因此该索引属于**业务功能的组成部分**，不是可选优化。

---

## 5. `admins` 管理员表

| 字段名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|---|---|---|---|---|---|
| `_id` | string | ✅ | 系统生成 | 主键 | 云开发自动生成 |
| `openid` | string | ✅ | — | **唯一索引** | 微信 openid，由云函数从调用上下文获取 |
| `nickName` | string | ❌ | `""` | — | 微信昵称（用户授权后可得） |
| `avatarUrl` | string | ❌ | `""` | — | 微信头像地址 |
| `createTime` | date | ✅ | 服务端当前时间 | — | 首次授权登录时间 |

**JSON 示例**

```json
{
  "_id": "admin_778899aabbcc",
  "openid": "oXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "nickName": "张老师",
  "avatarUrl": "https://thirdwx.qlogo.cn/...",
  "createTime": "2025-03-01T01:50:00.000Z"
}
```

**首个管理员如何产生**：云函数环境变量 `ADMIN_OPENIDS`（英文逗号分隔）。首次登录时若 openid 命中该白名单但不在 `admins` 集合中，则自动写入。详见 [`design-decisions.md` D4](./design-decisions.md#d4--管理员身份与首个管理员的产生方式)。

---

## 6. `devices` 设备表（可选集合）

**该集合不参与任何业务判定**，仅用于管理员核对"同一台设备是否被多个学号使用"这类异常。若不需要可在 `init` 云函数中关闭写入。

| 字段名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|---|---|---|---|---|---|
| `_id` | string | ✅ | 系统生成 | 主键 | 云开发自动生成 |
| `deviceId` | string | ✅ | — | **唯一索引** | 设备 ID |
| `fingerprint` | string | ❌ | `""` | — | 硬件指纹（审计用） |
| `platform` | string | ❌ | `""` | — | 系统平台（如 `android` / `ios` / `devtools`） |
| `firstSeen` | date | ✅ | 服务端当前时间 | — | 首次出现时间 |
| `lastSeen` | date | ✅ | 服务端当前时间 | — | 最近出现时间 |

---

## 7. 索引清单 ★ 部署必做

微信云开发控制台 → 数据库 → 选中集合 → 索引管理 → 新建索引。

| # | 集合 | 索引名 | 字段 | 排序 | 唯一 | 用途 |
|---|---|---|---|---|---|---|
| 1 | `records` | `uk_course_device` | `courseId` | 升序 | ✅ **是** | **业务约束载体**：同课程同设备仅 1 次（防并发） |
| 2 | `records` | `idx_course_time` | `courseId` + `signTime` | 升序 + 降序 | ❌ | 按课程查记录、导出、列表分页 |
| 3 | `records` | `idx_sno` | `sno` | 升序 | ❌ | 按学号查询与统计 |
| 4 | `users` | `uk_sno` | `sno` | 升序 | ✅ **是** | 登录匹配唯一、防 Excel 重复导入 |
| 5 | `courses` | `idx_status` | `status` | 升序 | ❌ | 学生端只取启用课程 |
| 6 | `admins` | `uk_openid` | `openid` | 升序 | ✅ **是** | 管理员鉴权 |
| 7 | `devices` | `uk_device` | `deviceId` | 升序 | ✅ **是** | 设备审计（可选） |

> ⚠️ **索引 1 未建立时**：功能看起来仍能正常工作（快路径查询会拦掉绝大多数重复签到），但在并发场景下会写入重复记录。请务必通过 `init` 云函数或控制台确认该索引已生效。

---

## 8. 集合权限配置 ★ 部署必做

在云开发控制台 → 数据库 → 每个集合 → 权限设置 → 选择**「所有用户不可读写」**（即自定义安全规则为仅管理端可读写）。

对应的自定义安全规则 JSON：

```json
{
  "read": false,
  "write": false
}
```

对全部 5 个集合（`courses`、`users`、`records`、`admins`、`devices`）**逐一**应用。

**验证方式**：在小程序端执行 `wx.cloud.database().collection('records').get()`，应当返回权限错误。若返回数据，说明权限配置不正确。

**为什么不用默认权限**：云开发默认"仅创建者可读写"，而本系统需要管理员跨用户读取全部签到记录，且学生不绑定 openid，默认权限模型无法表达该需求。关闭客户端直连、统一走云函数是最简单且最安全的方案。

---

## 9. 初始化脚本

项目提供 `cloudfunctions/init` 云函数，一次性完成：

1. 创建全部 5 个集合（已存在则跳过）
2. 创建第 7 节列出的全部索引
3. 将环境变量 `ADMIN_OPENIDS` 中的 openid 写入 `admins` 集合

**调用方式**（微信开发者工具 → 云函数 → `init` → 本地调试，或右键"云端测试"）：

```json
{ "action": "setup" }
```

**返回示例**

```json
{
  "code": 0,
  "msg": "初始化完成",
  "data": {
    "collections": [
      { "name": "courses", "created": true },
      { "name": "users", "created": true },
      { "name": "records", "created": true },
      { "name": "admins", "created": false },
      { "name": "devices", "created": true }
    ],
    "indexes": [
      { "collection": "records", "name": "uk_course_device", "created": true },
      { "collection": "records", "name": "idx_course_time", "created": true },
      { "collection": "records", "name": "idx_sno", "created": true },
      { "collection": "users", "name": "uk_sno", "created": true },
      { "collection": "courses", "name": "idx_status", "created": true },
      { "collection": "admins", "name": "uk_openid", "created": true },
      { "collection": "devices", "name": "uk_device", "created": true }
    ],
    "admins": { "inserted": 1, "total": 1 }
  }
}
```

> 说明：云开发数据库的部分管理接口（如创建索引）在 SDK 中支持有限。若 `init` 云函数中索引创建失败，请按第 7 节表格在控制台**手工创建**，并在部署文档中记录。`init` 会在返回结果里明确列出哪些索引需要手动创建。

---

## 10. 字段 ↔ 任务书业务规则完整对照表

用于验收时逐条核对"每个需求是否在数据结构上有落点"。

| # | 任务书业务规则 | 数据结构落点 | 强制层级 |
|---|---|---|---|
| 1 | 管理员、学生共用一套小程序，首页选身份 | 无（前端路由设计） | 前端 |
| 2 | 管理员微信授权登录 | `admins.openid` 唯一索引 + 环境变量白名单 | 数据库 + 云函数 |
| 3 | 新增课程 | `courses` 集合 | 数据库 |
| 4 | 课程设置**单个**签到点位经纬度 | `courses.latitude` / `longitude` 标量字段 | **数据库结构** |
| 5 | 自定义定位距离阈值，默认 50 米 | `courses.radius`，默认 `50` | 数据库默认值 |
| 6 | **不支持多点位** | 无点位数组字段、无点位关联表 | **数据库结构** |
| 7 | Excel 批量导入学生（班级/姓名/学号） | `users.className` / `name` / `sno` | 数据库 |
| 8 | 查看学生列表 | `users` 集合查询 | 云函数 |
| 9 | 查看全部签到记录 | `records` 集合 + `idx_course_time` | 云函数 |
| 10 | 修改签到记录 | `records.operator` / `updateTime` | 云函数 |
| 11 | 删除签到记录 | `records` 集合删除 | 云函数 |
| 12 | 导出签到记录为 Excel | `records` 全字段 + `xlsx` 生成 | 云函数 |
| 13 | 学生用学号 + 姓名登录，匹配导入名单 | `users.sno` + `users.name` 全等匹配 | 云函数 |
| 14 | 学生不需要密码 | `users` 表**无 password 字段** | **数据库结构** |
| 15 | 学生**不绑定** openid | `users` 与 `records` 表**均无 openid 字段** | **数据库结构** |
| 16 | 调用微信原生定位 API | 无（`wx.getLocation`） | 前端 |
| 17 | 超出阈值禁止签到 | `signIn` 云函数比对 `distance` 与 `courses.radius` | 云函数（云端） |
| 18 | 同课程同设备仅签到 1 次，无例外 | **`records` 复合唯一索引 `courseId + deviceId`** | **数据库索引** |
| 19 | 签到成功后不可再次提交 | 前端按钮禁用 + 云端第 18 条拦截 | 前端 + 云端 |
| 20 | 不设置签到起止时间 | `courses` 表**无 startTime/endTime 字段** | **数据库结构** |
| 21 | 不区分迟到、缺勤 | `records` 表**无 status 字段** | **数据库结构** |
| 22 | 无消息推送 | 无订阅消息相关字段与调用 | 结构上不存在 |
| 23 | 无操作日志 | **无 log 集合**；仅 `records` 行内溯源字段 | **数据库结构** |

> 表中标注"**数据库结构**"的行，意味着该约束**无法通过前端或接口绕过**——因为数据结构本身就无法表达被禁止的状态。这是本设计的主要思路：**把业务约束尽量下沉到数据结构层，而不是依赖应用层判断**。
