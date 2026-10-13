# 数据库设计

## 1. 当前数据库

项目当前使用 SQLite，由 Prisma 管理 Schema 和迁移。数据库连接通过 `DATABASE_URL` 环境变量配置。

## 2. 模型概览

```text
User 1 ─── * Session
User 1 ─── * Account
User 1 ─── * Diary

Verification 独立保存认证验证数据
```

### 2.1 User

| 字段 | 类型 | 约束或用途 |
| --- | --- | --- |
| `id` | String | 主键，由认证系统使用 |
| `name` | String | 用户显示名称 |
| `email` | String | 唯一 |
| `emailVerified` | Boolean | 默认 `false` |
| `timeZone` | String | 默认 `Asia/Shanghai`，用于计算用户的“今天” |
| `image` | String? | 可选头像地址，当前 UI 未使用 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

`User` 与 `Session`、`Account`、`Diary` 都是一对多关系。

### 2.2 Diary

| 字段 | 类型 | 约束或用途 |
| --- | --- | --- |
| `id` | String | CUID 主键 |
| `userId` | String | 必填外键，关联 `User.id` |
| `date` | DateTime | 日志日期 |
| `completedTasks` | String | 完成事项 |
| `problems` | String | 遇到问题 |
| `nextPlan` | String | 下一步计划 |
| `content` | String | 历史保留字段，当前页面和 API 不使用 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

关键约束：

- `@@unique([userId, date])`：同一用户同一天最多一篇 Diary。
- 不同用户可以在同一天分别创建 Diary。
- `Diary.userId -> User.id` 使用级联删除。

Diary 日期由用户时区计算成 `YYYY-MM-DD`，再以对应 UTC 零点的 `DateTime` 保存。它表达的是日志日期键，而不是日志创建瞬间。

### 2.3 Better Auth 模型

- `Session`：保存 Session Token、过期时间、客户端信息和所属用户；`token` 唯一，`userId` 有索引。
- `Account`：保存认证提供方账号信息。当前启用邮箱密码认证，密码数据由 Better Auth 管理。
- `Verification`：保存认证流程所需的临时验证数据，`identifier` 有索引。

## 3. 用户数据隔离

隔离不依赖客户端提供用户 ID，而由服务端执行：

1. Route Handler 或服务端页面从 Better Auth Session 获取当前用户。
2. 调用 Diary 服务时传入 `user.id`。
3. 所有 Diary 查询都带有 `userId` 条件。
4. 今日记录使用复合唯一键 `userId_date` 查询和 upsert。
5. 日志详情使用 `{ id, userId }` 联合条件查询；其他用户的 Diary 与不存在的 Diary 都返回 404。
6. 历史列表和搜索同样使用 `where: { userId }`，搜索条件位于该用户范围之内。

因此，客户端即使额外发送 `userId`，也不会改变数据归属或扩大查询范围。

## 4. 已完成迁移

| 迁移 | 作用 |
| --- | --- |
| `20261013000000_init` | 创建单用户时期的 `Diary` 表 |
| `20261013130241_add_auth` | 创建 Better Auth 所需表和索引 |
| `20261013140000_add_diary_user_ownership` | 新增 `Diary.userId`，将日期唯一约束改为 `(userId, date)` |
| `20261013144625_add_user_time_zone` | 新增 `User.timeZone`，既有用户默认 `Asia/Shanghai` |

多人迁移保留了原 Diary 的 ID、日期和内容。若数据库中存在旧 Diary 但没有用户，迁移会创建仅用于承接旧数据的 `legacy-diary-owner`；否则旧 Diary 归属到最早创建的现有用户。

## 5. PostgreSQL 说明

PostgreSQL 仍是后续规划，不是当前数据库。迁移时不能只修改连接字符串，还需要生成并审核 PostgreSQL 专用迁移、迁移现有数据、校验复合唯一约束和外键，并建立生产备份与恢复流程。

