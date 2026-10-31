# Communication AI Closed Loop Design

## Goal
Close the communication loop for team channels, direct/group conversations, and voice/video calls: persist call sessions and recordings, transcribe audio, summarize ordinary chat history and call transcripts, and expose the same project/company-isolated state to Web, Android WebView, and the WeChat mini program.

## Decisions
- Existing channel and conversation message APIs remain the source of truth.
- Add explicit summary records with source ranges and structured decisions/action items/risks.
- Add call session and recording records; keep WebRTC signaling backward compatible.
- Use the configured company/user LLM when available; otherwise deterministic summaries remain usable and clearly identify `deterministic` provider.
- Use the existing ASR router; when no real provider is configured, return the existing explicit builtin placeholder and mark transcription unavailable rather than pretending audio was understood.
- Every read/write is scoped through existing company membership and conversation/channel ACLs; project_id is retained for isolation.
- Client APIs are thin adapters over the same backend endpoints.

## Backend API
- `POST/GET /channels/{channel_id}/summaries`
- `POST/GET /conversations/{conversation_id}/summaries`
- `POST /calls/sessions`
- `GET /calls/sessions/{session_id}`
- `POST /calls/sessions/{session_id}/end`
- `POST /calls/sessions/{session_id}/recordings` (multipart audio)
- `POST /calls/sessions/{session_id}/transcribe`
- `POST /calls/sessions/{session_id}/summarize`

## Client behavior
- Web and mobile conversation screens expose “AI 总结本页聊天记录”; the result shows source message count and structured sections.
- Call screen exposes “结束并整理通话”; it reports recording/transcription availability and never shows a fake success.
- Mini program adds summary buttons to channel/conversation/report pages and displays the same summary envelope.

## Verification
- Backend API tests cover ACL, source range, deterministic fallback, ASR unavailable state, and project isolation.
- Web contract tests cover message summary and call summary clients.
- Android/WebView smoke covers opening a conversation, generating a chat summary, ending a call session, and displaying unavailable ASR honestly.
- Mini program JS syntax/contract tests cover the new requests and response rendering.
