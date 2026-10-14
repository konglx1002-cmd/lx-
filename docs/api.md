# API 说明

## 1. 通用约定

- Diary API 和用户设置 API 使用 JSON。
- 用户身份来自 Better Auth Session Cookie。
- 未登录访问 Diary API 返回 `401` 和 `{ "message": "请先登录" }`。
- 客户端不需要、也不能通过传入 `userId` 指定数据归属。
- 当前没有公开的 Diary 删除 API，也没有单独的 Diary 详情 JSON API。

## 2. 认证 API

Better Auth 通过以下统一 Route Handler 提供认证能力：

```text
/api/auth/[...all]
```

当前前端实际使用的能力包括：

| 路径 | 方法 | 用途 |
| --- | --- | --- |
| `/api/auth/sign-up/email` | POST | 用户名、邮箱和密码注册 |
| `/api/auth/sign-in/email` | POST | 邮箱密码登录 |
| `/api/auth/sign-out` | POST | 退出当前 Session |
| `/api/auth/get-session` | GET | 获取当前 Session 和用户 |

认证请求、响应、Cookie 和密码处理由 Better Auth 定义。`User.timeZone` 是 Better Auth 的附加用户字段，默认 `Asia/Shanghai`；服务端会拒绝非法时区。

## 3. 用户设置

### `GET /api/settings`

返回当前 Session 用户的可展示设置：

```json
{
  "settings": {
    "name": "用户名",
    "email": "user@example.com",
    "timeZone": "Asia/Shanghai"
  }
}
```

### `PUT /api/settings`

### `PATCH /api/settings`

两个方法都支持更新 `name`、`timeZone` 中的一个或两个字段。用户名去除首尾空白后不能为空，时区必须是服务端可识别的 IANA 时区。邮箱只读，当前不能通过该 API 修改。

```json
{
  "name": "新用户名",
  "timeZone": "Asia/Tokyo"
}
```

用户身份只取自 Better Auth Session；请求体包含 `userId` 时返回 `400`。请求体包含 `email` 时也返回 `400`，不会修改邮箱。

## 4. 今日 Diary

### `GET /api/diary/today`

根据当前 Session 用户的时区返回“今天”和该日期的 Diary。

成功响应：

```json
{
  "date": "2026-10-13",
  "diary": {
    "id": "diary-id",
    "date": "2026-10-13",
    "completedTasks": "完成事项",
    "problems": "遇到的问题",
    "nextPlan": "下一步计划",
    "createdAt": "2026-10-13T08:00:00.000Z",
    "updatedAt": "2026-10-13T09:00:00.000Z"
  }
}
```

当天尚无 Diary 时，`diary` 为 `null`。

### `POST /api/diary/today`

### `PUT /api/diary/today`

两个方法当前执行相同的 upsert：不存在则创建，存在则更新。

请求体：

```json
{
  "completedTasks": "完成事项",
  "problems": "遇到的问题",
  "nextPlan": "下一步计划"
}
```

三个字段都必须是字符串，否则返回 `400`。服务端使用 Session 中的 `user.id` 和 `user.timeZone`，不采用请求体中的额外身份字段。

成功响应：

```json
{
  "diary": {
    "id": "diary-id",
    "date": "2026-10-13",
    "completedTasks": "完成事项",
    "problems": "遇到的问题",
    "nextPlan": "下一步计划",
    "createdAt": "2026-10-13T08:00:00.000Z",
    "updatedAt": "2026-10-13T09:00:00.000Z"
  }
}
```

## 5. 历史 Diary

### `GET /api/diary`

返回当前用户的全部 Diary，按 `date` 倒序排列。

```json
{
  "diaries": []
}
```

响应中的每个条目使用与今日 Diary 相同的公开字段，不包含 `userId` 和当前未使用的 `content`。

## 6. 搜索 Diary

### `GET /api/diary/search?q=关键词`

在当前用户范围内，对以下字段执行包含匹配：

- `completedTasks`
- `problems`
- `nextPlan`

结果按 `date` 倒序排列。`q` 缺失、为空或只包含空白时返回空数组。

```json
{
  "diaries": []
}
```

## 7. 页面侧详情读取

`/diary/[id]` 不是 JSON API。该服务端页面调用 `getDiaryById(currentUser.id, id)`：

- 未登录时重定向到 `/login`。
- Diary 属于当前用户时展示详情。
- Diary 不存在或属于其他用户时返回 404。

## 8. 当前错误响应

| 场景 | 状态码 | 当前消息 |
| --- | --- | --- |
| 未登录访问 Diary API | 401 | `请先登录` |
| 未登录访问用户设置 API | 401 | `请先登录` |
| 用户设置请求包含 `userId` | 400 | `不能指定用户身份` |
| 用户设置请求尝试修改邮箱 | 400 | `邮箱暂不支持修改` |
| 用户名为空 | 400 | `用户名不能为空` |
| 时区无效 | 400 | `请输入有效的 IANA 时区` |
| 用户设置保存失败 | 500 | `保存设置失败` |
| Diary 请求体格式错误 | 400 | `日志内容格式不正确` |
| 今日 Diary 读取失败 | 500 | `读取日志失败` |
| 今日 Diary 保存失败 | 500 | `保存日志失败` |
| 历史读取失败 | 500 | `读取历史日志失败` |
| 搜索失败 | 500 | `搜索日志失败` |

