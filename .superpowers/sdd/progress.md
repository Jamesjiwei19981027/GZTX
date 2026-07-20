# React rewrite SDD progress ledger

Plan: docs/superpowers/plans/2026-07-20-frontend-react-rewrite.md
Spec: docs/superpowers/specs/2026-07-20-frontend-react-rewrite-design.md
Branch target: frontend-react-rewrite
Started: 2026-07-20

## Tasks

(none complete yet)

Task 0: complete (commits e54aacc..231b420, review clean — archive only, build PASS, tag vue-frontend-last)
Task 1: complete (commits 231b420..cae321a, build PASS, scaffold OK)
Task 2: complete (commits cae321a..f4cb9ae, build PASS, API ported from archive)
Task 3: complete (commits f4cb9ae..d897d9f, build PASS, auth+router+login)
Task 4: complete (commits d897d9f..16007b2, build PASS; form simplified vs archive)
Task 5: complete (commits 16007b2..3c35686, build PASS; calendar month-only; settings SMTP+LLM only — theme/profile deferred Task 9)
Task 6: complete (commits 3c35686..44e751c, build PASS, outline+evidence+agent)
Task 7: complete (commits 44e751c..07299b7, build PASS, company settings)
Task 8: complete (commits 07299b7..ca08221, React Flow dual view, build PASS)
Task 9: complete (commits ca08221..4932f97, theme+profile, build PASS; sound deferred)
Task 10: complete (commits 4932f97..2b618cf, vitest 9 tests PASS)
Task 11: complete with concerns (commits 2b618cf..00d148f, Playwright suite committed; live run needs backend+E2E creds)

Task 12: complete (docker daemon verified 2026-07-20 evening: frontend+backend prod images build locally; npm in image upgraded to v11 for lockfile validation; G6 drill still not executed)
Task 13: BLOCKED pending human — staging deploy, PLAYWRIGHT on staging, 48h soak, G10 signoff (cannot complete in agent session without staging env)

2026-07-20 evening takeover session (Cursor):
- Committed previously-uncommitted collab backend/miniprogram/docs/deploy work (10f8b45..c4b04c8)
- Fixes: py3.11 f-string in agent_runtime, missing deps (asyncpg/psycopg2-binary/dateparser, requirements-dev.txt), categories /reorder route ordering bug, reminder email Reply-To/Message-ID re-wired through _send_smtp, notifications flag_modified, nginx 443/acme scaffold, vitest e2e exclude, Dockerfile VITE_API_BASE name, miniprogram evidence-submit file_ids chain
- Verified: backend pytest 148/148 (collab 84 + personal domain repaired), frontend vitest 9/9, typecheck clean, build clean, Playwright S1-S8 7/7 green locally (real company/project/tree data seeded via API), backend image imports on py3.11

## Branch HEAD
fd2281e887214fd3b07e66aec30bf7df77142c24
## Commits on frontend-react-rewrite since e54aacc
fd2281e fix(docker): point prod frontend build at Dockerfile.prod
e3257b3 docs(frontend): React stack, docker, gates template, rollback procedure
00d148f test(frontend): Playwright smoke e2e suite for gate S1-S8
2b618cf test(frontend): vitest for request helpers and auth guard
4932f97 feat(frontend): theme hooks parity with archive settings
ca08221 feat(frontend): React Flow project tree dual view with dagre layout
07299b7 feat(frontend): company settings SMTP/LLM
44e751c feat(frontend): project list/detail outline tree, evidence, agent chat
3c35686 feat(frontend): calendar and personal settings (SMTP/LLM)
16007b2 feat(frontend): port dashboard and task list/detail pages
d897d9f feat(frontend): auth store, router guards, layout, login/register
f4cb9ae feat(frontend): port axios request client and API/types from Vue archive
cae321a feat(frontend): scaffold Vite React + Tailwind + Ant Design
231b420 chore(frontend): archive Vue app to frontend-vue-archive
