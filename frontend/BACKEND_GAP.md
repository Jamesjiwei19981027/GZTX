# Remix UI ↔ GZTX 后端融合：缺口清单

> 新 UI 路径：`remix-flow---productivity-&-task-management/`  
> 现有后端：`backend/`（Docker 暴露 `http://127.0.0.1:8010/api/v1`）  
> 更新日期：2026-08-01（壳层全量补齐轮）

## 已对接

| 新 UI 能力 | 后端 API | 说明 |
|------------|----------|------|
| 登录 | `POST /auth/login`、`GET /users/me` | `LoginGate` + token |
| 个人任务 CRUD/完成 | `/tasks*` | status 0/1/2；看板同映射 |
| 跨项目任务列表 | `GET /tasks` | 用户域任务即「全盘」聚合 |
| 任务 ↔ 人轴事项 | `Task.project_node_id` + `PUT /tasks/{id}` | 单向关联；UI 字段 `linkedNodeId` |
| 项目列表切换 | `GET /companies/mine`、`GET /projects` | Navbar |
| 人轴读/写 | tree / nodes / move / evidence | 绑定真实 projectId |
| 人轴布局偏移 | `PUT /nodes/{id}/layout` | 写入 `progress_json.ui_offset` |
| 终责轴向偏移 | `PUT /projects/{id}/final-owner-position` | 滑条写回 `along_delta` |
| 证据 kind/URL | `EvidenceSubmit.evidence_kind` / `external_url` | 落入 structured/links |
| 项目成员 / 邀请 | members + invitations | Team 页 |
| 在线状态 | `PUT /users/me/presence`、`GET .../presence` | 心跳启发式 |
| 消息频道 | `/companies/{id}/channels`、`/channels/.../messages` | shell 新表 |
| 通知中心 | `GET/PUT /notifications/collab*` | 已读/全部已读 |
| 收件箱 | collab 通知 + integrations | 集成列表需超管时可为空 |
| 报表趋势 | `GET /tasks/stats/trend` | 周/月序列 |
| Dashboard 活动 | `GET /projects/{id}/activity` | 审计/证据回落 |
| 人轴审计 | `POST /projects/{id}/axis-audit` | 启发式风险，不走前端 Gemini |
| UI 偏好云同步 | `GET/PUT /users/me/ui-prefs` | `notify_pref.ui` |

本地：`npm run dev`（:3000，`/api` → :8010）。人轴写回需选**具体项目**。

## 刻意不做 / 残留边界

| 项 | 说明 |
|----|------|
| 看板列配置 / WIP | 三列 = 任务 status，不做人轴替代 |
| 第三方伪邮件收件 | 已改为协作通知流；真 Gmail/GitHub feed 仍无 |
| 前端 Gemini | 禁止；审计走服务端启发式 |
| 集成列表权限 | `GET .../integrations` 需超管；普通成员见空列表属预期 |
| 调色板强类型 | 仍用 `person` + description 表达厂商/主管 |

## 相关文件

- 新 UI：`src/api/{backend,shell,mappers}.ts`、`src/components/views/*`
- 后端壳层：`backend/app/api/v1/shell.py`、`models/shell.py`
- 迁移：`alembic/versions/f6a7b8c9d0e1_shell_channels_presence.py`
