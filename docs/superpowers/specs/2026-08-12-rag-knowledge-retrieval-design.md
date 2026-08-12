# WorkTodo 知识检索（RAG）系统设计

> 本设计补齐《团队协作与智能体-最终实现方案》中"搜索/知识：权限过滤的全文 + 向量检索（可插拔 embedding）"与 6.3 记忆规划的实现缺口。
> 现状：wiki 召回仅为 ILIKE 子串匹配、材料文件内容从不被读取、智能体对话无历史无记忆。

## 目标

1. **材料文件内容抽取**：用户上传的证据文件（PDF/Office/扫描件/图片/老格式/纯文本）抽取为文本并持久化，供 PM 智能体判定、复核重判与知识沉淀复用。
2. **统一知识检索层**：wiki 条目与已采纳材料正文统一切块入 `knowledge_chunks`，提供权限过滤的全文检索（PG tsvector / SQLite FTS5，应用层 jieba 分词），预留可插拔向量召回与 RRF 融合。
3. **智能体记忆与召回注入**：对话带历史 + 滚动摘要；项目会话自动检索知识块注入 LLM 上下文，来源可追溯。
4. **双镜像交付**：抽取 worker 独立容器，`slim`（首启下载模型）/`full`（权重打进镜像，离线可用）两个 tag，兼顾联网与离线 License 客户。

## 核心业务约束（不可违反）

- **未采纳不进知识库**：抽取正文持久化在证据域（无论采纳与否，服务复核追溯）；只有**采纳后**才切块进入 `knowledge_chunks` 检索层。
- **权限以后端为准**：所有检索路径必须经 ACL（`progress.read`，公司 + 项目双重隔离）。
- **可追溯**：chunk 记录来源（wiki 条目 / 材料文件 + 页码等元信息）；召回结果与注入内容写入消息 `meta_json` 供审计。
- **零新增基础设施**：检索收敛在主库（PG/SQLite），不引入 Elasticsearch / 独立向量库；唯一新增容器是可选的 extractor worker。

## 数据模型

### `evidence_file_texts`（证据域，抽取正文持久化）

| 字段 | 说明 |
|------|------|
| id / evidence_file_id(FK, unique) / company_id / project_id | 归属与隔离 |
| status | `pending / extracting / succeeded / failed / skipped`（skipped=不支持的格式） |
| extractor | 实际使用的引擎：`plain / markitdown / docling / libreoffice+markitdown` |
| text_md | 抽取正文（Markdown），上限 `EXTRACTION_MAX_CHARS`（默认 200_000，截断记 meta） |
| meta_json | 页数、耗时、是否截断、OCR 使用情况 |
| error_message / extracted_at / created_at | 失败原因与时间 |

### `knowledge_chunks`（检索层，统一知识块）

| 字段 | 说明 |
|------|------|
| id / company_id / project_id / node_id(nullable) | 隔离与定位 |
| source_type / source_id | `wiki_entry` → ProjectWikiEntry.id；`evidence_file` → EvidenceFile.id |
| chunk_index | 同源内序号；唯一约束 (source_type, source_id, chunk_index) |
| chunk_text | 原文块（约 500 字符，重叠 80） |
| tokens | jieba 分词后空格连接，全文索引建在此列 |
| embedding_json | 可空；EMBEDDING_ENABLED 时写入向量（JSON 数组） |
| meta_json | 页码 / 标题路径 / 原文件名 |

索引：PG 上 `GIN(to_tsvector('simple', tokens))`；SQLite 上 FTS5 外部内容表 + 同步触发器（迁移按 dialect 条件创建）。重建来源（wiki 修改 / 材料重判）时按 (source_type, source_id) 全删重建。

### `agent_sessions` 扩展

新增 `summary_text`（滚动摘要）与 `summary_upto_message_id`（摘要覆盖到的消息 id）。

## 抽取管线

**路由规则**（按扩展名/mime，`app/services/extraction/router.py`）：

- txt/md/csv/log → 内置纯文本读取（backend 镜像即可用）
- docx/xlsx/pptx/html/epub → MarkItDown
- pdf/png/jpg/tiff（含扫描件）→ Docling（版面分析 + RapidOCR 中文识别）
- doc/xls/ppt → LibreOffice headless 转新格式后走 MarkItDown
- 其余 → status=skipped

所有引擎 **lazy import**：依赖不可用时自动降级到下一档，最终纯文本失败则 skipped，永不阻断判定主流程。

**执行模式**（`EXTRACTION_MODE`，默认 `off`）：

| 模式 | 行为 |
|------|------|
| `off` | 不抽取，判定内联执行（保持现状，测试默认確定性路径） |
| `sync` | 提交时在请求进程内用轻量引擎（plain/markitdown）抽取后内联判定；裸进程调试用 |
| `worker` | 提交时建 `evidence.extract` AsyncJob，判定延后；extractor 容器轮询领任务 → 逐文件抽取写 `evidence_file_texts` → 完成后调用 `run_evidence_judge` 链式判定 |

extractor worker 复用 backend 代码包（同一 `app/` 模块，不同入口 `python -m app.workers.extractor`），镜像 = backend 依赖 + 抽取依赖（`requirements-extractor.txt`）。SQLite 开发场景 backend 与 extractor 共享数据卷（WAL + 短事务）；生产走 PG 无此限制。

## 判定器接入正文

`run_evidence_judge` 装载包内文件的 `evidence_file_texts`，以 `files_texts` 传入判定器。`LlmEvidenceJudge` 把截断后的正文（单文件 6k 字符、总预算 16k）拼入 prompt；`RuleBasedEvidenceJudge` 行为不变（保证既有测试与降级路径稳定）。

**采纳后的入库时机**：判定采纳 → 对包内所有已抽取成功的文件调用 indexer 切块入 `knowledge_chunks`，同时 wiki 摘要条目照旧创建并同步切块。若抽取晚于采纳完成（竞态），extractor 完成抽取时检查包状态，已采纳则补索引。未采纳/复核中不入检索层。

## 检索服务

`app/services/knowledge/search.py`：

1. query → jieba 分词
2. 全文候选：PG `ts_rank` / SQLite FTS5 bm25 / 降级 LIKE，取 top 50
3. 向量候选（可选，`EMBEDDING_ENABLED=true` 且配置了 embedding 模型时）：query 向 OpenAI 兼容 `/embeddings` 取向量，与项目内 chunk 的 `embedding_json` 做 Python 余弦（项目级语料量小，暴力扫描足够；规模上来后换 pgvector 镜像平滑升级）
4. **RRF 融合**去重排序，返回 top_k（默认 5）带来源引用

暴露两个消费口：

- `GET /api/v1/projects/{project_id}/knowledge/search?q=`（ACL：progress.read）
- 智能体工具 `wiki_search` 升级为调用本服务（工具名不变，兼容既有会话）；存量 wiki 条目通过 `backend/scripts/backfill_knowledge_chunks.py` 一次性补切块

wiki 条目创建/修改（手写 + 材料采纳沉淀）实时触发切块重建。

## 智能体记忆与召回注入

`AgentRuntime.chat` 改造：

1. **历史**：装载本会话最近 `AGENT_HISTORY_LIMIT`（默认 20）条消息进 LLM messages；若存在滚动摘要，以 system 块前置。
2. **滚动摘要**：未摘要消息数超过 `AGENT_SUMMARY_THRESHOLD`（默认 30）时，用当前 LLM 生成/更新 `summary_text`（失败静默容忍，不阻断对话）。
3. **召回注入**：项目会话（session.project_id 非空）先以用户输入检索知识块 top 5，作为独立 system 块注入（标注来源：wiki 标题 / 材料文件名 + 页码），召回明细写入助手消息 `meta_json["retrieval"]`。
4. FakeLLM/本地降级路径保持现状，仅追加 retrieval meta 记录。

## 配置项（`app/core/config.py` 一次性加齐）

`EXTRACTION_MODE(off)` `EXTRACTION_MAX_CHARS(200000)` `KNOWLEDGE_CHUNK_SIZE(500)` `KNOWLEDGE_CHUNK_OVERLAP(80)` `RETRIEVAL_TOP_K(5)` `AGENT_HISTORY_LIMIT(20)` `AGENT_SUMMARY_THRESHOLD(30)` `EMBEDDING_ENABLED(false)` `EMBEDDING_MODEL("")` `EMBEDDING_BASE_URL("")` `EMBEDDING_API_KEY("")`（embedding 未配 base_url 时回落公司 LLM 的 base_url/api_key）

## 部署与镜像

- `backend/Dockerfile.extractor`：`ARG WITH_MODELS=0`；`WITH_MODELS=1` 时构建期执行 `docling-tools models download` + RapidOCR 模型内置 → `extractor:full`（离线客户）；否则 `extractor:slim`（首启下载，走 HF 镜像源环境变量）。两 tag 同一 Dockerfile，代码零分叉。LibreOffice 两个 tag 都装。
- `docker-compose.yml` / `docker-compose.prod.yml` 新增 `extractor` 服务（profile `extraction`，dev 默认可不起；prod 建议起），backend 侧 `EXTRACTION_MODE` 相应设为 `worker`。
- jieba 进 backend 主 requirements（纯 Python，轻量）；docling/markitdown/rapidocr 仅进 `requirements-extractor.txt`。

## 验收

- `EXTRACTION_MODE=off` 时全部既有测试不变绿转红；空 SQLite 与现有开发库迁移到 head 均成功。
- sync 模式提交带 txt 附件 → 判定器 prompt 可见正文；采纳 → chunk 入库可检索；未采纳 → 无 chunk。
- 检索 API：正常召回 / 越权 403 / 跨项目隔离 / 空结果。
- chat：历史进上下文、超阈值产生摘要、项目会话注入召回且 meta 可审计。
- Docker：extractor slim 构建成功、worker 模式端到端（上传 → 抽取 → 判定 → 沉淀 → 检索）跑通。

## 明确边界

- 音视频转写不在本期（ASR 另有规划）；不支持格式标 skipped 不报错。
- 不引入 Elasticsearch / Milvus / Redis；向量暴力扫描按项目级语料设计，跨项目全局检索不在本期。
- rerank（bge-reranker 精排）预留融合点但不实现。
- 前端无新界面（现役 Web 尚无 wiki UI）；消费方为判定器、智能体与检索 API。
