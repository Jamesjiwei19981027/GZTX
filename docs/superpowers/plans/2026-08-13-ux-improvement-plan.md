# 使用体验改进方案（2026-08-13 三轮评审落盘）

> 来源：资深用户 + 资深 PM 双视角三轮评审。第一轮聚焦留存与信任，第二轮聚焦
> 交互质量与半成品能力，第三轮聚焦运维信任与可发现性。
> 前序清单见 `2026-08-13-product-improvement-backlog.md`（P0/P1 已完成项不再重复）。
> 标注【本轮实施】的条目由智能体团队一次性实现；标注【落盘观察】的暂不动工。

## 第一轮：留存与信任（用户为什么留下来）

| # | 事项 | 判断 | 状态 |
|---|------|------|------|
| 1 | 逾期治理 + 今日聚焦：逾期任务一键批量顺延（明天/下周一/自选），仪表盘今日聚焦，正反馈文案 | 待办产品最大流失路径是逾期堆积产生负罪感 | 【本轮实施】 |
| 2 | 提醒可靠性可见：各渠道「发送测试」按钮 + 通知发送记录视图（失败标红并给原因） | 自托管用户自配 SMTP，配错却无反馈会认为「提醒是坏的」 | 【本轮实施】 |
| 3 | 回收站：软删任务可查看/恢复，30 天自动清理；关键操作 5 秒撤销 | 后端已软删（`is_deleted`），前端删了就是删了；数据安全感的底线 | 【本轮实施】 |
| 4 | 重复任务补 UI 并接通链路 | 后端已有 `is_recurring`/`recurrence_rule`/`TaskService` 生成逻辑，但异步 complete 端点没接，前端零暴露——半成品 | 【本轮实施】 |
| 5 | 多端廉价补齐：APP/小程序加「复制 ICS 订阅地址」；「回复 done 完成任务」在客户端露出 | 服务端签名 URL 已就绪，纯入口成本 | 【本轮实施】 |
| 6 | 批量操作 + 键盘流：多选、批量完成/删除/顺延；j/k/x/e 快捷键 | 后端 batch 端点已有未暴露；重度用户「能用→顺手」的分界线 | 【本轮实施】 |
| 7 | 人轴画布首触引导：空状态示例结构 + 30 秒说明；拖拽被规则拦截时气泡解释而非静默失败 | 产品最独特的能力不该让新用户对着空画布猜 | 【本轮实施】 |
| 8 | 北极星与轻遥测：自托管事件表（视图使用/任务完成），北极星=周活人均任务完成数 | 功能面已大，无度量则优先级全靠感觉；也用于验证消息/收件箱是否值得维护 | 【本轮实施·最小版】 |

## 第二轮：交互质量与半成品能力

| # | 事项 | 判断 | 状态 |
|---|------|------|------|
| 9 | 统一 Toast/撤销体系，替换全部原生 `alert()`/`confirm()`（现存 15 处） | 阻塞式弹窗打断心流；删除类操作应给撤销而非确认 | 【本轮实施】 |
| 10 | NewTaskModal 竞态修复：boot 未完成时输入的标题会被分类加载完成后的重置 effect 清空 | E2E 调试期抓到的真实缺陷，测试侧只是规避 | 【本轮实施】 |
| 11 | 快捷键帮助面板（`?` 键唤起） | Ctrl+K/N 等已有但不可发现 | 【本轮实施】 |
| 12 | 空状态质量：重点视图（仪表盘/看板/我的任务）空状态带 CTA 而非「暂无」 | 首日体验 | 【本轮实施·重点视图】 |
| 13 | i18n 一致性：有 lang 开关但新组件大量硬编码中文（GlobalSearchModal、DelegationModal 等） | 列为债务逐步收，不一次性全修 | 【落盘观察】 |
| 14 | ReportsView 413KB chunk（recharts）继续瘦身 | 已懒加载，非首屏；收益边际 | 【落盘观察】 |

## 第三轮：运维信任与可发现性

| # | 事项 | 判断 | 状态 |
|---|------|------|------|
| 15 | 版本可见：`APP_VERSION` 不再硬编码 1.0.0，构建注入；设置页显示版本，自托管用户升级可确认 | 运维信任基本盘 | 【本轮实施】 |
| 16 | 健康检查 `migration` 口径修正：`alembic_version` 已就位却恒报 `not_managed` | 误导运维判断（backlog P2 项，顺手收掉） | 【本轮实施】 |
| 17 | 数据导出/备份 UI 产品化 | backlog P2 已有，涉及面大 | 【落盘观察】 |
| 18 | 审计日志查看入口（`audit_logs` 表已有） | 超管低频需求 | 【落盘观察】 |
| 19 | 首次登录 onboarding checklist（建任务→配提醒→订日历） | 与 #7/#12 合并考虑，避免引导过载 | 【落盘观察】 |

## 本轮实施的 API 契约（后端与前端并行开发的对齐基准）

1. **回收站**
   - `GET /tasks/trash?page=&page_size=` → `{items: Task[], total}`（`is_deleted=true`，含 `deleted_at`）
   - `POST /tasks/{id}/restore` → 完整序列化任务
   - 定时清理：删除超 30 天的软删任务（scheduler 日任务）
2. **批量顺延**
   - `PATCH /tasks/batch/reschedule` body `{task_ids: int[], due_date: "YYYY-MM-DD"}` → `{updated_count}`
   - 只改属于当前用户且非只读投影的任务；保留原时刻部分（仅替换日期）
3. **通知可靠性**
   - `POST /notify/test-send` body `{channel: "email"|"webpush"}` → 立即发一条测试通知，返回成败与原因
   - `GET /notify/records?limit=` → 当前用户最近发送记录 `{items: [{channel, status, error, task_title?, created_at}]}`
4. **重复任务**
   - 建任务已接受 `is_recurring`/`recurrence_rule`（`daily|weekly|monthly|weekdays`）
   - `PATCH /tasks/{id}/complete`：`is_recurring=true` 且非实例（`parent_task_id=null`）时，完成后生成下一次实例（幂等，复用 `TaskService._calculate_next_occurrence` 语义的异步实现）
5. **遥测（最小版）**
   - `POST /events` body `{events: [{name, ts, props?}]}` 批量写入 `usage_events` 表（当前用户）；失败静默
   - `GET /events/summary?days=7`（超管）→ 按事件名聚合计数
6. **版本**
   - `GET /health` 的 `version` 读 `APP_VERSION` 环境变量（compose 注入 git describe/日期），`migration` 在 `alembic_version` 存在且为头时报 `managed`

## 验收口径

- 三端门禁全绿（backend pytest / frontend lint+test+build / flutter analyze+test）
- E2E S1–S8 通过，并新增：回收站恢复、逾期批量顺延两条冒烟
- 全部提交合入 `main`，四分支同源，容器重建后健康检查 200

## 变更日志

- 2026-08-13：三轮评审完成并落盘；【本轮实施】条目交由智能体团队（后端 / Web / APP+小程序）并行实现。
