# Lingua LMS Backend

Backend REST API độc lập cho LMS của một trung tâm tiếng Anh. Stack: NestJS, Prisma, PostgreSQL, session cookie lưu trong PostgreSQL, file riêng tư dùng shared volume, NGINX cân bằng hai API replica.

## Chạy local

Yêu cầu Node.js 22 và Docker Engine/Compose. Sao chép `.env.example` thành `.env`, thay mọi secret/password, rồi:

```powershell
docker compose up -d db
docker compose --profile tools run --rm migrate
$env:SEED_PASSWORD = '<synthetic-password-at-least-12-chars>'
npm run seed
npm run start:dev
```

Toàn bộ topology hai replica:

```powershell
docker compose --profile tools run --rm migrate
docker compose up -d --build api-1 api-2 gateway
curl.exe http://localhost:8080/api/v1/health/ready
```

- API gateway: `http://localhost:8080/api/v1`
- OpenAPI UI khi chạy development: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`
- Ví dụ HTTP: `docs/requests.http`

Không có endpoint public để reset, seed hoặc bootstrap. Lệnh bootstrap đầu tiên yêu cầu `BOOTSTRAP_ADMIN_EMAIL` và `BOOTSTRAP_ADMIN_PASSWORD`: `npm run bootstrap:admin`.

## Kiểm định

```powershell
npm run lint
npm run typecheck
npm run test:unit
$env:TEST_DATABASE_URL = 'postgresql://lingua_test:lingua_test_local_only@localhost:5435/lingua_test?schema=public'
npm run test:integration
npm run build
docker compose config --quiet
docker build -t lingua-lms-api:local .
git diff --check
```

Integration tests cần PostgreSQL thật. Xem `DEPLOYMENT.md` và `PERFORMANCE_REPORT.md` trước khi triển khai/đo tải.
