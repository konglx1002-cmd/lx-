# 本地开发环境

本文说明如何使用 Docker Compose 启动项目所需的本地 PostgreSQL。该环境只用于开发和测试，不应保存生产数据或使用生产密钥。

## 前置条件

- Node.js 24.x
- pnpm 10.34.6
- Docker Desktop 或兼容 Docker Compose 的容器运行环境

本地 PostgreSQL 使用 `localhost:5433`，避免与 CVAT 或其他占用默认 5432 端口的 PostgreSQL 冲突。

## 配置环境变量

复制示例文件：

```bash
cp .env.local.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.local.example .env.local
```

`.env.local` 供 Next.js 本地应用读取。Prisma CLI 和 Node 测试还需要在当前终端设置相同的连接地址，或者把这两项同步到未提交的 `.env`：

```powershell
$env:DATABASE_URL="postgresql://scientific_log:scientific_log_password@localhost:5433/scientific_growth_log?schema=public"
$env:DIRECT_URL=$env:DATABASE_URL
$env:TEST_DATABASE_URL=$env:DIRECT_URL
```

以上凭据仅用于本机容器，不可用于 staging 或 production。

## 启动数据库

```bash
docker compose up -d
```

查看健康状态：

```bash
docker compose ps
```

`scientific-log-postgres` 显示为 `healthy` 后再执行 migration 或测试。

## 部署本地 migration

首次启动数据库以及仓库新增 migration 后执行：

```bash
pnpm db:migrate:deploy
```

该命令只应用仓库中已经提交的 migration。本地创建新 migration 时仍使用 `pnpm db:migrate:dev`。

## 运行部署测试

在当前终端已设置 `TEST_DATABASE_URL` 后执行：

```bash
pnpm test:deploy
```

测试会在本地 PostgreSQL 中创建临时 Schema，并在结束时清理，不会复用应用的 `public` Schema。

## 停止数据库

停止并删除容器和网络，同时保留数据库数据：

```bash
docker compose down
```

如需完全重置本地数据库，可同时删除命名卷：

```bash
docker compose down -v
```

`down -v` 会永久删除该 Compose 环境中的本地 PostgreSQL 数据，执行前应确认不需要保留。
