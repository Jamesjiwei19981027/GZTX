# Personal knowledge space implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans; partition files and verify integrations before completion.

**Goal:** Per-person, per-project Wiki entries with an editable relationship graph, own-source imports and scoped personal-agent retrieval, available in Web/APP/mini-program.

**Architecture:** New private tables; project-scoped APIs; shared React Flow screen; mini-program graph; root integrates existing navigation and agent retrieval. Current human reporting ACL remains authoritative for submitted reports and evidence.

**Spec:** `docs/superpowers/specs/2026-10-20-personal-knowledge-design.md`

**Tech Stack:** FastAPI, SQLAlchemy/Alembic, React/TypeScript/React Flow, WeChat mini-program, pytest, Playwright, Android WebView.

## API contract

Prefix: `/projects/{project_id}/personal-knowledge`.

- `GET` -> `{scope:{company_id,project_id,owner_user_id},entries:Entry[],links:Link[]}`.
- `POST /entries` body `{title,body_text,tags?:string[]}` -> Entry.
- `PATCH /entries/{entry_id}` partial `{title?,body_text?,tags?,position?:{x:number,y:number}}` -> Entry.
- `DELETE /entries/{entry_id}` -> `{id,is_deleted:true}`; removes graph links, keeps original source data.
- `POST /sync` body `{}` -> `{created:number,skipped:number}`; idempotent own source import.
- `POST /links` body `{source_entry_id,target_entry_id,label}` -> Link; `PATCH /links/{link_id}` body `{label}` -> Link; `DELETE /links/{link_id}` -> `{id,is_deleted:true}`.
- Entry: `{id,title,body_text,tags,position:{x,y}|null,source_type:'manual'|'evidence_package'|'evidence_file'|'agent_report'|'agent_message',source_id:number|null,source_ref:object,updated_at:string|null}`.
- Link: `{id,source_entry_id,target_entry_id,label}`.
- Service helper: `search_personal_knowledge(db,company_id,project_id,user_id,query,limit=6)` -> retrieval item dictionaries compatible with agent_runtime.

## Work packages

1. Backend owner: create `models/personal_knowledge.py`, `services/personal_knowledge.py`, `api/v1/personal_knowledge.py`, migration after `fh6c7d8e9f0a`, model/router registration, tests under `tests/collab/test_personal_knowledge.py`. Verify owner/PM/cross-project denials, imported own-file content, sync idempotency and edit preservation, edge validation, position updates and source-retaining deletion.
2. Shared React owner: create `src/api/personalKnowledge.ts` and `src/components/PersonalKnowledgeSpace.tsx`, browser tests. Props `{userId?:string,projects:Project[],currentProject:Project,onSelectProject:(project:Project)=>void,onBack?:()=>void,onOpenSource?:(entry:Entry)=>void}`. Render Wiki list and graph, text edits, source detail, links, positions, search, sync and error retry. Guard stale requests on scope changes.
3. Mini-program owner: add `pages/knowledge/*`, navigation registration and settings/reports links, logic tests. Same REST contract; nodes draggable with saved coordinates and Bezier edges follow endpoints; provide normal article list for accessible editing and mobile use.
4. Root: add Web ViewMode `knowledge`, desktop sidebar and deep links, APP route `me-knowledge`, “我的” and AI links. Add scoped personal knowledge retrieval in `agent_runtime.py`; never send knowledge to public search index. Validate live migration/startup, tests/build and actual Android navigation.

## Verification

Run new backend and browser tests first against missing implementations, then targeted regression suites. Check mini-program scripts and JSON. Build Web and test Android navigation against the real isolated backend on 8014; do not mutate real user knowledge. Record results and remaining device limitations in `docs/personal-knowledge-space.md` and feature inventory.
