# Cơ sở dữ liệu Gia Đình Xanh

## 1. Tổng quan

Cơ sở dữ liệu được thiết kế cho PostgreSQL/Supabase và nằm trong migration duy nhất:

- [20261124000000_gia_dinh_xanh_schema.sql](../database/migrations/20261124000000_gia_dinh_xanh_schema.sql)

Database sử dụng Supabase Auth làm nguồn xác thực. Khóa chính của người dùng là `auth.users.id`, đồng thời được liên kết với bảng `profiles`. Vai trò, trạng thái tài khoản, dữ liệu booking, thanh toán mô phỏng và phân quyền đều được lưu trong PostgreSQL.

### 1.1 Tình trạng đồng bộ với source code hiện tại

Migration mới là baseline schema Supabase chuẩn, chưa tự động đồng bộ Local Store hiện hành. Trước khi triển khai luồng thực tế cần thống nhất các điểm sau:

- Baseline dùng UUID cho `profiles`, `customers`, `workers`, `businesses`, `services` và `bookings`; Local Store hiện dùng các ID số cho `users`, `customer_profiles`, `provider_profiles`, `company_profiles`, `services` và `bookings`.
- Baseline dùng các vai trò `customer`, `worker`, `business`, `admin`; Local Store/route hiện chủ yếu dùng `customer`, `provider`, `company`, `admin`.
- Baseline dùng trạng thái booking `pending_confirmation`, `confirmed`, `surveying`, `awaiting_customer_quote`, `in_progress`, `completed`, `cancelled`, `cancelled_no_agreement`, `failed`; route hiện dùng thêm hoặc chủ yếu dùng `pending`, `confirmed`, `in_progress`, `completed`, `cancelled`, `auto_cancelled`.
- Bảng baseline là `profiles`, `customers`, `workers`, `businesses`; source hiện đọc chủ yếu `users`, `customer_profiles`, `provider_profiles`, `company_profiles`.
- Baseline yêu cầu `bookings.worker_id NOT NULL`, trong khi luồng hiện có đơn phát theo broadcast và chưa gán worker khi khách tạo đơn. Contract tạo đơn cần quy định việc gán worker sau hoặc điều chỉnh schema.
- Baseline mô tả thanh toán mô phỏng bằng enum `pending/success/failed/refunded`; không đồng nhất với các giá trị cũ như `unpaid/paid` trong Local Store.

Các tên gọi trên chỉ được coi là contract Supabase sau khi migration được thống nhất. Backend và frontend không được thay tên bảng/cột hoặc ID tùy tiện mà không cập nhật contract chung và seed.

## 2. Công nghệ PostgreSQL được sử dụng

- `pgcrypto`: tạo UUID ngẫu nhiên bằng `gen_random_uuid()`.
- `pg_trgm`: tìm kiếm tương đối tên dịch vụ bằng chỉ mục trigram.
- `btree_gist`: hỗ trợ exclusion constraint để ngăn booking trùng giờ.
- `PostGIS`: lưu tọa độ địa lý bằng kiểu geography.
- Enum: giới hạn giá trị cho vai trò, trạng thái tài khoản, booking, thanh toán và phiếu hỗ trợ.
- Trigger: tự động cập nhật thời gian, ghi trạng thái booking, đồng bộ tọa độ và kiểm tra ràng buộc địa chỉ.
- Row Level Security (RLS): kiểm soát dữ liệu theo người dùng, vai trò và doanh nghiệp.
- RPC/SECURITY DEFINER: xử lý nghiệp vụ atomically như tạo booking, hủy, điều chỉnh và thanh toán mô phỏng.

## 3. Vai trò và enum

| Enum | Giá trị |
|---|---|
| `app_role` | `customer`, `worker`, `business`, `admin` |
| `account_status` | `active`, `suspended`, `deleted` |
| `business_status` | `active`, `suspended`, `deleted` |
| `worker_status` | `active`, `suspended`, `deleted` |
| `service_pricing_type` | `fixed`, `area`, `hour`, `survey` |
| `service_status` | `active`, `suspended`, `deleted` |
| `category_status` | `active`, `suspended`, `deleted` |
| `booking_status` | `pending_confirmation`, `confirmed`, `surveying`, `awaiting_customer_quote`, `in_progress`, `completed`, `cancelled`, `cancelled_no_agreement`, `failed` |
| `payment_status` | `pending`, `success`, `failed`, `refunded` |
| `payment_method` | `qr_bank_transfer`, `pay_on_completion` |
| `quote_status` | `pending`, `accepted`, `rejected`, `expired` |
| `adjustment_status` | `pending`, `accepted`, `rejected`, `expired` |
| `review_status` | `published`, `edited`, `moderated`, `deleted` |
| `ticket_status` | `open`, `in_progress`, `waiting_customer`, `resolved`, `closed` |
| `ticket_priority` | `low`, `medium`, `high`, `urgent` |
| `dispute_status` | `open`, `under_review`, `resolved`, `rejected` |

## 4. Danh mục bảng

### 4.1 `profiles`

Hồ sơ mở rộng cho tài khoản Supabase Auth.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK, FK -> `auth.users(id)` | Định danh tài khoản, trùng với ID Supabase Auth |
| `role` | `app_role` | NOT NULL | Vai trò chính của tài khoản |
| `account_status` | `account_status` | NOT NULL | Trạng thái hoạt động tài khoản |
| `full_name` | `text` | | Họ và tên |
| `phone` | `text` | | Số điện thoại |
| `avatar_url` | `text` | | Đường dẫn ảnh đại diện |
| `description` | `text` | | Tiểu sử nhân viên, mô tả tài khoản hoặc thông tin công khai |
| `must_change_password` | `boolean` | NOT NULL | Bắt buộc đổi mật khẩu mặc định |
| `provisioned_by` | `uuid` | FK -> `auth.users(id)` | Người tạo tài khoản thay mặt hệ thống |
| `provisioned_at` | `timestamptz` | | Thời điểm cấp tài khoản |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.2 `provinces`

Danh mục tỉnh/thành phục vụ địa chỉ Việt Nam.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `code` | `text` | PK | Mã tỉnh/thành |
| `name` | `text` | NOT NULL | Tên tỉnh/thành |
| `name_en` | `text` | | Tên tiếng Anh |
| `active` | `boolean` | NOT NULL | Còn cho phép chọn |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.3 `wards`

Danh mục phường/xã theo từng tỉnh/thành.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `code` | `text` | PK | Mã phường/xã |
| `province_code` | `text` | FK -> `provinces(code)` | Tỉnh/thành sở hữu phường/xã |
| `name` | `text` | NOT NULL | Tên phường/xã |
| `name_en` | `text` | | Tên tiếng Anh |
| `active` | `boolean` | NOT NULL | Còn cho phép chọn |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.4 `addresses`

Địa chỉ thực hiện dịch vụ hoặc địa chỉ mặc định của người dùng.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh địa chỉ |
| `user_id` | `uuid` | FK -> `auth.users(id)` | Chủ sở hữu địa chỉ |
| `label` | `text` | | Tên gợi nhớ như Nhà, Công ty |
| `street_address` | `text` | NOT NULL | Số nhà và tên đường |
| `province_code` | `text` | FK -> `provinces(code)` | Tỉnh/thành |
| `ward_code` | `text` | FK -> `wards(code)` | Phường/xã |
| `latitude` | `double precision` | | Vĩ độ |
| `longitude` | `double precision` | | Kinh độ |
| `location` | `geography(Point,4326)` | | Điểm địa lý dùng tính khoảng cách |
| `is_default` | `boolean` | NOT NULL | Có phải địa chỉ mặc định |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |
| `deleted_at` | `timestamptz` | | Thời điểm xóa mềm |

### 4.5 `customers`

Thông tin nghiệp vụ riêng cho khách hàng.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh khách hàng |
| `profile_id` | `uuid` | UNIQUE, FK -> `profiles(id)` | Hồ sơ tương ứng |
| `default_address_id` | `uuid` | FK -> `addresses(id)` | Địa chỉ mặc định |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.6 `businesses`

Doanh nghiệp cung cấp dịch vụ.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh doanh nghiệp |
| `owner_profile_id` | `uuid` | UNIQUE, FK -> `profiles(id)` | Tài khoản đại diện/doanh nghiệp |
| `name` | `text` | NOT NULL | Tên doanh nghiệp |
| `slug` | `text` | UNIQUE, NOT NULL | Tên trong URL |
| `description` | `text` | | Mô tả công khai |
| `logo_url` | `text` | | Đường dẫn logo |
| `phone` | `text` | | Số điện thoại liên hệ |
| `email` | `text` | | Email liên hệ |
| `street_address` | `text` | | Số nhà/tên đường |
| `province_code` | `text` | FK -> `provinces(code)` | Tỉnh/thành hoạt động |
| `ward_code` | `text` | FK -> `wards(code)` | Phường/xã hoạt động |
| `latitude` | `double precision` | | Vĩ độ |
| `longitude` | `double precision` | | Kinh độ |
| `location` | `geography(Point,4326)` | | Điểm địa lý doanh nghiệp |
| `status` | `business_status` | NOT NULL | Trạng thái doanh nghiệp |
| `deleted_at` | `timestamptz` | | Thời điểm xóa mềm |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.7 `workers`

Nhân viên thuộc một doanh nghiệp.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh nhân viên |
| `profile_id` | `uuid` | UNIQUE, FK -> `profiles(id)` | Tài khoản nhân viên |
| `business_id` | `uuid` | FK -> `businesses(id)` | Doanh nghiệp quản lý nhân viên |
| `street_address` | `text` | | Số nhà/tên đường làm việc |
| `province_code` | `text` | FK -> `provinces(code)` | Tỉnh/thành làm việc |
| `ward_code` | `text` | FK -> `wards(code)` | Phường/xã làm việc |
| `latitude` | `double precision` | | Vĩ độ vị trí |
| `longitude` | `double precision` | | Kinh độ vị trí |
| `location` | `geography(Point,4326)` | | Điểm địa lý dùng tính khoảng cách |
| `status` | `worker_status` | NOT NULL | Trạng thái nhân viên |
| `can_self_set_location` | `boolean` | NOT NULL | Cho phép nhân viên tự cập nhật vị trí |
| `deleted_at` | `timestamptz` | | Thời điểm xóa mềm |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.8 `worker_portfolio_images`

Ảnh công việc đã thực hiện được nhân viên đăng trong hồ sơ công khai.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh ảnh |
| `worker_id` | `uuid` | FK -> `workers(id)` | Nhân viên sở hữu ảnh |
| `image_url` | `text` | NOT NULL | URL công khai |
| `storage_path` | `text` | | Đường dẫn trong Supabase Storage |
| `title` | `text` | | Tiêu đề ảnh |
| `description` | `text` | | Mô tả công việc |
| `display_order` | `integer` | NOT NULL, >= 0 | Thứ tự hiển thị |
| `active` | `boolean` | NOT NULL | Hiển thị công khai hay không |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tải |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.9 `service_categories`

Danh mục dịch vụ do admin quản lý.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh danh mục |
| `name` | `text` | NOT NULL | Tên danh mục |
| `slug` | `text` | UNIQUE, NOT NULL | Tên trong URL |
| `description` | `text` | | Mô tả danh mục |
| `status` | `category_status` | NOT NULL | Trạng thái danh mục |
| `display_order` | `integer` | NOT NULL | Thứ tự hiển thị |
| `deleted_at` | `timestamptz` | | Thời điểm xóa mềm |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.10 `services`

Dịch vụ do từng doanh nghiệp tạo và định giá.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh dịch vụ |
| `business_id` | `uuid` | FK -> `businesses(id)` | Doanh nghiệp cung cấp |
| `name` | `text` | NOT NULL | Tên dịch vụ |
| `slug` | `text` | NOT NULL | Tên trong URL |
| `description` | `text` | | Mô tả chi tiết công việc |
| `pricing_type` | `service_pricing_type` | NOT NULL | Cố định, theo m², theo giờ hoặc khảo sát |
| `base_price` | `numeric(14,2)` | NOT NULL, >= 0 | Giá cơ bản hoặc đơn giá |
| `initial_visit_fee` | `numeric(14,2)` | NOT NULL, >= 0 | Phí thăm khám ban đầu |
| `min_quantity` | `numeric(12,2)` | | Số lượng tối thiểu cho m²/giờ |
| `max_quantity` | `numeric(12,2)` | | Số lượng tối đa |
| `quantity_step` | `numeric(12,2)` | | Bước thay đổi số lượng |
| `unit_label` | `text` | | Nhãn đơn vị như m², giờ |
| `estimated_duration_minutes` | `integer` | NOT NULL, > 0 | Thời lượng dự kiến |
| `area_rounding_step` | `numeric(12,2)` | | Quy tắc làm tròn diện tích |
| `status` | `service_status` | NOT NULL | Trạng thái dịch vụ |
| `deleted_at` | `timestamptz` | | Thời điểm xóa mềm |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.11 `service_categories_map`

Quan hệ nhiều-nhiều giữa dịch vụ và danh mục.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `service_id` | `uuid` | PK, FK -> `services(id)` | Dịch vụ |
| `category_id` | `uuid` | PK, FK -> `service_categories(id)` | Danh mục |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm gán danh mục |

### 4.12 `service_images`

Ảnh minh họa do doanh nghiệp tải cho từng dịch vụ.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh ảnh |
| `service_id` | `uuid` | FK -> `services(id)` | Dịch vụ sở hữu ảnh |
| `image_url` | `text` | NOT NULL | URL công khai |
| `storage_path` | `text` | | Đường dẫn Supabase Storage |
| `title` | `text` | | Tiêu đề ảnh |
| `display_order` | `integer` | NOT NULL, >= 0 | Thứ tự hiển thị |
| `is_cover` | `boolean` | NOT NULL | Có phải ảnh đại diện |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tải |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.13 `service_workers`

Gán nhân viên có thể thực hiện dịch vụ cụ thể.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `service_id` | `uuid` | PK, FK -> `services(id)` | Dịch vụ |
| `worker_id` | `uuid` | PK, FK -> `workers(id)` | Nhân viên |
| `active` | `boolean` | NOT NULL | Quan hệ đang hoạt động |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm gán |

### 4.14 `worker_schedules`

Lịch làm việc lặp lại theo thứ trong tuần.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh lịch |
| `worker_id` | `uuid` | FK -> `workers(id)` | Nhân viên |
| `day_of_week` | `integer` | NOT NULL, 0-6 | Ngày trong tuần |
| `start_minute` | `integer` | NOT NULL, 0-1439 | Số phút tính từ nửa đêm |
| `end_minute` | `integer` | NOT NULL, 1-1440 | Số phút kết thúc |
| `active` | `boolean` | NOT NULL | Lịch đang hoạt động |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.15 `worker_availability_exceptions`

Ngày nghỉ, giờ nghỉ hoặc thay đổi lịch một lần.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh ngoại lệ |
| `worker_id` | `uuid` | FK -> `workers(id)` | Nhân viên |
| `start_at` | `timestamptz` | NOT NULL | Thời điểm bắt đầu nghỉ |
| `end_at` | `timestamptz` | NOT NULL | Thời điểm kết thúc nghỉ |
| `reason` | `text` | | Lý do nghỉ |
| `created_by` | `uuid` | FK -> `auth.users(id)` | Người tạo ngoại lệ |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.16 `bookings`

Bảng booking trung tâm chứa dịch vụ, nhân viên, khách hàng và giá.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh booking |
| `booking_code` | `text` | UNIQUE, NOT NULL | Mã hiển thị cho người dùng |
| `customer_id` | `uuid` | FK -> `customers(id)` | Khách đặt dịch vụ |
| `business_id` | `uuid` | FK -> `businesses(id)` | Doanh nghiệp thực hiện |
| `service_id` | `uuid` | FK -> `services(id)` | Dịch vụ được đặt |
| `worker_id` | `uuid` | FK -> `workers(id)` | Nhân viên được phân công |
| `address_id` | `uuid` | FK -> `addresses(id)` | Địa chỉ đã lưu |
| `customer_street_address` | `text` | NOT NULL | Số nhà/tên đường lưu tại thời điểm đặt |
| `customer_province_code` | `text` | FK -> `provinces(code)` | Tỉnh/thành tại thời điểm đặt |
| `customer_ward_code` | `text` | FK -> `wards(code)` | Phường/xã tại thời điểm đặt |
| `status` | `booking_status` | NOT NULL | Trạng thái hiện tại |
| `scheduled_start` | `timestamptz` | NOT NULL | Thời điểm bắt đầu dự kiến |
| `scheduled_end` | `timestamptz` | NOT NULL | Thời điểm kết thúc dự kiến |
| `initial_quantity` | `numeric(12,2)` | | m², số giờ hoặc số lượng ban đầu |
| `initial_unit_price` | `numeric(14,2)` | NOT NULL, >= 0 | Đơn giá ban đầu |
| `initial_visit_fee` | `numeric(14,2)` | NOT NULL, >= 0 | Phí thăm khám ban đầu |
| `initial_total` | `numeric(14,2)` | NOT NULL, >= 0 | Tổng ban đầu |
| `final_quantity` | `numeric(12,2)` | | Số lượng sau điều chỉnh |
| `final_unit_price` | `numeric(14,2)` | >= 0 | Đơn giá cuối |
| `final_price` | `numeric(14,2)` | >= 0 | Giá dịch vụ cuối |
| `final_total` | `numeric(14,2)` | >= 0 | Tổng thanh toán cuối |
| `extra_fee` | `numeric(14,2)` | NOT NULL, >= 0 | Phí phát sinh đã chấp nhận |
| `customer_notes` | `text` | | Ghi chú của khách |
| `worker_notes` | `text` | | Ghi chú của nhân viên |
| `cancellation_reason` | `text` | | Lý do hủy |
| `cancelled_at` | `timestamptz` | | Thời điểm hủy |
| `confirmed_at` | `timestamptz` | | Thời điểm nhân viên xác nhận |
| `started_at` | `timestamptz` | | Thời điểm bắt đầu công việc |
| `completed_at` | `timestamptz` | | Thời điểm hoàn thành |
| `version` | `integer` | NOT NULL | Phiên bản tối ưu cho kiểm tra/cập nhật nhất quán |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.17 `booking_cancellations`

Lưu chi tiết hủy trước xác nhận hoặc hủy sau xác nhận.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh hành động hủy |
| `booking_id` | `uuid` | FK -> `bookings(id)` | Booking bị hủy |
| `cancelled_by` | `uuid` | FK -> `auth.users(id)` | Người thực hiện hủy |
| `reason` | `text` | | Lý do hủy |
| `pre_confirmation` | `boolean` | NOT NULL | Hủy trước khi nhân viên xác nhận |
| `refund_simulated` | `numeric(14,2)` | NOT NULL, >= 0 | Số tiền hoàn mô phỏng |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm hủy |

### 4.18 `booking_status_history`

Lịch sử mọi thay đổi trạng thái booking.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh dòng lịch sử |
| `booking_id` | `uuid` | FK -> `bookings(id)` | Booking liên quan |
| `from_status` | `booking_status` | | Trạng thái trước |
| `to_status` | `booking_status` | NOT NULL | Trạng thái sau |
| `changed_by` | `uuid` | FK -> `auth.users(id)` | Người thực hiện |
| `reason` | `text` | | Lý do thay đổi |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm thay đổi |

### 4.19 `booking_price_quotes`

Đề nghị giá cuối sau khi nhân viên khảo sát.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh báo giá |
| `booking_id` | `uuid` | FK -> `bookings(id)` | Booking cần báo giá |
| `worker_id` | `uuid` | FK -> `workers(id)` | Nhân viên đề xuất |
| `description` | `text` | NOT NULL | Mô tả công việc |
| `proposed_unit_price` | `numeric(14,2)` | NOT NULL, >= 0 | Đơn giá đề xuất |
| `proposed_quantity` | `numeric(12,2)` | | Số lượng đề xuất |
| `proposed_final_price` | `numeric(14,2)` | NOT NULL, >= 0 | Giá cuối đề xuất |
| `expires_at` | `timestamptz` | | Hết hạn xác nhận |
| `status` | `quote_status` | NOT NULL | Trạng thái báo giá |
| `responded_by` | `uuid` | FK -> `auth.users(id)` | Người chấp nhận/từ chối |
| `responded_at` | `timestamptz` | | Thời điểm phản hồi |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |

### 4.20 `booking_quantity_adjustments`

Nhân viên đề xuất điều chỉnh m², giờ, thời lượng hoặc phí phát sinh.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh điều chỉnh |
| `booking_id` | `uuid` | FK -> `bookings(id)` | Booking bị điều chỉnh |
| `worker_id` | `uuid` | FK -> `workers(id)` | Nhân viên đề xuất |
| `adjustment_type` | `text` | NOT NULL | `area`, `hours`, `duration`, `quantity` hoặc `other` |
| `description` | `text` | | Mô tả điều chỉnh |
| `original_quantity` | `numeric(12,2)` | | Số lượng ban đầu |
| `proposed_quantity` | `numeric(12,2)` | | Số lượng đề xuất |
| `original_duration_minutes` | `integer` | | Thời lượng ban đầu |
| `proposed_duration_minutes` | `integer` | | Thời lượng đề xuất |
| `original_extra_fee` | `numeric(14,2)` | NOT NULL | Phí phát sinh trước điều chỉnh |
| `proposed_extra_fee` | `numeric(14,2)` | NOT NULL | Phí phát sinh đề xuất |
| `recalculated_unit_price` | `numeric(14,2)` | | Đơn giá tính lại |
| `recalculated_total` | `numeric(14,2)` | | Tổng tính lại |
| `proposed_scheduled_end` | `timestamptz` | | Khung thời gian kết thúc đề xuất |
| `status` | `adjustment_status` | NOT NULL | Trạng thái chờ/chấp nhận/từ chối |
| `responded_by` | `uuid` | FK -> `auth.users(id)` | Khách phản hồi |
| `responded_at` | `timestamptz` | | Thời điểm phản hồi |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |

### 4.21 `payments`

Giao dịch thanh toán mô phỏng bằng QR chuyển khoản hoặc thanh toán hoàn tất.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh giao dịch |
| `booking_id` | `uuid` | FK -> `bookings(id)` | Booking thanh toán |
| `customer_id` | `uuid` | FK -> `customers(id)` | Khách thanh toán |
| `method` | `payment_method` | NOT NULL | Phương thức mô phỏng |
| `status` | `payment_status` | NOT NULL | Trạng thái giao dịch |
| `transaction_reference` | `text` | | Mã giao dịch mô phỏng |
| `qr_payload` | `text` | | Nội dung mã QR mô phỏng |
| `bank_name` | `text` | | Tên ngân hàng demo |
| `demo_account_number` | `text` | | Số tài khoản demo |
| `amount` | `numeric(14,2)` | NOT NULL, >= 0 | Tổng cần thanh toán |
| `initial_visit_fee_amount` | `numeric(14,2)` | NOT NULL | Phần phí thăm khám |
| `service_amount` | `numeric(14,2)` | NOT NULL | Phần giá dịch vụ |
| `extra_fee_amount` | `numeric(14,2)` | NOT NULL | Phần phí phát sinh |
| `is_simulated` | `boolean` | NOT NULL | Luôn true trong giai đoạn demo |
| `paid_at` | `timestamptz` | | Thời điểm thành công mô phỏng |
| `refunded_at` | `timestamptz` | | Thời điểm hoàn mô phỏng |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.22 `reviews`

Đánh giá của khách sau booking hoàn thành.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh đánh giá |
| `booking_id` | `uuid` | UNIQUE, FK -> `bookings(id)` | Booking được đánh giá |
| `customer_id` | `uuid` | FK -> `customers(id)` | Khách đánh giá |
| `worker_id` | `uuid` | FK -> `workers(id)` | Nhân viên được đánh giá |
| `rating` | `integer` | NOT NULL, 1-5 | Số sao |
| `comment` | `text` | | Nhận xét |
| `report_quality_issue` | `boolean` | NOT NULL | Có báo cáo chất lượng |
| `status` | `review_status` | NOT NULL | Trạng thái kiểm duyệt |
| `edited_at` | `timestamptz` | | Thời điểm chỉnh sửa |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.23 `worker_reports`

Báo cáo chất lượng hoặc vi phạm liên quan nhân viên.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh báo cáo |
| `worker_id` | `uuid` | FK -> `workers(id)` | Nhân viên bị báo cáo |
| `reported_by` | `uuid` | FK -> `auth.users(id)` | Người báo cáo |
| `booking_id` | `uuid` | FK -> `bookings(id)` | Booking liên quan |
| `category` | `text` | NOT NULL | Loại báo cáo |
| `description` | `text` | NOT NULL | Nội dung |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |

### 4.24 `disciplinary_actions`

Cảnh cáo hoặc kỷ luật do doanh nghiệp ghi nhận.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh hành động |
| `worker_id` | `uuid` | FK -> `workers(id)` | Nhân viên bị xử lý |
| `business_id` | `uuid` | FK -> `businesses(id)` | Doanh nghiệp xử lý |
| `actor_profile_id` | `uuid` | FK -> `profiles(id)` | Người thực hiện |
| `action_type` | `text` | NOT NULL | Cảnh cáo, tạm ngưng công việc hoặc tài khoản |
| `reason` | `text` | NOT NULL | Lý do xử lý |
| `expires_at` | `timestamptz` | | Ngày hết hiệu lực |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm ghi nhận |

### 4.25 `disputes`

Tranh chấp liên quan đến booking.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh tranh chấp |
| `booking_id` | `uuid` | FK -> `bookings(id)` | Booking tranh chấp |
| `opened_by` | `uuid` | FK -> `auth.users(id)` | Người mở |
| `reason` | `text` | NOT NULL | Lý do |
| `status` | `dispute_status` | NOT NULL | Trạng thái tranh chấp |
| `resolution` | `text` | | Kết quả xử lý |
| `resolved_by` | `uuid` | FK -> `auth.users(id)` | Người xử lý |
| `resolved_at` | `timestamptz` | | Thời điểm xử lý |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm mở |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.26 `support_tickets`

Phiếu hỗ trợ của khách hàng hoặc liên quan booking.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh phiếu |
| `ticket_number` | `text` | UNIQUE, NOT NULL | Mã hiển thị như HT-000001 |
| `customer_id` | `uuid` | FK -> `customers(id)` | Khách tạo phiếu |
| `booking_id` | `uuid` | FK -> `bookings(id)` | Booking liên quan |
| `subject` | `text` | NOT NULL | Chủ đề |
| `description` | `text` | | Mô tả ban đầu |
| `priority` | `ticket_priority` | NOT NULL | Mức ưu tiên |
| `status` | `ticket_status` | NOT NULL | Trạng thái phiếu |
| `assigned_to` | `uuid` | FK -> `auth.users(id)` | Người hỗ trợ phụ trách |
| `created_by` | `uuid` | FK -> `auth.users(id)` | Người tạo |
| `resolved_at` | `timestamptz` | | Thời điểm giải quyết |
| `closed_at` | `timestamptz` | | Thời điểm đóng |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.27 `support_messages`

Tin nhắn trao đổi trong phiếu hỗ trợ.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh tin nhắn |
| `ticket_id` | `uuid` | FK -> `support_tickets(id)` | Phiếu hỗ trợ |
| `sender_id` | `uuid` | FK -> `auth.users(id)` | Người gửi |
| `message` | `text` | NOT NULL | Nội dung |
| `internal` | `boolean` | NOT NULL | Tin nhắn nội bộ hay công khai |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm gửi |

### 4.28 `support_attachments`

Tệp đính kèm trong phiếu hỗ trợ.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh tệp |
| `ticket_id` | `uuid` | FK -> `support_tickets(id)` | Phiếu liên quan |
| `uploaded_by` | `uuid` | FK -> `auth.users(id)` | Người tải lên |
| `storage_path` | `text` | NOT NULL | Đường dẫn Storage |
| `file_name` | `text` | NOT NULL | Tên file |
| `mime_type` | `text` | | Loại MIME |
| `file_size` | `bigint` | | Kích thước byte |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tải |

### 4.29 `notifications`

Thông báo trong ứng dụng.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh thông báo |
| `recipient_id` | `uuid` | FK -> `auth.users(id)` | Người nhận |
| `type` | `text` | NOT NULL | Loại sự kiện |
| `title` | `text` | NOT NULL | Tiêu đề |
| `body` | `text` | NOT NULL | Nội dung |
| `action_url` | `text` | | Liên kết hành động |
| `read_at` | `timestamptz` | | Thời điểm đọc |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm tạo |

### 4.30 `notification_preferences`

Cấu hình kênh thông báo của từng tài khoản.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `recipient_id` | `uuid` | PK, FK -> `auth.users(id)` | Người cấu hình |
| `in_app_enabled` | `boolean` | NOT NULL | Nhận thông báo trong ứng dụng |
| `email_booking_enabled` | `boolean` | NOT NULL | Email xác nhận booking |
| `email_status_enabled` | `boolean` | NOT NULL | Email thay đổi trạng thái |
| `email_adjustment_enabled` | `boolean` | NOT NULL | Email điều chỉnh giá |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.31 `platform_settings`

Cấu hình vận hành toàn hệ thống.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `key` | `text` | PK | Tên cấu hình |
| `value` | `jsonb` | NOT NULL | Giá trị JSON |
| `updated_by` | `uuid` | FK -> `auth.users(id)` | Admin cập nhật |
| `updated_at` | `timestamptz` | NOT NULL | Thời điểm cập nhật |

### 4.32 `audit_logs`

Nhật ký hành động quản trị và nghiệp vụ quan trọng.

| Cột | Kiểu | Khóa/Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | Định danh nhật ký |
| `actor_id` | `uuid` | FK -> `auth.users(id)` | Người thực hiện |
| `action` | `text` | NOT NULL | Tên hành động |
| `entity_type` | `text` | NOT NULL | Loại đối tượng |
| `entity_id` | `text` | | Định danh đối tượng |
| `reason` | `text` | | Lý do |
| `metadata` | `jsonb` | NOT NULL | Dữ liệu bổ sung |
| `created_at` | `timestamptz` | NOT NULL | Thời điểm ghi |

## 5. Quan hệ chính

- Một `auth.users` tương ứng tối đa một `profiles`.
- Một `profiles` khách hàng tương ứng một `customers`.
- Một `profiles` doanh nghiệp tương ứng một `businesses`.
- Một `profiles` nhân viên tương ứng một `workers`.
- Một `businesses` có nhiều `workers` và `services`.
- Một `services` có nhiều `service_images`, một hoặc nhiều `service_categories_map` và nhiều `service_workers`.
- Một `customers` có nhiều `addresses`, `bookings`, `payments` và `reviews`.
- Một `workers` có nhiều `worker_schedules`, `worker_availability_exceptions`, `worker_portfolio_images`, `worker_reports` và `disciplinary_actions`.
- Một `bookings` có lịch sử trạng thái, báo giá, điều chỉnh, thanh toán, hủy, đánh giá, tranh chấp và booking cancellation.
- Một `support_tickets` có nhiều `support_messages` và `support_attachments`.

## 6. Trigger và hàm PostgreSQL

### 6.1 Triggers

| Trigger/FUNCTION | Bảng | Chức năng |
|---|---|---|
| `set_updated_at` | Các bảng có `updated_at` | Tự động cập nhật thời điểm chỉnh sửa |
| `on_auth_user_created` / `handle_new_user` | `auth.users` | Tạo profile và customer mặc định khi đăng ký Auth |
| `protect_profile_account_fields` | `profiles` | Chặn người dùng tự thay role, trạng thái hoặc dữ liệu cấp tài khoản |
| `record_booking_status_changes` | `bookings` | Ghi dòng vào `booking_status_history` |
| `check_worker_availability_exception` | `worker_availability_exceptions` | Chặn ngày nghỉ trùng booking đã xác nhận |
| `set_address_location`, `set_business_location`, `set_worker_location` | Địa chỉ và vị trí | Đồng bộ kinh/vĩ độ sang PostGIS geography |
| `validate_address_ward`, `validate_business_ward`, `validate_worker_ward` | Địa chỉ | Kiểm tra ward thuộc province đã chọn |
| `protect_worker_account_fields_trigger` | `workers` | Chặn worker tự đổi owner hoặc trạng thái |
| `protect_business_owner_trigger` | `businesses` | Chỉ admin được đổi owner hoặc trạng thái doanh nghiệp |
| `validate_booking_status_transition_trigger` | `bookings` | Kiểm tra thay đổi trạng thái theo vai trò |

### 6.2 Hàm lấy quyền và chủ sở hữu

| Hàm | Mục đích |
|---|---|
| `current_role()` | Lấy role của tài khoản hiện tại |
| `is_admin()`, `is_business()`, `is_worker()`, `is_customer()` | Kiểm tra quyền vai trò |
| `current_customer_id()` | Lấy customer ID tương ứng auth UID |
| `current_worker_id()` | Lấy worker ID tương ứng auth UID |
| `current_business_id()` | Lấy business ID do tài khoản sở hữu |

### 6.3 Hàm nghiệp vụ

| Hàm | Mục đích |
|---|---|
| `mark_password_changed()` | Bỏ trạng thái bắt buộc đổi mật khẩu mặc định |
| `create_booking(...)` | Tạo booking atomically, kiểm tra service, worker, địa chỉ, lịch, ngày nghỉ và trùng khung giờ |
| `cancel_booking_pre_confirmation(...)` | Hủy booking trước xác nhận và ghi refund mô phỏng |
| `submit_booking_adjustment(...)` | Worker gửi thay đổi số lượng, thời lượng hoặc phí phát sinh |
| `respond_booking_adjustment(...)` | Customer chấp nhận/từ chối điều chỉnh |
| `transition_booking_status(...)` | Chuyển trạng thái booking theo vai trò |
| `reassign_booking(...)` | Doanh nghiệp/admin tái phân công trước khi công việc bắt đầu |
| `create_simulated_payment(...)` | Tạo giao dịch QR transfer mô phỏng |
| `confirm_simulated_payment(...)` | Xác nhận giao dịch mô phỏng thành công |
| `provision_business_account(...)` | Admin cấp tài khoản doanh nghiệp |
| `provision_worker_account(...)` | Doanh nghiệp/admin cấp tài khoản nhân viên |

## 7. Exclusion constraint và kiểm tra chồng lịch

`bookings` có `bookings_worker_time_exclusion`:

- Dùng cột `worker_id`.
- Dùng `tstzrange(scheduled_start, scheduled_end, '[)')`.
- Ngăn hai khoảng thời gian overlap có cùng worker.
- Chỉ áp dụng cho trạng thái chiếm lịch:
  - `pending_confirmation`
  - `confirmed`
  - `surveying`
  - `awaiting_customer_quote`
  - `in_progress`

Ngoài constraint, hàm `create_booking()` kiểm tra lại:

- Lịch làm việc theo thứ trong tuần.
- Ngày nghỉ hoặc giờ nghỉ một lần.
- Worker có cung cấp service.
- Worker thuộc cùng business với service.
- Khoảng thời gian hợp lệ.

## 8. Thanh toán mô phỏng

Database không lưu ví hoặc số dư nội bộ.

Thanh toán mô phỏng là `QR bank transfer` hoặc `pay_on_completion`:

- `qr_payload`: nội dung mã QR mô phỏng.
- `bank_name`: ngân hàng demo.
- `demo_account_number`: tài khoản demo.
- `transaction_reference`: mã giao dịch mô phỏng.
- `is_simulated`: luôn true.
- Không lưu số thẻ, CVV hoặc thông tin thanh toán thật.

Giá cuối được chia thành:

- Phí thăm khám.
- Giá dịch vụ.
- Phí phát sinh.
- Tổng cuối.

## 9. Row Level Security

RLS được bật cho tất cả bảng chứa dữ liệu người dùng hoặc nghiệp vụ.

Nguyên tắc phân quyền:

- Customer chỉ xem/sửa dữ liệu booking, thanh toán, địa chỉ, review và phiếu của mình.
- Worker chỉ xem công việc được phân công và quản lý lịch, vị trí, portfolio của mình.
- Business chỉ xem và quản lý worker, service, booking và báo cáo thuộc business.
- Admin xem dữ liệu quản trị và có quyền cấp/tạm ngưng tài khoản.
- Worker và business không thể đọc dữ liệu cross-business.
- Role không được lấy từ tham số client; database lấy role từ bảng `profiles`.

Các nhóm policy gồm:

- Policy công khai cho danh mục, dịch vụ, doanh nghiệp, nhân viên và ảnh công khai.
- Policy owner cho hồ sơ, địa chỉ, notification và notification preferences.
- Policy business cho worker, service, booking và báo cáo.
- Policy worker cho lịch và booking được phân công.
- Policy customer cho booking, payment, review và adjustment.
- Policy admin cho cấu hình, audit log, tài khoản và giám sát.

## 10. Storage

Các bucket Supabase Storage được tạo trong migration:

| Bucket | Công khai | Giới hạn | MIME cho phép |
|---|---:|---:|---|
| `avatars` | Có | 5 MB | JPEG, PNG, WEBP |
| `business_logos` | Có | 5 MB | JPEG, PNG, WEBP |
| `service_images` | Có | 5 MB | JPEG, PNG, WEBP |
| `worker_portfolio` | Có | 5 MB | JPEG, PNG, WEBP |
| `support_attachments` | Không | 10 MB | JPEG, PNG, WEBP, PDF |

Storage policy đảm bảo:

- Mỗi người dùng tự quản lý avatar trong thư mục của mình.
- Business quản lý logo và ảnh dịch vụ.
- Worker quản lý ảnh portfolio trong thư mục của mình.
- Admin được truy cập ảnh worker hoặc tệp hỗ trợ theo policy.
- Tệp hỗ trợ riêng tư không công khai.

## 11. Chỉ mục

### Chỉ mục chính

| Chỉ mục | Bảng/Cột | Mục đích |
|---|---|---|
| `idx_profiles_role_status` | `profiles(role, account_status)` | Lọc tài khoản theo role/trạng thái |
| `idx_addresses_location` | `addresses(location)` | Tìm địa chỉ gần |
| `idx_addresses_user_default` | `addresses(user_id,is_default)` | Tìm địa chỉ mặc định |
| `idx_businesses_status` | `businesses(status)` | Lọc doanh nghiệp hoạt động |
| `idx_businesses_location` | `businesses(location)` | Tìm doanh nghiệp gần |
| `idx_workers_business_status` | `workers(business_id,status)` | Lọc nhân viên theo doanh nghiệp |
| `idx_workers_location` | `workers(location)` | Tìm nhân viên gần khách |
| `idx_worker_portfolio_worker_order` | `worker_portfolio_images(worker_id,display_order)` | Sắp xếp portfolio |
| `idx_service_categories_status` | `service_categories(status)` | Lọc danh mục hoạt động |
| `idx_services_business_status` | `services(business_id,status)` | Quản lý dịch vụ doanh nghiệp |
| `idx_services_name_trgm` | `services(name)` GIN | Tìm tên dịch vụ gần đúng |
| `idx_services_pricing_type` | `services(pricing_type)` | Lọc loại giá |
| `idx_service_categories_map_category` | `service_categories_map(category_id,service_id)` | Tìm dịch vụ theo danh mục |
| `idx_service_images_service_order` | `service_images(service_id,display_order)` | Sắp xếp ảnh dịch vụ |
| `idx_service_workers_worker` | `service_workers(worker_id,active)` | Tìm service của worker |
| `idx_worker_schedules_worker_day` | `worker_schedules(worker_id,day_of_week,active)` | Tìm lịch theo ngày |
| `idx_worker_exceptions_worker_time` | `worker_availability_exceptions(worker_id,start_at,end_at)` | Kiểm tra ngày nghỉ |
| `idx_bookings_customer_created` | `bookings(customer_id,created_at)` | Lịch sử customer |
| `idx_bookings_worker_status_time` | `bookings(worker_id,status,scheduled_start)` | Công việc và lịch worker |
| `idx_bookings_business_created` | `bookings(business_id,created_at)` | Booking theo doanh nghiệp |
| `idx_bookings_status_time` | `bookings(status,scheduled_start)` | Giám sát trạng thái |
| `idx_booking_status_history_booking` | `booking_status_history(booking_id,created_at)` | Tiến độ booking |
| `idx_booking_quantity_adjustments_booking_status` | `booking_quantity_adjustments(booking_id,status)` | Điều chỉnh chờ xác nhận |
| `idx_payments_booking_status` | `payments(booking_id,status)` | Thanh toán theo booking |
| `idx_payments_customer_created` | `payments(customer_id,created_at)` | Lịch sử payment customer |
| `idx_reviews_worker_status` | `reviews(worker_id,status)` | Tính rating worker |
| `idx_support_tickets_status_priority` | `support_tickets(status,priority,created_at)` | Hàng đợi hỗ trợ |
| `idx_support_messages_ticket` | `support_messages(ticket_id,created_at)` | Trao đổi trong phiếu |
| `idx_notifications_recipient_unread` | `notifications(recipient_id,created_at)` | Thông báo chưa đọc |
| `idx_audit_logs_created` | `audit_logs(created_at)` | Audit log mới nhất |
| `idx_audit_logs_actor` | `audit_logs(actor_id,created_at)` | Hành động theo tài khoản |

### Unique/partial indexes

| Chỉ mục | Mục đích |
|---|---|
| `uq_addresses_user_default` | Chỉ một địa chỉ mặc định đang hoạt động cho mỗi user |
| `uq_service_cover` | Chỉ một ảnh đại diện cho mỗi dịch vụ |
| `uq_booking_pending_adjustment` | Chỉ một điều chỉnh đang chờ cho mỗi booking |
| `uq_payment_booking_method` | Mỗi booking chỉ có tối đa một payment cho mỗi payment method |

## 12. Cấu hình mặc định

Migration khởi tạo các setting sau trong `platform_settings`:

| Key | Nội dung |
|---|---|
| `cancellation_policy` | Hủy trước xác nhận miễn phí; hủy sau xác nhận theo chính sách admin |
| `quote_response_minutes` | Thời gian mặc định 30 phút để phản hồi báo giá |
| `review_edit_days` | Thời hạn chỉnh sửa đánh giá 7 ngày |
| `demo_payment` | Bật thanh toán mô phỏng và không yêu cầu tiền thật |

## 13. Chu kỳ dữ liệu được giữ lại

Database được thiết kế để xóa mềm thay vì xóa dữ liệu nghiệp vụ quan trọng:

- Doanh nghiệp dùng `deleted_at`.
- Nhân viên dùng `deleted_at`.
- Dịch vụ dùng `deleted_at`.
- Danh mục dùng `deleted_at`.
- Địa chỉ dùng `deleted_at`.
- Booking, thanh toán, đánh giá và lịch sử trạng thái vẫn được giữ để đối soát.
- Profile Supabase Auth dùng soft account status thay vì xóa dữ liệu booking.
