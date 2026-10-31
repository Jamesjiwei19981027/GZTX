# Project knowledge to personal knowledge implementation plan

> **For agentic workers:** Use subagent-driven-development or executing-plans; independent backend/React/mini files may execute in parallel after reading the full spec and this contract.

**Goal:** Authorized users summarize selected project shared pages with their own AI, then explicitly save a cited editable draft to their private current-project Wiki.

**Architecture:** Reuse published/manual ProjectWikiEntry and PersonalKnowledgeEntry. Add scoped grants and owner-private summary drafts. Central backend authorization, provenance validation and idempotent save. Three clients share the exact API.

**Tech Stack:** FastAPI, SQLAlchemy/Alembic, React/React Flow, WeChat mini-program, pytest/Playwright/Android WebView.

**Spec:** `docs/superpowers/specs/2026-10-20-project-personal-knowledge-design.md` defines the full API and security constraints.

## Task 1: Backend authorization and summarize/save lifecycle

Files: new `backend/app/models/project_knowledge.py`, `services/project_knowledge.py`, `api/v1/project_knowledge.py`, migration after `fi7d8e9f0a1b`, tests `backend/tests/collab/test_project_knowledge_space.py`; narrow registration in models/__init__.py and main.py. No client files.

- [ ] Write real API tests for PM grant, unauthorized member generation, authorized summary+save, private data exclusion and idempotent save; run before implementation.
- [ ] Implement active member checks with company/project/owner scoping. Use current PM/company-admin policies, no ordinary reader implicit summarize right. Validate target grant membership.
- [ ] Only read source `manual` and `llm_wiki`; selected IDs all must belong to scope. Resolve own model with existing resolve_llm; require usable non-fake agent model. Validate quoted page references against selected body text. Bound input and reject oversize honestly.
- [ ] Store private draft and source fingerprints. Recheck membership/grant after model call and fingerprint/ACL again on save. Idempotent private entry `project_summary` keyed by draftID; don't resurrect deleted saved copies. Audit grants/save.
- [ ] Test company/project/member/grant revocation, other user's draft, bad source citations, missing model, source changed, model-time revocation and safe failure. Run old project Wiki/private Wiki regressions too.

## Task 2: Shared Web/APP UI

Files: new `frontend/src/api/projectKnowledge.ts`, `components/ProjectKnowledgeSpace.tsx` and CSS if needed, `frontend/e2e/project-knowledge-space.spec.ts`; narrow modify `PersonalKnowledgeSpace.tsx` and `api/personalKnowledge.ts` for tab integration and `project_summary` source label/type. No App/sidebar/navigation edits needed; current entry is shared by Web and APP.

- [ ] Browser tests fail first for project tab and granted/ungranted action.
- [ ] ProjectKnowledgeSpace receives `{projectId:number,userId?:string,onSaved:()=>void}`. Add named project tab under existing parent, keep concrete project and owner key, key reload personal after save.
- [ ] Read project catalog, list/detail/select shared pages and show source graph using explicit source package facts (no invented semantic edges); independent node dragging and Bezier connections follow.
- [ ] Show grant toggles only for manager. Generate selected summary with optional instruction; display source quotes, editable title/body/tags; explicit confirm-save. Handle403/409/model-unconfigured honestly; preserve unsaved text on error and reject old-scope responses.
- [ ] Run lint and browser test. Do not run competing same-output Playwright suites simultaneously with root; coordinate.

## Task 3: Mini-program UI

Files: new `miniprogram/pages/project-knowledge/*`, registration app.json, narrow link in `pages/knowledge/knowledge.wxml/js` and sourceNames project_summary, tests `miniprogram/tests/project-knowledge.test.cjs`.

- [ ] Add project shared entry from personal knowledge page, preserving selected project and real member state.
- [ ] Render shared list/detail and citations, select pages/instruction, authorization controls and summary preview/edit/confirm-save with same API. Allow saved entry to be opened via existing personal knowledge space.
- [ ] Guard scope epoch/unload responses, preserve input on save failures, no fake fallback. Use existing knowledge canvas graph conventions if adding source graph; curves must redraw after overlays and normalize negative coordinates.
- [ ] Run meaningful VM behavior tests, JS syntax and JSON validation. Record unavailable true WeChat runtime.

## Root integration/review/verification

- [ ] Review cross-layer contract and security; add missing regression/integration tests instead of relying only on agent claims.
- [ ] Migrate isolated axis_joint_debug_20261020.db after stopping backend8014, restart latest service; never use production data.
- [ ] Run targeted backend/private+shared regression, Web type/build/contracts, new browser suites and all mini logic tests.
- [ ] Real Android test project knowledge tab/catalog and unconfigured model error/grants using disposable seeded data; any temporary shared pages/grants cleaned afterwards.
- [ ] Update feature inventory and readable docs with exact verification and limitations. Existing production gates remain applicable; don't claim all product buttons or true iOS/WeChat device coverage.
