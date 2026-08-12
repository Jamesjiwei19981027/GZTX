# RAG 知识检索系统实施计划

> 设计依据：`docs/superpowers/specs/2026-08-12-rag-knowledge-retrieval-design.md`。
> 分四个阶段实施；阶段 1 是阶段 2/3 的前置，阶段 2 与 3 可并行，阶段 4 收尾编排。
> 全程约束：`EXTRACTION_MODE=off` 默认值下既有行为与测试零变化；所有新写路径不绕过 ACL。

## 阶段 1：数据模型 + 检索基座

- Create: `backend/app/models/knowledge.py`（EvidenceFileText、KnowledgeChunk）
- Create: `backend/alembic/versions/<new>_knowledge_rag_base.py`（down_revision 接当前 head，用 `alembic heads` 确认；建表 + agent_sessions 加 summary 两列 + 按 dialect 条件建 PG GIN / SQLite FTS5+触发器，参考 `fd2e3f4a5b6c_collab_files.py` 的幂等风格）
- Create: `backend/app/services/knowledge/__init__.py`、`tokenize.py`（jieba，懒加载单例）、`chunker.py`（递归分块：标题/段落/句子，size/overlap 走 settings）、`indexer.py`（index_wiki_entry / index_evidence_file / delete_source，全删重建语义）、`search.py`（分词 → 方言分派 FTS → 可选向量余弦 → RRF 融合 → top_k）
- Create: `backend/scripts/backfill_knowledge_chunks.py`（存量 wiki 条目补切块，幂等可重跑）
- Modify: `backend/app/models/__init__.py`、`backend/app/models/agent.py`（summary 两列）、`backend/app/core/config.py`（设计文档"配置项"一节全部一次加齐）、`backend/requirements.txt`（jieba）
- Test: `backend/tests/knowledge/test_chunker.py`、`test_indexer_search.py`（SQLite FTS5 与 LIKE 降级两路；公司/项目隔离；wiki 重建删旧块）

- [ ] 迁移在空 SQLite 与现有开发库均能升到 head；PG 分支语法正确（可仅静态审查）
- [ ] chunker 对中英混排、长段落、Markdown 标题层级切块正确且带重叠
- [ ] search 在 FTS5 缺失时自动 LIKE 降级，返回结构一致
- [ ] embedding 相关代码路径在 EMBEDDING_ENABLED=false 时零外呼

## 阶段 2：抽取管线 + worker + 判定接入

- Create: `backend/app/services/extraction/__init__.py`、`router.py`（扩展名/mime → 引擎路由）、`engines.py`（plain / markitdown / docling / libreoffice 四引擎，全部 lazy import + 逐级降级）、`service.py`（extract_package：遍历包内文件写 evidence_file_texts，截断与 meta 记录）
- Create: `backend/app/workers/__init__.py`、`extractor.py`（`python -m app.workers.extractor`：轮询 `async_jobs` 中 pending 的 `evidence.extract`，行级抢占（PG `FOR UPDATE SKIP LOCKED` / SQLite 乐观更新 status），抽取完成后调 `run_evidence_judge`；异常写 job.error_message，不崩进程）
- Create: `backend/requirements-extractor.txt`（markitdown、docling、rapidocr_onnxruntime 等，版本用包管理器最新稳定）
- Modify: `backend/app/services/evidence_service.py`（submit_evidence 按 EXTRACTION_MODE 分流建 job；run_evidence_judge 装载 files_texts 传判定器；采纳后调 indexer 入 chunk；竞态补索引）
- Modify: `backend/app/api/v1/nodes.py`（内联判定仅在 off/sync 模式执行；worker 模式返回 pending job，复用现有 `/jobs/{job_id}` 轮询）
- Modify: `backend/app/services/evidence_judge.py`、`llm_evidence_judge.py`（judge 增加 `files_texts: list[dict] | None` 入参；LLM 版拼 prompt 带预算截断；规则版忽略该参数）
- Test: `backend/tests/knowledge/test_extraction.py`（off 模式行为不变；sync 模式 txt 附件正文进判定与 chunk；skipped 格式不阻断；worker 领取-抽取-判定链路用直接函数调用模拟）

- [ ] `EXTRACTION_MODE=off` 下 `pytest -q` 全绿（与改动前基线一致）
- [ ] sync 模式提交 txt → evidence_file_texts.succeeded → 采纳后 knowledge_chunks 可检索
- [ ] 未采纳包的文件正文已持久化但无 chunk
- [ ] 判定器 LLM prompt 含正文且不超预算；无 LLM 时规则判定不受影响

## 阶段 3：智能体记忆 + 召回注入 + 检索 API

- Modify: `backend/app/services/agent_runtime.py`（chat 装载历史 N 条 + 滚动摘要 system 块；超阈值 LLM 更新摘要（容错静默）；项目会话检索 top_k 注入 system 块并写 meta_json["retrieval"]；`wiki_search` 工具改调 knowledge.search，返回结构保持 items 列表兼容）
- Modify: `backend/app/api/v1/nodes.py` 或新建 `backend/app/api/v1/knowledge.py`（`GET /projects/{project_id}/knowledge/search?q=&top_k=`，ACL progress.read，404/403 语义与现有 wiki 接口一致；注册进 v1 router）
- Test: `backend/tests/knowledge/test_agent_memory.py`（历史进 messages；阈值触发摘要；FakeLLM 路径不回归）、`test_knowledge_api.py`（正常/越权/跨项目/空查询）

- [ ] 既有 agent 相关测试不回归；`/tool wiki_search` 在无 chunk 时返回空 items 而非报错
- [ ] 项目会话 assistant 消息 meta_json 含 retrieval 来源明细
- [ ] 摘要生成失败（LLM 不可用）时对话正常完成

## 阶段 4：镜像与编排

- Create: `backend/Dockerfile.extractor`（基于 backend 镜像层 + requirements-extractor.txt + LibreOffice；`ARG WITH_MODELS=0`，=1 时构建期下载 docling/RapidOCR 模型权重 → full tag）
- Modify: `docker-compose.yml`、`docker-compose.prod.yml`（新增 extractor 服务，profile `extraction`；backend 在启用该 profile 时 `EXTRACTION_MODE=worker`；SQLite 开发场景共享 `./backend/data` 卷）
- Modify: `启动指导文档.md`、`CLAUDE.md`（抽取模式、双 tag 构建命令、backfill 脚本用法各一段）
- Test: `docker build`（slim）成功；compose config 校验通过

- [ ] slim 镜像可构建、`python -m app.workers.extractor` 可启动并空轮询
- [ ] full 构建命令与离线说明写入启动文档（构建可只验证 Dockerfile 语法与下载命令存在性，不强制在本机拉 2GB）
- [ ] compose 默认（不带 profile）行为与当前完全一致

## 全局验收

- [ ] `cd backend && pytest -q` 全绿；`cd frontend && npm run typecheck` 不受影响
- [ ] 空库与存量库迁移 head 成功；backfill 脚本幂等
- [ ] Docker Compose 重建后 health 正常，`EXTRACTION_MODE=off` 默认路径回归
