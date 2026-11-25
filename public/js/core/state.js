export const urlParams = new URLSearchParams(window.location.search);
export const initialModeParam = urlParams.get("mode") || urlParams.get("env");
export const isDevFromUrl =
  initialModeParam === "dev" || urlParams.get("dev") === "1";
export const isProdFromUrl = initialModeParam === "production";
export const initialViewMode = isDevFromUrl ? "dev" : "production";
if (typeof document !== "undefined" && document.body) {
  document.body.setAttribute(
    "data-dev-enabled",
    isDevFromUrl ? "true" : "false",
  );
  document.body.setAttribute("data-view-mode", initialViewMode);
}

export const state = {
  viewMode: initialViewMode, // 'user' | 'dev' | 'production'
  isProduction: isProdFromUrl,
  currentPortal: 1, // 0: Auth, 1: Customer, 2: Provider, 3: Admin, 4: Company
  currentScreen: "1.1",
  currentUser: null,
  authToken: (() => {
    try {
      return localStorage.getItem("gdx_auth_token");
    } catch (_) {
      return null;
    }
  })(),
  activeModal: null,
  activeBookingId: 1042,
  activeProviderId: !isDevFromUrl || isProdFromUrl ? null : 201,
  activeCustomerId: !isDevFromUrl || isProdFromUrl ? null : 101,
  activeCompanyId: !isDevFromUrl || isProdFromUrl ? null : 501,
  activeUserId:
    !isDevFromUrl || isProdFromUrl
      ? null
      : "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  userRole: !isDevFromUrl || isProdFromUrl ? "anon" : "customer",
  timerInterval: null,
  timerSeconds: 1 * 3600 + 45 * 60 + 22,
  isTimerRunning: true,
  // Filters for interactive screens
  catalogFilter: {
    categoryId: "all",
    pricingType: "all",
    query: "",
    searchQuery: "",
  },
  directProviderSearch: "",
  directProviderCompanyId: "all",
  companyStaffFilter: "",
  supportTicketImageDraft: null,
  bookingListFilter: "all",
  jobBoardFilter: {
    wardId: "all",
    serviceId: "all",
  },
  adminDispatchFilter: "all",
  selectedServiceId: null,
  selectedProviderId: 201,
  wizardProviderMode: "broadcast", // 'broadcast' (rải đơn cho tất cả thợ khả dụng) | 'direct' (tự chọn thợ)
  wizardCategory: "1", // '1' (Home Cleaning) | '2' (Home Cooking)
  inboxTab: "available", // 'available' (Hộp thư đến) | 'expired' (Đơn đã hết hạn)
  expiredJobIds: [],
  dismissedJobIds: [],
  selectedBookingId: 1042,
  bookingHours: 3,
  liveTimerSeconds: 1 * 3600 + 45 * 60 + 22,
  liveTimerInterval: null,
  reviewRating: 5,
  reviewDraftRating: 5,
  onboardingAvatar: "/assets/provider-mai.jpg",
  wizardDraft: {
    service_id: null,
    scheduled_time: "2026-10-25T08:30",
    provinceId: null,
    ward_id: null,
    address: "",
    latitude: null,
    longitude: null,
    provider_id: 201,
    notes: "Hãy điền thông tin mà bạn muốn nhân viên dọn dẹp biết.",
    hours: 3,
  },
  bookingAddressSelection: null,
  backend: {
    mode: "local",
    supabaseConfigured: false,
    message: "Đang sử dụng dữ liệu cục bộ chuẩn PostgreSQL (local-db.json)",
  },
  backendStatus: {
    mode: "local_sql_store",
    hasSupabaseUrl: false,
    hasAnonKey: false,
    hasServiceRoleKey: false,
    supabaseReachable: false,
    message: "Đang kết nối tới Backend API...",
    tableCounts: {},
  },
  customerServiceLoadStatus: "loading",
  customerServiceLoadError: null,
};


// --- SCREEN METADATA CATALOG (All 34 UI Elements) ---
export const SCREENS = {
  0.1: {
    id: "0.1",
    portal: 0,
    title: "0.1. Đăng nhập / Đăng ký / Khôi phục mật khẩu",
    type: "page",
    table: "auth.users, users",
  },
  0.2: {
    id: "0.2",
    portal: 0,
    title: "0.2. Thiết lập hồ sơ Khách hàng (Customer Onboarding)",
    type: "page",
    table: "users, customer_profiles, ward",
  },
  0.3: {
    id: "0.3",
    portal: 0,
    title: "0.3. Đăng ký Đối tác Công ty (Company Onboarding)",
    type: "page",
    table: "company_profiles, users, ward",
  },
  0.4: {
    id: "0.4",
    portal: 0,
    title: "0.4. Trạng thái Xác minh Công ty (Chờ duyệt / Từ chối)",
    type: "page",
    table: "company_profiles (verification_status)",
  },
  0.5: {
    id: "0.5",
    portal: 0,
    title: "0.5. Thông báo Tài khoản bị khóa (Account Suspended)",
    type: "page",
    table: "users (is_active = FALSE)",
  },

  1.1: {
    id: "1.1",
    portal: 1,
    title: "1.1. Trang chủ & Khám phá dịch vụ",
    type: "page",
    table: "service_categories, services, favorites",
  },
  1.2: {
    id: "1.2",
    portal: 1,
    title: "1.2. Cấu hình dịch vụ trước khi đặt (Booking Wizard)",
    type: "page",
    table: "services, provider_public_profiles, bookings",
  },
  1.3: {
    id: "1.3",
    portal: 1,
    title: "1.3. Theo dõi đơn hàng trực tiếp (Live Tracking)",
    type: "page",
    table: "bookings, booking_status_history, provider_public_profiles",
  },
  1.4: {
    id: "1.4",
    portal: 1,
    title: "1.4. Quản lý lịch hẹn dịch vụ",
    type: "page",
    table: "bookings, services, reviews",
  },
  1.5: {
    id: "1.5",
    portal: 1,
    title: "1.5. Hồ sơ cá nhân & Sổ địa chỉ",
    type: "page",
    table: "users, customer_profiles, ward",
  },
  1.6: {
    id: "1.6",
    portal: 1,
    title: "1.6. Danh sách Dịch vụ yêu thích",
    type: "page",
    table: "favorites, services",
  },
  1.7: {
    id: "1.7",
    portal: 1,
    title: "1.7. Hồ sơ công khai của Thợ",
    type: "modal",
    table: "provider_public_profiles, reviews, provider_services",
  },
  1.8: {
    id: "1.8",
    portal: 1,
    title: "1.8. Cổng Thanh toán QR Chuyển khoản (VietQR)",
    type: "page",
    table: "bookings (total_amount, payment_status)",
  },
  1.9: {
    id: "1.9",
    portal: 1,
    title: "1.9. Đánh giá & Chấm điểm Thợ",
    type: "modal",
    table: "reviews, bookings",
  },
  "1.10": {
    id: "1.10",
    portal: 1,
    title: "1.10. Xác nhận Hủy lịch hẹn",
    type: "modal",
    table: "bookings, booking_status_history",
  },
  1.11: {
    id: "1.11",
    portal: 1,
    title: "1.11. Trung tâm Hỗ trợ & Gửi khiếu nại",
    type: "drawer",
    table: "support_tickets, bookings",
  },

  2.1: {
    id: "2.1",
    portal: 2,
    title: "2.1. Sàn nhận việc làm (Job Board)",
    type: "page",
    table: "bookings (pending), services, ward",
  },
  2.2: {
    id: "2.2",
    portal: 2,
    title: "2.2. Ca làm việc hiện tại (Live Timer)",
    type: "page",
    table: "bookings, services, booking_status_history",
  },
  2.3: {
    id: "2.3",
    portal: 2,
    title: "2.3. Ví Thu Nhập & Lịch Ca",
    type: "page",
    table: "bookings, availability_schedules, reviews",
  },
  2.4: {
    id: "2.4",
    portal: 2,
    title: "2.4. Cấu hình Năng lực & Khu vực hoạt động",
    type: "page",
    table: "provider_profiles, provider_services, provider_areas",
  },
  2.5: {
    id: "2.5",
    portal: 2,
    title: "2.5. Thanh trạng thái Nhận việc & GPS",
    type: "component",
    table: "provider_profiles (is_available_online, GPS)",
  },
  2.6: {
    id: "2.6",
    portal: 2,
    title: "2.6. Thiết lập Lịch cố định & Xin nghỉ phép",
    type: "modal",
    table: "availability_schedules, availability_exceptions",
  },
  2.7: {
    id: "2.7",
    portal: 2,
    title: "2.7. Kê khai Chi phí phát sinh (Incidental Cost)",
    type: "modal",
    table: "bookings (total_incidental, notes)",
  },
  2.8: {
    id: "2.8",
    portal: 2,
    title: "2.8. Nghiệm thu & Hoàn thành Ca làm",
    type: "modal",
    table: "bookings, booking_status_history",
  },
  2.9: {
    id: "2.9",
    portal: 2,
    title: "2.9. Báo cáo Sự cố / Hỗ trợ Đối tác",
    type: "drawer",
    table: "support_tickets, bookings",
  },

  3.1: {
    id: "3.1",
    portal: 3,
    title: "3.1. Dashboard Tổng quan & Điều phối",
    type: "page",
    table: "bookings, provider_profiles, users, support_tickets",
  },
  3.2: {
    id: "3.2",
    portal: 3,
    title: "3.2. Danh mục Gốc & Giám sát Dịch vụ Công ty",
    type: "page",
    table: "service_categories, services, company_profiles",
  },
  3.3: {
    id: "3.3",
    portal: 3,
    title: "3.3. Xét duyệt Hồ sơ Công ty Đối tác (KYC)",
    type: "page",
    table: "company_profiles, users",
  },
  3.4: {
    id: "3.4",
    portal: 3,
    title: "3.4. Quản lý Tài khoản & Giải quyết Khiếu nại",
    type: "page",
    table: "users, company_profiles, support_tickets",
  },
  3.5: {
    id: "3.5",
    portal: 3,
    title: "3.5. Tra cứu Chi tiết Đơn & Lịch sử Kiểm toán (Audit Log)",
    type: "drawer",
    table: "bookings, booking_status_history, users",
  },
  3.6: {
    id: "3.6",
    portal: 3,
    title: "3.6. Xử lý Hoàn tiền & Điều chỉnh Thanh toán",
    type: "modal",
    table: "bookings, booking_status_history",
  },
  3.7: {
    id: "3.7",
    portal: 3,
    title: "3.7. Xử lý & Cập nhật Phiếu hỗ trợ (Ticket Detail)",
    type: "drawer",
    table: "support_tickets, users, bookings",
  },
  3.8: {
    id: "3.8",
    portal: 3,
    title: "3.8. Thêm / Chỉnh sửa Danh mục Dịch vụ Gốc",
    type: "modal",
    table: "service_categories",
  },
  3.9: {
    id: "3.9",
    portal: 3,
    title: "3.9. Quản lý Địa giới hành chính (Tỉnh/Thành & Phường/Xã)",
    type: "modal",
    table: "province, ward",
  },

  4.1: {
    id: "4.1",
    portal: 4,
    title: "4.1. Tổng quan Công ty & Đơn hàng",
    type: "page",
    table: "company_profiles, bookings, provider_profiles",
  },
  4.2: {
    id: "4.2",
    portal: 4,
    title: "4.2. Quản lý Nhân viên Thợ & Phân công",
    type: "page",
    table: "users, provider_profiles, provider_services",
  },
  4.3: {
    id: "4.3",
    portal: 4,
    title: "4.3. Quản lý Dịch vụ & Bảng giá Công ty",
    type: "page",
    table: "services, service_categories, company_profiles",
  },
  4.4: {
    id: "4.4",
    portal: 4,
    title: "4.4. Thêm / Cập nhật Hồ sơ Thợ Công ty",
    type: "modal",
    table: "users, provider_profiles, provider_services",
  },
  4.5: {
    id: "4.5",
    portal: 4,
    title: "4.5. Thêm / Chỉnh sửa Dịch vụ Công ty",
    type: "modal",
    table: "services, service_categories",
  },
};

export const SCREEN_ROUTES = {
  0.1: "/auth/login",
  0.2: "/onboarding/customer",
  0.3: "/onboarding/company",
  0.4: "/company/status",
  0.5: "/account/suspended",
  1.1: "/home",
  1.2: "/bookings/new",
  1.3: "/bookings/tracking",
  1.4: "/bookings",
  1.5: "/profile",
  1.6: "/favorites",
  1.8: "/bookings/payment",
  2.1: "/provider/jobs",
  2.2: "/provider/shift",
  2.3: "/provider/earnings",
  2.4: "/provider/settings",
  3.1: "/admin/dashboard",
  3.2: "/admin/services",
  3.3: "/admin/kyc",
  3.4: "/admin/support",
  4.1: "/company/dashboard",
  4.2: "/company/staff",
  4.3: "/company/services",
};


export const USER_SCREEN_COPY = {
  0.1: {
    title: "Đăng nhập & Đăng ký tài khoản",
    sub: "Sử dụng số điện thoại hoặc chọn nhanh tài khoản mẫu để trải nghiệm hệ thống.",
  },
  0.2: {
    title: "Thiết lập thông tin liên hệ & Địa chỉ",
    sub: "Cập nhật địa chỉ mặc định để hệ thống gợi ý thợ gần khu vực nhà bạn nhất.",
  },
  0.3: {
    title: "Đăng ký trở thành Công ty Đối tác",
    sub: "Điền thông tin doanh nghiệp, mã số thuế và khu vực hoạt động để kích hoạt Cổng Công ty.",
  },
  0.4: {
    title: "Trạng thái xác minh Hồ sơ Công ty",
    sub: "Theo dõi kết quả thẩm định hồ sơ Công ty Đối tác của bạn tại Gia Đình Xanh.",
  },
  0.5: {
    title: "Tài khoản đang tạm ngừng hoạt động",
    sub: "Vui lòng gửi yêu cầu hỗ trợ để được giải đáp và mở lại tài khoản.",
  },
  1.1: { title: "Trang chủ & Khám phá dịch vụ", sub: "" },
  1.2: {
    title: "Đặt lịch dịch vụ tại nhà",
    sub: "Tùy chỉnh thời lượng, địa chỉ hẹn và chọn đối tác thợ phù hợp với lịch gia đình bạn.",
  },
  1.3: {
    title: "Theo dõi tiến độ ca dịch vụ",
    sub: "Cập nhật trạng thái thực hiện, thông tin thợ phụ trách và chi tiết hóa đơn.",
  },
  1.4: {
    title: "Lịch hẹn dịch vụ của tôi",
    sub: "Quản lý các lịch hẹn sắp tới, xem lại lịch sử và đánh giá chất lượng phục vụ.",
  },
  1.5: {
    title: "Thông tin cá nhân & Sổ địa chỉ",
    sub: "Cập nhật họ tên, số điện thoại liên hệ và địa chỉ mặc định khi đặt dịch vụ.",
  },
  1.6: {
    title: "Dịch vụ gia đình đã lưu",
    sub: "Danh sách các gói dịch vụ bạn yêu thích để đặt lại nhanh chóng.",
  },
  1.7: {
    title: "Hồ sơ đối tác thực hiện dịch vụ",
    sub: "Thông tin kinh nghiệm, các dịch vụ đảm nhận và nhận xét từ khách hàng trước.",
  },
  1.8: {
    title: "Thanh toán hóa đơn dịch vụ",
    sub: "Kiểm tra chi tiết chi phí và xác nhận hoàn tất thanh toán cho ca dịch vụ.",
  },
  1.9: {
    title: "Đánh giá chất lượng dịch vụ",
    sub: "Chia sẻ cảm nhận của bạn sau khi ca làm việc hoàn tất.",
  },
  "1.10": {
    title: "Xác nhận hủy lịch hẹn",
    sub: "Vui lòng cho biết lý do hủy để chúng tôi thông báo tới thợ phụ trách.",
  },
  1.11: {
    title: "Trung tâm Hỗ trợ Khách hàng",
    sub: "Gửi câu hỏi hoặc phản ánh về ca dịch vụ để đội ngũ chăm sóc khách hàng hỗ trợ bạn.",
  },
  2.1: {
    title: "Việc làm mới trong khu vực của bạn",
    sub: "Danh sách các lịch hẹn mới phù hợp với kỹ năng và phường/xã bạn đã đăng ký.",
  },
  2.2: {
    title: "Ca làm việc đang thực hiện",
    sub: "Theo dõi thời gian làm việc, địa chỉ khách hàng và cập nhật phụ phí vật tư mua hộ.",
  },
  2.3: {
    title: "Ví thu nhập & Lịch làm việc tuần",
    sub: "Tổng hợp thu nhập từ các ca đã hoàn tất và quản lý khung giờ nhận việc trong tuần.",
  },
  2.4: {
    title: "Thông tin & Khu vực nhận việc",
    sub: "Dịch vụ đảm nhiệm được Công ty quản lý phân công; bạn có thể cập nhật mô tả và khu vực phường/xã nhận việc.",
  },
  2.6: {
    title: "Cài đặt lịch làm việc & Xin nghỉ phép",
    sub: "Thiết lập các ngày làm cố định trong tuần hoặc báo bận đột xuất.",
  },
  2.7: {
    title: "Kê khai phụ phí vật tư mua hộ",
    sub: "Ghi nhận chi phí mua thêm vật tư hoặc nguyên liệu theo yêu cầu của chủ nhà.",
  },
  2.8: {
    title: "Nghiệm thu & Hoàn thành Ca làm",
    sub: "Xác nhận hoàn tất công việc tại nhà khách hàng và chốt hóa đơn.",
  },
  2.9: {
    title: "Báo cáo sự cố cần hỗ trợ",
    sub: "Gửi thông báo tới bộ phận điều phối khi gặp vướng mắc tại địa chỉ khách hàng.",
  },
  3.1: {
    title: "Tổng quan vận hành & Điều phối lịch hẹn",
    sub: "Theo dõi doanh thu, tình trạng các ca dịch vụ và hỗ trợ điều phối thợ.",
  },
  3.2: {
    title: "Quản lý Danh mục gốc & Giám sát Dịch vụ",
    sub: "Quản lý cây danh mục gốc; việc tạo và cấu hình giá dịch vụ được quản lý bởi Công ty Đối tác.",
  },
  3.3: {
    title: "Duyệt hồ sơ Công ty Đối tác",
    sub: "Kiểm tra thông tin doanh nghiệp và phê duyệt hoặc tạm khóa hoạt động Công ty trên hệ thống.",
  },
  3.4: {
    title: "Quản lý tài khoản, Hỗ trợ & Đánh giá",
    sub: "Quản lý trạng thái tài khoản người dùng, xử lý yêu cầu hỗ trợ có minh chứng và đánh giá dịch vụ.",
  },
  3.5: {
    title: "Chi tiết đơn hàng & Lịch sử cập nhật",
    sub: "Xem toàn bộ quá trình thay đổi trạng thái của đơn đặt lịch.",
  },
  3.6: {
    title: "Điều chỉnh thanh toán & Hoàn tiền",
    sub: "Cập nhật chi phí, trạng thái thanh toán hoặc hoàn tiền cho khách hàng.",
  },
  3.7: {
    title: "Xử lý yêu cầu hỗ trợ khách hàng",
    sub: "Cập nhật mức độ ưu tiên và kết quả giải quyết phiếu hỗ trợ.",
  },
  3.8: {
    title: "Cập nhật Danh mục gốc",
    sub: "Thêm mới hoặc chỉnh sửa danh mục dịch vụ cấp nền tảng.",
  },
  3.9: {
    title: "Quản lý danh sách Tỉnh/Thành & Phường/Xã",
    sub: "Cập nhật các khu vực hành chính đang triển khai dịch vụ.",
  },
  4.1: {
    title: "Tổng quan Công ty Đối tác",
    sub: "Theo dõi đội ngũ nhân viên Thợ, các gói dịch vụ và đơn hàng thuộc Công ty.",
  },
  4.2: {
    title: "Quản lý Nhân viên Thợ",
    sub: "Tạo hồ sơ Thợ, phân công dịch vụ và khóa/mở khóa tài khoản nhân viên thuộc Công ty.",
  },
  4.3: {
    title: "Quản lý Dịch vụ Công ty",
    sub: "Tạo mới, điều chỉnh đơn giá và bật/tắt trạng thái các gói dịch vụ của Công ty.",
  },
  4.4: {
    title: "Thêm & Phân công Nhân viên Thợ",
    sub: "Cấp tài khoản nhân viên Thợ và chọn các dịch vụ đảm nhiệm.",
  },
  4.5: {
    title: "Cập nhật Dịch vụ Công ty",
    sub: "Thiết lập tên gói, cách tính giá, đơn giá và thời lượng dịch vụ.",
  },
};

