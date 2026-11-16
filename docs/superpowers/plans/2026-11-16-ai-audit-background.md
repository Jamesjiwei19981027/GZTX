# 第二轮 AI 审计后台执行计划

依据：用户 FEATAUD2 要求及 `../specs/2026-11-16-ai-audit-design.md`。
约束：不提交，不改 Docker/代理/指定端口服务，不改人轴卡片，保留已有修改。

## 后端

1. 先增加 POST 立即返回 running 的回归断言并观察失败。
2. 新迁移接在 ft8b9c0d1e2f 后，添加 status、started_at、finished_at；存量记录回填 done。
3. run 同步授权、材料及规则快照，保存 running；旧兼容接口仍 done+rule。
4. 复用 APScheduler 每 5 秒扫描待处理记录，原子认领，独立会话执行。主模型 180 秒，每个收件人 120 秒，并发 4。模型错误回退 done+rule，权限/归属变化丢弃 AI，调度进程重启将遗留 running 标 failed。
5. 假模型验证成功、超时、异常、坏 JSON、权限/归属/会话变化、输入上限、收件人投影与迁移。

## 共享网页

1. AuditRun 增加状态时间字段，统一状态文案。
2. 轮询当前详情与历史中的 running，每 5 秒请求详情，完成自动替换结果；离页、切项目停止并忽略旧响应。
3. 增加轮询行为与状态渲染测试，不增加依赖，桌面/手机/Web Shell 复用 AuditPanel。

## 原生 APP

1. AxisAuditRecord 增加状态时间字段。
2. Timer 轮询 running 详情，完成刷新；dispose、项目/会话切换取消并忽略旧响应。
3. Widget 测试覆盖进行中、完成/回退、离页停止与切项目。

## 验收与报告

亲自前台执行 backend DEBUG=true pytest -q、frontend npm run lint 和 npm test、app flutter analyze 和 flutter test，保留完整日志及原始末尾。
更新设计及 FEATAUD-REPORT.md 第二轮章节，记录迁移与调度选择、改动文件和设备验收限制。
最终只读复核接口一致性、安全边界及测试覆盖，不提交。

## 执行记录

- 初始工作区仅 .feataud-tmp/、FEATAUD-REPORT.md、FEATAUD-evidence/ 未跟踪，保持原内容。
- JevRouter 调用失败：missing_jev_api_url，无 live 决策/置信度。
- 采用 subagent-driven-development 分工共享网页及 APP；后端与最终门禁由主代理执行。用户已给出明确设计和执行授权，沿用该授权，不重复请求批准。
- 接口契约：status=running|done|failed；started_at 可空（排队未开始），finished_at 可空；running 暂为 rule 并含完整规则快照；fallback_reason 为中文；旧记录无状态的客户端兼容为 done。
- 后端实现与定向回归完成：独立迁移、APScheduler 持久化排队/认领/恢复、独立会话、超时透传及最终权限复验。
- 共享网页实现完成：生产轮询器定向测试、真实 Chromium 桌面/390px、切项目/卸载、同/跨标签身份切换与续期、首次订阅竞态共 6 项浏览器行为回归通过。完整 lint/test 退出码 0。
- 原生 APP 实现完成：Timer、历史恢复、路由覆盖/返回、会话代次与旧响应防护；完整 analyze 无问题、test 1209 通过。仅两张审计 Golden 因新增状态文字更新，已经视觉核对。
- 复核修复：全局 AI 成功但本人生成失败的投影补中文回退原因；网页退出/切账号丢弃旧响应；首次 render 与订阅间换账号立即同步代次。独立复核确认无待修复项。
- 最终后端门禁在项目外 TEMP 目录执行，避免旧有私钥路径测试误命中工作树；运行结束后由真实原始日志生成根报告，报告保留第一轮原内容。
- 最终完整门禁：后端 866 passed in 830.08s；网页 lint/test 退出码 0、真实 Chromium 6 passed；同一 Flutter SDK 缓存 CLI analyze 无问题、test 1209 通过。日志已提取到根报告第二轮章节。
- 安卓枚举仍报 Cannot mkdir '\.android': Permission denied，设备点击、iOS/微信未执行；可选通知未实现。临时目录递归清理被自动权限审查 blocked by policy，保留目录且不绕过。

## 验收映射

| 需求 | 实现与证据入口 |
| --- | --- |
| 发起立即返回规则与 running | axis_audit.run；test_start_returns_before_model_and_keeps_rules / test_success_runs_outside_request_and_once |
| 独立后台、超时、中文回退、终态 | axis_audit_jobs；test_axis_audit_background.py；双协议 HTTP MockTransport 测试 |
| 授权、会话、归属变更丢弃与被审人投影 | validate_job / project_result；test_axis_audits.py 与后台参数化回归 |
| 重启、意外异常不留 running | scheduler/main 启动恢复；restart / unexpected_worker_error 回归 |
| 迁移与输入上限 | fu9c0d1e2f3a；存量升级/降级测试与 60000 字符/41 人测试 |
| Web/APP 状态及轮询 | test-axis-audit.tsx、axis-audit-background.spec.ts、axis_audit_background_test.dart |
| 三端完整门禁及实际限制 | FEATAUD-evidence/round2-*.log；FEATAUD-REPORT.md 第二轮章节 |
