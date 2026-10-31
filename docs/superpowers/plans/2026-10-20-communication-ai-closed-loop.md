# Communication AI Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement and test chat-history summaries plus call session, recording, transcription, and AI summary flows across backend, Web, Android WebView, and WeChat mini program.

**Architecture:** Extend the existing shell and calls APIs with isolated persistence models. Reuse existing ACL, ASR router, LLM settings, and WebRTC signaling. Add thin client adapters and truthful UI states for unavailable providers.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, pytest, React/TypeScript, Flutter WebView host, WeChat Mini Program JavaScript.

**Spec:** `docs/superpowers/specs/2026-10-20-communication-ai-closed-loop-design.md`

## Global Constraints
- Preserve existing channel, direct conversation, and WebRTC signaling contracts.
- Enforce company membership and conversation/channel membership on every new endpoint.
- Preserve project isolation using `project_id` and existing ACL helpers.
- Never fabricate transcription, recording, or LLM success when a provider is unavailable.
- Add tests before production code for each new behavior.

---

### Task 1: Persistence and deterministic summary service
**Files:** create `backend/app/models/communication.py`, `backend/alembic/versions/fh6c7d8e9f0a_communication_ai.py`, modify `backend/app/models/__init__.py`, create `backend/app/services/communication_summary.py`, test `backend/tests/collab/test_communication_summary.py`.
- [ ] Add `ConversationSummary`, `CallSession`, `CallRecording` models with source metadata, status, provider, transcript, and structured JSON fields.
- [ ] Add deterministic summary extraction for messages/transcript: key points, decisions, action items, risks, and source count.
- [ ] Test project isolation, deterministic output, and unavailable ASR status.

### Task 2: Conversation summary API
**Files:** modify `backend/app/api/v1/shell.py`, test `backend/tests/collab/test_communication_summary_api.py`.
- [ ] Add POST/GET channel and conversation summary endpoints.
- [ ] Reuse existing channel/conversation ACL functions.
- [ ] Test member access, non-member denial, source message count, and project isolation.

### Task 3: Call session and audio pipeline API
**Files:** modify `backend/app/api/v1/calls.py`, create `backend/app/services/call_summary.py`, test `backend/tests/collab/test_call_summary_api.py`.
- [ ] Persist call session start/end and participant snapshot.
- [ ] Accept a recording upload, store metadata through existing collaboration file storage, and attach it to the call session.
- [ ] Transcribe with the existing ASR router; persist `unavailable` when builtin placeholder is the only provider.
- [ ] Summarize transcript with configured LLM or deterministic fallback.
- [ ] Test full lifecycle and ACL.

### Task 4: Web and mobile client adapters/UI
**Files:** modify `frontend/src/api/shell.ts`, `frontend/src/components/views/MessagesView.tsx`, `frontend/src/mobile/features/messages/MobileMessageScreens.tsx`, `frontend/src/mobile/features/messages/MobileCallScreen.tsx`, add contract tests and Playwright coverage.
- [ ] Add API clients and explicit loading/empty/provider-unavailable states.
- [ ] Add chat summary action in channel and direct conversation views.
- [ ] Add call-session end and summarize action.
- [ ] Test button behavior and truthful failure states.

### Task 5: WeChat mini program integration
**Files:** modify relevant message/report pages and request helpers, add JS contract tests.
- [ ] Add chat summary request/response rendering.
- [ ] Add call summary status rendering; keep recording upload delegated to the server contract.
- [ ] Verify syntax, endpoint paths, and response envelopes.

### Task 6: End-to-end verification and documentation
**Files:** update `docs/full-feature-inventory.md`, `docs/android-emulator-acceptance-2026-10-19.md`, `docs/design-review/app-v2-2026-10-19/IMPLEMENTATION-REPORT.md`.
- [ ] Run backend tests, Web lint/contract/build, Flutter tests/build, mini program checks.
- [ ] Run real desktop and Android WebView smoke for chat summary and call lifecycle.
- [ ] Record real provider limitations separately from code failures.
