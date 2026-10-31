# Ten product feedback changes implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans, with explicit file ownership and verification before completion.

**Goal:** Implement the ten approved mobile feedback requirements and synchronize shared Web, native wrapper and mini-program behavior.

**Architecture:** Shared React screens provide Web/APP behavior; backend enforces personnel ownership, three-level hierarchy and channel access; native Android owns keyboard overlay. Preserve existing work and project isolation.

**Tech Stack:** FastAPI/SQLAlchemy/Alembic, React/TypeScript, Flutter Android WebView, WeChat mini-program, pytest and Playwright.

**Spec:** User feedback 2026-10-20: pending summary first; full month calendar second; project progress then task creation; overlay keyboard; upload with caption and agent access; main/secondary person ownership, max three levels, deletion preview and handover plus access revocation; selectable AI report project; green verified phone state and one-week launch reminders; correct axis navigation; expanded project tasks/kanban and prominent invitation.

## Tasks

- [ ] Backend: regression tests, person hierarchy and ownership, deletion impact/handover, project channel permissions and revocation.
- [ ] Homepage/project: full month calendar, reordered metrics and creation, expanded project task/kanban with invitation at top; synchronize mini-program.
- [ ] Evidence/report: simplify upload to files and caption, preserve personal-agent access, choose project for AI progress reports.
- [ ] Integration: cross-tab navigation and project detail header, native keyboard overlay, phone verification state and launch reminder.
- [ ] Verify meaningful backend/browser/native paths, repair failures, update acceptance documentation with actual results and remaining limits.
