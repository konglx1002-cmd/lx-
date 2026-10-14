# 部署指南

本文记录 v2.2 云端化的部署流程。Phase 1 已完成 PostgreSQL Schema、Better Auth Adapter、migration 历史和本地集成测试适配，但尚未部署云端资源，也没有迁移生产数据。

## 1. 版本要求

- Node.js：`24.19.0`，以 `.nvmrc` 为准。
- pnpm：`11.25.0`，以 `package.json` 的 `packageManager` 为准。

生产构建当前显式使用 Next.js 官方支持的 Webpack 构建器。默认 Turbopack 在现有 Windows 验证环境启动 PostCSS worker 时发生内部错误，而相同源码使用 Webpack 可以稳定完成生产构建；后续升级 Next.js 后可重新评估。

开始工作前确认版本：

```bash
node --version
pnpm --version
```

## 2. 本地运行

1. 安装依赖：

   ```bash
   pnpm install
   ```

2. 启动本地 PostgreSQL。可以使用系统 PostgreSQL，也可以使用 Prisma 官方本地开发服务：

   ```bash
   pnpm exec prisma dev --name scientific-growth-log
   ```

3. 从 `.env.example` 创建本地 `.env`，填写本地 PostgreSQL 连接和 Better Auth 开发密钥。

   - `DATABASE_URL`：应用运行时连接。
   - `DIRECT_URL`：Prisma migration 直连地址。
   - 本地没有连接池时，两者可以相同。
   - 使用 `prisma dev` 输出的 TCP 地址配合 Prisma 6 测试时，连接参数需要包含 `pgbouncer=true&connection_limit=1`，避免复用连接时的 prepared statement 冲突。

4. 生成 Prisma Client 并部署已提交的初始 migration：

   ```bash
   pnpm db:generate
   pnpm db:migrate:deploy
   ```

5. 启动开发服务器：

   ```bash
   pnpm dev
   ```

后续修改 Prisma Schema 时使用 `pnpm db:migrate:dev` 创建新的 PostgreSQL migration。`pnpm db:migrate` 当前保留为该命令的兼容别名。

集成测试需要一个可创建和删除 Schema 的本地 PostgreSQL 连接。运行测试前，将 `TEST_DATABASE_URL`、`DIRECT_URL` 或 `DATABASE_URL` 之一设置为直连 `postgresql://` URL；测试会创建隔离 Schema、运行 `prisma migrate deploy`，结束后删除测试 Schema。

## 3. Staging 流程

Phase 1 不执行实际 staging 部署。后续 staging 应按以下顺序进行：

1. 创建与 production 隔离的应用、数据库、域名和 Better Auth 密钥。
2. 根据 `.env.production.example` 在部署平台设置环境变量，不上传 `.env` 文件。
3. 安装锁定依赖并运行 `pnpm db:generate`。
4. 对 staging 数据库运行 `pnpm db:migrate:deploy`。
5. 运行 lint、全部测试和生产构建。
6. 部署 Next.js，并验证注册、登录、Session、设置、Dashboard、Diary 隔离、搜索和时区边界。
7. 使用模拟数据完成 SQLite 到 PostgreSQL 的迁移演练及一致性校验；该步骤尚未实施。

Staging 不得复用 production 数据库、密钥或正式用户数据。

## 4. Production 部署流程

PostgreSQL 适配及迁移演练完成后，production 发布顺序应为：

1. 确认数据库备份、维护窗口和回滚条件。
2. 在部署平台设置 production 环境变量。
3. 运行 `pnpm install --frozen-lockfile` 和 `pnpm db:generate`。
4. 运行 lint、全部测试和 `pnpm build`。
5. 由单独的发布步骤运行 `pnpm db:migrate:deploy`，不要在应用实例启动时运行 migration。
6. 部署 Next.js Node.js 应用。
7. 完成健康检查及认证、用户隔离和 Diary 读写冒烟测试后再开放流量。

生产环境禁止使用 `prisma migrate dev`。该命令会创建开发 migration，并依赖 shadow database；生产环境只应用已经审核并提交的 migration。

## 5. 环境变量

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 应用运行时 PostgreSQL 连接；云端建议使用连接池地址 |
| `DIRECT_URL` | Prisma migration 和管理操作使用的 PostgreSQL 直连地址 |
| `BETTER_AUTH_SECRET` | Better Auth 生产密钥，至少 32 个高熵字符 |
| `BETTER_AUTH_URL` | 应用唯一的正式 HTTPS Origin |

所有环境变量由部署平台管理。不得提交真实数据库凭据或 Better Auth 密钥。开发、staging、production 必须使用不同的数据库和密钥。

## 6. 数据迁移注意事项

- 当前生效历史位于 `prisma/migrations`，只包含 PostgreSQL migration。
- 原 SQLite SQL 原样归档在 `prisma/migrations-sqlite-legacy`，不得对 PostgreSQL 执行。
- PostgreSQL 初始 migration 已建立，但它只创建空结构，不复制 SQLite 数据。
- 正式迁移前先复制并校验 SQLite 文件，迁移期间暂停写入。
- 必须保留 `User`、`Account`、`Diary` 的 ID、关联关系、密码哈希、日期、时区和正文内容。
- MVP 推荐不迁移 `Session` 和 `Verification`，切换后要求用户重新登录；最终策略需在迁移实现前确认。
- 校验至少包括表数量、ID 集合、逐用户 Diary 数量、`(userId, date)` 唯一性、外键完整性和关键内容摘要。
- 在 staging 至少完成一次可重复的全量迁移演练，再安排 production 切换。
- PostgreSQL 开始接受新写入后，不能仅靠切换应用版本回滚到 SQLite；应在开放写入前完成最终验证。
