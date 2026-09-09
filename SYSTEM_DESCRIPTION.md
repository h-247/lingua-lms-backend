# Mô tả hệ thống backend Lingua LMS

## Phạm vi

Đây là backend API cho một trung tâm tiếng Anh duy nhất. Hệ thống quản lý tài khoản, lớp học thực tế, ghi danh, nhóm hỗ trợ, tài liệu, bài tập, quiz chính thức, quiz luyện tập, chấm điểm, báo cáo và audit. Không có học phí, thời khóa biểu, điểm danh, AI, chat, chứng chỉ, marketplace hay đa trung tâm.

`LearningClass` là biên dạy học duy nhất; không có Program/CourseTemplate/Cohort. `Enrollment.ACTIVE` là quyền thành viên lớp duy nhất. `LearnerGroup` chỉ phục vụ phân phối bài và lọc; rời nhóm không xóa bài đã giao, còn thu hồi ghi danh chặn mọi truy cập tiếp theo nhưng giữ lịch sử.

## Vai trò và vòng đời

- `ADMIN`: tạo/vô hiệu hóa tài khoản, lớp, phân công giáo viên, ghi danh và giám sát dữ liệu.
- `TEACHER`: quản lý nội dung/nhóm/bài/chấm điểm trong đúng lớp được phân công.
- `STUDENT`: chỉ xem lớp đang ghi danh, bài đã có recipient và dữ liệu của chính mình.

Lớp: `DRAFT → ACTIVE → CLOSED`. Assessment: `DRAFT → PUBLISHED → CLOSED`. Đóng lớp đồng thời đóng assessment đã phát hành; người học còn ghi danh được xem lịch sử, giáo viên vẫn chấm bài đã nộp.

## Bài học và kết quả

- `HOMEWORK`: nội dung chữ tối đa 20.000 ký tự và/hoặc một file; nộp một lần; giáo viên chấm 0..maxPoints; sửa điểm cần lý do.
- `GRADED_QUIZ`: 1–50 câu single-choice/true-false; server chấm; đáp án/giải thích chỉ hiện sau khi đóng.
- `PRACTICE_QUIZ`: nhiều lượt, tối đa một draft đang mở; giữ lịch sử, best/latest; hiện giải thích sau mỗi lượt; không ảnh hưởng điểm hoặc tiến độ chính thức.

Draft dùng optimistic revision. Submit dùng final payload + expected revision + `Idempotency-Key`; retry giống hệt trả receipt cũ, payload khác trả conflict. Điểm phần trăm làm tròn hai chữ số; báo cáo lấy trung bình ngang nhau của tỷ lệ chưa làm tròn và không coi bài chưa chấm là 0.

## Bảo mật và file

Mật khẩu Argon2id; session opaque 8 giờ trong PostgreSQL; session ID được regenerate khi login; CSRF gắn session; Origin/CORS allowlist; authVersion thu hồi session sau đổi/reset mật khẩu hoặc vô hiệu hóa. File private dùng opaque key, signature/MIME/extension allowlist, giới hạn 10 MiB cho tài liệu và 5 MiB cho bài nộp. Mọi lượt tải xuống phải được authorize trước; NGINX chỉ phục vụ qua internal redirect.

## Vận hành

Hai bản sao của cùng ứng dụng đứng sau NGINX `least_conn`, cùng PostgreSQL, session store và shared file volume. Đây là khả năng chịu lỗi tiến trình, không phải HA đa máy: VM, DB, NGINX và disk vẫn là single point of failure. Mục tiêu 300 người dùng đồng thời chỉ được công nhận sau khi các bài k6 trong `PERFORMANCE_REPORT.md` đạt trên đúng topology triển khai.
