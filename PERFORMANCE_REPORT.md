# Báo cáo hiệu năng và failover

Ngày đo: 2026-09-09 (Asia/Ho_Chi_Minh)

Trạng thái: **đạt smoke và warm-up local đến 100 VU; một bài 100 VU/15 phút từ Grafana Cloud đang chạy; chưa nghiệm thu 300 concurrent**. Tài liệu yêu cầu load generator ở máy riêng, hai lần 300 VU/15 phút và các bài burst/file/fixed-arrival chuyên biệt; không được tuyên bố PERF-03 đến PERF-08 đã đạt.

## Môi trường và topology

- Windows + Docker Desktop, Docker Engine 28.5.1.
- NGINX OSS `least_conn` → `api-1` + `api-2` → PostgreSQL 16.
- Hai API dùng chung PostgreSQL session store và private-file volume.
- Seed: 300 học viên, staff, hai nhóm chồng lấp và ba assessment.
- Target local: `http://localhost:8080/api/v1`.
- Target cloud tạm thời: Cloudflare Quick Tunnel HTTPS → NGINX `localhost:8080`; endpoint `/api/v1/health/ready` đã trả HTTP 200 từ Internet.
- Grafana Cloud k6: stack `tinygorge510`, default project `8477270`, quota 500 VU-giờ/tháng nhưng subscription giới hạn tối đa **100 VU/test**. UI từ chối tăng 300 VU mà không liên hệ support.
- Cloud run: [100 VU / 15 phút](https://tinygorge510.grafana.net/a/k6-app/runs/8521677), khởi chạy lúc 17:31 ngày 2026-09-09; dùng 25 VU-giờ khi hoàn tất. Kết quả chưa được ghi nhận tại thời điểm cập nhật tài liệu này.
- Mã nguồn đang ở worktree chưa commit; không có GitHub/cloud write.

## Kết quả đã đo

| Bài đo | Kết quả | HTTP lỗi | Read p95 | Write p95 | Overall p99 |
|---|---:|---:|---:|---:|---:|
| Smoke 5 VU / 30 giây | 48/48 checks, 60 requests | 0% | 86,25 ms | 62,43 ms | 122,61 ms |
| Warm-up 30 VU / 2 phút | 808/808 checks, 1.028 requests | 0% | 112,22 ms | 67,90 ms | 505,93 ms |
| Warm-up 100 VU / 3 phút, lần đầu | 3.831/3.834 checks, 4.924 requests; **fail** | 0,06% | 219,14 ms | 83,14 ms | 500,79 ms |
| Warm-up 100 VU / 3 phút, sau sửa | 3.876/3.876 checks, 4.979 requests | 0% | 152,01 ms | 73,47 ms | 604,67 ms |

Lần 100 VU đầu phát hiện ba `P2034` write-conflict khi nhiều tài khoản tạo practice attempt dưới transaction `SERIALIZABLE`. Đã thêm bounded retry tối đa bốn lần với exponential jitter, không thêm khóa toàn cục. Lần chạy lại dùng riêng `student101`–`student200` để buộc đi qua nhánh tạo attempt mới và đã đạt toàn bộ threshold.

Raw k6 summary (gitignored):

- `performance-results/smoke-5vu.json`
- `performance-results/warmup-30vu-2m.json`
- `performance-results/warmup-100vu-3m.json` (lần fail)
- `performance-results/warmup-100vu-3m-after-retry-fix.json` (lần pass)

## Cân bằng tải và failover

- Trước failover, 20 lần `GET /auth/me` chia đều 10 request cho mỗi replica theo NGINX access log.
- Dừng `api-1`: session read đạt 10/10 qua `api-2`; sau đó `api-1` được bật lại và healthy.
- Hai request đầu trong cửa sổ phát hiện lỗi được NGINX retry thành công qua replica còn lại, mỗi request khoảng 2,015 giây; client không nhận lỗi.
- Sau warm-up, cả `api-1`, `api-2`, PostgreSQL và NGINX vẫn healthy. Mức RAM snapshot sau bài 30 VU: API khoảng 134–140 MiB/replica, PostgreSQL khoảng 78 MiB, NGINX khoảng 21 MiB.

## Bài nghiệm thu còn thiếu

- Hai lần sustained 300 active VU/15 phút từ máy phát tải riêng.
- Authentication 300 login/120 giây.
- 300 official submit trong 10 giây và đối soát đúng 300 receipt bền vững.
- 300 VU kèm dừng một replica 60 giây.
- 10 file clients song song với 300 VU.
- Fixed arrival 30 actions/giây trong 5 phút, zero dropped iterations.
- Thu CPU/RAM/event-loop/disk IO, DB connections/locks/slow queries trong toàn bộ bài 300 VU.

Không được dùng các kết quả local đến 100 VU này để tuyên bố production-ready, SLA, miễn phí không giới hạn hoặc đã đạt 300 concurrent.
