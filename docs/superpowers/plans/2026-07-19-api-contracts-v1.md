# API Contracts v1 — 团队协作 HTTP 真源

> **版本**：v1 / 2026-07-19  
> **Base URL**：`/api/v1`  
> **权威性**：HTTP 路径、方法、请求/响应 JSON、错误码以**本文**为准；表字段细节见附录可实施规格；工程选择见 `dev-handoff-patch.md`。  
> **认证**：`Authorization: Bearer <access_token>`（与现网一致），除注明 Public 的接口。  
> **通道**：可选 `X-Client-Channel: web | miniprogram | wechat`（默认 `web`）。

---

## 0. 通用约定

### 0.1 信封

```typescript
interface ResponseData<T = unknown> {
  code: number;      // 200 成功；其它见 handoff §3.3
  message: string;   // 中文
  data: T | null;
}
```

### 0.2 分页（列表类）

```typescript
interface PageQuery {
  page?: number;       // default 1
  page_size?: number;  // default 20, max 100
}

interface PageData<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
```

列表成功：`data: PageData<T>` 或文档写明的非分页数组。

### 0.3 公共类型

```typescript
type ISODateTime = string; // e.g. "2026-07-19T08:00:00Z" or +08:00

type DeployMode = "single_company" | "saas";
type CompanyStatus = "pending_license" | "active" | "readonly" | "suspended";
type MembershipStatus = "active" | "disabled";
type EmploymentStatus = "active" | "left" | "unknown";
type ProjectStatus = "draft" | "active" | "archived";
type BehaviorTemplate = "scope" | "work_item" | "milestone";
type WorkItemStatus = "not_started" | "in_progress" | "blocked" | "pending_acceptance" | "done";
type MilestoneStatus = "not_reached" | "at_risk" | "reached";
type ProjectMemberRole = "pm" | "member";
type EvidenceStatus =
  | "draft" | "submitted" | "precheck_failed" | "judging"
  | "adopted" | "rejected" | "superseded";
type ProgressSource =
  | "pm_agent_auto" | "executor_clear_text" | "human_pm_confirm" | "correction";
type ProgressEventType =
  | "set_status" | "set_percent" | "set_checklist" | "set_milestone" | "recompute_scope";
type ReviewCaseType = "rejection_review" | "progress_correction" | "pm_supplement";
type ReviewCaseStatus =
  | "open" | "agent_concluded" | "awaiting_pm" | "confirmed" | "dismissed";
type AgentKind = "system_executor" | "system_pm" | "user_created";
type AgentScene = "general" | "progress_update" | "report" | "pm_judge" | string; // custom:*
type NotifyChannel = "in_app" | "wechat" | "email" | "sms";
type JobStatus = "pending" | "running" | "succeeded" | "failed";
type ClientChannel = "web" | "miniprogram" | "wechat";
```

### 0.4 progress_json

```typescript
interface ProgressWorkItem {
  template: "work_item";
  status: WorkItemStatus;
  percent: number; // 0-100
  checklist: { key: string; label: string; done: boolean }[];
  updated_at: ISODateTime;
  last_record_id: number | null;
}

interface ProgressMilestone {
  template: "milestone";
  status: MilestoneStatus;
  updated_at: ISODateTime;
  last_record_id: number | null;
}

interface ProgressScope {
  template: "scope";
  summary: {
    total_work_items: number;
    done: number;
    blocked: number;
    milestones_reached: number;
    milestones_total: number;
    rollupon: string;
  };
  updated_at: ISODateTime;
  last_record_id: number | null;
}

type ProgressJson = ProgressWorkItem | ProgressMilestone | ProgressScope;
```

---

## 1. Companies · License · Membership · Policy

### 1.1 `POST /companies`

**Auth**: 登录用户；SaaS 自助开通或单公司 bootstrap 后少用。  
**Body**:

```json
{
  "name": "示例科技",
  "slug": "acme",
  "policy_preset": "standard"
}
```

**Data**:

```json
{
  "id": 1,
  "name": "示例科技",
  "slug": "acme",
  "status": "pending_license",
  "policy_preset": "standard",
  "entitlement": {},
  "created_at": "2026-07-19T00:00:00Z"
}
```

创建者自动 membership：`is_super_admin=true`, `is_org_leader=true`。

**Errors**: `40900` slug 占用。

---

### 1.2 `GET /companies/{company_id}`

**Auth**: 本公司 active membership。  
**Data**:

```json
{
  "id": 1,
  "name": "示例科技",
  "slug": "acme",
  "status": "active",
  "policy_preset": "standard",
  "policy": {},
  "entitlement": {
    "features": { "project_tree": true, "agents": true },
    "quotas": { "max_users": 200, "max_projects": 50 },
    "valid_to": null,
    "on_expire": "readonly"
  },
  "login_methods": {
    "password": true,
    "wechat": true,
    "wecom": false,
    "dingtalk": false,
    "feishu": false
  },
  "my_membership": {
    "status": "active",
    "is_super_admin": true,
    "is_org_leader": true,
    "employment_status": "active",
    "title": null
  }
}
```

---

### 1.3 `POST /companies/{company_id}/license`

**Auth**: super_admin。  
**Body**:

```json
{
  "license_payload": "{\"company_slug\":\"acme\",\"features\":{\"project_tree\":true,\"agents\":true},\"quotas\":{\"max_users\":50},\"valid_to\":\"2027-07-19T00:00:00Z\"}",
  "signature": "<hmac-hex>"
}
```

**Data**: `{ "status": "active", "valid_to": "...", "features": {} }`  
**Errors**: `40303`；签名/过期 → `42200` message 说明。

---

### 1.4 `POST /companies/saas-open`

**Auth**: 登录用户。`DEPLOY_MODE=saas`。  
**Body**: `{ "name", "slug", "plan_code": "standard" }`  
**Data**: company + activation 摘要。  
**Errors**: `40311` 若环境不允许。

---

### 1.5 `PATCH /companies/{company_id}/policy`

**Auth**: super_admin。  
**Body**:

```json
{
  "policy_preset": "controlled",
  "policy_json": { "llm_egress": "allowlist", "allowed_model_ids": ["private:llm1"] },
  "login_methods": { "wecom": true }
}
```

**Data**: 更新后 company 策略摘要。

---

### 1.6 `GET /companies/{company_id}/members`

**Auth**: 本公司成员。  
**Query**: `page`, `page_size`, `status?`  
**Data**: `PageData<MembershipDTO>`

```typescript
interface MembershipDTO {
  user_id: number;
  username: string;
  nickname: string | null;
  status: MembershipStatus;
  employment_status: EmploymentStatus;
  is_super_admin: boolean;
  is_org_leader: boolean;
  org_unit_id: number | null;
  title: string | null;
}
```

---

### 1.7 `PATCH /companies/{company_id}/members/{user_id}`

**Auth**: super_admin。  
**Body**: `{ "is_org_leader"?: boolean, "is_super_admin"?: boolean, "status"?: MembershipStatus, "title"?: string }`  
**Data**: MembershipDTO。

---

### 1.8 `GET /companies/{company_id}/features`

**Auth**: 成员。  
**Data**: `{ "features": Record<string, boolean>, "unlocked": boolean, "status": CompanyStatus }`  
未解锁时 `unlocked=false`，features 可能全 false。

---

## 2. Projects · Members · Invitations

### 2.1 `POST /projects`

**Auth**: OrgLeader（handoff §1）。**Feature**: `project_tree`。  
**Body**: `{ "name": "营销改版", "company_id": 1 }`  
**Data**:

```json
{
  "id": 10,
  "company_id": 1,
  "name": "营销改版",
  "status": "draft",
  "pm_user_id": null,
  "created_by": 3,
  "created_at": "2026-07-19T00:00:00Z"
}
```

**Errors**: `40304`, `40312`, `40310`, `40901` max_projects。

---

### 2.2 `GET /projects`

**Auth**: 登录。  
**Query**: `company_id`（必填）, `status?`, `page`, `page_size`  
**规则**: 返回我是 active 成员（left_at null）的项目；超管/OrgLeader 可加 `as_admin=true` 看公司全部。  
**Data**: `PageData<ProjectDTO>`

```typescript
interface ProjectDTO {
  id: number;
  company_id: number;
  name: string;
  status: ProjectStatus;
  pm_user_id: number | null;
  pm_nickname?: string | null;
  my_role?: ProjectMemberRole | null;
  created_at: ISODateTime;
  archived_at?: ISODateTime | null;
}
```

---

### 2.3 `GET /projects/{project_id}`

**Auth**: 项目成员或超管。  
**Data**: ProjectDTO + `{ "member_count": number }`。

---

### 2.4 `POST /projects/{project_id}/pm`

**Auth**: 超管 | created_by | 现 PM。  
**Body**: `{ "user_id": 9 }`  
**Data**: `{ "project_id", "pm_user_id": 9 }`  
副作用：upsert `project_members` role=pm；旧 PM → member（若存在）。

---

### 2.5 `POST /projects/{project_id}/members`

**Auth**: PM（或 delegation `member.pull` P1）。  
**Body**:

```json
{ "user_id": 8, "mode": "pull" }
```

**Data**: `{ "project_id", "user_id", "role": "member", "joined_at": "..." }`  
**Errors**: `40301/40305`, `40314` 对方离职, `40903` 已是活跃成员。  
要求：被拉人必须本公司 active membership。

---

### 2.6 `POST /projects/{project_id}/invitations`

**Auth**: PM。  
**Body**: `{ "user_id"?: number, "email"?: string }` 二选一。  
**Data**: `{ "id", "token", "status": "pending", "expires_at" }`  
（token 仅创建响应返回一次，列表不回完整 token）。

---

### 2.7 `POST /projects/invitations/{token}/accept`

**Auth**: 登录用户且匹配 invitee。  
**Data**: `{ "project_id", "role": "member" }`。

---

### 2.8 `POST /projects/{project_id}/leave`

**Auth**: 项目成员（非强制 PM 先转让——若是唯一 PM，status 保持但 pm_user_id 可空，**P0：PM leave 前必须先转让或 422**）。  
**Data**: `{ "left_at": "..." }`。

---

### 2.9 `POST /projects/{project_id}/archive`

**Auth**: PM 或超管。  
**Data**: `{ "status": "archived", "archived_at": "..." }`。  
归档后写操作 403 `40313` 类提示「项目已归档」。

---

### 2.10 `GET /projects/{project_id}/members`

**Auth**: 项目成员。  
**Data**: `{ "items": [ { "user_id", "nickname", "role", "joined_at", "left_at" } ] }`。

---

## 3. Tree · Nodes · Assignees

### 3.1 `GET /projects/{project_id}/tree`

**Auth**: 项目成员。  
**Query**: `format=nested|flat`（default `nested`）。  
**Data nested**:

```typescript
interface TreeNodeDTO {
  id: number;
  parent_id: number | null;
  node_type_key: string;
  behavior_template: BehaviorTemplate;
  title: string;
  description: string | null;
  sort_order: number;
  path: string;
  depth: number;
  start_at: ISODateTime | null;
  due_at: ISODateTime | null;
  milestone_at: ISODateTime | null;
  allow_clear_text_progress: boolean;
  progress_json: ProgressJson;
  assignees: { user_id: number; role_key: string; nickname?: string }[];
  children?: TreeNodeDTO[];
}
```

`data: { "project_id", "nodes": TreeNodeDTO[] }`（森林：多根）。

---

### 3.2 `POST /projects/{project_id}/nodes`

**Auth**: ACL `tree.edit_any` 或 `tree.edit_subtree`（parent 路径下）。  
**Body**:

```json
{
  "parent_id": null,
  "node_type_key": "work_item",
  "title": "登录改版",
  "description": null,
  "due_at": "2026-08-01T16:00:00+08:00",
  "start_at": null,
  "milestone_at": null,
  "allow_clear_text_progress": false,
  "sort_order": 0,
  "assignees": [{ "user_id": 8, "role_key": "primary" }]
}
```

**Data**: 单节点 TreeNodeDTO（无 children）。  
**Errors**: `42204` 环（创建时一般无）；`404` parent；类型 key 未知 `42200`。

系统内置 `node_type_key`: `scope` | `work_item` | `milestone`。

---

### 3.3 `GET /nodes/{node_id}`

**Auth**: 项目成员。  
**Data**: TreeNodeDTO。

---

### 3.4 `PATCH /nodes/{node_id}`

**Auth**: tree.edit_* 。  
**Body**（均可选）:

```json
{
  "title": "登录改版 v2",
  "description": "...",
  "due_at": null,
  "start_at": null,
  "milestone_at": null,
  "allow_clear_text_progress": true,
  "sort_order": 2
}
```

**禁止** body 直接传 `progress_json`（正式进度走材料/复核 API）。  
**Data**: TreeNodeDTO。

---

### 3.5 `POST /nodes/{node_id}/move`

**Auth**: tree.edit_any（P0：仅 PM；子树 owner P0 可做同 path 限制）。  
**Body**: `{ "new_parent_id": 3, "sort_order": 1 }`  
`new_parent_id: null` = 移到根。  
**Errors**: `42204` 成环。  
**Data**: TreeNodeDTO（path 已更新）。

---

### 3.6 `DELETE /nodes/{node_id}`

**Auth**: PM。  
**语义**: 软删 `is_deleted=true`；**不**删 progress_records。  
**Data**: `{ "id", "is_deleted": true }`。

---

### 3.7 `PUT /nodes/{node_id}/assignees`

**Auth**: PM 或 tree.edit_subtree。  
**Body**: `{ "assignees": [ { "user_id": 8, "role_key": "primary" }, { "user_id": 9, "role_key": "collaborator" } ] }`  
全量替换。  
**Data**: assignees 列表。

---

## 4. Evidence · Files · Jobs

### 4.1 `POST /evidence/files`

**Auth**: 登录 + 将用于某项目成员（P0：任意登录用户上传到个人暂存，submit 时校验节点成员）。  
**Channel**: **禁止 wechat** → `40320`。  
**Content-Type**: `multipart/form-data`  
**Fields**: `file` (binary)  
**Data**:

```json
{
  "file_id": 1,
  "storage_key": "ev/tmp/1/a.png",
  "original_name": "a.png",
  "mime_type": "image/png",
  "size_bytes": 12345,
  "sha256": "..."
}
```

---

### 4.2 `POST /nodes/{node_id}/evidence`

**Auth**: 项目成员 + employment active。  
**Channel**: wechat 允许纯说明草稿但 **file_ids 非空则 40320**；产品原则：微信侧走 chat 更新，不鼓励本接口；P0 实现：wechat 通道 **一律 40320**。  
**Body**:

```json
{
  "summary_text": "已完成接口联调",
  "structured": {
    "percent": 80,
    "checklist": [{ "key": "ut", "label": "单测", "done": true }]
  },
  "links": [{ "url": "https://git/pr/1", "title": "PR", "kind": "pr" }],
  "file_ids": [1, 2],
  "supersedes_package_id": null
}
```

**Data**:

```json
{
  "package_id": 55,
  "status": "submitted",
  "job_id": "12"
}
```

预检失败：`status=precheck_failed` 可同步返回 `code=42200` + `data.precheck_errors`。  
成功提交后：package 不可被提交人 PATCH。

---

### 4.3 `GET /evidence/{package_id}`

**Auth**: 材料读集（附录 E）。  
**Data**:

```typescript
interface EvidencePackageDTO {
  id: number;
  company_id: number;
  project_id: number;
  node_id: number;
  submitter_user_id: number;
  status: EvidenceStatus;
  summary_text: string | null;
  structured: Record<string, unknown> | null;
  links: { url: string; title: string; kind: string }[] | null;
  files: {
    file_id: number;
    original_name: string;
    mime_type: string | null;
    size_bytes: number;
    kind: string;
  }[];
  supersedes_package_id: number | null;
  precheck_errors: unknown;
  judge_result: {
    decision?: string;
    reason?: string;
    confidence?: number;
  } | null;
  submitted_at: ISODateTime | null;
  judged_at: ISODateTime | null;
  created_at: ISODateTime;
}
```

---

### 4.4 `GET /nodes/{node_id}/evidence`

**Auth**: 项目成员。  
**Query**: `page`, `page_size`  
**Data**: `PageData<EvidencePackageDTO>`（可缩略无 files 内容）。

---

### 4.5 `GET /jobs/{job_id}`

**Auth**: 同公司成员且 job 属其公司。  
**Data**:

```json
{
  "job_id": "12",
  "job_type": "evidence.judge",
  "status": "succeeded",
  "result": { "package_id": 55, "decision": "adopted" },
  "error_message": null,
  "created_at": "...",
  "finished_at": "..."
}
```

---

## 5. Progress · Review · Corrections

### 5.1 `GET /nodes/{node_id}/progress`

**Auth**: progress.read。  
**Data**:

```json
{
  "node_id": 12,
  "progress_json": { "template": "work_item", "status": "done", "percent": 100, "checklist": [], "updated_at": "...", "last_record_id": 99 },
  "recent_records": [ /* ProgressRecordDTO 最多 10 条 */ ]
}
```

---

### 5.2 `GET /nodes/{node_id}/progress/records`

**Auth**: progress.read。  
**Query**: `limit=50`（max 100）  
**Data**: `{ "items": ProgressRecordDTO[] }`

```typescript
interface ProgressRecordDTO {
  id: number;
  event_type: ProgressEventType;
  source: ProgressSource;
  actor_user_id: number | null;
  evidence_package_id: number | null;
  review_case_id: number | null;
  before_json: ProgressJson | Record<string, unknown> | null;
  after_json: ProgressJson | Record<string, unknown>;
  reason: string | null;
  created_at: ISODateTime;
}
```

---

### 5.3 `POST /evidence/{package_id}/review-request`

**Auth**: 提交人或 PM。  
**Body**: `{ "reason"?: string }`  
**Data**: `{ "case_id": 7, "status": "open" }`  
适用：package 为 rejected。

---

### 5.4 `POST /review-cases/{case_id}/supplement`

**Auth**: PM。  
**Body**: `{ "text": "与提交人沟通后材料有效" }`  
**Data**: `{ "case_id", "status": "open"|"agent_concluded" }`。

---

### 5.5 `POST /review-cases/{case_id}/confirm`

**Auth**: PM（人确认）。  
**Body**:

```json
{
  "decision": "adopted",
  "progress_after": {
    "template": "work_item",
    "status": "done",
    "percent": 100,
    "checklist": []
  },
  "wiki_title": "可选",
  "wiki_body": "可选"
}
```

**副作用（事务「四件事」）**：  
1) 若 adopted：`append_progress` source=`human_pm_confirm`  
2) wiki 沉淀（若 adopted）  
3) 通知提交人  
4) audit  
**Data**: `{ "case_id", "status": "confirmed", "progress_record_id": 100 | null }`。

---

### 5.6 `POST /nodes/{node_id}/corrections`

**Auth**: 项目成员。  
**Body**:

```json
{
  "reason": "误标完成",
  "proposed_after": {
    "template": "work_item",
    "status": "in_progress",
    "percent": 50,
    "checklist": []
  }
}
```

**Data**: `{ "case_id", "status": "open", "type": "progress_correction" }`  
最终仍需 PM `confirm`。

---

### 5.7 `GET /projects/{project_id}/review-cases`

**Auth**: PM。  
**Query**: `status?`  
**Data**: `{ "items": ReviewCaseDTO[] }`

```typescript
interface ReviewCaseDTO {
  id: number;
  type: ReviewCaseType;
  status: ReviewCaseStatus;
  node_id: number;
  package_id: number | null;
  opened_by: number;
  supplement_text: string | null;
  agent_conclusion: Record<string, unknown> | null;
  pm_confirmed_by: number | null;
  pm_confirmed_at: ISODateTime | null;
  created_at: ISODateTime;
}
```

---

## 6. Wiki

### 6.1 `GET /projects/{project_id}/wiki`

**Auth**: 项目成员。  
**Query**: `q?`, `page`, `page_size`  
**Data**: `PageData<WikiEntryDTO>`

```typescript
interface WikiEntryDTO {
  id: number;
  project_id: number;
  node_id: number | null;
  title: string;
  body: string;
  source: "manual" | "evidence_adopt" | "progress_confirm";
  evidence_package_id: number | null;
  created_by: number | null;
  created_at: ISODateTime;
  updated_at: ISODateTime | null;
}
```

---

### 6.2 `GET /wiki/{entry_id}`

**Auth**: 项目成员。  
**Data**: WikiEntryDTO。

---

### 6.3 `POST /projects/{project_id}/wiki`

**Auth**: PM 或 NodeOwner（P0：PM + 任意有 tree.edit_subtree 的指派）。  
**Body**: `{ "title", "body", "node_id"?: number }`  
**Data**: WikiEntryDTO source=`manual`。

---

### 6.4 `PATCH /wiki/{entry_id}`

**Auth**: 同上。  
**Body**: `{ "title"?, "body"? }`  
软删：`DELETE /wiki/{entry_id}` → `is_deleted=true`。

---

## 7. Agents

### 7.1 `POST /agents/chat`

**Auth**: 登录。项目相关 scene 需项目成员。  
**Body**:

```json
{
  "project_id": 1,
  "scene": "progress_update",
  "session_id": null,
  "message": "登录改版做完了",
  "node_id": 12
}
```

**Data**:

```typescript
interface AgentChatResult {
  session_id: number;
  reply: string;
  actions: {
    tool_id: string;
    authorized: boolean;
    result?: Record<string, unknown>;
  }[];
  need_clarification: boolean;
  clarification_questions: string[];
}
```

---

### 7.2 `GET /agents`

**Auth**: 登录。  
**Data**: `{ "items": AgentDefinitionDTO[], "user_created_count": number, "user_created_limit": 5 }`

```typescript
interface AgentDefinitionDTO {
  id: number;
  kind: AgentKind;
  name: string;
  system_prompt: string;
  tools: string[];
  is_template: boolean;
  owner_user_id: number | null;
  created_at: ISODateTime;
}
```

---

### 7.3 `POST /agents`

**Auth**: 登录。  
**Body**:

```json
{
  "name": "我的日报助手",
  "system_prompt": "你简洁...",
  "tools_json": ["list_my_project_links", "get_node", "wiki_search"]
}
```

**Data**: AgentDefinitionDTO。  
**Errors**: `40902` 超过 5 个。

---

### 7.4 `DELETE /agents/{agent_id}`

**Auth**: owner。软删。  
**Data**: `{ "id", "is_deleted": true }`。

---

### 7.5 `POST /agents/{agent_id}/export-template`

**Auth**: owner。  
**Data**: `{ "template_id", "name", "system_prompt", "tools_json" }`（写入 is_template 克隆或返回可分享 payload）。

---

### 7.6 `POST /agents/import-template`

**Auth**: 登录。  
**Body**: `{ "template_id": 3 }` 或 `{ "payload": { ... } }`  
**Data**: 新 AgentDefinitionDTO；计入 ≤5。

---

### 7.7 `PUT /agents/bindings`

**Auth**: 登录。  
**Body**:

```json
{
  "scene": "progress_update",
  "agent_definition_id": 9,
  "project_id": null
}
```

**Data**: 绑定记录。

---

### 7.8 `GET /agents/sessions/{session_id}/messages`

**Auth**: session 所有者。  
**Data**: `{ "items": [ { "id", "role", "content", "created_at" } ] }`。

---

## 8. Org · Integrations · Sync

### 8.1 `GET /companies/{company_id}/org-tree`

**Auth**: 成员。  
**Data**: `{ "nodes": OrgUnitDTO[] }` nested or flat。

```typescript
interface OrgUnitDTO {
  id: number;
  parent_id: number | null;
  name: string;
  external_id: string | null;
  source: string;
  leader_user_id: number | null;
  path: string;
  is_active: boolean;
  children?: OrgUnitDTO[];
}
```

---

### 8.2 `POST /companies/{company_id}/integrations`

**Auth**: super_admin。  
**Body**:

```json
{
  "provider": "generic_scim",
  "credentials": { "token": "..." },
  "config": { "static_snapshot": null }
}
```

**Data**: `{ "id", "provider", "last_sync_at": null }`（不回凭证）。

---

### 8.3 `POST /companies/{company_id}/org-sync`

**Auth**: super_admin。  
**Data**: `{ "job_id": "33", "status": "pending" }`。

---

### 8.4 `PATCH /companies/{company_id}/login-methods`

**Auth**: super_admin。  
**Body**: `{ "password": true, "wechat": true, "wecom": false, "dingtalk": false, "feishu": false }`  
**Data**: 同上对象。

---

## 9. SSO

### 9.1 `GET /sso/{provider}/start`

**Query**: `company_id`（必填）  
**Providers**: `wecom` | `dingtalk` | `feishu` | `oidc`  
**行为**: 302 到 IdP，或 JSON `{ "authorize_url": "..." }`（P0 可用 JSON 便于测）。  
**Errors**: `40300` 公司未启用该登录。

---

### 9.2 `GET /sso/{provider}/callback`

**Query**: provider 回调参数。  
**行为**: 建会话，重定向前端 `/login/callback?token=` 或返回 tokens JSON（测试模式）。

---

## 10. WeChat Collab

### 10.1 `POST /wx/collab/chat`

**Auth**: 微信登录用户（现网 wx token 体系或 Bearer）。  
**Body**:

```json
{
  "project_id": 1,
  "node_id": 12,
  "message": "进度到一半了",
  "media_id": null
}
```

**Data**: 同 `AgentChatResult`。  
内部 `channel=wechat`。

---

### 10.2 禁止

微信通道调用 `POST /evidence/files` → `40320`。

---

## 11. Bindings · ASR · Storage

### 11.1 `GET /companies/{company_id}/bindings`

**Auth**: super_admin 或成员只读脱敏。  
**Data**:

```json
{
  "storage": { "provider_id": "local", "is_default": true },
  "asr": { "provider_id": "builtin", "is_default": true },
  "model": { "provider_id": "fake", "is_default": true }
}
```

---

### 11.2 `PUT /companies/{company_id}/bindings/storage`

**Auth**: super_admin。  
**Body**: `{ "provider_id": "local", "config_json": { "root": "data/objects" } }`  
**Data**: 绑定摘要。  
Policy：`file_egress=deny_external` 时拒绝外部 S3。

---

### 11.3 `PUT /companies/{company_id}/bindings/asr`

**Auth**: super_admin。  
**Body**: `{ "provider_id": "builtin", "config_json": {} }`。

---

### 11.4 `PUT /users/me/bindings/asr`

**Auth**: 登录。  
**Body**: `{ "provider_id": "cloud:x", "company_id": 1 }`  
**Errors**: 不在白名单 `40300`。

---

### 11.5 `POST /asr/transcribe`

**Auth**: 登录。  
**Body**: multipart `file` + `company_id`  
**Data**: `{ "text": "转写结果", "provider_id": "builtin" }`。

---

## 12. Notifications（内部为主）

对外最小：

### 12.1 `GET /notifications/collab`

**Auth**: 登录。  
**Data**: `PageData<{ id, template_key, payload, read, created_at }>`  
（可复用现网 notifications 表扩展 type=collab）。

---

## 13. Reports（P1）

### 13.1 `GET /projects/{project_id}/report-policies`

**Data**: policies 列表。

### 13.2 `POST /projects/{project_id}/reports/run`

**Body**: `{ "policy_id"?: number, "trigger": "manual_confirm" }`  
**Data**: `{ "run_id", "status", "summary_text" }`。

---

## 14. Delegations（P1）

### 14.1 `POST /delegations`

**Auth**: super_admin 和/或 PM（范围校验）。  
**Body**:

```json
{
  "company_id": 1,
  "project_id": 10,
  "grantee_user_id": 5,
  "actions": ["project.read", "progress.nudge", "review.read"],
  "valid_to": "2026-12-31T00:00:00Z"
}
```

**Data**: DelegationDTO。

### 14.2 `GET /delegations`

**Query**: `company_id`, `project_id?`  
**Data**: items。

### 14.3 `POST /delegations/{id}/revoke`

**Data**: `{ "status": "revoked" }`。

---

## 15. Personal import · Tasks compat

### 15.1 `POST /projects/{project_id}/import-personal-tasks/preview`

**Auth**: PM 或任务所有者导入自己的。  
**Body**:

```json
{
  "task_ids": [1, 2, 3],
  "parent_node_id": 10
}
```

**Data**:

```json
{
  "confirm_token": "xxx",
  "expires_in": 600,
  "preview": [
    { "task_id": 1, "title": "写周报", "will_create_node_title": "写周报" }
  ]
}
```

---

### 15.2 `POST /projects/{project_id}/import-personal-tasks`

**Auth**: 同 preview。  
**Body**:

```json
{
  "task_ids": [1, 2, 3],
  "parent_node_id": 10,
  "mapping": { "node_type_key": "work_item" },
  "confirm_token": "xxx"
}
```

**Data**:

```json
{
  "created_nodes": [{ "node_id": 88, "task_id": 1 }],
  "skipped": []
}
```

**Errors**: `42203` token。

---

### 15.3 现网 `tasks` 响应增量字段

```typescript
// TaskResponse 追加（可选返回）
{
  origin: "personal" | "project_link"; // default personal
  company_id: number | null;
  project_id: number | null;
  project_node_id: number | null;
  linked_readonly: boolean;
}
```

`origin=project_link` 且 `linked_readonly=true` 时，完成/改 status → `40321`。

---

## 16. Audit（只读）

### 16.1 `GET /projects/{project_id}/audit-logs`

**Auth**: PM 或 super_admin。  
**Query**: `page`, `page_size`, `action?`  
**Data**: `PageData<{ id, action, actor_user_id, resource_type, resource_id, payload, created_at }>`。

---

## 17. 工具 IDL（Agent，非 HTTP 但稳定）

| tool_id | args | 谁可调 |
|---------|------|--------|
| `list_my_project_links` | `{}` | 登录用户 |
| `get_node` | `{ node_id }` | 项目成员 |
| `submit_clarification` | `{ node_id, text }` | 成员且 allow_clear_text |
| `create_evidence_draft` | `{ node_id, summary, structured, links }` | 成员；channel≠强制文件 |
| `submit_evidence` | `{ package_id }` | 提交人；**wechat 禁止** |
| `request_review` | `{ package_id }` | 提交人 |
| `request_correction` | `{ node_id, reason, proposed_after }` | 成员 |
| `pm_judge_package` | `{ package_id }` | system_pm + worker |
| `pm_write_progress` | `{ node_id, after, source, package_id? }` | system_pm + worker → append_progress |
| `wiki_search` | `{ project_id, q }` | 成员 |
| `send_notify` | `{ user_ids, channel, template, data, confirmed? }` | 高风险需 confirmed |
| `nudge_member` | `{ user_id, node_id, message }` | PM |

未授权：tool result `{ "error": "unauthorized", "code": 40300 }`，不抛崩会话。

---

## 18. Judge Worker I/O（内部）

**Input**（`evidence.judge` payload）:

```json
{
  "package_id": 55,
  "node_id": 12,
  "company_id": 1,
  "project_id": 1
}
```

Worker 组装附录 F.6 的 node/package/policy 调 Judge。

**Output 写入 package.judge_result_json** 必须可解析：

```json
{
  "decision": "adopted",
  "reason": "含 PR 链接与完成说明",
  "progress_after": {
    "template": "work_item",
    "status": "done",
    "percent": 100,
    "checklist": []
  },
  "wiki_draft": { "title": "...", "body": "..." },
  "confidence": 0.86
}
```

`decision=rejected` 时可不写 progress；`in_wiki` 强制 false。

---

## 19. OpenAPI 落地要求

实现时：

1. 每个 collab 路由 `response_model` 可用 `ResponseData`。  
2. P0 结束前提供 `GET /api/v1/collab/openapi.json` **或** 合并进 FastAPI 自动文档，路径与本文一致。  
3. 契约变更：先改本文版本号（v1.1），再改代码；PR 必须更新本文。

---

## 20. 前端 TypeScript 建议落点

```
frontend/src/types/collab.ts     // 复制本文 type
frontend/src/api/companies.ts
frontend/src/api/projects.ts
frontend/src/api/evidence.ts
frontend/src/api/agents.ts
frontend/src/api/wiki.ts
frontend/src/api/org.ts
```

`request.ts` 拦截：`if (body.code !== 200) throw BusinessError(body)`。

---

## 21. 契约测试清单（后端）

| ID | 断言 |
|----|------|
| C-01 | POST projects 非 OrgLeader → code 40304 |
| C-02 | POST evidence/files + Channel wechat → 40320 |
| C-03 | submit evidence → job_id 可 GET succeeded/failed |
| C-04 | adopted 后 progress/records 增加 source=pm_agent_auto |
| C-05 | submitted 后 PATCH package → 42201 |
| C-06 | 第 6 个 user_created agent → 40902 |
| C-07 | left employment submit → 40314 |
| C-08 | import 无 token → 42203 |
| C-09 | move 成环 → 42204 |
| C-10 | project_link task complete → 40321 |

---

*本文与实现不一致时：修代码或发 v1.1 修订说明，禁止静默改路径。*
