# Project LLM Wiki integration

> **For agentic workers:** Execute this plan inline with superpowers:executing-plans. User approved direct integration of a suitable existing library.

**Goal:** Reuse an existing LLM Wiki core for project-scoped, source-backed knowledge with a preview and publication gate, without embeddings.

**Architecture:** Vendor the unmodified MIT-licensed Microsoft core at commit `e09126f257c1fcf8e63234382748a51cf6a5df7f`. A Node bridge materializes isolated temporary wiki snapshots from authorized SQL records and uses upstream page/index/search/lint functions. FastAPI owns tenancy, model configuration, immutable material references, draft storage and optimistic publication; existing evidence adoption and formal progress are not changed by publishing knowledge.

**Tech Stack:** FastAPI, SQLAlchemy, existing OpenAI-compatible model gateway, Node 22, Microsoft llmwiki core, React.

**Spec:** Approved conversation: per-project wiki, immutable sources, no vector models, incremental pages, provenance, review before publication.

## Global constraints

- Preserve all existing responsibility-tree edits in the current feature checkout.
- No embedding calls or vector storage in the new workflow.
- Never substitute a rule/FakeLLM result for a successful AI synthesis.
- Drafts are visible only to their author and authorized wiki publishers.
- Published knowledge does not alter progress, assignments, or evidence adoption.
- Runtime fixtures and any live writes use only the dedicated joint-debug environment.

## Task 1: Reusable engine adapter

Files: `backend/wiki-engine/`, `backend/app/services/project_wiki_engine.py`, `backend/tests/knowledge/test_project_wiki_engine.py`, `backend/Dockerfile`.

- [x] Pin upstream files, license and SHA-256 manifest; inspect imported code before running builds.
- [x] Write a failing test: Chinese query found only in a page body must find that page; a second isolated snapshot must contain none of the first project's pages.
- [x] Build a JSON stdio bridge using upstream `writePage`, `writeIndex`, `readIndex`, `queryWiki`, and `lintWiki`; cover body-only lookup by supplying caller-generated keyword terms and searchable summaries.
- [x] Run the adapter tests with real Node and temporary directories.

## Task 2: Source-backed draft and publication workflow

Files: `backend/app/services/project_wiki.py`, `backend/app/api/v1/project_wiki.py`, API registration, tests under `backend/tests/collab/`.

- [x] Write failing API tests for project isolation, missing model, private drafts, invalid quotations, incremental publication, stale drafts and no progress mutation.
- [x] Implement catalog, material-to-draft, and draft publication endpoints using existing project ACL and company write checks.
- [x] Split source bodies into bounded segments, analyze all segments, validate source IDs and literal quotation support, and record line locators and source fingerprints.
- [x] Store draft proposals in existing Wiki metadata; on publication compare reviewed topic fingerprints and source state, then merge facts and create audit entries transactionally.
- [x] Run targeted collaboration and knowledge regression tests.

## Task 3: User entry and deployment

Files: `frontend/src/api/projectWiki.ts`, `frontend/src/components/views/ProjectWikiPanel.tsx`, `PeopleAxisView.tsx`, `backend/requirements.txt`, deployment docs.

- [x] Add a project knowledge entry with material selection, AI draft generation, provenance preview, search, and authorized publication.
- [x] Build/type-check the frontend; verify small-screen dialog behavior and successful/error states with browser fixtures.
- [x] Package the Node engine in the backend image; run real library smoke tests in the dedicated debug backend.
- [x] Record the selected dependency, limitations, commands and model setup requirements in `docs/project-llm-wiki.md`.


## Verification record (2026-10-18)

- Backend targeted suite: 49 passed (workflow, isolation, privacy, permissions, long segments, real DOCX, extraction and existing knowledge/judge regressions).
- Additional real XLSX, PPTX and text PDF parser tests: 3 passed.
- Frontend type check and production build passed; 30 component browser checks passed, including 28 existing responsibility-tree checks. After fixing the live title race, type check/build and 2 real API browser checks passed at 390px and 1280px.
- Engine build passed; npm runtime audit reported 0 vulnerabilities; all 26 upstream SHA-256 checks passed.
- Dedicated debug container: official Node 22.14.0 archive checksum verified, runtime/core copied and MarkItDown installed. Chinese body search, isolated snapshots, real catalog and missing-model 409 verified. No real LLM is configured, so genuine model synthesis quality remains unverified.
- Both Dockerfiles include the runtime; the production image build was attempted but blocked by Docker Hub authentication endpoint connectivity. Existing debug container was updated directly as a local fallback; no daily/production database was modified.
