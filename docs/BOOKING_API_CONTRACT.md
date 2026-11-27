# Booking API Contract & Test Checklist — Sprint 1 (Nguyễn Quang Hào)

Tài liệu thống nhất API Backend cho luồng đặt dịch vụ, nhận đơn, bắt đầu/hoàn thành ca làm và theo dõi trạng thái đơn hàng giữa **Backend (Nguyễn Hào)**, **Database (Nhật Hào)**, **Frontend (Học, Hải)** và **Kiểm thử (Việt)**.

---

## 1. Quy ước Xác thực & Nhận diện Vai trò từ Token

- **Header chuẩn:**
  ```http
  Authorization: Bearer <token>
  Content-Type: application/json
  ```
- **Loại token hỗ trợ:**
  1. GDX Session Token (`POST /api/auth/login` hoặc `POST /api/auth/demo-session`).
  2. Supabase Auth JWT (`client.auth.getUser(token)` ở chế độ Supabase/Production).
- **Nguyên tắc bảo mật (không tin ID giả từ Client):**
  - Khi gọi với token `customer`, Backend tự suy ra `customer_id` từ `authUser.user_id` (bỏ qua `body.customer_id` nếu client gửi sai/giả mạo).
  - Khi gọi với token `provider`, Backend tự suy ra `provider_id` từ `authUser.user_id` (bỏ qua `body.provider_id` / `body.user_id` nếu client gửi sai/giả mạo).
  - Token thiếu/hết hạn/sai chữ ký → **`401 Unauthorized`** (`code: "UNAUTHORIZED"`).
  - Sai vai trò hoặc truy cập đơn của người khác → **`403 Forbidden`** (`code: "FORBIDDEN"`).

---

## 2. Quy trình Trạng thái Đơn hàng (State Machine)

```
pending ──(Partner nhận /accept)──▶ confirmed ──(Partner /start)──▶ in_progress ──(Partner /complete)──▶ completed
   │                                    │                                 │
   ├──(Customer/Partner/Admin /cancel)──┼─────────────────────────────────┴──▶ cancelled
   ├──(Partner từ chối)──────────────────────────────────────────────────────▶ rejected
   └──(Quá 24h không ai nhận)────────────────────────────────────────────────▶ auto_cancelled
```

| Vai trò | Chuyển trạng thái hợp lệ |
|---|---|
| `customer` | `pending` / `confirmed` → `cancelled` |
| `provider` | `pending` → `confirmed` / `rejected`; `confirmed` → `in_progress` / `cancelled`; `in_progress` → `completed` / `cancelled` |
| `admin` | Mọi chuyển đổi hợp lệ theo đồ thị trên |

---

## 3. Đối chiếu Kiểu ID: Local Store ↔ Supabase

| Trường | Local Store (`local-db.json`) | Supabase (`mode=production`) | Lưu ý |
|---|---|---|---|
| `booking_id` | Number (vd: `1042`) | UUID | Backend dùng `normalizeId()` và tự nhận diện UUID |
| `customer_id` | Number (vd: `101`) | UUID | Tự lấy từ token khi có `Authorization` |
| `provider_id` | Number hoặc `null` | UUID hoặc `null` | `null` nếu là đơn rải (`dispatch_type: "broadcast"`) |
| `service_id` | Number (vd: `301`) | UUID | Bắt buộc tồn tại trong bảng `services` |

---

## 4. Chi tiết API Contract

### 4.1. Tạo đơn đặt lịch (Học — `POST /api/bookings`)
- **Quyền:** `customer`, `admin`
- **Request Body:**
  ```json
  {
    "service_id": 301,
    "provider_id": null,
    "ward_id": "27403",
    "address": "14 Đường Nội Khu Cảnh Đồi, Quận 7",
    "scheduled_time": "2026-11-28T09:00:00.000Z",
    "total_amount": 255000,
    "latitude": 10.728912,
    "longitude": 106.712405,
    "notes": "Ghi chú cho thợ"
  }
  ```
  *(Truyền `provider_id: null` để rải đơn; truyền `provider_id` cụ thể nếu khách tự chọn thợ.)*
- **Response `201 Created`:**
  ```json
  {
    "ok": true,
    "booking": {
      "booking_id": 1043,
      "customer_id": 101,
      "provider_id": null,
      "dispatch_type": "broadcast",
      "status": "pending",
      "payment_status": "unpaid",
      "total_incidental": 0
    },
    "history": { "new_status": "pending" }
  }
  ```
- **Lỗi:** `400 INVALID_INPUT` (thiếu trường / giờ quá khứ / tọa độ sai), `404 SERVICE_NOT_FOUND`, `409` (trùng lịch thợ).

### 4.2. Đọc danh sách & Chi tiết đơn theo phân quyền (Việt, Hải)
- **Danh sách:** `GET /api/bookings` *(tùy chọn `?status=pending`)* — **Bắt buộc Bearer Token**
  - `customer`: chỉ trả đơn của chính mình.
  - `provider`: trả đơn của mình + đơn `pending` chưa có thợ (`provider_id == null`).
  - `company`: trả đơn thuộc công ty / thợ của công ty.
  - `admin`: tất cả đơn.
  - **Response `200`:** `{ "ok": true, "bookings": [ ... ] }`
- **Chi tiết:** `GET /api/bookings/:id` — **Bắt buộc Bearer Token**
  - **Response `200`:** `{ "ok": true, "booking": { ... }, "history": [ ... ] }`
  - **Lỗi:** `401 UNAUTHORIZED`, `403 FORBIDDEN` (xem đơn người khác), `404 NOT_FOUND`.

### 4.3. Đối tác nhận đơn (Hải — `POST /api/bookings/:id/accept`)
- **Quyền:** `provider`, `admin`
- **Request Body:** `{}` *(với token `provider`, Backend tự lấy `provider_id` từ token)*.
- **Chống nhận trùng (Concurrency):** khóa `inFlightAcceptLocks` + cập nhật điều kiện nguyên tử (`status = 'pending'` và `provider_id IS NULL`).
- **Response `200`:** `{ "ok": true, "booking": { "status": "confirmed", "provider_id": 201, ... }, "history": { ... } }`
- **Lỗi:** `404 NOT_FOUND`, `409 BOOKING_ALREADY_TAKEN` (`expired: true`).

### 4.4. Bắt đầu, Hoàn thành & Hủy ca làm (Luồng chính thức)
- **Bắt đầu làm việc:** `POST /api/bookings/:id/start` (`provider`, `admin`) → chuyển `confirmed` → `in_progress`.
- **Hoàn thành nghiệm thu:** `POST /api/bookings/:id/complete` (`provider`, `admin`) → chuyển `in_progress` → `completed`.
- **Hủy đơn:** `POST /api/bookings/:id/cancel` (`customer`, `provider`, `admin`) → chuyển sang `cancelled` (kèm `body.reason`).
- **Alias tương thích:** `POST /api/rpc/transition-status` (`{ booking_id, new_status, reason }`) — dùng chung State Machine và kiểm tra quyền sở hữu.
- **Response `200`:** `{ "ok": true, "booking": { ... }, "history": { ... } }`
- **Lỗi:** `400 INVALID_TRANSITION` (nhảy cóc trạng thái), `403 FORBIDDEN` (sai vai trò / không phải chủ đơn), `409 ALREADY_IN_STATUS`.

---

## 5. Danh sách Test Cases bàn giao cho Việt (Kiểm thử Tích hợp)

| ID | Kịch bản kiểm thử | Kết quả mong đợi |
|---|---|---|
| TC-01 | `GET /api/bookings` không có token / token giả | `401 UNAUTHORIZED` |
| TC-02 | Customer gửi `POST /api/bookings` kèm `customer_id: 999` giả mạo | `201`, `booking.customer_id` đúng theo token (`101`) |
| TC-03 | Customer gửi `POST /api/bookings` với `provider_id: null` | `201`, `provider_id: null`, `dispatch_type: "broadcast"`, `status: "pending"` |
| TC-04 | Partner gọi `POST /api/bookings` (tạo đơn) | `403 FORBIDDEN` |
| TC-05 | Customer khác gọi `GET /api/bookings/:id` | `403 FORBIDDEN` |
| TC-06 | Customer gọi `GET /api/bookings` | `200`, chỉ chứa đơn của chính Customer |
| TC-07 | Partner gửi `POST /api/bookings/:id/accept` kèm `provider_id` giả mạo | `200`, `booking.provider_id` đúng theo token (`201`) |
| TC-08 | 2 Partner gọi `POST /api/bookings/:id/accept` đồng thời (`Promise.all`) | Đúng 1 request `200`, 1 request `409` (`expired: true`) |
| TC-09 | Customer gọi `POST /api/bookings/:id/accept` | `403 FORBIDDEN` |
| TC-10 | Partner #202 gọi `/start` hoặc `/complete` trên đơn của Partner #201 | `403 FORBIDDEN` |
| TC-11 | Partner #201 gọi `/complete` khi đơn đang `confirmed` (nhảy cóc) | `400 INVALID_TRANSITION` |
| TC-12 | Partner #201 gọi `/start` (`confirmed` → `in_progress`) | `200`, `status: "in_progress"` |
| TC-13 | Partner #201 gọi `/complete` (`in_progress` → `completed`) | `200`, `status: "completed"` |
| TC-14 | Customer gọi `/cancel` sau khi đơn đã `completed` | `400 INVALID_TRANSITION` |
| TC-15 | Customer gọi `POST /api/rpc/transition-status` lên `completed` | `403 FORBIDDEN_TRANSITION` |
