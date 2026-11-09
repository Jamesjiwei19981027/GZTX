# FIXFE 第二轮报告（分支 fix/r2-web-flow）

编号｜结果｜改了哪些文件｜对应测试

1. D-2 手机完成任务报错｜已修（App 的完成函数同时接受任务对象与 id+事件，事件可省略；工作台圆圈原本即调用该函数，现可直接完成；桌面端完成/取消完成走原有 complete/uncomplete 逻辑，核对无问题）｜frontend/src/App.tsx｜frontend/scripts/test-r2-web-flow.ts（D-2 段）
2. D-4 / A-11 通知设置并发覆盖｜已修（原因：两个接口读改写同一 JSON 列，同时发出时后提交者覆盖先提交者；后端加进程内按用户互斥 + 行锁重读 + 立即提交；前端把两类写入串成一条队列，且界面偏好没变不再重复写）｜backend/app/services/notify_pref_lock.py、backend/app/api/v1/users.py、backend/app/api/v1/shell.py、frontend/src/api/serialQueue.ts、frontend/src/App.tsx｜backend/tests/test_notify_pref_merge.py（连续写与并发写）、frontend/scripts/test-pref-write-queue.ts
3. WR-03 / A-07 提醒读取通知偏好｜已修（渠道关闭则不发且不兜底；全部渠道关闭则标记结束并记原因；静音时段/周末免打扰顺延 remind_at；本地时间按 USER_TIMEZONE_OFFSET）｜backend/app/services/notify_pref_gate.py、backend/app/services/reminder_service.py｜backend/tests/test_reminder_notify_pref.py
4. C-1 材料状态映射｜已修（pending_review 显示“待负责人确认”，仅 adopted 显示已采纳）｜frontend/src/api/mappers.ts、frontend/src/types.ts｜test-r2-web-flow.ts（C-1 段）
5. C-2 负责人采纳/驳回按钮｜已修（网页人轴“材料”页，仅后端 can_review 且待确认时显示；驳回可填原因）｜frontend/src/components/views/ResponsibilityWorkspace.tsx｜test-r2-web-flow.ts（C-2 段，源码契约；未做浏览器点按实测）
6. C-3 前端驳回原因｜已修（读取 reject_reason，缺省不显示）｜mappers.ts、ResponsibilityWorkspace.tsx｜test-r2-web-flow.ts（C-3 段）
7. C-4 通知中文标题与跳转｜已修（模板键映射中文，未知键也不露原始键；材料类跳人轴、汇报类跳汇报页并切到对应项目；后端 enqueue 自动把 project_id 写入载荷）｜frontend/src/utils/notificationText.ts、NotificationsModal.tsx、InboxView.tsx、App.tsx、backend/app/services/notify/service.py｜test-r2-web-flow.ts（C-4 段）、backend/tests/collab/test_notify_service.py::test_enqueue_adds_project_id_to_payload_for_deeplink。限制：只跳到项目人轴页，未定位到具体事项/材料卡片
8. WR-19 切项目清空事项｜已修（切项目清空已选事项；保存时事项不在当前项目事项列表则丢弃）｜frontend/src/api/recordProgress.ts、frontend/src/mobile/features/progress/RecordProgressScreen.tsx｜test-r2-web-flow.ts（WR-19 段）
9. WR-14 附件随记录保存｜已修（后端原本不支持：汇报草稿 agents/chat 与个人知识新建条目补 file_ids，只认本人上传的文件，存入消息 meta / 条目 source_ref；前端带上 file_ids）。限制：知识条目界面未单独渲染附件列表｜backend/app/services/progress_attachments.py、api/v1/agents.py、api/v1/personal_knowledge.py、services/agent_runtime.py、frontend/src/api/{agents,personalKnowledge,recordProgress}.ts｜backend/tests/collab/test_record_progress_attachments.py、test-r2-web-flow.ts（WR-14 段）
10. A-01 忘记密码｜已修（send-code 新增 purpose=reset_password，存在与否、过于频繁、发送失败均同样回应；POST /auth/reset-password 统一错误提示、复用验证码错误次数上限与登录限流，成功后撤销该账号全部会话；登录页“忘记密码”表单）。限制：手机网页的独立登录页（MobileAuthScreens）未加入口｜backend/app/api/v1/auth.py、frontend/src/api/auth.ts、frontend/src/components/LoginGate.tsx｜backend/tests/test_verification.py（2 条）、test-r2-web-flow.ts（A-01 段）
11. WR-44 批量顺延跳过只读｜已修（后端返回 skipped_task_ids，批量完成同理；界面只改被处理的任务，提示“x 条只读任务未顺延”）｜backend/app/api/v1/tasks.py、frontend/src/utils/batchReschedule.ts、App.tsx、api/backend.ts｜backend/tests/test_batch_reschedule.py、test-r2-web-flow.ts（WR-44 段）
12. WR-20 接受他司邀请切公司｜已修（先取项目所属公司，刷新时优先选该公司，项目列表随之刷新）｜frontend/src/utils/activeCompany.ts、App.tsx｜test-r2-web-flow.ts（WR-20 段，纯函数 + 接线契约；未做多公司真实环境实测）
13. A-10 邀请邮箱不匹配提示｜已修（令牌有效但邮箱不一致返回“请使用收到邀请的邮箱注册”，send-code 与 register 都适用）｜backend/app/api/v1/auth.py｜backend/tests/test_launch_auth.py（更新 5.2/5.5 断言）

说明：自动化测试多为源码契约 + 纯函数 + 后端接口测试，未做浏览器端到端点按；以上“已修”指代码写完且单测/接口测通过，不等于真环境验证。

## 门禁输出

后端全量（pytest -q -p no:cacheprovider，约 11 分钟）：602 条里 7 条失败、595 通过。
- 1 条是我的改动引起（接口文档缺 reset-password 字段说明，test_api_docs::test_dict_bodies_are_documented），已修并单独重跑 6 条全过。
- 6 条为 Wiki 引擎用例（tests/collab/test_project_llm_wiki.py 4 条、tests/knowledge/test_project_wiki_engine.py 2 条），报错“Wiki 引擎未安装，请在 backend/wiki-engine 执行 npm ci && npm run build”；本工作树未构建该引擎，属环境缺失，与本次改动无关（主目录同样用例 14 条全过）。未在本树构建。
- 修复接口文档后未再整套重跑，仅重跑受影响文件。

前端：npm run lint 通过（tsc --noEmit 无输出）；npm test 退出码 0，末尾：
  ✓ 记录进展 assertions PASSED
  pref write queue: passed
  r2 web flow: 50 assertions passed
