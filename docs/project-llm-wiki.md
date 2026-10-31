# 项目 LLM Wiki

## 引入的组件

复用 [Microsoft llmwiki](https://github.com/microsoft/llmwiki) 的 MIT 核心源码，固定提交 `e09126f257c1fcf8e63234382748a51cf6a5df7f`。未改动的上游文件、许可证、逐文件 SHA-256 位于 `backend/wiki-engine/vendor/llmwiki-core/`。包管理器中未找到可安装的 `@llmwiki/core`，因此采用源码随项目分发。

上游核心提供 Markdown 页、目录、关键词查询和一致性检查。AI 分析、公司与项目隔离、原文引用校验、私人草稿、发布权限和审计由本项目实现；没有引入依赖 VS Code Copilot 的上游扩展。

## 使用

1. 进入人轴责任链，选择具体项目，打开顶部「项目知识」。手机端与桌面端共用入口。
2. 在有权限的事项下提交材料，可填写提交说明、上传 TXT/Markdown/CSV、DOCX、XLSX、PPTX 或文字 PDF。
3. 在「项目知识」选择材料，点击「AI 整理为草稿」。内容按事项交付、风险与问题、项目决策整理，保留材料编号、连续原文及抽取正文行号。
4. 草稿作者和拥有 `wiki.manual_write` 的人员可查看草稿。只有后者可以确认发布，且来源材料必须已经采纳。发布不改变事项进度、指派或材料采纳结果。
5. 已发布知识可按中文关键词搜索。下一份材料合入同一主题时追加有来源的事实并增加版本号；页面或来源变化时旧草稿不能发布，需重新生成。

AI 配置沿用系统既有「通知与 AI 设置」，按个人、公司、环境配置顺序解析，并要求启用「用于智能体」。Fake、缺少模型、模型失败均不会生成成功草稿。原文引用不匹配会拒绝整个草稿；这一检查证明引用确实来自材料，事实解释仍需发布者核对。

## 工作原理

数据库是权威存储。每次浏览或检索仅把已授权项目的已发布页构建为独立临时 Markdown 快照，调用真实上游核心，完成后删除快照。新流程不调用 embedding，不使用向量数据库；附件解析也不会触发旧的知识块索引。LLM Wiki 条目不能由旧索引器收录，避免私人草稿进入共享检索。

原始材料保留在既有材料存储中；发布只修改知识页与审计记录。页面元数据保留来源、引用、版本、发布者。发布事务会核对材料正文指纹、采纳状态和已审阅页面版本，防止旧草稿覆盖新知识。

## 安装与部署

本地需要 Python 依赖及 Node.js 22+：

```powershell
cd backend
python -m pip install -r requirements.txt
cd wiki-engine
npm ci --ignore-scripts
npm run build
```

开发 `backend/Dockerfile` 和生产 `backend/Dockerfile.prod` 均打包 Node 与核心。该功能复用 `project_wiki_entries`，没有新增数据库迁移。部署仍应遵循项目本身的既有迁移要求。

依赖管理使用锁文件；`js-yaml` 固定到 4.3.2，桥接层适配新版 YAML API，保留上游文件原样。可通过 `npm audit --omit=dev` 检查 Node 运行依赖。

## 当前边界

- 外链仅保留记录，不自动抓取网页；需提交可读正文或附件。
- 默认使用 MarkItDown 解析 Office 与文字 PDF，没有默认安装 OCR。扫描件、空正文、解析降级乱码或截断文件会明确报错。行号对应抽取后的正文，不是 PDF 页码或 Word 页码。
- 单次最多处理 40 段，每段 12,000 字符，全部段落都会分析；超限要求分批。模型逐段请求，等待时间随材料增长，当前未引入后台队列。
- 搜索是关键词匹配，无语义向量召回。每次重建项目临时快照，适合目前项目级材料规模；尚未进行大规模性能基准，文档少不等于可保证固定延迟。
- 已发布事实保留历史引用。来源后来被替代不自动删除已发布内容，需管理人员结合材料版本核对；新旧结论发生冲突时必须人工判断。
- 当前联调环境未配置真实 LLM；自动化使用明确的模型测试桩验证流程，不能据此认定真实模型的整理质量已验证。

## 验证命令

```powershell
cd backend
python -m pytest tests/collab/test_project_llm_wiki.py tests/knowledge/test_project_wiki_engine.py tests/knowledge/test_project_wiki_parsers.py tests/knowledge/test_extraction.py tests/knowledge/test_indexer_search.py -q
cd ../frontend
npm run lint
npm run build
npx playwright test e2e/project-wiki.spec.ts e2e/people-axis-native.spec.ts --workers=1 --reporter=line
```

组件浏览器测试需要 `127.0.0.1:5174` 上的 Vite 开发服务。真实联调仅使用独立 `axis_joint_debug_20261018.db`，不修改日常数据库。


## 本次联调记录（2026-10-18）

- 相关后端回归 49 项通过，真实 XLSX、PPTX、文字 PDF 解析另 3 项通过；DOCX 已包含在流程回归内。
- 前端类型检查、生产构建、30 项组件浏览器回归通过；真实接口手机/桌面检查 2 项通过，检查了缺少模型时不生成草稿。
- Node 运行依赖 audit 为 0 个已知漏洞，26 个上游文件 SHA-256 全部匹配。
- Docker Hub 认证端点网络故障导致生产镜像构建未完成。当前独立联调容器通过复制官方校验后的 Node 22.14.0、核心文件及安装解析依赖运行成功。重新创建该容器前应使用更新后的 Dockerfile 构建镜像，直接补装的运行时不会随旧镜像保留。
- 通过本机 Clash Verge 代理 `127.0.0.1:7897` 重试后，生产镜像 `gongzuotix-wiki-prod:20261018` 已构建成功。构建命令：`docker build --build-arg HTTP_PROXY=http://host.docker.internal:7897 --build-arg HTTPS_PROXY=http://host.docker.internal:7897 --build-arg NO_PROXY=localhost,127.0.0.1,::1 -f Dockerfile.prod -t gongzuotix-wiki-prod:20261018 .`。容器内 Node 22.23.3、Wiki 中文检索/快照隔离与 `/api/v1/health` 均已通过冒烟验证。
- 没有配置真实 LLM，没有验证真实模型整理质量，也没有对 iOS 或新 APK 进行本功能专项测试。
