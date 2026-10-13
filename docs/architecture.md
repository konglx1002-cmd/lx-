# 系统架构

## 1. 项目定位与当前范围

科研成长日志是一个基于 Web 的多人科研记录工具。当前系统已经完成：

- Diary MVP：创建、读取和更新当日日志。
- 历史日志列表与日志详情。
- 按关键词搜索日志。
- 基于邮箱和密码的注册、登录、退出及 Session 持久化。
- 用户级 Diary 数据隔离。
- 按用户时区判断“今天”，默认时区为 `Asia/Shanghai`。

当前没有设置页面、Dashboard、标签、项目管理、统计图表、AI 功能或 PostgreSQL 部署。

## 2. 技术栈

| 层级 | 当前技术 |
| --- | --- |
| Web 框架 | Next.js 16，App Router |
| UI | React 19、TypeScript、Tailwind CSS 4 |
| 数据访问 | Prisma 6 |
| 数据库 | SQLite |
| 认证 | Better Auth，Prisma Adapter，邮箱密码认证 |
| 测试 | Node.js 内置测试运行器 |
| 代码检查 | ESLint |

## 3. 代码结构

```text
src/
  app/                         页面与 Route Handlers
    api/auth/[...all]/         Better Auth 统一入口
    api/diary/                 Diary JSON API
    diary/                     今日记录和详情页面
    history/                   历史列表页面
    search/                    搜索页面
    login/、register/          认证页面
  components/                  导航与认证表单组件
  features/diary/              Diary 服务、类型和格式化逻辑
  lib/                         Prisma、Better Auth、当前用户和时区工具
prisma/
  schema.prisma                数据模型
  migrations/                  数据库迁移
tests/                         认证、Diary 隔离和时区测试
```

## 4. 请求与数据流

### 4.1 认证

1. 登录、注册和退出组件通过 Better Auth 客户端调用 `/api/auth/*`。
2. `src/app/api/auth/[...all]/route.ts` 将请求交给 Better Auth。
3. Better Auth 使用 Prisma Adapter 读写 `User`、`Session`、`Account` 和 `Verification`。
4. 服务端通过 `getCurrentUser()` 从请求头和 Session 获取当前用户。

密码散列、Session Cookie 和认证端点由 Better Auth 管理，业务代码不自行实现密码或 Cookie 逻辑。

### 4.2 Diary

```text
页面或客户端表单
  -> Next.js 页面 / Route Handler
  -> getCurrentUser() 获取 Session 用户
  -> diary-service 传入 user.id
  -> Prisma 查询或写入 SQLite
```

`diary-service` 是当前 Diary 数据访问边界。历史、搜索、详情和今日记录的查询都要求传入服务端获得的 `userId`。客户端请求体中的 `userId` 不参与权限判断或数据写入。

### 4.3 今日日期

当前用户的 `timeZone` 保存在 `User` 中，并随 Session 用户数据返回。今日记录接口把 Session 中的 `user.id` 和 `user.timeZone` 一起传给 Diary 服务。服务使用 `Intl.DateTimeFormat` 将当前时间转换成该时区的 `YYYY-MM-DD` 日期键，再查询或写入当日日志。

## 5. 页面边界

| 页面 | 当前行为 |
| --- | --- |
| `/` | 公共首页，展示主要入口 |
| `/login` | 邮箱密码登录 |
| `/register` | 用户名、邮箱和密码注册 |
| `/diary` | 通过今日 Diary API 加载和保存记录；未登录请求会得到 401 |
| `/history` | 服务端获取当前用户；未登录重定向到 `/login` |
| `/search` | 服务端获取当前用户；未登录重定向到 `/login` |
| `/diary/[id]` | 仅查询当前用户的 Diary；他人 Diary 或不存在的 ID 返回 404 |

## 6. 云端演进边界

当前架构通过 Prisma 隔离数据库访问，便于未来替换数据库。但 SQLite 文件不适合作为多实例云服务的共享数据库。云端部署前需要单独完成 PostgreSQL Schema、数据迁移、备份恢复和生产环境密钥配置；这些能力目前尚未实现。

