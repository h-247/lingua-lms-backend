# API consumer guide

Base path: `/api/v1`. JSON timestamps are UTC ISO 8601. Pagination uses `page` (default 1) and `pageSize` (default 20, maximum 100).

## Authentication

1. `GET /auth/csrf` with a cookie jar.
2. `POST /auth/login` with `X-CSRF-Token`; retain the regenerated `lingua.sid` cookie and returned new CSRF token.
3. Send the cookie for authenticated reads and cookie + `X-CSRF-Token` for mutations.
4. Send a unique `Idempotency-Key` for final official/practice submissions.

Session cookie is HttpOnly, SameSite=Lax, eight-hour non-rolling; Secure is enabled under HTTPS production. Missing Origin is supported for non-browser clients but never bypasses auth or CSRF. Credentialed CORS only permits configured origins.

## Error shape

```json
{"code":"REVISION_CONFLICT","message":"Bản nháp đã thay đổi ở yêu cầu khác.","requestId":"...","fieldErrors":{"currentRevision":2}}
```

Expected statuses: 400, 401, 403/hidden 404, 409, 413, 415, 429 and 503. Unknown mutable fields are rejected.

## Main routes

- Auth: `/auth/csrf`, `/auth/login`, `/auth/me`, `/auth/change-password`, `/auth/logout`
- Admin users: `/users`, `/users/:id/profile|status|reset-password`
- Classes: `/classes`, lifecycle/teacher/enrollment actions under `/classes/:id`
- Groups: `/classes/:classId/groups`
- Materials: `/classes/:classId/sections`, `/classes/:classId/materials/*`, `/materials/:id/download`
- Assessments: `/classes/:classId/assessments`, `/assessments/:id`, publish/close/extend/duplicate/preview actions
- Official work: `/assessments/:id/submission`, `/submit`, `/result`, attachment upload, `/submissions/:id/grade`
- Practice: `/assessments/:id/practice/start`, attempt save/submit/history/detail
- Reports: `/reports/dashboard`, class/own progress, CSV and scoped audit
- Health: `/health/live`, `/health/ready`

For exact DTO enums, nullability and schemas use the generated OpenAPI endpoint; examples are in `requests.http`.
