# DCL Auth Worker Migration Kit

Thư mục này là nền để chuyển app Quy hoạch ĐCL từ đăng nhập static sang backend thật.

## Trạng thái

- Frontend hiện đã ưu tiên gọi `POST /api/auth/login` nếu endpoint tồn tại.
- Nếu chưa triển khai Worker/API, bản static chỉ cho phép tạo ADMIN đầu tiên bằng hash local trong trình duyệt để kiểm thử luồng.
- Tài khoản local của bản static không phải bảo mật sản xuất. Backend dưới đây mới là hướng cần triển khai chính thức.

## File

- `schema.sql`: schema D1 cho users, quyền tỉnh, quyền bưu cục, sessions và audit log.
- `worker.js`: khung API `/api/auth/login`, `/api/auth/session`, `/api/auth/logout`.

## Việc còn phải làm trước production

1. Tạo D1 database và chạy `schema.sql`.
2. Seed ít nhất một `ADMIN`.
3. Gắn thư viện verify password `argon2id` hoặc `bcrypt` vào Worker build.
4. Thay `verifyPassword()` trong `worker.js` bằng verifier thật.
5. Bổ sung API quản trị user:
   - tạo/sửa/khóa/mở khóa tài khoản;
   - reset password;
   - đổi username/full name/password;
   - quản lý quyền GĐV theo tỉnh;
   - quản lý quyền AM theo bưu cục.
6. Bổ sung middleware bắt buộc quyền server-side cho mọi API dữ liệu nhạy cảm.
7. Không upload toàn bộ dữ liệu nhạy cảm bằng static file nếu người chưa login.

## Vai trò quyền

- `ADMIN`: quản trị toàn hệ thống, không được khóa/xóa/hạ quyền ADMIN cuối cùng.
- `GDV`: Giám đốc vùng, phân quyền theo `user_province_permissions`.
- `AM`: phân quyền theo `user_branch_permissions`.
- `VIEWER`: chỉ xem.

## Lưu ý quan trọng

Cloudflare Worker không có sẵn bcrypt/Argon2 trong Web Crypto. Vì vậy `worker.js` đang cố tình không xác thực fallback bằng hash yếu. Khi triển khai production, cần dùng build pipeline có thư viện bcrypt/Argon2 tương thích Worker hoặc xác thực qua dịch vụ backend riêng.
