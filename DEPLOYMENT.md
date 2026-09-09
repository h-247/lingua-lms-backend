# Deployment runbook

## Trạng thái chi phí và quyền

Repository chỉ chuẩn bị topology. Chưa có quyền hoặc thông tin tài khoản để provision/deploy cloud. Trước khi triển khai phải kiểm tra trực tiếp quota Always Free, home region, VM ARM còn khả dụng, boot/block volume và chính sách hiện hành; không bật PAYG/trial/billable add-on. Một VM vẫn là single point of failure và không có SLA.

## Preflight

1. Xác nhận host Linux ARM64/AMD64, IP/DNS HTTPS, quota và nơi backup ngoài VM.
2. Thay toàn bộ secret trong `.env`; quyền file `chmod 600`; chỉ mở 80/443, SSH giới hạn IP; không public 3000/5432.
3. Kiểm tra `docker compose config --quiet`, build image, kiến trúc native Argon2/Prisma.

## Deploy/update

```bash
docker compose build
docker compose --profile tools run --rm migrate
docker compose up -d db api-1 api-2 gateway
docker compose exec gateway nginx -t
curl -fsS http://127.0.0.1:8080/api/v1/health/ready
```

Bootstrap admin chỉ một lần bằng biến môi trường bảo mật và `npm run bootstrap:admin`; không lưu/ghi log mật khẩu. TLS phải được terminate bằng ACME client đã xác minh, auto-renew và có giám sát hết hạn.

Rolling restart: dừng một replica, đợi NGINX passive fail detection, recreate/start nó và xác nhận ready trước khi lặp lại replica còn lại. Không chạy migration trên từng startup. Rollback image chỉ hợp lệ khi schema migration tương thích ngược.

## Backup/restore

Trong maintenance window: chặn mutation/drain upload, `pg_dump -Fc`, archive private-files, tạo SHA-256 manifest, sao chép cả ba ra nơi owner kiểm soát ngoài VM. Restore vào PostgreSQL/volume cô lập, chạy `pg_restore`, kiểm tra foreign keys và checksum mẫu trước khi coi backup hợp lệ. Backup cùng VM không đủ. Không tuyên bố PITR/zero data loss.

Theo dõi: disk/WAL/upload staging, CPU/RAM/event-loop, DB connections/locks/slow queries, migration version, log rotation và thời điểm backup thành công cuối.
