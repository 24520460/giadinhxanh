# Báo cáo Kiểm thử Trung thực (QA Audit Report) — Nhánh `main`

**Mục tiêu:** Đánh giá trung thực chất lượng nhánh `main` qua 4 bộ kiểm thử độc lập: Baseline API, Unit Test, Integration Test và E2E Browser Test.

---

## 1. Tổng hợp Kết quả Sau khi Sửa Toàn bộ 8 Lỗi (Post-Fix Verification)

| Bộ kiểm thử | Lệnh chạy | Trước sửa (3112dab) | Sau merge & sửa lỗi | Trạng thái |
|---|---|---:|---:|---|
| Baseline API (`test/api.test.js`) | `npm run test` | 28 / 28 | **28 / 28** | **PASS** |
| **Unit Test** (`test/unit.test.js`) | `npm run test:unit` | 11 / 12 | **12 / 12** | **PASS** |
| **Integration Test** (`test/integration.test.js`) | `npm run test:integration` | 3 / 8 | **8 / 8** | **PASS** |
| **E2E Browser Test** (`test/e2e.test.js`) | `npm run test:e2e` | 2 / 4 | **4 / 4** | **PASS** |
| **TỔNG CỘNG (4 tầng kiểm thử)** | — | **44 / 52 (8 lỗi)** | **52 / 52 (0 lỗi)** | **100% PASS** |

---

## 2. Lịch sử Các Lỗi Đã Phát hiện & Cách Khắc phục (Audit Ban Đầu trên `3112dab`)

### Nhóm Bảo mật & Phân quyền (Critical / High)

1. **BUG-01 [CRITICAL] — Các API ghi đơn hàng không yêu cầu xác thực (`401`):**
   - **Bằng chứng:** `INT-02` FAIL (`201 !== 401`).
   - **Vị trí:** `backend/routes/bookingRoutes.js` (`POST /api/bookings`, `/accept`, `/start`, `/complete`, `/cancel`).
   - **Hiện trạng:** Ai cũng có thể tạo đơn, nhận đơn, bắt đầu/hoàn thành/hủy đơn mà không cần `Authorization: Bearer <token>`.

2. **BUG-02 [CRITICAL] — Giả mạo `customer_id` / `provider_id` (IDOR):**
   - **Bằng chứng:** `INT-03` FAIL (`99999 !== 101`).
   - **Vị trí:** `backend/routes/bookingRoutes.js:41` (`POST /api/bookings` lấy thẳng `body.customer_id`).
   - **Hiện trạng:** Client gửi token Customer `#101` nhưng truyền `body.customer_id = 99999` thì hệ thống vẫn lưu đơn cho `99999`, không lấy danh tính từ token.

3. **BUG-03 [HIGH] — Thiếu API đọc đơn hàng có phân quyền theo vai trò:**
   - **Bằng chứng:** `INT-04` FAIL (`404 !== 401`).
   - **Vị trí:** `backend/routes/bookingRoutes.js` chưa có `GET /api/bookings` và `GET /api/bookings/:id` trên `main`.
   - **Hiện trạng:** Frontend phải đọc toàn bộ `bookings` của mọi khách hàng thông qua `GET /api/bootstrap` công khai.

### Nhóm Nghiệp vụ & State Machine (High)

4. **BUG-04 [HIGH] — Không kiểm soát State Machine & Quyền sở hữu ca làm:**
   - **Bằng chứng:** `INT-06` FAIL (`POST /api/bookings/:id/start` trên đơn `pending` vẫn trả `200`).
   - **Vị trí:** `backend/routes/bookingRoutes.js` (`/start`, `/complete`, `/cancel`, `/rpc/transition-status`).
   - **Hiện trạng:** Có thể nhảy cóc trạng thái (`pending -> start`, `confirmed -> complete`, `completed -> cancel`) và thợ khác có thể cập nhật trạng thái đơn không phải của mình.

5. **BUG-05 [HIGH] — Lệch HTTP Method giữa Frontend & Backend ở chức năng Kê khai vật tư (`2.7`):**
   - **Bằng chứng:** `INT-07` FAIL (`404 !== 200`).
   - **Vị trí:** `public/js/portals/provider.js:1273` gọi `PATCH /api/bookings/:id/incidental`, trong khi `backend/routes/bookingRoutes.js:939` chỉ bắt `method === "POST"`.
   - **Hệ quả:** Thợ bấm lưu chi phí phát sinh trên giao diện bị lỗi `404` ngầm (UI vẫn hiện toast thành công giả vì không `await` kiểm tra response!).

### Nhóm Tích hợp End-to-End & Module (Medium / High)

6. **BUG-06 [HIGH] — Đứt gãy luồng E2E Customer (`1.2`) → Partner (`2.1`) khi có `.env.local`:**
   - **Bằng chứng:** `E2E-2` FAIL (Timeout chờ `[data-booking-id="3c6599ba-..."]` trên màn hình `2.1`).
   - **Nguyên nhân kép:**
     1. Dù chạy `?mode=dev`, `GET /api/bootstrap` vẫn tải `services` UUID từ Supabase nên `1.2` tạo đơn vào Supabase (`3c6599ba-...`), và `bookingRoutes.js:141-145` trên `main` vẫn gán bừa `provider_id` thay vì `null`.
     2. `provider.js` (PR #6) kiểm tra `getJobBoardUser()` đòi hỏi `state.currentUser` / `localStorage` có user `provider`, nên khi chuyển nhanh sang Phân hệ 2 ở `dev` mode hoặc khi đồng bộ lại bootstrap, đơn mới không hiện để nhận.

7. **BUG-07 [MEDIUM] — Modal `2.7` không khớp dữ liệu UUID & không gửi request khi thiếu booking số:**
   - **Bằng chứng:** `E2E-3` FAIL (Timeout chờ network `/incidental` khi mở Modal `2.7` với `bookingId: 1042`).

8. **BUG-08 [LOW] — `public/js/core/state.js` phụ thuộc `window` ở top-level:**
   - **Bằng chứng:** `test/unit.test.js` FAIL (`ReferenceError: window is not defined` tại `state.js:1`).
   - **Hệ quả:** Không thể import trực tiếp các hàm thuần trong `formatters.js` (do `formatters.js` import `state.js`) trong môi trường Node test nếu không mock `window`.

---

## 3. Ghi chú tích cực (Những phần đang hoạt động đúng)
- **Unit Backend:** `validators.js`, `auth.js` (ký/verify HMAC JWT), `autoExpirePendingBookings`, và `db-mock.js` đều pass **11/11**.
- **Concurrency `/accept` (khi đã có booking hợp lệ):** `INT-05` pass (`[200, 409]`).
- **Render UI & AI/Notifications:** Tất cả 23 màn hình trên 5 phân hệ render với **0 `pageerror`**, ngăn thông báo và trợ lý AI Chat hoạt động thông suốt (`E2E-1`, `E2E-4` PASS).
- **Lưu ý quan trọng:** Các lỗi **BUG-01, BUG-02, BUG-03, BUG-04, BUG-05** đã được xử lý trên branch riêng `feat/nguyen-hao-booking-api`, nhưng **chưa được merge vào `main`**.
