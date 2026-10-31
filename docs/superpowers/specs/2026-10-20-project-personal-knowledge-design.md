# 项目知识空间与授权沉淀

## 目标

每个项目有独立共享知识空间，复用现有已发布项目 Wiki 及手写项目知识。获得明确授权的成员能调用自己的 AI 总结选中的共享知识，预览和编辑后确认存入本人当前项目知识库。Web、Flutter WebView APP、微信小程序同步。

## 知识与权限边界

- 已发布 `ProjectWikiEntry.source=llm_wiki` 和手写 `manual` 是共享来源；草稿、未发布审阅、其他人的私人知识和原始私人材料不参与总结。
- 当前公司在职成员且当前项目有效成员可读项目共享页。
- 项目经理默认能总结并管理授权；明确授权的普通成员才能生成和沉淀。仅项目经理或同项目有效成员中的公司管理员可管理授权。
- 授权不会改变项目 Wiki 发布权限或人轴管理权限。不能向非当前项目成员授权。
- 权限撤销或成员离开后，生成和保存都拒绝。模型调用完成后再次校验权限。已合法保存的个人知识不因总结授权撤销而删除；项目成员资格撤销仍按个人空间现有规则禁止访问。
- 个人总结草稿只有本人可读写，管理者没有查看他人草稿的后门；所有查询校验公司、项目、所有者。

## 完整流程

知识空间新增“我的知识 / 项目知识”切换。项目知识展示共享页、来源和引用关系图；图只反映明确来源，不捏造知识关系。选择页面并填写可选整理要求，点击“让我的 AI 总结”，返回带可核对来源的草稿。用户可修改标题、正文和标签，确认后存入本人当前项目 Wiki。

没有真实可用模型时返回明确配置错误，不生成假总结。模型输出要求结构化事实与原文引用，引用必须来自所选页。内容过长明确要求分批，不能默默忽略选中资料。生成或保存遇到授权撤销、源页更新或范围切换时不能写入旧范围。保存幂等，不覆盖手改，也不恢复已删除条目。

总结草稿保存所选页面的内容指纹、引用快照、调用用户与项目、模型来源及保存状态。确认时再次验证来源仍存在且版本一致；不一致返回409要求重新总结。个人条目 source_type=project_summary、source_id=草稿ID、source_ref 包含项目、草稿和来源页引用快照。授权变更与确认保存写审计。

## 三端界面

- 复用“我的知识空间”入口，新加项目共享页签和说明；项目选择沿用当前范围。
- 项目页：共享页列表/详情、真实来源图、勾选、整理要求、生成按钮、生成失败说明。
- 预览：标题、可编辑正文、标签、来源页与摘引、确认存入我的知识；重复保存展示既有结果。
- 项目经理：显示当前有效成员的总结授权开关，变更成功由服务端结果确认。
- 普通成员未获授权时显示申请说明和禁用总结操作。
- 个人页展示“项目知识总结”来源类型；新保存条目可在个人列表和知识图中使用。

## 数据与接口

新增独立授权表和个人总结草稿表，迁移继承 fi7d8e9f0a1b。项目 Wiki 和个人条目继续复用，不把私有总结反写项目公共索引。

REST 根路径 `/projects/{project_id}/knowledge-space`：

- GET：`{scope:{company_id,project_id,owner_user_id},pages:Page[],permissions:{can_summarize,can_manage_grants},members:Member[]}`。
- Page：`{id,title,body_text,source,meta,updated_at}`，meta保留项目原始引用。
- Member：`{user_id,name,can_summarize,is_manager}`；只有授权管理者收到其他成员清单。
- PUT `/grants/{user_id}` `{can_summarize:boolean}` -> Member。
- POST `/summaries` `{page_ids:number[],instruction?:string}` -> Summary。
- GET `/summaries/{id}` -> 本人Summary，刷新可恢复。
- POST `/summaries/{id}/save` `{title,body_text,tags:string[]}` -> `{entry:PersonalKnowledgeEntry,already_saved:boolean}`。
- Summary：`{id,title,body_text,sources:[{page_id,title,quote}],page_ids:number[],status:'draft'|'saved',provider,model_source,personal_entry_id:number|null}`。

## 验收

后端真实数据库/API测试覆盖授权/撤销、他人草稿、跨项目/公司、私有资料隔离、原文引用验证、模型缺失、模型后撤权、源更新、幂等与已删除条目。浏览器覆盖普通成员与管理者、选页生成/编辑/保存、失败文字保留、项目切换迟到响应。小程序行为测试和JS/JSON检查，安卓模拟器验证真实入口和权限未配置模型反馈；不声称未执行的iOS/微信设备验收。
