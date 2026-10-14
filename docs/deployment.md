# 部署指南

本文记录 v2.2 云端化的部署流程。Phase 2 已完成 SQLite 到 PostgreSQL 的可重复迁移工具和本地 staging 等价演练，但尚未部署云端资源，也没有迁移生产数据。

## 1. 版本要求

- Node.js：`24.19.0`，以 `.nvmrc` 为准。
- pnpm：`10.34.6`，以 `package.json` 的 `packageManager` 为准。该版本位于 Vercel 当前明确支持的 pnpm 10 范围内。

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

   `package.json` 的 `postinstall` 会在依赖安装完成后自动执行 `prisma generate`。本地安装和 Vercel 安装阶段都使用这一流程，避免依赖缓存导致 Prisma Client 与 `schema.prisma` 不一致。需要单独重新生成时仍可执行 `pnpm db:generate`。

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

Phase 2 只完成本地 staging 等价演练，不执行实际云端 staging 部署。后续 staging 应按以下顺序进行：

1. 创建与 production 隔离的应用、数据库、域名和 Better Auth 密钥。
2. 根据 `.env.production.example` 在部署平台设置环境变量，不上传 `.env` 文件。
3. 安装锁定依赖并运行 `pnpm db:generate`。
4. 对 staging 数据库运行 `pnpm db:migrate:deploy`。
5. 运行 lint、全部测试和生产构建。
6. 部署 Next.js，并验证注册、登录、Session、设置、Dashboard、Diary 隔离、搜索和时区边界。
7. 按“SQLite → PostgreSQL 迁移演练”执行导出、导入和自动校验，再完成双用户业务冒烟测试。

Staging 不得复用 production 数据库、密钥或正式用户数据。

部署平台的健康检查路径配置为 `GET /api/health`。响应 `200` 表示应用可以连接 PostgreSQL；响应 `503` 表示数据库连接不可用，此时实例不应接收流量。该检查只执行 `SELECT 1`，不依赖登录状态，也不读取业务数据。

首次部署前执行统一部署回归：

```bash
pnpm lint
pnpm test:deploy
pnpm build
```

`test:deploy` 串行运行部署配置、健康检查、认证、Diary 隔离、时区和数据迁移测试。串行执行可以避免多个集成测试同时初始化 PostgreSQL Schema。测试环境需要通过 `TEST_DATABASE_URL`、`DIRECT_URL` 或 `DATABASE_URL` 提供可创建和删除 Schema 的 PostgreSQL 直连地址。

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

## 6. 部署前工程检查

- Node.js 使用 `.nvmrc` 指定的 24.x，并在 Vercel 项目设置中选择 Node.js 24.x。
- 使用仓库声明的 pnpm 10.34.6 和已提交的 `pnpm-lock.yaml`，安装时启用 frozen lockfile。
- 确认安装日志包含成功的 `prisma generate`；不要依赖旧的 `node_modules` 或 Vercel 依赖缓存。
- 确认四个 staging 环境变量均已设置，且 `DATABASE_URL` 使用连接池地址、`DIRECT_URL` 使用直连地址。
- 在部署应用前，由独立发布步骤执行 `pnpm db:migrate:deploy`，禁止在应用启动时执行 migration。
- 执行 `pnpm lint`、`pnpm test:deploy` 和 `pnpm build`，任一失败都停止部署。
- 部署后先验证 `GET /api/health`，再执行认证、Session、时区和 Diary 用户隔离冒烟测试。

## 7. 数据迁移注意事项

- 当前生效历史位于 `prisma/migrations`，只包含 PostgreSQL migration。
- 原 SQLite SQL 原样归档在 `prisma/migrations-sqlite-legacy`，不得对 PostgreSQL 执行。
- PostgreSQL 初始 migration 已建立，但它只创建空结构，不复制 SQLite 数据。
- 正式迁移前先复制并校验 SQLite 文件，迁移期间暂停写入。
- 必须保留 `User`、`Account`、`Diary` 的 ID、关联关系、密码哈希、日期、时区和正文内容。
- MVP 推荐不迁移 `Session` 和 `Verification`，切换后要求用户重新登录；最终策略需在迁移实现前确认。
- 校验至少包括表数量、ID 集合、逐用户 Diary 数量、`(userId, date)` 唯一性、外键完整性和关键内容摘要。
- 在 staging 至少完成一次可重复的全量迁移演练，再安排 production 切换。
- PostgreSQL 开始接受新写入后，不能仅靠切换应用版本回滚到 SQLite；应在开放写入前完成最终验证。

## 8. SQLite → PostgreSQL 迁移演练

Phase 2 提供三个独立命令：

| 命令 | 作用 |
| --- | --- |
| `pnpm migration:export:sqlite` | 从 SQLite 只读导出 `User`、`Account`、`Diary` |
| `pnpm migration:import:postgres` | 在单个事务中导入空的 PostgreSQL 目标库 |
| `pnpm migration:verify` | 逐项比较导出快照与 PostgreSQL 数据 |

默认读取 `prisma/dev.db`，默认快照写入 `migration-data/sqlite-export.json`。可通过 `SQLITE_DATABASE_PATH` 和 `MIGRATION_EXPORT_PATH` 指定演练文件。导入和校验优先使用 `DIRECT_URL`，没有设置时使用 `DATABASE_URL`；这两个命令必须使用 PostgreSQL 直连 URL。

迁移快照包含邮箱、密码哈希以及可能存在的 Account 令牌，属于敏感文件。`migration-data/` 已被 Git 忽略，但演练时仍应放在受控临时目录，限制访问，并在校验完成后安全删除。不得上传到制品仓库或日志系统。

### 演练步骤

1. 暂停源 SQLite 的写入，复制数据库文件，并记录副本的校验和。所有导出操作针对副本执行，不直接操作运行中的文件。
2. 创建全新的 staging PostgreSQL 数据库或 Schema，设置 `DATABASE_URL` 和 `DIRECT_URL`，然后执行：

   ```bash
   pnpm db:migrate:deploy
   ```

3. 指向 SQLite 副本并导出：

   ```bash
   SQLITE_DATABASE_PATH=/secure/path/source.db \
   MIGRATION_EXPORT_PATH=/secure/path/sqlite-export.json \
   pnpm migration:export:sqlite
   ```

4. 保持相同 `MIGRATION_EXPORT_PATH`，指向 staging PostgreSQL 直连地址并导入：

   ```bash
   DIRECT_URL=postgresql://... \
   MIGRATION_EXPORT_PATH=/secure/path/sqlite-export.json \
   pnpm migration:import:postgres
   ```

   导入器要求 `User`、`Account`、`Diary`、`Session`、`Verification` 全部为空；任一表已有数据都会停止。`User.id`、`Account.id` 和 `Diary.id` 按原值写入，不重新生成。

5. 使用同一快照和 PostgreSQL 地址执行：

   ```bash
   DIRECT_URL=postgresql://... \
   MIGRATION_EXPORT_PATH=/secure/path/sqlite-export.json \
   pnpm migration:verify
   ```

6. 只有校验返回 `verified: true` 后，才启动 staging 应用。用至少两个已迁移账号验证登录、Session 新建、Diary 隔离、Dashboard、搜索、历史和用户时区。
7. 删除迁移快照，并保留不含凭据的数量、校验结论、演练时间和版本记录。

### 自动校验范围

- `User`、`Account`、`Diary` 数量及完整 ID 集合。
- `Diary.userId` 关系、日期、三个结构化内容字段、完整正文和时间戳。
- 用户名、邮箱、邮箱验证状态、头像、`timeZone` 和时间戳。
- Account 与 User 的关系、凭据哈希和现有可空字段。
- PostgreSQL 中 `Session` 与 `Verification` 保持为空。

`Session` 和 `Verification` 不进入快照，也不导入 PostgreSQL。迁移后的首次访问要求用户重新登录，新 Session 由 Better Auth 在 PostgreSQL 中创建。

若导入或校验失败，不在目标库上手工修补数据。删除本次 staging 数据库或 Schema，修复原因后从 migration deploy 和导入步骤重新开始。Phase 2 的本地演练不代表 production 已迁移，也不授权生产切换。
