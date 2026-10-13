# 科研成长日志项目状态

更新日期：2026-10-13

## 项目概况

科研成长日志是面向研究生、科研人员和工程师的个人成长记录工具。当前 MVP 已形成完整闭环：用户可以创建或更新当日日志、查看历史日志和详情，并通过关键词搜索过往记录。

当前版本：`0.1.0`

## 技术栈

- Next.js 16（App Router）
- React 19
- TypeScript
- Tailwind CSS 4
- Prisma 6
- SQLite
- Node.js 内置测试运行器
- ESLint

## 已完成功能

### 1. 当日日志

- 展示当天日期。
- 填写完成事项、遇到问题和下一步计划。
- 创建和编辑当天日志。
- 同一天仅保存一篇日志，重复保存时更新原记录。
- 保存后显示成功状态，刷新页面后数据仍然存在。

### 2. 历史日志

- 按日期倒序展示全部日志。
- 列表展示日期及各字段摘要。
- 点击记录进入日志详情页面。
- 详情页展示完整内容并可返回历史列表。

### 3. 日志搜索

- 支持关键词包含匹配。
- 搜索范围包括 `completedTasks`、`problems` 和 `nextPlan`。
- 搜索结果按日期倒序展示。
- 结果可进入日志详情；无匹配内容时显示空结果提示。

## 页面与接口

| 路径 | 用途 |
| --- | --- |
| `/` | 产品首页及主要功能入口 |
| `/diary` | 创建或编辑当日日志 |
| `/history` | 历史日志列表 |
| `/diary/[id]` | 日志详情 |
| `/search` | 日志关键词搜索 |
| `GET /api/diary/today` | 获取当日日志 |
| `POST/PUT /api/diary/today` | 创建或更新当日日志 |
| `GET /api/diary` | 获取全部日志 |
| `GET /api/diary/search?q=关键词` | 搜索日志 |

## 数据模型

当前仅有 `Diary` 模型，主要字段如下：

- `id`：日志唯一标识。
- `date`：日志日期，具有唯一约束。
- `completedTasks`：完成事项。
- `problems`：遇到问题。
- `nextPlan`：下一步计划。
- `content`：预留内容字段，当前功能未使用。
- `createdAt`、`updatedAt`：创建和更新时间。

## 项目结构

```text
src/
  app/                 页面与 Route Handlers
  components/          通用组件
  features/diary/      日志业务逻辑、类型和格式化函数
  lib/                 Prisma 数据库连接
prisma/                Schema 与数据库迁移
tests/                 日志集成测试
```

## 验证状态

截至本次更新，以下检查均已通过：

- ESLint 检查。
- Next.js 生产构建。
- 日志集成测试。
- 当日日志创建、读取、更新及日期唯一性验证。
- 历史列表排序与详情展示验证。
- 三个日志字段的关键词搜索与空结果验证。

## 本地运行

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

默认开发地址为 `http://localhost:3000`。数据库连接由 `.env` 中的 `DATABASE_URL` 配置，当前使用 SQLite。

常用验证命令：

```bash
pnpm lint
pnpm test:diary
pnpm build
```

## 尚未实现

- 用户系统与多用户数据隔离。
- 标签与项目管理。
- 高级筛选和全文索引优化。
- 数据统计与可视化。
- AI 总结或 AI 搜索。
- 部署与生产环境配置。

## Git 状态

- 当前分支：`main`。
- 创建本文档前的最新功能提交：`6279767 Add diary keyword search`。
- 本地分支创建本文档前领先 `origin/main` 6 个提交，相关提交尚未推送到远端。
