import { apiRequest } from "../core/api.js";
import { calcDistanceKm, escapeHtml, escapeQuotes, formatDateTime, formatMoney, formatTimer, getDefaultUpcomingTimeLocal, getLocalDateTimeOffset, getMinDateTimeLocal, getServiceImage, inlineIdentifier, isCookingService, shortCode } from "../core/formatters.js";
import { go, switchPortal } from "../core/router.js";
import { state } from "../core/state.js";
import { Icons, applyUserModeCleanups, handleProvinceChange, initCustomerLocationPicker, showToast } from "../shared/ui-utils.js";

// =====================================================================
// SAVED ADDRESSES MODULE (FR-CUST-003)
// =====================================================================
export function pickSavedAddress(street, wardId, lat, lng) {
  const addrInput = document.getElementById("wizAddress");
  const wardSelect = document.getElementById("wizWardSelect");
  const provinceSelect = document.getElementById("wizProvSelect");
  const latInput = document.getElementById("wizLat");
  const lngInput = document.getElementById("wizLng");

  if (addrInput) addrInput.value = street;
  const db = window.GDX_DB || {};
  const wards = db.ward || db.wards || [];
  const ward = wards.find(
    (item) => String(item.ward_id) === String(wardId),
  );
  if (
    ward &&
    provinceSelect &&
    String(provinceSelect.value) !== String(ward.provinceId)
  ) {
    provinceSelect.value = ward.provinceId;
    handleProvinceChange("wizProvSelect", "wizWardSelect");
  }
  if (wardSelect) wardSelect.value = wardId;
  if (latInput) latInput.value = lat;
  if (lngInput) lngInput.value = lng;

  state.wizardDraft.address = street;
  state.wizardDraft.ward_id = wardId;
  state.wizardDraft.latitude = lat;
  state.wizardDraft.longitude = lng;
  state.bookingAddressSelection = {
    customerId: String(state.activeCustomerId),
    street,
    wardId: String(wardId),
    latitude: Number(lat),
    longitude: Number(lng),
  };
  updateBookingAddressSummary();

  showToast(`Đã áp dụng địa chỉ: ${street.slice(0, 35)}`);
}

export function updateBookingAddressSummary() {
  const summary = document.getElementById("bookingAddressSummary");
  const address = document.getElementById("wizAddress");
  const wardSelect = document.getElementById("wizWardSelect");
  const provinceSelect = document.getElementById("wizProvSelect");
  if (!summary || !address) return;

  const wardName =
    wardSelect && wardSelect.selectedOptions[0]
      ? wardSelect.selectedOptions[0].textContent
      : "";
  const provinceName =
    provinceSelect && provinceSelect.selectedOptions[0]
      ? provinceSelect.selectedOptions[0].textContent
      : "";
  summary.querySelector(".booking-address-street").textContent =
    address.value || "Chưa có địa chỉ mặc định";
  summary.querySelector(".booking-address-location").textContent = [
    wardName,
    provinceName,
  ]
    .filter(Boolean)
    .join(", ");
  const bookingSummaryLocation = document.getElementById(
    "bookingSummaryLocation",
  );
  const scheduledTime = document.getElementById("wizScheduledTime");
  if (bookingSummaryLocation) {
    bookingSummaryLocation.textContent = `${scheduledTime ? formatDateTime(scheduledTime.value) : ""} · ${wardName}`;
  }
  if (address.value && wardSelect && wardSelect.value) {
    state.bookingAddressSelection = {
      customerId: String(state.activeCustomerId),
      street: address.value,
      wardId: String(wardSelect.value),
      latitude: Number(document.getElementById("wizLat")?.value) || null,
      longitude: Number(document.getElementById("wizLng")?.value) || null,
    };
  }
}

export async function addCustomerAddress(
  tag,
  streetAddress,
  wardId,
  isDefault = false,
) {
  const res = await apiRequest("/api/customer/addresses", {
    method: "POST",
    body: JSON.stringify({
      customer_id: state.activeCustomerId,
      tag,
      street_address: streetAddress,
      ward_id: wardId,
      is_default: isDefault,
    }),
  });
  if (res && res.ok) {
    if (!Array.isArray(window.GDX_DB.customer_addresses))
      window.GDX_DB.customer_addresses = [];
    if (isDefault) {
      window.GDX_DB.customer_addresses.forEach((a) => {
        if (Number(a.customer_id) === state.activeCustomerId)
          a.is_default = false;
      });
    }
    window.GDX_DB.customer_addresses.push(res.address);
    showToast(`Đã lưu địa chỉ "${tag}" vào Sổ địa chỉ`);
    if (state.currentScreen === "1.5") go("1.5");
  } else {
    showToast(res ? res.error : "Lỗi khi lưu địa chỉ");
  }
}

export async function deleteCustomerAddress(addressId) {
  if (!confirm("Bạn có chắc chắn muốn xóa địa chỉ này?")) return;
  const res = await apiRequest(`/api/customer/addresses/${addressId}`, {
    method: "DELETE",
  });
  if (res && res.ok) {
    window.GDX_DB.customer_addresses = (
      window.GDX_DB.customer_addresses || []
    ).filter((a) => String(a.address_id) !== String(addressId));
    showToast("Đã xóa địa chỉ thành công");
    if (state.currentScreen === "1.5") go("1.5");
  }
}

export async function setDefaultCustomerAddress(addressId) {
  const res = await apiRequest(`/api/customer/addresses/${addressId}`, {
    method: "PUT",
    body: JSON.stringify({ is_default: true }),
  });
  if (res && res.ok) {
    (window.GDX_DB.customer_addresses || []).forEach((a) => {
      if (Number(a.customer_id) === state.activeCustomerId) {
        a.is_default = String(a.address_id) === String(addressId);
      }
    });
    showToast("Đã đặt làm địa chỉ mặc định");
    if (state.currentScreen === "1.5") go("1.5");
  }
}

// =====================================================================
// PROVIDER FAVORITES MODULE (FR-FAV-001)
// =====================================================================
export async function toggleProviderFavorite(providerId) {
  const db = window.GDX_DB;
  if (!Array.isArray(db.favorites)) db.favorites = [];
  const idx = db.favorites.findIndex(
    (f) =>
      Number(f.customer_id) === state.activeCustomerId &&
      Number(f.provider_id) === Number(providerId),
  );
  let added = false;
  if (idx >= 0) {
    db.favorites.splice(idx, 1);
    added = false;
  } else {
    db.favorites.push({
      favorite_id: Date.now(),
      customer_id: state.activeCustomerId,
      provider_id: Number(providerId),
      created_at: new Date().toISOString(),
    });
    added = true;
  }

  await apiRequest("/api/favorites/toggle", {
    method: "POST",
    body: JSON.stringify({
      customer_id: state.activeCustomerId,
      provider_id: providerId,
    }),
  });

  const pp = (db.provider_public_profiles || []).find(
    (p) => p.provider_id === providerId,
  );
  showToast(
    added
      ? `Đã thêm thợ ${pp ? pp.full_name : ""} vào danh sách yêu thích!`
      : `Đã bỏ lưu thợ khỏi danh sách yêu thích.`,
  );
  if (state.currentScreen === "1.6") go("1.6");
}


// =====================================================================
// SCREEN RENDERERS: PHÂN HỆ 1 (CUSTOMER PORTAL: 1.1 – 1.6)
// =====================================================================

// 1.1: Trang chủ & Khám phá dịch vụ (Warm Minimalism — Reference Layout)
export function renderScreen_1_1(container) {
  const db = window.GDX_DB;
  const activeServices =
    state.customerServiceLoadStatus === "loaded"
      ? (db.services || []).filter((s) => {
          if (!s.is_active) return false;
          const t = (s.title || "").toLowerCase();
          if (
            t.includes("repair") ||
            t.includes("sửa") ||
            t.includes("appliance")
          )
            return false;
          return true;
        })
      : [];
  const publicProviders = db.provider_public_profiles;
  const wards = db.ward;
  const favCount = db.favorites.filter(
    (f) => f.customer_id === state.activeCustomerId,
  ).length;
  const activeBooking = db.bookings.find(
    (b) =>
      b.customer_id === state.activeCustomerId &&
      (b.status === "in_progress" || b.status === "confirmed"),
  );

  const filteredServices = activeServices.filter((s) => {
    if (state.catalogFilter.categoryId !== "all") {
      const catId = String(state.catalogFilter.categoryId);
      const isCooking = isCookingService(s);
      if (catId === "1" && isCooking) return false;
      if (catId === "2" && !isCooking) return false;
    }
    if (
      state.catalogFilter.pricingType !== "all" &&
      s.pricing_type !== state.catalogFilter.pricingType
    ) {
      return false;
    }
    if (state.catalogFilter.searchQuery.trim() !== "") {
      const q = state.catalogFilter.searchQuery.trim().toLowerCase();
      if (!s.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const activeBookingSvc = activeBooking
    ? db.services.find(
        (s) => String(s.service_id) === String(activeBooking.service_id),
      )
    : null;
  const activeBookingProv = activeBooking
    ? publicProviders.find(
        (p) => p.provider_id === activeBooking.provider_id,
      )
    : null;

  const avgRatingAll =
    publicProviders.length > 0
      ? (
          publicProviders.reduce(
            (sum, p) => sum + Number(p.average_rating || 0),
            0,
          ) / publicProviders.length
        ).toFixed(2)
      : "4.92";

  const omniTimes = [
    {
      label: "Sáng mai (08:00 – 12:00)",
      value: getLocalDateTimeOffset(1, 8, 0),
    },
    {
      label: "Chiều mai (13:30 – 17:30)",
      value: getLocalDateTimeOffset(1, 13, 30),
    },
    {
      label: "Tối mai (18:00 – 21:00)",
      value: getLocalDateTimeOffset(1, 18, 0),
    },
    { label: "Ngày kia (08:30)", value: getLocalDateTimeOffset(2, 8, 30) },
  ];

  container.innerHTML = `
  ${
    activeBooking
      ? `
    <div class="site-container active-booking-strip-wrap">
      <div class="active-booking-banner">
        <div class="active-booking-banner-info">
          <span class="status-dot is-online"></span>
          <div>
            <div style="font-family:var(--font-heading); font-weight:700; font-size:0.9375rem; color:var(--color-primary);">
              Ca dịch vụ #${shortCode(activeBooking.booking_id)}: ${activeBookingSvc ? activeBookingSvc.title : "Dịch vụ gia đình"} đang thực hiện
            </div>
            <div class="field-hint">
              Đối tác: <strong>${activeBookingProv ? activeBookingProv.full_name : "Đặng Thị Mai Lan"}</strong> · Địa chỉ: ${activeBooking.address} · Tổng tạm tính: <strong class="num">${formatMoney(activeBooking.total_amount + activeBooking.total_incidental)}</strong>
            </div>
          </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="primary-btn btn-sm" onclick="GDXApp.go('1.3', {bookingId: ${activeBooking.booking_id}})">
            Theo dõi tiến độ ca làm &rarr;
          </button>
          ${
            activeBooking.payment_status === "unpaid"
              ? `<button type="button" class="ghost-btn btn-sm" onclick="GDXApp.openModal('1.8', {bookingId: ${activeBooking.booking_id}})">Thanh toán hóa đơn</button>`
              : ""
          }
        </div>
      </div>
    </div>`
      : ""
  }

  <!-- 1. HERO SECTION & OMNI-SEARCH (Home Cleaning & Home Cooking) -->
  <section class="hero-section">
    <div class="site-container hero-grid">
      <!-- Left Column: Value Proposition + Omni-Search + Quick Chips + Wizard Prompt + Stats -->
      <div class="hero-content">

        <h1 class="hero-headline">
          Dọn dẹp chu đáo · Bữa cơm vẹn tròn
        </h1>
        <p class="hero-subtitle">
          Gia Đình Xanh chuyên cung cấp 2 dịch vụ gia đình thiết yếu: Dọn dẹp nhà cửa (Home Cleaning) và Nấu ăn tại nhà (Home Cooking) tại TP.HCM. Đối tác được kiểm tra lý lịch, đối chiếu Căn cước công dân và niêm yết bảng giá công khai.
        </p>

        <!-- Omni-Search Bar (Bound to services, ward, and scheduled_time) -->
        <div class="omni-search" id="omniSearchBox">
          <form class="omni-form" onsubmit="event.preventDefault(); GDXApp.handleOmniSearchSubmit(this);">
            <div class="omni-field">
              <label for="omniServiceSelect" class="omni-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                Dịch vụ cần đặt
              </label>
              <select id="omniServiceSelect" name="service_id" class="omni-input" ${activeServices.length === 0 ? "disabled" : ""}>
                ${
                  activeServices.length === 0
                    ? `<option value="">${state.customerServiceLoadStatus === "loading" ? "Đang tải dịch vụ..." : state.customerServiceLoadStatus === "error" ? "Không tải được dịch vụ" : "Chưa có dịch vụ khả dụng"}</option>`
                    : activeServices
                        .map(
                          (s) =>
                            `<option value="${s.service_id}">${s.title} (${formatMoney(s.price)}${s.pricing_type === "hourly" ? "/giờ" : "/lần"})</option>`,
                        )
                        .join("")
                }
              </select>
            </div>

            <div class="omni-field">
              <label for="omniWardSelect" class="omni-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                Khu vực Phường/Xã
              </label>
              <select id="omniWardSelect" name="ward_id" class="omni-input">
                ${wards
                  .map(
                    (w) =>
                      `<option value="${w.ward_id}">${w.name}</option>`,
                  )
                  .join("")}
              </select>
            </div>

            <div class="omni-field">
              <label for="omniTimeSelect" class="omni-label">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Khung giờ hẹn
              </label>
              <select id="omniTimeSelect" name="scheduled_time" class="omni-input">
                ${omniTimes.map((slot) => `<option value="${slot.value}">${slot.label}</option>`).join("")}
              </select>
            </div>

            <div class="omni-action">
              <button type="submit" class="primary-btn search-submit-btn" ${activeServices.length === 0 ? "disabled" : ""}>
                Tìm &amp; Đặt lịch
              </button>
            </div>
          </form>
        </div>

        <!-- Quick Filter Chips -->
        <div class="quick-chips" aria-label="Gợi ý tìm kiếm nhanh">
          <span class="chips-label">Dịch vụ:</span>
          <button type="button" class="quick-chip ${state.catalogFilter.categoryId === "all" ? "is-active" : ""}" onclick="GDXApp.setCatalogCategory('all'); document.getElementById('dich-vu')?.scrollIntoView({behavior:'smooth'});">
            Tất cả (${activeServices.length})
          </button>
          <button type="button" class="quick-chip ${state.catalogFilter.categoryId === "1" ? "is-active" : ""}" onclick="GDXApp.setCatalogCategory('1'); document.getElementById('dich-vu')?.scrollIntoView({behavior:'smooth'});">
            Dọn dẹp nhà cửa (Home Cleaning)
          </button>
          <button type="button" class="quick-chip ${state.catalogFilter.categoryId === "2" ? "is-active" : ""}" onclick="GDXApp.setCatalogCategory('2'); document.getElementById('dich-vu')?.scrollIntoView({behavior:'smooth'});">
            Nấu ăn tại nhà (Home Cooking)
          </button>
          <button type="button" class="quick-chip" onclick="GDXApp.go('1.6')">
            Đã lưu (${favCount})
          </button>
        </div>

        <!-- Hero Wizard Callout Prompt -->
        <div class="hero-wizard-prompt">
          <div class="wizard-prompt-text">
            <span class="wizard-prompt-tag">Trình đặt lịch 4 bước</span>
            <h2 class="wizard-prompt-title">Tự cấu hình thời lượng &amp; chọn thợ</h2>
            <p class="wizard-prompt-desc">Tùy chỉnh số giờ phục vụ, kiểm tra lịch rảnh thực tế của từng đối tác thợ trong khu vực và nhận báo giá tự động.</p>
          </div>
          <button type="button" class="wizard-cta-btn" ${activeServices.length === 0 ? "disabled" : ""} onclick="GDXApp.go('1.2', {serviceId: ${activeServices[0] ? inlineIdentifier(activeServices[0].service_id) : "null"}})">
            Tự cấu hình &amp; Báo giá ngay
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        <!-- Hero Stats Row -->
        <div class="hero-stats-row">
          ${
            publicProviders && publicProviders.length > 0
              ? `
              <div class="stat-item">
                <strong class="stat-number num">${publicProviders.length} Đối tác</strong>
                <span class="stat-desc">Đã đối chiếu CCCD &amp; duyệt hồ sơ công khai</span>
              </div>
              <div class="stat-item">
                <strong class="stat-number num">${avgRatingAll} / 5 <span class="stat-star">${Icons.star(true)}</span></strong>
                <span class="stat-desc">Điểm hài lòng trung bình từ khách hàng thực tế</span>
              </div>`
              : `
              <div class="stat-item">
                <strong class="stat-number num">Tiêu chuẩn</strong>
                <span class="stat-desc">Xác minh danh tính CCCD &amp; tay nghề thực tế</span>
              </div>
              <div class="stat-item">
                <strong class="stat-number num">Minh bạch</strong>
                <span class="stat-desc">Không phát sinh chi phí ẩn ngoài thỏa thuận</span>
              </div>`
          }
          <div class="stat-item">
            <strong class="stat-number num">${activeServices.length} Gói dịch vụ</strong>
            <span class="stat-desc">Chuyên sâu Dọn dẹp &amp; Nấu ăn gia đình</span>
          </div>
        </div>
      </div>

      <!-- Right Column: Warm Documentary Photography -->
      <div class="hero-media-wrapper">
        <div class="hero-media-frame">
          <img src="/assets/hero-home-clean.jpg" alt="Không gian nhà cửa sáng sạch ấm cúng cùng Gia Đình Xanh" class="hero-image" loading="eager">
          <div class="v3-live-pill"><span class="status-dot is-online"></span> 12 ca đang phục vụ hôm nay</div>
        </div>
      </div>
    </div>
  </section>

  <!-- 2. CORE SERVICES SECTION (Bento Cards) -->
  <section id="dich-vu" class="section-services">
    <div class="site-container">
      <div class="section-header">
        <h2 class="section-title">Bento Khám phá dịch vụ</h2>
      </div>

      <div class="filter-toolbar">
        <div class="filter-chips" role="tablist" aria-label="Lọc theo danh mục">
          <button type="button" class="filter-chip" aria-pressed="${state.catalogFilter.categoryId === "all"}" onclick="GDXApp.setCatalogCategory('all')">
            Tất cả (${activeServices.length})
          </button>
          <button type="button" class="filter-chip" aria-pressed="${state.catalogFilter.categoryId === "1"}" onclick="GDXApp.setCatalogCategory('1')">
            Dọn dẹp nhà cửa (Home Cleaning)
          </button>
          <button type="button" class="filter-chip" aria-pressed="${state.catalogFilter.categoryId === "2"}" onclick="GDXApp.setCatalogCategory('2')">
            Nấu ăn tại nhà (Home Cooking)
          </button>
        </div>

        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <select class="select" style="min-height:42px; width:auto; border-radius:var(--radius-pill); padding:0 18px;" onchange="GDXApp.setCatalogPricingType(this.value)" aria-label="Cách tính phí">
            <option value="all" ${state.catalogFilter.pricingType === "all" ? "selected" : ""}>Mọi hình thức tính phí</option>
            <option value="hourly" ${state.catalogFilter.pricingType === "hourly" ? "selected" : ""}>Tính theo giờ (Hourly)</option>
            <option value="fixed" ${state.catalogFilter.pricingType === "fixed" ? "selected" : ""}>Trọn gói cố định (Fixed)</option>
          </select>
          <div class="search-input-wrap">
            <input type="search" class="input" style="min-height:42px; border-radius:var(--radius-pill);" placeholder="Tìm dịch vụ (dọn dẹp, tổng vệ sinh, nấu ăn, đầu bếp)..." value="${state.catalogFilter.searchQuery}" oninput="GDXApp.setCatalogSearch(this.value)" aria-label="Tìm kiếm dịch vụ">
          </div>
        </div>
      </div>

      <div class="services-grid">
        ${
          state.customerServiceLoadStatus === "loading"
            ? `<div class="customer-api-state" style="grid-column:1 / -1;" role="status">Đang tải danh sách dịch vụ...</div>`
            : state.customerServiceLoadStatus === "error"
              ? `<div class="customer-api-state is-error" style="grid-column:1 / -1;" role="alert">
                <div class="customer-api-state-title">Không thể tải dịch vụ</div>
                <p>Không thể kết nối để tải danh sách dịch vụ. Vui lòng thử lại.</p>
                <button type="button" class="ghost-btn btn-sm" onclick="GDXApp.refreshCustomerServices()">Thử tải lại</button>
              </div>`
              : filteredServices.length === 0
                ? `<div class="panel" style="grid-column:1 / -1; text-align:center; padding:36px;">
                <div style="font-family:var(--font-heading); font-weight:700; font-size:1.125rem; margin-bottom:6px;">${activeServices.length ? "Không tìm thấy gói dịch vụ phù hợp" : "Hiện chưa có dịch vụ khả dụng"}</div>
                <p class="field-hint" style="margin-bottom:16px;">${activeServices.length ? 'Hãy thử xóa từ khóa tìm kiếm hoặc chọn lại danh mục "Tất cả".' : "Danh mục sẽ được cập nhật khi có dịch vụ mới."}</p>
                ${activeServices.length ? '<button type="button" class="ghost-btn btn-sm" onclick="GDXApp.resetCatalogFilters()">Xem tất cả dịch vụ</button>' : ""}
              </div>`
                : filteredServices
                    .map((s) => {
                      const isFav = db.favorites.some(
                        (f) =>
                          String(f.customer_id) ===
                            String(state.activeCustomerId) &&
                          String(f.service_id) === String(s.service_id),
                      );
                      const providerCount = db.provider_services.filter(
                        (ps) => {
                          const p = publicProviders.find(
                            (pub) =>
                              String(pub.provider_id) ===
                              String(ps.provider_id),
                          );
                          return (
                            String(ps.service_id) ===
                              String(s.service_id) && Boolean(p)
                          );
                        },
                      ).length;
                      const desc =
                        s.description ||
                        "Dịch vụ chăm sóc gia đình với đội ngũ đối tác đã xác minh.";

                      return `
                  <article class="service-card">
                    <div class="service-card-media">
                      <img src="${getServiceImage(s)}" alt="${s.title}" loading="lazy">
                      <span class="service-badge-pill">${isCookingService(s) ? "Nấu ăn tại nhà (Home Cooking)" : "Dọn dẹp nhà cửa (Home Cleaning)"}</span>
                      <button type="button" class="fav-icon-btn ${isFav ? "is-favorited" : ""}" onclick="GDXApp.toggleFavorite(${inlineIdentifier(s.service_id)})" aria-label="${isFav ? "Bỏ lưu dịch vụ" : "Lưu dịch vụ yêu thích"}" title="${isFav ? "Đã lưu yêu thích" : "Lưu vào yêu thích"}">
                        ${Icons.heart(isFav)}
                      </button>
                    </div>
                    <div class="service-card-body">
                      <h3 class="service-title">${s.title}</h3>
                      <p class="service-desc">${desc}</p>
                      <ul class="service-features">
                        <li>Thời lượng tiêu chuẩn: ~${s.estimated_duration} phút / ca</li>
                        <li>Hình thức tính phí: ${s.pricing_type === "hourly" ? "Tính theo giờ thực tế" : "Trọn gói cố định theo lần"}</li>
                        <li>Đội ngũ sẵn sàng: ${providerCount} đối tác thợ đã xác minh CCCD</li>
                      </ul>
                      <div class="service-card-footer">
                        <div class="service-price-box">
                          <span class="price-label">Giá niêm yết</span>
                          <strong class="price-value num">${formatMoney(s.price)}<span class="price-unit">${s.pricing_type === "hourly" ? "/giờ" : "/lần"}</span></strong>
                        </div>
                        <button type="button" class="primary-btn btn-sm" onclick="GDXApp.go('1.2', {serviceId: ${inlineIdentifier(s.service_id)}})">
                          Chọn dịch vụ
                        </button>
                      </div>
                    </div>
                  </article>`;
                    })
                    .join("")
        }
      </div>

      <div class="services-wizard-callout">
        <div class="callout-info">
          <h3 class="callout-title">Cần tùy chỉnh thời lượng hoặc chọn thợ quen?</h3>
          <p class="callout-desc">Sử dụng trình cấu hình để chọn khung giờ hẹn, kiểm tra khoảng cách của thợ và nhận báo giá chi tiết.</p>
        </div>
        <button type="button" class="wizard-cta-btn" ${activeServices.length === 0 ? "disabled" : ""} onclick="GDXApp.go('1.2', {serviceId: ${activeServices[0] ? inlineIdentifier(activeServices[0].service_id) : "null"}})">
          Mở trình cấu hình chi tiết &rarr;
        </button>
      </div>
    </div>
  </section>

  <!-- 2.5. VISUAL GALLERY SHOWCASE (TẬP TRUNG 2 DỊCH VỤ CỐT LÕI VỚI HÌNH ẢNH ĐA DẠNG) -->
  <section class="section-gallery-showcase">
    <div class="site-container">
      <div class="section-header" style="text-align:center; max-width:680px; margin:0 auto 36px;">
        <span class="auth-badge-pill" style="margin-bottom:8px;">Không gian sống &amp; Bữa cơm ấm</span>
        <h2 class="section-title">Hai giải pháp trọn vẹn cho tổ ấm hiện đại</h2>
        <p class="section-subtitle">
          Không dàn trải, Gia Đình Xanh tập trung hoàn thiện tối đa chất lượng phục vụ ở 2 nhu cầu thiết yếu nhất của mỗi gia đình.
        </p>
      </div>

      <div class="gallery-grid-2col">
        <!-- Card 1: Home Cleaning Showcase -->
        <article class="gallery-service-card">
          <div class="gallery-photo-strip">
            <img src="/assets/cleaning-livingroom.jpg" alt="Dọn dẹp phòng khách tinh tươm" loading="lazy">
            <img src="/assets/cleaning-detail.jpg" alt="Chăm chút từng góc nhỏ ngăn nắp" loading="lazy">
          </div>
          <div class="gallery-card-body">
            <div>
              <span class="gallery-tag-pill">
                ${Icons.shield()} Phân hệ Dọn dẹp nhà cửa (Home Cleaning)
              </span>
              <h3 class="gallery-title">Không gian sống sáng trong, tinh tươm &amp; khử khuẩn</h3>
              <p class="gallery-desc">
                Lau dọn phòng khách, phòng ngủ, hút bụi sofa, lau kính mặt trong và cọ rửa nhà tắm sạch sẽ. Sử dụng dung dịch tẩy rửa sinh học an toàn cho trẻ nhỏ.
              </p>
              <ul class="gallery-highlights">
                <li>
                  ${Icons.check()}
                  <span>Lau sàn, hút bụi chuyên sâu và lau chùi bàn ghế, đồ đạc</span>
                </li>
                <li>
                  ${Icons.check()}
                  <span>Tẩy sạch dầu mỡ khu vực bếp và khử khuẩn nhà vệ sinh</span>
                </li>
                <li>
                  ${Icons.check()}
                  <span>Tùy chọn theo giờ linh hoạt (từ 2 giờ) hoặc tổng vệ sinh trọn gói</span>
                </li>
              </ul>
            </div>
            <button type="button" class="primary-btn btn-sm" style="width:100%;" onclick="GDXApp.setCatalogCategory('1'); document.getElementById('dich-vu')?.scrollIntoView({behavior:'smooth'});">
              Xem các gói Dọn dẹp nhà cửa &rarr;
            </button>
          </div>
        </article>

        <!-- Card 2: Home Cooking Showcase -->
        <article class="gallery-service-card">
          <div class="gallery-photo-strip">
            <img src="/assets/cooking-family-meal.jpg" alt="Mâm cơm gia đình ấm cúng" loading="lazy">
            <img src="/assets/cooking-pot-stew.jpg" alt="Món ăn nóng hổi đượm vị" loading="lazy">
          </div>
          <div class="gallery-card-body">
            <div>
              <span class="gallery-tag-pill" style="background:#fef3c7; color:#92400e;">
                ${Icons.check()} Phân hệ Nấu ăn tại nhà (Home Cooking)
              </span>
              <h3 class="gallery-title">Bữa cơm nóng hổi, chuẩn vị ngon mẹ nấu</h3>
              <p class="gallery-desc">
                Đầu bếp gia đình đến tận nhà sơ chế nguyên liệu tươi sạch, nấu 3–4 món ăn tròn vị theo khẩu vị riêng của gia đình bạn và dọn rửa sạch khu bếp sau khi nấu.
              </p>
              <ul class="gallery-highlights">
                <li>
                  ${Icons.check()}
                  <span>Sơ chế rau củ, thịt cá tươi sống đảm bảo vệ sinh an toàn thực phẩm</span>
                </li>
                <li>
                  ${Icons.check()}
                  <span>Nấu đa dạng món canh, mặn, xào theo yêu cầu dinh dưỡng gia đình</span>
                </li>
                <li>
                  ${Icons.check()}
                  <span>Rửa sạch chén bát xoong nồi và lau sạch gian bếp sau bữa nấu</span>
                </li>
              </ul>
            </div>
            <button type="button" class="primary-btn btn-sm" style="width:100%;" onclick="GDXApp.setCatalogCategory('2'); document.getElementById('dich-vu')?.scrollIntoView({behavior:'smooth'});">
              Xem các gói Nấu ăn tại nhà &rarr;
            </button>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- 3. VERIFIED PROVIDERS SECTION (CONDITIONAL RENDERING: ẨN KHI CHƯA CÓ THỢ VERIFIED) -->
  ${
    publicProviders && publicProviders.length > 0
      ? `
      <section id="doi-tac" class="section-providers">
        <div class="site-container">
          <div class="section-header">
            <h2 class="section-title">Đội ngũ Đối tác tiêu biểu</h2>
            <p class="section-subtitle">
              Bạn có quyền xem trước hồ sơ công khai, các gói kỹ năng đăng ký, lịch rảnh trong tuần và nhận xét thực tế từ các gia đình trước khi đặt lịch.
            </p>
            <p class="screen-finding">Dữ liệu trích xuất từ View provider_public_profiles (ẩn số CCCD, chỉ hiển thị thợ đã verified).</p>
          </div>

          <div class="providers-grid">
            ${publicProviders
              .map((p) => {
                const skillIds = (db.provider_services || [])
                  .filter((ps) => ps.provider_id === p.provider_id)
                  .map((ps) => ps.service_id);
                const skillNames = (db.services || [])
                  .filter((s) => skillIds.includes(s.service_id))
                  .map((s) => s.title);
                const bookingService = activeServices.find((s) =>
                  skillIds.some(
                    (id) => String(id) === String(s.service_id),
                  ),
                );
                const areaWards = (db.provider_areas || [])
                  .filter((pa) => pa.provider_id === p.provider_id)
                  .map((pa) => {
                    const w = (db.ward || []).find(
                      (x) => x.ward_id === pa.ward_id,
                    );
                    return w
                      ? w.name.replace("Phường ", "P. ")
                      : pa.ward_id;
                  });

                return `
                <article class="provider-card">
                  <div class="provider-card-top">
                    <img src="${p.avatar_url || "/assets/provider-lan.jpg"}" alt="${p.full_name}" class="provider-avatar" loading="lazy">
                    <div class="provider-meta">
                      <div class="provider-name-row">
                        <h3 class="provider-name">${p.full_name}</h3>
                        <span class="badge badge-positive">Đã xác minh</span>
                      </div>
                      <span class="provider-Exp">Khu vực: ${areaWards.join(", ") || "TP.HCM"}</span>
                      <div class="provider-rating">
                        <span class="star-rating num">${Icons.star(true)} ${Number(p.average_rating || 5).toFixed(2)}</span>
                        <span class="rating-count">(${p.total_reviews || 0} đánh giá)</span>
                      </div>
                    </div>
                  </div>
                  <div class="provider-specialty">
                    <span class="specialty-label">Chuyên môn &amp; Kinh nghiệm:</span>
                    <p class="specialty-text">${p.info || "Đối tác thợ kỹ thuật tiêu chuẩn Gia Đình Xanh"}</p>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                      ${skillNames
                        .slice(0, 3)
                        .map(
                          (name) =>
                            `<span class="badge badge-positive">${name}</span>`,
                        )
                        .join("")}
                    </div>
                  </div>
                  <div class="provider-card-footer">
                    <span class="provider-rate">${p.is_available_online ? "Đang nhận việc" : "Theo lịch hẹn"}</span>
                    <div style="display:flex; gap:8px;">
                      <button type="button" class="ghost-btn btn-sm" onclick="GDXApp.openModal('1.7', {providerId: ${p.provider_id}})">
                        Xem lịch rảnh
                      </button>
                      ${bookingService ? `<button type="button" class="primary-btn btn-sm" onclick="GDXApp.go('1.2', {serviceId: ${inlineIdentifier(bookingService.service_id)}, providerId: ${inlineIdentifier(p.provider_id)}})">Đặt lịch</button>` : ""}
                    </div>
                  </div>
                </article>`;
              })
              .join("")}
          </div>
        </div>
      </section>`
      : ""
  }

  <!-- 4. TRUST & TRANSPARENCY SECTION (DB-Compliant) -->
  <section id="an-toan" class="section-trust">
    <div class="site-container">
      <div class="trust-split-layout">
        <div class="trust-intro">
          <h2 class="section-title">Vì sao các gia đình yên tâm đặt lịch?</h2>
          <p class="trust-lead">
            Sự an tâm của gia đình bạn được xây dựng trên quy trình đối chiếu danh tính rõ ràng, biểu giá minh bạch và hệ thống đánh giá thực tế sau từng ca làm việc.
          </p>
          <div class="trust-cta-box">
            <button type="button" class="primary-btn" onclick="GDXApp.openModal('CATALOG')">
              Xem bảng giá niêm yết &amp; Quy trình
            </button>
          </div>
        </div>

        <div class="trust-pillars">
          <div class="trust-pillar-card">
            <div class="pillar-body">
              <h3 class="pillar-title">Xác minh Căn cước công dân &amp; Kỹ năng hành nghề</h3>
              <p class="pillar-desc">
                Mọi đối tác thợ đều bắt buộc khai báo số CCCD duy nhất, đăng ký chuyên môn và khu vực Phường/Xã hoạt động, được Quản trị viên xét duyệt trước khi mở hồ sơ công khai.
              </p>
            </div>
          </div>

          <div class="trust-pillar-card">
            <div class="pillar-body">
              <h3 class="pillar-title">Minh bạch đơn giá &amp; Kiểm soát chi phí phát sinh</h3>
              <p class="pillar-desc">
                Hệ thống báo giá tự động theo giờ hoặc trọn gói cố định. Nếu có nhờ mua hộ vật tư phụ, đối tác phải kê khai lý do và lưu vết vào nhật ký đơn hàng để chủ nhà nghiệm thu.
              </p>
            </div>
          </div>

          <div class="trust-pillar-card">
            <div class="pillar-body">
              <h3 class="pillar-title">Đánh giá thực tế 1-1 từ đơn hàng đã hoàn tất</h3>
              <p class="pillar-desc">
                Mỗi lượt chấm sao và nhận xét đều gắn trực tiếp với một mã đơn đặt lịch đã hoàn thành, tự động cập nhật điểm uy tín trung bình của đối tác thợ.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 5. FAMILY STORY & CUSTOMER REVIEWS SECTION -->
  <section class="section-testimonial">
    <div class="site-container">
      <div class="testimonial-grid">
        <div class="testimonial-media">
          <img src="/assets/family-story.jpg" alt="Không gian gia đình ấm cúng sạch sẽ sau ca dịch vụ" class="testimonial-image" loading="lazy">
        </div>
        <div class="testimonial-content">
          <h2 class="section-title">Thời gian thảnh thơi bên gia đình</h2>
          <blockquote class="testimonial-quote">
            "${db.reviews[0] ? db.reviews[0].comment : "Chị Lan đến đúng giờ, mang đầy đủ khăn lau phân màu theo từng khu vực bếp và phòng tắm, làm việc rất kỹ lưỡng."}"
          </blockquote>
          <div class="testimonial-author">
            <strong>Gia đình chị Nguyễn Minh Thảo</strong>
            <span>Khách hàng tại Khu đô thị Phú Mỹ Hưng, Quận 7, TP.HCM</span>
          </div>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button type="button" class="primary-btn" ${activeServices.length === 0 ? "disabled" : ""} onclick="GDXApp.go('1.2', {serviceId: ${activeServices[0] ? inlineIdentifier(activeServices[0].service_id) : "null"}})">
              Đặt lịch chăm sóc tổ ấm ngay &rarr;
            </button>
            <button type="button" class="ghost-btn" onclick="GDXApp.go('1.4')">
              Xem lịch sử đơn hàng
            </button>
          </div>
        </div>
      </div>

      <div class="reviews-feed-grid">
        ${db.reviews
          .slice(0, 3)
          .map((r) => {
            const bk = db.bookings.find(
              (b) => b.booking_id === r.booking_id,
            );
            const svc = bk
              ? db.services.find((s) => s.service_id === bk.service_id)
              : null;
            const prov = publicProviders.find(
              (p) => p.provider_id === r.provider_id,
            );
            return `
            <article class="review-quote-card">
              <p class="review-quote-text">"${r.comment}"</p>
              <div style="margin-top:auto; padding-top:8px; display:flex; justify-content:space-between; align-items:center; font-size:0.875rem;">
                <span>Đối tác: <strong>${prov ? prov.full_name : "Thợ Gia Đình Xanh"}</strong></span>
                <span class="badge badge-positive num">Điểm ${r.rating}.0 / 5.0 · Đơn #${shortCode(r.booking_id)}</span>
              </div>
              <div class="field-hint">${svc ? svc.title : ""}</div>
            </article>`;
          })
          .join("")}
      </div>
    </div>
  </section>

  <!-- 6. MINIMALIST SITE FOOTER -->
  <footer class="site-footer">
    <div class="site-container">
      <div class="footer-content">
        <div class="footer-brand-col">
          <div class="brand-logo">
            <span class="logo-mark" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="8" fill="#1B4332"/>
                <path d="M8 14.5L14 9.5L20 14.5V20.5C20 21.0523 19.5523 21.5 19 21.5H9C8.44772 21.5 8 21.0523 8 20.5V14.5Z" stroke="#F8F9FA" stroke-width="1.75" stroke-linejoin="round"/>
                <path d="M14 17.5C15.3807 17.5 16.5 16.3807 16.5 15C16.5 13.6193 14 11.5 14 11.5C14 11.5 11.5 13.6193 11.5 15C11.5 16.3807 12.6193 17.5 14 17.5Z" fill="#E07A5F"/>
              </svg>
            </span>
            <span class="logo-text">Gia Đình Xanh</span>
          </div>
          <p class="footer-desc">
            Nền tảng kết nối các gia đình Việt với đội ngũ đối tác chăm sóc nhà cửa, vệ sinh điện máy và nấu ăn gia đình chuyên nghiệp, minh bạch đơn giá tại TP.HCM.
          </p>
          <p class="footer-meta">Phục vụ các Phường thuộc Quận 7 &amp; Quận 1, TP. Hồ Chí Minh</p>
        </div>

        <div class="footer-links-col">
          <h3 class="footer-heading">Dịch vụ Gia đình</h3>
          <ul class="footer-nav">
            ${
              activeServices.length
                ? activeServices
                    .map(
                      (s) =>
                        `<li><button type="button" onclick="GDXApp.go('1.2', {serviceId: ${inlineIdentifier(s.service_id)}})">${s.title}</button></li>`,
                    )
                    .join("")
                : `<li><span class="field-hint">${state.customerServiceLoadStatus === "loading" ? "Đang tải dịch vụ..." : "Chưa có dịch vụ khả dụng"}</span></li>`
            }
          </ul>
        </div>

        <div class="footer-links-col">
          <h3 class="footer-heading">Tiện ích &amp; Hỗ trợ</h3>
          <ul class="footer-nav">
            <li><button type="button" onclick="GDXApp.openModal('CATALOG')">Tra cứu biểu giá niêm yết</button></li>
            <li><button type="button" onclick="GDXApp.openModal('1.11')">Trung tâm hỗ trợ &amp; Khiếu nại</button></li>
            <li><button type="button" onclick="GDXApp.go('0.3')">Đăng ký Công ty Đối tác</button></li>
            <li><button type="button" onclick="GDXApp.go('1.5')">Sổ địa chỉ &amp; Hồ sơ cá nhân</button></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <span>&copy; 2026 Gia Đình Xanh. Hệ thống Đặt lịch Dịch vụ Gia đình.</span>
        <span>Minh bạch đơn giá · Đối tác đã xác minh CCCD</span>
      </div>
    </div>
  </footer>
`;
}

export function handleOmniSearchSubmit(form) {
  const svcId = form.service_id ? form.service_id.value : "";
  const service = (window.GDX_DB.services || []).find(
    (s) => String(s.service_id) === String(svcId),
  );
  if (!service) {
    showToast(
      state.customerServiceLoadError ||
        "Vui lòng chọn một dịch vụ đang được cung cấp.",
    );
    return;
  }
  const wardId = form.ward_id ? form.ward_id.value : "27472";
  const schedTime = form.scheduled_time
    ? form.scheduled_time.value
    : getDefaultUpcomingTimeLocal();
  state.selectedServiceId = service.service_id;
  state.wizardDraft.service_id = service.service_id;
  state.wizardDraft.ward_id = wardId;
  state.wizardDraft.scheduled_time = schedTime;
  go("1.2", {
    serviceId: service.service_id,
    wardId,
    scheduledTime: schedTime,
  });
}

export function setCatalogCategory(catId) {
  state.catalogFilter.categoryId = catId;
  go("1.1");
}

export function setCatalogPricingType(pricingType) {
  state.catalogFilter.pricingType = pricingType;
  go("1.1");
}

export function setCatalogSearch(q) {
  state.catalogFilter.searchQuery = q;
  const viewport = document.getElementById("mainViewport");
  if (viewport && state.currentScreen === "1.1") {
    renderScreen_1_1(viewport);
    applyUserModeCleanups(viewport, "1.1");
    const searchInput = viewport.querySelector('input[type="search"]');
    if (searchInput) {
      searchInput.focus();
      searchInput.setSelectionRange(q.length, q.length);
    }
  }
}

export function resetCatalogFilters() {
  state.catalogFilter = {
    categoryId: "all",
    pricingType: "all",
    searchQuery: "",
  };
  go("1.1");
}

export function toggleFavorite(serviceId) {
  const db = window.GDX_DB;
  const idx = db.favorites.findIndex(
    (f) =>
      String(f.customer_id) === String(state.activeCustomerId) &&
      String(f.service_id) === String(serviceId),
  );
  if (idx >= 0) {
    db.favorites.splice(idx, 1);
    showToast("Đã xóa dịch vụ khỏi danh sách yêu thích");
  } else {
    db.favorites.push({
      customer_id: state.activeCustomerId,
      service_id: serviceId,
      created_at: new Date().toISOString(),
    });
    showToast("Đã lưu dịch vụ vào danh sách yêu thích");
  }
  apiRequest("/api/favorites/toggle", {
    method: "POST",
    body: JSON.stringify({
      customer_id: state.activeCustomerId,
      service_id: serviceId,
    }),
  });
  go(state.currentScreen);
}

// Helper tra cứu hồ sơ khách hàng hoạt động (Active Customer Profile)
export function getActiveCustomerProfile() {
  const db = window.GDX_DB;
  if (!db || !db.customer_profiles) return null;

  // 1. Tìm theo state.activeCustomerId (chấp nhận cả string lẫn number)
  if (state.activeCustomerId) {
    const byCid = db.customer_profiles.find(
      (c) => String(c.customer_id) === String(state.activeCustomerId),
    );
    if (byCid) return byCid;
  }

  // 2. Tìm theo state.activeUserId (UUID)
  if (state.activeUserId) {
    const byUid = db.customer_profiles.find(
      (c) => String(c.user_id) === String(state.activeUserId),
    );
    if (byUid) {
      state.activeCustomerId = byUid.customer_id;
      return byUid;
    }
  }

  // 3. Tìm theo currentUser nếu có
  if (state.currentUser && state.currentUser.user_id) {
    const byCur = db.customer_profiles.find(
      (c) => String(c.user_id) === String(state.currentUser.user_id),
    );
    if (byCur) {
      state.activeCustomerId = byCur.customer_id;
      return byCur;
    }
  }

  // 4. Fallback ở chế độ dev/mock không phải production
  if (!state.isProduction && db.customer_profiles.length > 0) {
    state.activeCustomerId = db.customer_profiles[0].customer_id;
    return db.customer_profiles[0];
  }

  return null;
}


// 1.2: Cấu hình dịch vụ trước khi đặt (Booking Wizard — Reference Layout)
export function renderScreen_1_2(container, params = {}) {
  if (params.serviceId) {
    state.selectedServiceId = isNaN(Number(params.serviceId))
      ? String(params.serviceId)
      : Number(params.serviceId);
  }
  if (params.providerId) {
    state.selectedProviderId = isNaN(Number(params.providerId))
      ? String(params.providerId)
      : Number(params.providerId);
  }
  if (params.wardId) state.wizardDraft.ward_id = params.wardId;
  if (params.scheduledTime)
    state.wizardDraft.scheduled_time = params.scheduledTime;

  const db = window.GDX_DB;
  const activeServices = (db.services || []).filter((s) => {
    if (!s.is_active) return false;
    const t = (s.title || "").toLowerCase();
    if (
      t.includes("repair") ||
      t.includes("sửa") ||
      t.includes("appliance")
    )
      return false;
    return true;
  });

  if (
    state.customerServiceLoadStatus !== "loaded" ||
    activeServices.length === 0
  ) {
    const isLoading = state.customerServiceLoadStatus === "loading";
    const isError = state.customerServiceLoadStatus === "error";
    const message = isLoading
      ? "Đang tải danh sách dịch vụ..."
      : isError
        ? "Không thể kết nối để tải danh sách dịch vụ. Vui lòng thử lại."
        : "Hiện chưa có dịch vụ nào khả dụng.";
    container.innerHTML = `
    <div class="v3-wiz-page">
      <div class="panel" style="max-width:680px; margin:40px auto; text-align:center; padding:32px;" role="${isLoading ? "status" : "alert"}">
        <h1 class="screen-title">${isLoading ? "Đang tải dịch vụ" : "Chưa thể đặt lịch"}</h1>
        <p class="field-hint" style="margin:12px 0 20px;">${message}</p>
        <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
          <button type="button" class="ghost-btn btn-sm" onclick="GDXApp.go('1.1')">Quay lại danh sách dịch vụ</button>
          ${isError ? '<button type="button" class="primary-btn btn-sm" onclick="GDXApp.refreshCustomerServices()">Thử tải lại</button>' : ""}
        </div>
      </div>
    </div>`;
    return;
  }

  const selectedService = activeServices.find(
    (s) => String(s.service_id) === String(state.selectedServiceId),
  );
  const svc = selectedService || activeServices[0];
  if (params.serviceId || !selectedService) {
    state.wizardCategory = isCookingService(svc) ? "2" : "1";
  }
  state.selectedServiceId = svc.service_id;
  state.wizardDraft.service_id = svc.service_id;

  if (!state.wizardCategory) {
    state.wizardCategory = isCookingService(svc) ? "2" : "1";
  }

  const categoryServices = activeServices.filter((s) => {
    const isCooking = isCookingService(s);
    return state.wizardCategory === "2" ? isCooking : !isCooking;
  });
  const cust = getActiveCustomerProfile();
  const savedBookingAddress =
    state.bookingAddressSelection &&
    String(state.bookingAddressSelection.customerId) ===
      String(state.activeCustomerId)
      ? state.bookingAddressSelection
      : null;
  const provinces = db.province || db.provinces || [];
  const allWards = db.ward || db.wards || [];

  // Use the explicitly selected saved address, otherwise the profile default.
  const selectedWardId =
    params.wardId ||
    (savedBookingAddress && savedBookingAddress.wardId) ||
    (cust && cust.ward_id) ||
    "";
  const currentBookingWard = allWards.find(
    (w) => String(w.ward_id) === String(selectedWardId),
  );
  const currentBookingProvId = currentBookingWard
    ? String(currentBookingWard.provinceId)
    : provinces.find((p) => p.provinceId === "29" || p.provinceId === "79")
        ?.provinceId || "29";
  const bookingWards = allWards.filter(
    (w) =>
      !w.provinceId ||
      String(w.provinceId) === String(currentBookingProvId),
  );
  const wardsToRender =
    bookingWards.length > 0 ? bookingWards : allWards.slice(0, 100);

  // An explicit route address takes precedence over the selected/profile address.
  const defaultAddressValue =
    params.address !== undefined
      ? params.address
      : savedBookingAddress
        ? savedBookingAddress.street
        : cust && cust.default_address
          ? cust.default_address
          : "";

  const upcomingDefault = getDefaultUpcomingTimeLocal();
  const draftTimeMs = state.wizardDraft.scheduled_time
    ? Date.parse(state.wizardDraft.scheduled_time)
    : 0;
  const validDraftTime =
    draftTimeMs && draftTimeMs > Date.now()
      ? state.wizardDraft.scheduled_time
      : upcomingDefault;
  const selectedTime = params.scheduledTime || validDraftTime;
  const minBookingTime = getMinDateTimeLocal();

  const matchingProviderIds = (db.provider_services || [])
    .filter((ps) => String(ps.service_id) === String(svc.service_id))
    .map((ps) => ps.provider_id);

  const baseEligibleProviders = (db.provider_public_profiles || []).filter(
    (p) => {
      if (
        matchingProviderIds.length > 0 &&
        !matchingProviderIds.some(
          (id) => String(id) === String(p.provider_id),
        )
      ) {
        return false;
      }
      return true;
    },
  );

  const verifiedCompanies = (db.company_profiles || []).filter(
    (c) => c.verification_status === "verified",
  );
  const searchKw = (state.directProviderSearch || "").trim().toLowerCase();
  const companyFilterId = state.directProviderCompanyId || "all";

  const eligibleProviders = baseEligibleProviders.filter((p) => {
    const comp = (db.company_profiles || []).find(
      (c) => Number(c.company_id) === Number(p.company_id),
    );
    const compName = p.company_name || (comp && comp.company_name) || "";
    if (
      companyFilterId !== "all" &&
      String(p.company_id) !== String(companyFilterId)
    ) {
      return false;
    }
    if (searchKw) {
      const provMatch = (p.full_name || "")
        .toLowerCase()
        .includes(searchKw);
      const compMatch = compName.toLowerCase().includes(searchKw);
      if (!provMatch && !compMatch) return false;
    }
    return true;
  });

  if (state.wizardProviderMode === "direct") {
    if (
      !eligibleProviders.some(
        (p) => String(p.provider_id) === String(state.selectedProviderId),
      ) &&
      eligibleProviders.length > 0
    ) {
      state.selectedProviderId = eligibleProviders[0].provider_id;
    }
  } else {
    state.selectedProviderId = null;
  }

  const selectedProv =
    eligibleProviders.find(
      (p) => String(p.provider_id) === String(state.selectedProviderId),
    ) || eligibleProviders[0];
  const totalAmount =
    svc.pricing_type === "hourly"
      ? svc.price * state.bookingHours
      : svc.price;

  const savedAddrs = (db.customer_addresses || []).filter(
    (a) =>
      String(a.customer_id) === String(state.activeCustomerId) &&
      !(
        cust &&
        cust.default_address &&
        String(a.ward_id) === String(cust.ward_id) &&
        a.street_address === cust.default_address
      ),
  );

  container.innerHTML = `
  <div class="v3-wiz-page">
    <div class="v3-wiz-header">
      <h1 class="v3-wiz-title">Đặt lịch trong 4 chạm</h1>
      <button type="button" class="v3-track-chip-btn" onclick="GDXApp.go('1.1')">&larr; Trang chủ</button>
    </div>

    <div class="v3-wiz-layout">
      <!-- Left Main Card (Figma 1.2 1:1 + Direct Provider Selection) -->
      <div class="v3-wiz-card">
        <!-- 1. Chọn gói dịch vụ -->
        <div class="v3-wiz-section">
          <div class="v3-wiz-sec-head">
            <h2 class="v3-wiz-sec-title">1. Chọn gói dịch vụ</h2>
            <div class="v3-seg-tabs" style="padding:3px;">
              <button type="button" class="v3-seg-tab ${state.wizardCategory === "1" ? "is-active" : ""}" style="padding:5px 12px; font-size:12.5px;" onclick="GDXApp.setWizardCategory('1')">
                Dọn dẹp nhà cửa
              </button>
              <button type="button" class="v3-seg-tab ${state.wizardCategory === "2" ? "is-active" : ""}" style="padding:5px 12px; font-size:12.5px;" onclick="GDXApp.setWizardCategory('2')">
                Nấu ăn tại nhà
              </button>
            </div>
          </div>

          <div class="v3-wiz-svc-grid">
            ${
              categoryServices.length > 0
                ? categoryServices
                    .map((s) => {
                      const isSel =
                        String(s.service_id) === String(svc.service_id);
                      const unit = s.pricing_type === "hourly" ? "/h" : "";
                      return `
                <button type="button" class="v3-wiz-svc-item ${isSel ? "is-selected" : ""}" onclick="GDXApp.go('1.2', {serviceId: ${inlineIdentifier(s.service_id)}})">
                  <img src="${getServiceImage(s)}" alt="${s.title}" class="v3-wiz-svc-img">
                  <div class="v3-wiz-svc-name">${s.title}</div>
                  <div class="v3-wiz-svc-price num">${formatMoney(s.price).replace(" đ", "đ")}${unit}</div>
                </button>`;
                    })
                    .join("")
                : '<div class="panel-subtle" style="grid-column:1 / -1; text-align:center; padding:20px;">Chưa có gói dịch vụ trong danh mục này.</div>'
            }
          </div>

          ${
            svc.pricing_type === "hourly"
              ? `
            <div class="v3-wiz-hours-row">
              <span class="v3-wiz-hours-label">Thời lượng:</span>
              ${[2, 3, 4]
                .map(
                  (h) => `
                <button type="button" class="v3-appt-filter-pill ${state.bookingHours === h ? "is-active" : ""}" onclick="GDXApp.setBookingHours(${h})">
                  ${h} giờ
                </button>`,
                )
                .join("")}
            </div>`
              : ""
          }
        </div>

        <!-- 2. Ngày phục vụ, Giờ bắt đầu & Địa chỉ -->
        <div class="v3-wiz-section">
          <div class="v3-wiz-row-2">
            <div class="v3-profile-field">
              <label for="wizScheduledTime">2. Ngày &amp; giờ phục vụ</label>
              <input type="datetime-local" id="wizScheduledTime" class="v3-profile-input" value="${selectedTime}" min="${minBookingTime}" required>
            </div>
            <div class="booking-address-panel">
              <div class="booking-address-heading">
                <div>
                  <span class="booking-address-eyebrow">ĐỊA CHỈ ĐÃ LƯU TRONG HỒ SƠ</span>
                  <strong>Địa chỉ thực hiện</strong>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="GDXApp.go('1.5')">Sửa hồ sơ</button>
              </div>
              <div id="bookingAddressSummary" class="booking-address-summary">
                <span class="booking-address-street">${escapeHtml(defaultAddressValue || "Chưa có địa chỉ mặc định")}</span>
                <span class="booking-address-location">${escapeHtml([currentBookingWard && currentBookingWard.name, provinces.find((p) => String(p.provinceId) === String(currentBookingProvId))?.name].filter(Boolean).join(", "))}</span>
              </div>
              ${
                defaultAddressValue
                  ? `<button type="button" class="booking-address-gps" onclick="GDXApp.locateUserGPS('wizLat', 'wizLng', null, 'wizAddress', 'wizProvSelect', 'wizWardSelect')">&#128205; Chọn vị trí GPS cho đơn này</button>`
                  : `<div class="booking-address-missing" role="alert">Bạn chưa lưu địa chỉ mặc định. <button type="button" onclick="GDXApp.go('1.5')">Cập nhật hồ sơ</button> để tiếp tục đặt lịch.</div>`
              }
              <input type="hidden" id="wizAddress" value="${escapeHtml(defaultAddressValue)}">
              <select id="wizProvSelect" class="booking-address-hidden" aria-hidden="true" tabindex="-1" onchange="GDXApp.handleProvinceChange('wizProvSelect', 'wizWardSelect')">
                ${provinces.map((p) => `<option value="${escapeHtml(p.provinceId)}" ${String(p.provinceId) === String(currentBookingProvId) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
              </select>
              <select id="wizWardSelect" class="booking-address-hidden" aria-hidden="true" tabindex="-1">
                ${selectedWardId ? "" : '<option value="" selected disabled>Chưa có phường/xã trong hồ sơ</option>'}
                ${wardsToRender.map((w) => `<option value="${escapeHtml(w.ward_id)}" ${String(selectedWardId) === String(w.ward_id) ? "selected" : ""}>${escapeHtml(w.name)}</option>`).join("")}
              </select>
            </div>
          </div>

          ${
            savedAddrs.length > 0
              ? `
            <div class="wizard-address-chips">
              <span class="booking-address-saved-label">Địa chỉ khác đã lưu:</span>
              ${savedAddrs
                .map(
                  (a) => `
                <button type="button" class="wizard-addr-chip" onclick="GDXApp.pickSavedAddress('${escapeQuotes(a.street_address)}', '${escapeQuotes(a.ward_id)}', ${a.latitude || 10.741}, ${a.longitude || 106.702})">
                  &#128205; <strong>${escapeQuotes(a.tag || a.label || "Địa chỉ")}</strong>: ${escapeQuotes(a.street_address.slice(0, 28))}${a.street_address.length > 28 ? "..." : ""}
                </button>`,
                )
                .join("")}
            </div>`
              : ""
          }

          <input type="hidden" id="wizLat" value="${savedBookingAddress ? savedBookingAddress.latitude : cust && cust.latitude ? cust.latitude : 10.741205}">
          <input type="hidden" id="wizLng" value="${savedBookingAddress ? savedBookingAddress.longitude : cust && cust.longitude ? cust.longitude : 106.70211}">

          <div class="v3-profile-field">
            <label for="wizNotes">Ghi chú cho nhân viên (tùy chọn)</label>
            <input type="text" id="wizNotes" class="v3-profile-input" value="Hãy ghi điều bạn muốn nói với nhân viên." placeholder="Ví dụ: Mang theo thang chữ A, gọi chuông cửa...">
          </div>
        </div>

        <!-- 3. Chọn Nhân viên đề xuất / Tự chọn nhân viên cụ thể -->
        <div class="v3-wiz-section">
          <div class="v3-wiz-sec-head">
            <h2 class="v3-wiz-sec-title">3. Chọn Nhân viên đề xuất gần bạn</h2>
            <div class="v3-seg-tabs" style="padding:3px;">
              <button type="button" class="v3-seg-tab ${state.wizardProviderMode !== "direct" ? "is-active" : ""}" style="padding:5px 12px; font-size:12.5px;" onclick="GDXApp.setWizardProviderMode('broadcast')">
                &#9889; Rải đơn nhanh
              </button>
              <button type="button" class="v3-seg-tab ${state.wizardProviderMode === "direct" ? "is-active" : ""}" style="padding:5px 12px; font-size:12.5px;" onclick="GDXApp.setWizardProviderMode('direct')">
                &#128100; Tự chọn nhân viên (${baseEligibleProviders.length})
              </button>
            </div>
          </div>

          ${
            state.wizardProviderMode === "direct"
              ? `
            <div class="v3-wiz-row-2" style="margin-bottom:4px;">
              <input
                type="text"
                id="directProviderSearchInput"
                class="v3-profile-input"
                value="${escapeQuotes(state.directProviderSearch || "")}"
                placeholder="Tìm theo tên Thợ hoặc Công ty..."
                oninput="GDXApp.setDirectProviderSearch(this.value)"
              >
              <select
                id="directProviderCompanySelect"
                class="v3-profile-input"
                onchange="GDXApp.setDirectProviderCompanyFilter(this.value)"
                aria-label="Lọc theo Công ty Đối tác"
              >
                <option value="all" ${companyFilterId === "all" ? "selected" : ""}>Tất cả Công ty (${verifiedCompanies.length})</option>
                ${verifiedCompanies.map((c) => `<option value="${c.company_id}" ${String(companyFilterId) === String(c.company_id) ? "selected" : ""}>${c.company_name}</option>`).join("")}
              </select>
            </div>

            <div class="v3-wiz-prov-list">
              ${
                eligibleProviders.length > 0
                  ? eligibleProviders
                      .map((p) => {
                        const fullProv = (db.provider_profiles || []).find(
                          (fp) => fp.provider_id === p.provider_id,
                        );
                        const compObj = (db.company_profiles || []).find(
                          (c) =>
                            Number(c.company_id) ===
                            Number(
                              p.company_id ||
                                (fullProv && fullProv.company_id),
                            ),
                        );
                        const companyLabel =
                          p.company_name ||
                          (compObj && compObj.company_name) ||
                          "Công ty Đối tác";
                        const distKm =
                          cust && fullProv
                            ? calcDistanceKm(
                                cust.latitude,
                                cust.longitude,
                                fullProv.lattitude,
                                fullProv.longtitude,
                              )
                            : "1.4";
                        const isSelected =
                          selectedProv &&
                          selectedProv.provider_id === p.provider_id;

                        return `
                      <div class="v3-wiz-prov-card ${isSelected ? "is-selected" : ""}" onclick="GDXApp.selectBookingProvider(${p.provider_id})">
                        <img src="${p.avatar_url || "/assets/provider-lan.jpg"}" onerror="this.onerror=null; this.src='/assets/provider-lan.jpg';" alt="${p.full_name}" class="v3-wiz-prov-avatar">
                        <div class="v3-wiz-prov-info">
                          <div class="v3-wiz-prov-name">
                            ${p.full_name} &middot; <span class="num">&#9733; ${Number(p.average_rating || 5).toFixed(2)} (${p.total_reviews || 42} đánh giá)</span>
                          </div>
                          <div class="v3-wiz-prov-meta">
                            Cách bạn ~${distKm} km &middot; ${companyLabel} &middot;
                            <button type="button" class="v3-prov-expand-btn" style="font-size:12.5px;" onclick="event.stopPropagation(); GDXApp.openModal('1.7', {providerId: ${p.provider_id}})">
                              Xem hồ sơ
                            </button>
                          </div>
                        </div>
                        <span class="v3-wiz-prov-pick ${isSelected ? "is-selected" : ""}">
                          ${isSelected ? "&#10003; Đã chọn" : "Chọn thợ"}
                        </span>
                      </div>`;
                      })
                      .join("")
                  : `<div class="panel-subtle" style="text-align:center; padding:20px;">
                      Chưa có thợ phù hợp bộ lọc. Bạn có thể chuyển sang <strong>Rải đơn nhanh</strong> để hệ thống tự điều phối.
                    </div>`
              }
            </div>`
              : `
            <div class="v3-wiz-prov-card is-selected" style="cursor:pointer;" onclick="GDXApp.setWizardProviderMode('direct')">
              <div class="v3-kyc-avatar" style="width:52px; height:52px; font-size:20px;" aria-hidden="true">&#9889;</div>
              <div class="v3-wiz-prov-info">
                <div class="v3-wiz-prov-name">Rải đơn toàn mạng lưới thợ quanh bạn</div>
                <div class="v3-wiz-prov-meta">Hệ thống tự động gửi thông báo tới tất cả thợ xác minh gần nhất · Bấm nếu muốn tự chọn thợ cụ thể</div>
              </div>
              <span class="v3-wiz-prov-pick is-selected">&#10003; Khuyên dùng</span>
            </div>`
          }
        </div>
      </div>

      <!-- Right Sticky Summary Card (Figma 1.2 1:1) -->
      <aside class="v3-wiz-summary">
        <h2 class="v3-wiz-sum-title">Tóm tắt đơn đặt lịch</h2>

        <div class="v3-wiz-sum-detail">
          <div class="v3-wiz-sum-svc">
            ${svc.title}${svc.pricing_type === "hourly" ? ` (${state.bookingHours} giờ)` : ""}
          </div>
          <div id="bookingSummaryLocation" class="v3-wiz-sum-line num">
            ${formatDateTime(selectedTime)} &middot; ${currentBookingWard ? currentBookingWard.name : ""}
          </div>
          <div class="v3-wiz-sum-line">
            Thợ: ${
              state.wizardProviderMode === "direct" && selectedProv
                ? `${selectedProv.full_name} (&#9733; ${Number(selectedProv.average_rating || 5).toFixed(2)})`
                : "Điều phối tự động (Rải đơn)"
            }
          </div>
        </div>

        <div class="v3-wiz-sum-total num">${formatMoney(totalAmount)}</div>

        <button type="button" class="v3-wiz-submit-btn" onclick="GDXApp.submitNewBooking()">
          Hoàn tất &amp; Đặt lịch hẹn &rarr;
        </button>
        <p id="bookingSubmitStatus" class="booking-submit-status" role="status" aria-live="polite"></p>
      </aside>
    </div>
  </div>
`;
}

export function setWizardCategory(catId) {
  state.wizardCategory = catId;
  const db = window.GDX_DB;
  const activeServices = (db.services || []).filter((s) => {
    if (!s.is_active) return false;
    const t = (s.title || "").toLowerCase();
    if (
      t.includes("repair") ||
      t.includes("sửa") ||
      t.includes("appliance")
    )
      return false;
    return true;
  });
  const match = activeServices.find((s) =>
    catId === "2" ? isCookingService(s) : !isCookingService(s),
  );
  if (match) {
    state.selectedServiceId = match.service_id;
  }
  go("1.2");
}

export function setWizardProviderMode(mode) {
  state.wizardProviderMode = mode;
  if (mode === "broadcast") {
    state.selectedProviderId = null;
  }
  go("1.2");
}

export function setDirectProviderSearch(val) {
  state.directProviderSearch = val || "";
  const activeId = document.activeElement && document.activeElement.id;
  go("1.2");
  if (activeId === "directProviderSearchInput") {
    const inp = document.getElementById("directProviderSearchInput");
    if (inp) {
      inp.focus();
      const len = inp.value.length;
      inp.setSelectionRange(len, len);
    }
  }
}

export function setDirectProviderCompanyFilter(companyId) {
  state.directProviderCompanyId = companyId || "all";
  go("1.2");
}

export function setBookingHours(h) {
  state.bookingHours = h;
  go("1.2");
}

export function selectBookingProvider(providerId) {
  state.wizardProviderMode = "direct";
  state.selectedProviderId = providerId;
  go("1.2");
}

export function updateBookingSubmitStatus(message, status) {
  const statusEl = document.getElementById("bookingSubmitStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.status = status;
}

export async function submitNewBooking() {
  const db = window.GDX_DB;

  // Check auth in Cold Start / Production mode
  if (!state.activeUserId) {
    showToast("Vui lòng đăng ký hoặc đăng nhập để tiếp tục đặt lịch.");
    switchPortal(0, "0.1");
    return;
  }
  let cust = getActiveCustomerProfile();
  if (!state.activeCustomerId && cust) {
    state.activeCustomerId = cust.customer_id;
  }
  if (!state.activeCustomerId) {
    showToast("Vui lòng hoàn tất thông tin hồ sơ khách hàng trước.");
    go("0.2");
    return;
  }

  const svc = (db.services || []).find(
    (s) =>
      String(s.service_id) === String(state.selectedServiceId) &&
      s.is_active,
  );
  if (!svc) {
    showToast("Vui lòng chọn một dịch vụ hợp lệ.");
    return;
  }
  if (!cust || cust.customer_id == null) {
    showToast("Vui lòng hoàn tất thông tin hồ sơ khách hàng trước.");
    go("0.2");
    return;
  }

  const schedEl = document.getElementById("wizScheduledTime");
  const wardEl = document.getElementById("wizWardSelect");
  const addrEl = document.getElementById("wizAddress");
  const notesEl = document.getElementById("wizNotes");
  const latEl = document.getElementById("wizLat");
  const lngEl = document.getElementById("wizLng");

  const addressVal = addrEl ? addrEl.value.trim() : "";
  if (!addressVal) {
    showToast(
      "Vui lòng lưu địa chỉ mặc định trong hồ sơ trước khi đặt lịch.",
    );
    go("1.5");
    return;
  }

  const schedRaw = schedEl && schedEl.value ? schedEl.value : "";
  const schedMs = schedRaw ? Date.parse(schedRaw) : NaN;
  if (!Number.isFinite(schedMs) || schedMs < Date.now() - 5 * 60 * 1000) {
    showToast(
      "Thời gian hẹn phải từ hiện tại trở đi (không thể đặt lịch trong quá khứ).",
    );
    if (schedEl) schedEl.focus();
    return;
  }

  const totalAmount = Number(
    svc.pricing_type === "hourly"
      ? svc.price * state.bookingHours
      : svc.price,
  );
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    showToast("Giá dịch vụ hiện không hợp lệ. Vui lòng chọn dịch vụ khác.");
    return;
  }

  const chosenLat =
    latEl && latEl.value
      ? Number(latEl.value)
      : cust && cust.latitude
        ? Number(cust.latitude)
        : 10.741205;
  const chosenLng =
    lngEl && lngEl.value
      ? Number(lngEl.value)
      : cust && cust.longitude
        ? Number(cust.longitude)
        : 106.70211;

  const isBroadcast = state.wizardProviderMode !== "direct";
  const chosenProviderId = isBroadcast ? null : state.selectedProviderId;
  if (
    !isBroadcast &&
    (chosenProviderId == null || chosenProviderId === "")
  ) {
    showToast("Vui lòng chọn thợ hoặc chuyển sang điều phối tự động.");
    return;
  }

  const wardVal = wardEl && wardEl.value ? String(wardEl.value).trim() : "";
  if (!wardVal) {
    showToast("Vui lòng chọn phường/xã trong hồ sơ trước khi đặt lịch.");
    go("1.5");
    return;
  }

  const newBooking = {
    customer_id: cust.customer_id,
    provider_id: chosenProviderId,
    service_id: svc.service_id,
    scheduled_time: new Date(schedMs).toISOString(),
    total_amount: totalAmount,
    address: addressVal,
    ward_id: wardVal,
    latitude: chosenLat,
    longitude: chosenLng,
    notes: notesEl ? notesEl.value.trim() : "",
    changed_by: state.activeUserId || null,
  };

  const submitBtn = document.querySelector(".v3-wiz-submit-btn");
  const originalButtonText = submitBtn ? submitBtn.innerHTML : "";
  updateBookingSubmitStatus("Đang gửi yêu cầu đặt lịch...", "loading");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.setAttribute("aria-busy", "true");
    submitBtn.textContent = "Đang gửi yêu cầu...";
  }

  let res;
  try {
    res = await apiRequest("/api/bookings", {
      method: "POST",
      body: JSON.stringify(newBooking),
    });
    if (
      !res ||
      res.ok !== true ||
      !res.booking ||
      res.booking.booking_id == null
    ) {
      const message =
        (res && res.error) ||
        "Máy chủ chưa xác nhận tạo đơn. Vui lòng thử lại.";
      updateBookingSubmitStatus(message, "error");
      showToast(message);
      return;
    }
  } catch (err) {
    const message = err.message || "Không thể kết nối máy chủ để tạo đơn.";
    updateBookingSubmitStatus(message, "error");
    showToast(message);
    return;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute("aria-busy");
      submitBtn.innerHTML = originalButtonText;
    }
  }

  const realBooking = res.booking;
  db.bookings = db.bookings || [];
  db.bookings.unshift(realBooking);

  db.booking_status_history = db.booking_status_history || [];
  const nowIso = new Date().toISOString();
  const actorId =
    state.activeUserId || "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  db.booking_status_history.unshift({
    history_id: Date.now(),
    booking_id: realBooking.booking_id,
    previous_status: null,
    old_status: null,
    new_status: "pending",
    changed_by: actorId,
    reason: "Khách hàng tạo lịch hẹn mới từ giao diện đặt lịch",
    created_at: nowIso,
    changed_at: nowIso,
  });

  state.selectedBookingId = realBooking.booking_id;
  if (isBroadcast) {
    showToast(
      `Đã phát đơn #${realBooking.booking_id} tới Hòm thư nhận việc của tất cả thợ trong khu vực!`,
    );
  } else {
    showToast(
      `Đã tạo đơn #${realBooking.booking_id} và gửi thông báo trực tiếp tới Đối tác thợ!`,
    );
  }
  go("1.3", { bookingId: realBooking.booking_id });
}

// 1.3: Theo dõi đơn hàng trực tiếp (Live Tracking)
export function renderScreen_1_3(container, params = {}) {
  const db = window.GDX_DB;
  if (params.bookingId) state.selectedBookingId = Number(params.bookingId);

  const custBookings = (db.bookings || []).filter(
    (b) => b.customer_id === state.activeCustomerId,
  );
  const bk =
    (db.bookings || []).find(
      (b) => b.booking_id === state.selectedBookingId,
    ) ||
    custBookings[0] ||
    (db.bookings || [])[0];

  if (!bk) {
    container.innerHTML = `
    <div class="screen-header">
      <div>
        <h1 class="screen-title">1.3. Theo dõi tiến độ ca làm việc</h1>
        <p class="screen-finding">Bảng: bookings, booking_status_history, provider_public_profiles.</p>
      </div>
    </div>
    <div class="empty-state-card" style="padding: 48px 24px;">
      <h2 class="panel-title" style="margin-bottom: 8px;">Bạn chưa có đơn đặt lịch nào</h2>
      <p class="field-hint" style="max-width: 480px; margin: 0 auto 20px auto;">
        Tiến độ và vị trí của Đối tác Thợ sẽ được hiển thị trực tiếp tại đây sau khi bạn hoàn tất tạo đơn đặt lịch đầu tiên.
      </p>
      <button type="button" class="primary-btn" onclick="GDXApp.go('1.2')">
        Đặt lịch dịch vụ ngay &rarr;
      </button>
    </div>
  `;
    return;
  }

  const svc = (db.services || []).find(
    (s) => s.service_id === bk.service_id,
  );
  const prov = (db.provider_public_profiles || []).find(
    (p) => p.provider_id === bk.provider_id,
  );
  const fullProv = (db.provider_profiles || []).find(
    (p) => p.provider_id === bk.provider_id,
  );
  const history = (db.booking_status_history || []).filter(
    (h) => h.booking_id === bk.booking_id,
  );
  const distKm =
    fullProv && bk.latitude
      ? calcDistanceKm(
          bk.latitude,
          bk.longitude,
          fullProv.lattitude,
          fullProv.longtitude,
        )
      : "0";

  const statusOrder = ["pending", "confirmed", "in_progress", "completed"];
  const currentStepIdx = statusOrder.indexOf(bk.status);

  const statusMetaMap = {
    pending: {
      pillClass: "is-pending",
      label: "Chờ xác nhận",
      headline: "Đang tìm thợ phù hợp gần bạn",
    },
    confirmed: {
      pillClass: "is-confirmed",
      label: "Đã nhận lịch",
      headline: "Thợ đã nhận lịch & đang di chuyển",
    },
    in_progress: {
      pillClass: "is-progress",
      label: "Đang thực hiện",
      headline: "Thợ đang làm việc tại nhà bạn",
    },
    completed: {
      pillClass: "is-completed",
      label: "Hoàn thành",
      headline: "Ca dịch vụ đã hoàn tất",
    },
    cancelled: {
      pillClass: "is-cancelled",
      label: "Đã hủy",
      headline: "Lịch hẹn đã được hủy",
    },
  };
  const statusMeta = statusMetaMap[bk.status] || statusMetaMap.pending;

  const getStepTime = (targetStatus, fallbackTime) => {
    const match = history.find((h) => h.new_status === targetStatus);
    const raw = match && (match.changed_at || match.created_at);
    if (!raw) return fallbackTime;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return fallbackTime;
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const scheduledDate = bk.scheduled_time
    ? new Date(bk.scheduled_time)
    : null;
  const endTimeStr =
    scheduledDate && !Number.isNaN(scheduledDate.getTime())
      ? new Date(
          scheduledDate.getTime() + 2 * 3600 * 1000,
        ).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "11:00";

  const timelineSteps = [
    {
      title: "Đã nhận việc",
      time: getStepTime("confirmed", "08:40"),
      state:
        currentStepIdx >= 1
          ? "is-done"
          : currentStepIdx === 0
            ? "is-current"
            : "is-upcoming",
    },
    {
      title: "Đã đến địa điểm",
      time: getStepTime("confirmed", "08:55"),
      state:
        currentStepIdx >= 2
          ? "is-done"
          : currentStepIdx === 1
            ? "is-current"
            : "is-upcoming",
    },
    {
      title:
        bk.status === "in_progress"
          ? `Đang thực hiện (${formatTimer(state.liveTimerSeconds || state.timerSeconds || 4365)})`
          : "Đang thực hiện",
      time: getStepTime("in_progress", "09:02"),
      state:
        currentStepIdx > 2
          ? "is-done"
          : currentStepIdx === 2
            ? "is-current"
            : "is-upcoming",
    },
    {
      title: "Nghiệm thu & Đánh giá",
      time: getStepTime("completed", endTimeStr),
      state: currentStepIdx === 3 ? "is-done" : "is-upcoming",
    },
  ];

  const stepIcon = (st) => {
    if (st === "is-done") return "&#10003;";
    if (st === "is-current") return "&#9679;";
    return "&#9675;";
  };

  const distNum = parseFloat(distKm);
  const distLabel = !prov
    ? "Đang định vị thợ gần bạn"
    : Number.isFinite(distNum) && distNum <= 0.05
      ? "Cách 0m (Tại nhà)"
      : `Cách ${distKm} km`;

  const provName = prov ? prov.full_name : "Đang điều phối thợ";
  const provPhone =
    (prov && prov.phone) || (fullProv && fullProv.phone) || "0912 345 678";
  const totalPay = (bk.total_amount || 0) + (bk.total_incidental || 0);
  const showPayPrimary =
    bk.payment_status === "unpaid" &&
    bk.status !== "cancelled" &&
    bk.status !== "completed";

  container.innerHTML = `
  <div class="v3-tracking-stage">
    <!-- Subtle Map Roads & Grid Layer -->
    <div class="v3-tracking-map-grid" aria-hidden="true"></div>

    <!-- Top-Right Compact Controls (Booking Switcher + Details Drawer Toggle) -->
    <div class="v3-track-top-controls">
      ${
        custBookings.length > 1
          ? `<select class="v3-track-select" onchange="GDXApp.go('1.3', {bookingId: Number(this.value)})" aria-label="Chọn đơn hàng cần xem">
              ${custBookings
                .map((b) => {
                  const s = db.services.find(
                    (x) => x.service_id === b.service_id,
                  );
                  return `<option value="${b.booking_id}" ${b.booking_id === bk.booking_id ? "selected" : ""}>#${shortCode(b.booking_id)} · ${s ? s.title : ""}</option>`;
                })
                .join("")}
            </select>`
          : ""
      }
      <button type="button" class="v3-track-chip-btn" onclick="document.getElementById('v3TrackDetailsDrawer').classList.toggle('is-open')">
        Chi tiết đơn &amp; Hóa đơn
      </button>
      <button type="button" class="v3-track-chip-btn" onclick="GDXApp.go('1.4')">
        Lịch hẹn
      </button>
    </div>

    <!-- Left Floating White Card (Figma 1.3 1:1) -->
    <aside class="v3-tracking-card" aria-label="Tiến độ ca dịch vụ">
      <div class="v3-track-status-pill ${statusMeta.pillClass}">
        <span class="v3-track-status-dot"></span>
        <span>${statusMeta.label} &middot; #${shortCode(bk.booking_id)}</span>
      </div>

      <h1 class="v3-track-headline">${statusMeta.headline}</h1>

      <div class="v3-track-steps" role="list">
        ${timelineSteps
          .map(
            (step) => `
          <div class="v3-track-step ${step.state}" role="listitem">
            <span class="v3-track-step-icon" aria-hidden="true">${stepIcon(step.state)}</span>
            <span class="v3-track-step-text">${step.time} &middot; ${step.title}</span>
          </div>`,
          )
          .join("")}
      </div>

      <div class="v3-track-provider-card" ${prov ? `onclick="GDXApp.openModal('1.7', {providerId: ${prov.provider_id}})" role="button" tabindex="0"` : ""}>
        <img src="${prov ? prov.avatar_url : "/assets/provider-lan.jpg"}" alt="${provName}" class="v3-track-provider-avatar">
        <div class="v3-track-provider-info">
          <div class="v3-track-provider-name">${provName}</div>
          <div class="v3-track-provider-meta">
            ${
              prov
                ? `<span class="v3-track-star">&#9733;</span> <span class="num">${prov.average_rating}</span> &middot; <span class="num">${provPhone}</span>`
                : "Hệ thống đang gửi thông báo tới thợ trong khu vực"
            }
          </div>
        </div>
      </div>

      <div class="v3-track-actions">
        ${
          showPayPrimary
            ? `<button type="button" class="v3-track-btn-primary" onclick="GDXApp.openModal('1.8', {bookingId: ${bk.booking_id}})">
                Thanh toán (${formatMoney(totalPay)})
              </button>`
            : `<button type="button" class="v3-track-btn-primary" onclick="GDXApp.openModal('1.9', {bookingId: ${bk.booking_id}})">
                Đánh giá sau ca
              </button>`
        }
        <button type="button" class="v3-track-btn-danger" onclick="GDXApp.openModal('1.11', {bookingId: ${bk.booking_id}})">
          Hỗ trợ / Sự cố
        </button>
      </div>

      ${
        bk.status === "pending" || bk.status === "confirmed"
          ? `<button type="button" class="v3-track-cancel-link" onclick="GDXApp.openModal('1.10', {bookingId: ${bk.booking_id}})">
              Yêu cầu hủy lịch hẹn này
            </button>`
          : ""
      }
    </aside>

    <!-- Map Floating Provider Pin -->
    <div class="v3-track-map-pin-wrap">
      <div class="v3-track-map-pulse" aria-hidden="true"></div>
      <div class="v3-track-map-pin">
        <span class="v3-track-pin-dot" aria-hidden="true">&#128205;</span>
        <span>${provName} &middot; ${distLabel}</span>
      </div>
      <div class="v3-track-map-address">${bk.address}</div>
    </div>

    <!-- Collapsible Invoice & Status History Drawer -->
    <div id="v3TrackDetailsDrawer" class="v3-track-details-drawer">
      <div class="v3-track-drawer-head">
        <strong>Chi tiết hóa đơn &amp; Nhật ký (#${shortCode(bk.booking_id)})</strong>
        <button type="button" class="v3-track-drawer-close" onclick="document.getElementById('v3TrackDetailsDrawer').classList.remove('is-open')" aria-label="Đóng">&times;</button>
      </div>
      <div class="v3-track-drawer-body">
        <div class="slip-row">
          <span class="field-hint">Gói dịch vụ</span>
          <span class="slip-dots"></span>
          <strong>${svc ? svc.title : ""}</strong>
        </div>
        <div class="slip-row">
          <span class="field-hint">Phí cơ bản</span>
          <span class="slip-dots"></span>
          <strong class="num">${formatMoney(bk.total_amount)}</strong>
        </div>
        <div class="slip-row">
          <span class="field-hint">Phát sinh</span>
          <span class="slip-dots"></span>
          <strong class="num">${formatMoney(bk.total_incidental)}</strong>
        </div>
        <div class="slip-total" style="margin-top:8px;">
          <strong>Tổng thanh toán</strong>
          <span class="slip-total-price num">${formatMoney(totalPay)}</span>
        </div>
        <div style="margin-top:14px; font-weight:600; font-size:13px;">Nhật ký trạng thái</div>
        <div class="audit-timeline" style="margin-top:8px; max-height:180px; overflow:auto;">
          ${history
            .map(
              (h) => `
            <div class="audit-item">
              <div style="display:flex; justify-content:space-between; gap:8px;">
                <strong>${h.old_status || h.previous_status ? `${h.old_status || h.previous_status} &rarr; ${h.new_status}` : `Khởi tạo (${h.new_status})`}</strong>
                <span class="field-hint num">${formatDateTime(h.changed_at || h.created_at)}</span>
              </div>
              <div class="field-hint">${h.reason || "Cập nhật trạng thái lịch hẹn"}</div>
            </div>`,
            )
            .join("")}
        </div>
      </div>
    </div>
  </div>
`;
}

// 1.4: Quản lý lịch hẹn dịch vụ
export function renderScreen_1_4(container) {
  const db = window.GDX_DB;
  const allBookings = (db.bookings || []).filter(
    (b) => b.customer_id === state.activeCustomerId,
  );
  const activeCount = allBookings.filter(
    (b) => b.status === "in_progress" || b.status === "confirmed",
  ).length;
  const pendingCount = allBookings.filter(
    (b) => b.status === "pending",
  ).length;
  const completedCount = allBookings.filter(
    (b) => b.status === "completed",
  ).length;
  const cancelledCount = allBookings.filter(
    (b) => b.status === "cancelled",
  ).length;

  const filtered = allBookings.filter((b) => {
    if (state.bookingListFilter === "all") return true;
    if (state.bookingListFilter === "in_progress") {
      return b.status === "in_progress" || b.status === "confirmed";
    }
    return b.status === state.bookingListFilter;
  });

  const getPillMeta = (status) => {
    switch (status) {
      case "in_progress":
        return { cls: "is-progress", dot: "●", text: "Đang thực hiện" };
      case "confirmed":
        return { cls: "is-progress", dot: "●", text: "Đã nhận lịch" };
      case "pending":
        return { cls: "is-pending", dot: "●", text: "Chờ xác nhận" };
      case "completed":
        return { cls: "is-completed", dot: "✓", text: "Hoàn thành" };
      case "cancelled":
        return { cls: "is-cancelled", dot: "✕", text: "Đã hủy" };
      default:
        return { cls: "is-pending", dot: "●", text: status };
    }
  };

  const getPrimaryAction = (b, existingReview) => {
    if (b.status === "in_progress" || b.status === "confirmed") {
      return {
        label: "Theo dõi ca &rarr;",
        onclick: `GDXApp.go('1.3', {bookingId: ${b.booking_id}})`,
      };
    }
    if (b.status === "pending") {
      if (b.payment_status === "unpaid") {
        return {
          label: "Thanh toán &rarr;",
          onclick: `GDXApp.openModal('1.8', {bookingId: ${b.booking_id}})`,
        };
      }
      return {
        label: "Hủy lịch",
        onclick: `GDXApp.openModal('1.10', {bookingId: ${b.booking_id}})`,
      };
    }
    if (b.status === "completed" && !existingReview) {
      return {
        label: "Đánh giá &#9733;",
        onclick: `GDXApp.openModal('1.9', {bookingId: ${b.booking_id}})`,
      };
    }
    return {
      label: "Đặt lại",
      onclick: `GDXApp.go('1.2', {serviceId: ${b.service_id}})`,
    };
  };

  container.innerHTML = `
  <div class="v3-appointments-page">
    <div class="v3-appointments-header">
      <h1 class="v3-appointments-title">Lịch hẹn dịch vụ của bạn</h1>
      <button type="button" class="v3-appointments-new-btn" onclick="GDXApp.go('1.2', {serviceId: 301})">
        + Đặt lịch mới
      </button>
    </div>

    <div class="v3-appointments-filters" role="tablist" aria-label="Lọc lịch hẹn">
      <button type="button" class="v3-appt-filter-pill ${state.bookingListFilter === "all" ? "is-active" : ""}" onclick="GDXApp.setBookingListFilter('all')">
        Tất cả (${allBookings.length})
      </button>
      <button type="button" class="v3-appt-filter-pill ${state.bookingListFilter === "in_progress" ? "is-active" : ""}" onclick="GDXApp.setBookingListFilter('in_progress')">
        Đang làm (${activeCount})
      </button>
      ${
        pendingCount > 0
          ? `<button type="button" class="v3-appt-filter-pill ${state.bookingListFilter === "pending" ? "is-active" : ""}" onclick="GDXApp.setBookingListFilter('pending')">
              Chờ xác nhận (${pendingCount})
            </button>`
          : ""
      }
      <button type="button" class="v3-appt-filter-pill ${state.bookingListFilter === "completed" ? "is-active" : ""}" onclick="GDXApp.setBookingListFilter('completed')">
        Hoàn thành (${completedCount})
      </button>
      ${
        cancelledCount > 0
          ? `<button type="button" class="v3-appt-filter-pill ${state.bookingListFilter === "cancelled" ? "is-active" : ""}" onclick="GDXApp.setBookingListFilter('cancelled')">
              Đã hủy (${cancelledCount})
            </button>`
          : ""
      }
    </div>

    <div class="v3-appointments-list">
      ${
        filtered.length === 0
          ? `
          <div class="panel empty-state-card" style="text-align:center; padding:48px 24px; border-radius:20px;">
            <h3 style="margin-bottom:8px;">${allBookings.length === 0 ? "Bạn chưa có lịch hẹn dịch vụ nào" : "Không có lịch hẹn phù hợp bộ lọc"}</h3>
            <p class="field-hint" style="max-width:440px; margin:0 auto 20px;">
              ${
                allBookings.length === 0
                  ? "Hãy khám phá danh mục dịch vụ Gia Đình Xanh và đặt lịch hẹn đầu tiên của bạn."
                  : 'Thử chuyển sang bộ lọc "Tất cả" để xem toàn bộ lịch hẹn.'
              }
            </p>
            <button type="button" class="v3-appointments-new-btn" onclick="GDXApp.go('1.1')">
              Khám phá dịch vụ ngay
            </button>
          </div>
          `
          : filtered
              .map((b) => {
                const svc = (db.services || []).find(
                  (s) => s.service_id === b.service_id,
                );
                const prov = (db.provider_public_profiles || []).find(
                  (p) => p.provider_id === b.provider_id,
                );
                const existingReview = (db.reviews || []).find(
                  (r) => r.booking_id === b.booking_id,
                );
                const pill = getPillMeta(b.status);
                const action = getPrimaryAction(b, existingReview);

                return `
          <article class="v3-booking-row">
            <img
              src="${svc ? svc.image_url : "/assets/service-cleaning.jpg"}"
              alt="${svc ? svc.title : "Dịch vụ"}"
              class="v3-booking-thumb"
              onclick="GDXApp.go('1.3', {bookingId: ${b.booking_id}})"
            >
            <div class="v3-booking-info" onclick="GDXApp.go('1.3', {bookingId: ${b.booking_id}})">
              <div class="v3-booking-title">
                <span class="num">#${shortCode(b.booking_id)}</span> &middot; ${svc ? svc.title : "Dịch vụ"}
              </div>
              <div class="v3-booking-meta">
                <span class="num">${formatDateTime(b.scheduled_time)}</span> &middot;
                Thợ: ${prov ? `${prov.full_name} (&#9733; ${prov.average_rating})` : "Đang tìm thợ"}
              </div>
            </div>

            <div class="v3-booking-status-col">
              <span class="v3-booking-pill ${pill.cls}">
                <span class="v3-booking-pill-icon" aria-hidden="true">${pill.dot}</span>
                <span>${pill.text}</span>
              </span>
            </div>

            <div class="v3-booking-action-col">
              <button type="button" class="v3-booking-action-btn" onclick="${action.onclick}">
                ${action.label}
              </button>
            </div>
          </article>`;
              })
              .join("")
      }
    </div>
  </div>
`;
}

export function setBookingListFilter(filter) {
  state.bookingListFilter = filter;
  go("1.4");
}

// 1.5: Hồ sơ cá nhân & Sổ địa chỉ
export function renderScreen_1_5(container) {
  const db = window.GDX_DB;
  const u = (db.users || []).find(
    (x) => x.user_id === state.activeUserId,
  ) ||
    (db.users && db.users[1]) || {
      full_name: "Khách hàng mới",
      phone_number: "",
      email: "",
      user_id: state.activeUserId || "guest",
    };
  const cust = (db.customer_profiles || []).find(
    (c) => c.customer_id === state.activeCustomerId,
  ) ||
    (db.customer_profiles && db.customer_profiles[0]) || {
      customer_id: state.activeCustomerId || 0,
      default_address: "",
      ward_id: (db.ward && db.ward[0] && db.ward[0].ward_id) || "70101063",
      latitude: 10.7769,
      longitude: 106.7009,
    };
  const provinces = db.province || db.provinces || [];
  const allWards = db.ward || db.wards || [];
  const currentWard = allWards.find(
    (w) => String(w.ward_id) === String(cust.ward_id),
  );
  const currentProvId = currentWard
    ? String(currentWard.provinceId)
    : provinces.find((p) => p.provinceId === "29" || p.provinceId === "79")
        ?.provinceId || "29";
  const wardsForProv = allWards.filter(
    (w) => !w.provinceId || String(w.provinceId) === String(currentProvId),
  );
  const wardsToRender =
    wardsForProv.length > 0 ? wardsForProv : allWards.slice(0, 100);
  const savedAddrs = (db.customer_addresses || []).filter(
    (a) => Number(a.customer_id) === cust.customer_id,
  );
  const totalPinned = (cust.default_address ? 1 : 0) + savedAddrs.length;
  const pinnedLabel = cust.default_address || "14 Nội Khu Cảnh Đồi, Q.7";

  container.innerHTML = `
  <div class="v3-profile-page">
    <h1 class="v3-profile-page-title">Hồ sơ cá nhân &amp; Sổ địa chỉ</h1>

    <form class="v3-profile-grid" onsubmit="event.preventDefault(); GDXApp.saveCustomerProfile(this);">
      <!-- Left Card: Profile Info (Figma 1.5 1:1) -->
      <section class="v3-profile-card">
        <div class="v3-profile-identity">
          <img src="${u.avatar_url || "/assets/provider-lan.jpg"}" alt="${u.full_name || "Khách hàng"}" class="v3-profile-avatar">
          <div>
            <div class="v3-profile-name">${u.full_name || "Nguyễn Minh Thảo"}</div>
            <span class="v3-profile-tier-pill">Khách hàng thân thiết</span>
          </div>
        </div>

        <div class="v3-profile-fields">
          <div class="v3-profile-field">
            <label for="profFullName">Họ và tên</label>
            <input type="text" id="profFullName" name="full_name" class="v3-profile-input" value="${u.full_name || ""}" required>
          </div>
          <div class="v3-profile-field">
            <label for="profPhone">Số điện thoại</label>
            <input type="tel" id="profPhone" name="phone_number" class="v3-profile-input num" value="${u.phone_number || ""}" required pattern="0[0-9]{9,10}">
          </div>
          <div class="v3-profile-field">
            <label for="profEmail">Email</label>
            <input type="email" id="profEmail" name="email" class="v3-profile-input" value="${u.email || "minhthao@giadinhxanh.vn"}">
          </div>
        </div>

        <button type="submit" class="v3-profile-save-btn">
          Lưu thông tin cá nhân
        </button>
      </section>

      <!-- Right Card: Pinned Address Book & Map (Figma 1.5 1:1) -->
      <section class="v3-address-card">
        <div class="v3-address-card-head">
          <h2 class="v3-address-card-title">Sổ địa chỉ đã ghim (${totalPinned})</h2>
          <button type="button" class="v3-address-add-btn" onclick="GDXApp.openAddAddressModal()">
            + Thêm địa chỉ
          </button>
        </div>

        <div class="v3-address-pill-list">
          <div class="v3-address-pill is-default" onclick="document.getElementById('v3PinnedMapLabel').textContent = ${JSON.stringify(pinnedLabel)}">
            <span class="v3-address-pill-text">&#127968; Nhà riêng (Mặc định) &mdash; ${pinnedLabel}</span>
          </div>
          ${savedAddrs
            .map(
              (a) => `
            <div class="v3-address-pill ${a.is_default ? "is-default" : ""}" onclick="document.getElementById('v3PinnedMapLabel').textContent = ${JSON.stringify(a.street_address)}">
              <span class="v3-address-pill-text">&#128205; ${a.tag} &mdash; ${a.street_address}</span>
              <span class="v3-address-pill-actions" onclick="event.stopPropagation()">
                ${!a.is_default ? `<button type="button" class="v3-addr-mini-btn" onclick="GDXApp.setDefaultCustomerAddress('${a.address_id}')">Mặc định</button>` : ""}
                <button type="button" class="v3-addr-mini-btn is-del" onclick="GDXApp.deleteCustomerAddress('${a.address_id}')">Xóa</button>
              </span>
            </div>`,
            )
            .join("")}
        </div>

        <!-- Sage-Green Map Preview (matching Figma 1.5) -->
        <div class="v3-address-map-box">
          <div class="v3-tracking-map-grid" aria-hidden="true"></div>
          <button type="button" class="v3-address-gps-toggle" onclick="const p = document.getElementById('v3ProfileGpsPanel'); p.classList.toggle('is-open'); if (p.classList.contains('is-open')) { window.dispatchEvent(new Event('resize')); }">
            Chỉnh sửa GPS &amp; Phường/Xã
          </button>
          <div class="v3-track-map-pin">
            <span aria-hidden="true">&#128205;</span>
            <span id="v3PinnedMapLabel">${pinnedLabel}</span>
          </div>
        </div>

        <!-- Expandable GPS & Ward Editor (preserves all backend fields & Leaflet picker) -->
        <div id="v3ProfileGpsPanel" class="v3-address-gps-panel">
          <div class="form-row-2">
            <div class="field-group">
              <label class="field-label" for="profProv">Tỉnh / Thành phố</label>
              <select id="profProv" class="select" onchange="GDXApp.handleProvinceChange('profProv', 'profWard')">
                ${provinces.map((p) => `<option value="${p.provinceId}" ${String(p.provinceId) === String(currentProvId) ? "selected" : ""}>${p.name}</option>`).join("")}
              </select>
            </div>
            <div class="field-group">
              <label class="field-label" for="profWard">Phường / Xã mặc định</label>
              <select id="profWard" name="ward_id" class="select" required>
                ${wardsToRender.map((w) => `<option value="${w.ward_id}" ${String(w.ward_id) === String(cust.ward_id) ? "selected" : ""}>${w.name}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="field-group">
            <label class="field-label" for="profAddress">Địa chỉ mặc định</label>
            <input type="text" id="profAddress" name="default_address" class="input" value="${cust.default_address || ""}" required>
          </div>
          <div class="geo-map-card">
            <div id="customerProfileMap" class="geo-map-container" style="height:220px;" tabindex="0"></div>
            <div class="geo-map-footer">
              <div>
                <span>Tọa độ:</span>
                <span id="profCoordText" class="geo-coords-tag">${cust.latitude || 10.7769}, ${cust.longitude || 106.7009}</span>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="GDXApp.locateUserGPS('profLat', 'profLng', 'profCoordText', 'profAddress', 'profProv', 'profWard')">
                ${Icons.pin()} Định vị GPS
              </button>
            </div>
          </div>
          <div class="form-row-2">
            <div class="field-group">
              <label class="field-label" for="profLat">Vĩ độ (latitude)</label>
              <input type="number" step="0.000001" id="profLat" name="latitude" class="input num" value="${cust.latitude || 10.7769}" required>
            </div>
            <div class="field-group">
              <label class="field-label" for="profLng">Kinh độ (longitude)</label>
              <input type="number" step="0.000001" id="profLng" name="longitude" class="input num" value="${cust.longitude || 106.7009}" required>
            </div>
          </div>
        </div>
      </section>
    </form>
  </div>
`;

  // Khởi tạo bản đồ tương tác cho màn hình hồ sơ
  initCustomerLocationPicker({
    containerId: "customerProfileMap",
    lat: Number(cust.latitude || 10.7769),
    lng: Number(cust.longitude || 106.7009),
    zoom: 15,
    latInputId: "profLat",
    lngInputId: "profLng",
    coordTextId: "profCoordText",
    addrInputId: "profAddress",
    provSelectId: "profProv",
    wardSelectId: "profWard",
  });
}

export async function saveCustomerProfile(form) {
  const u = (window.GDX_DB.users || []).find(
    (x) => String(x.user_id) === String(state.activeUserId),
  );
  let cust = getActiveCustomerProfile();
  const wardId = form.ward_id.value;
  const defaultAddress = form.default_address.value.trim();
  const lat = Number(form.latitude.value);
  const lng = Number(form.longitude.value);

  if (u) {
    u.full_name = form.full_name.value.trim();
    u.phone_number = form.phone_number.value.trim();
  }
  if (cust) {
    cust.ward_id = wardId;
    cust.default_address = defaultAddress;
    cust.latitude = lat;
    cust.longitude = lng;
  } else {
    cust = {
      customer_id: state.activeCustomerId || 101,
      user_id: state.activeUserId,
      ward_id: wardId,
      default_address: defaultAddress,
      latitude: lat,
      longitude: lng,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    window.GDX_DB.customer_profiles = window.GDX_DB.customer_profiles || [];
    window.GDX_DB.customer_profiles.push(cust);
  }

  // Đồng bộ ngay lập tức vào state.wizardDraft
  state.wizardDraft.ward_id = wardId;
  state.wizardDraft.address = defaultAddress;
  state.wizardDraft.latitude = lat;
  state.wizardDraft.longitude = lng;

  const res = await apiRequest("/api/customer/profile", {
    method: "PUT",
    body: JSON.stringify({
      user_id: state.activeUserId,
      customer_id: state.activeCustomerId || (cust && cust.customer_id),
      full_name: form.full_name.value.trim(),
      phone_number: form.phone_number.value.trim(),
      ward_id: wardId,
      default_address: defaultAddress,
      latitude: lat,
      longitude: lng,
    }),
  });

  if (res && res.customer_profile) {
    if (cust) Object.assign(cust, res.customer_profile);
    state.activeCustomerId = res.customer_profile.customer_id;
    state.bookingAddressSelection = null;
  }

  showToast("Đã cập nhật hồ sơ & địa chỉ mặc định!");
  go("1.5");
}

export function openAddAddressModal() {
  const tag = prompt(
    "Nhập nhãn địa chỉ (VD: Nhà riêng, Văn phòng, Nhà bố mẹ):",
    "Văn phòng",
  );
  if (!tag) return;
  const street = prompt(
    "Nhập địa chỉ chi tiết (Số nhà, tên đường, tòa nhà):",
    "",
  );
  if (!street || !street.trim()) return;
  const cust = getActiveCustomerProfile();
  addCustomerAddress(
    tag.trim(),
    street.trim(),
    cust ? cust.ward_id : "27403",
    false,
  );
}

// 1.6: Danh sách Dịch vụ & Thợ yêu thích (FR-FAV-001)
export function renderScreen_1_6(container) {
  const db = window.GDX_DB;
  const favs = (db.favorites || []).filter(
    (f) => Number(f.customer_id) === state.activeCustomerId,
  );
  const serviceFavs = favs.filter((f) => f.service_id);
  const providerFavs = favs.filter((f) => f.provider_id);

  container.innerHTML = `
  <div class="v3-fav-page">
    <div class="v3-fav-header">
      <h1 class="v3-fav-page-title">Dịch vụ yêu thích của bạn</h1>
      ${
        serviceFavs.length === 0
          ? `<button type="button" class="v3-fav-explore-btn" onclick="GDXApp.go('1.1')">Khám phá dịch vụ &rarr;</button>`
          : ""
      }
    </div>

    ${
      serviceFavs.length === 0 && providerFavs.length === 0
        ? `
      <div class="panel empty-state-card" style="text-align:center; padding:52px 24px; border-radius:20px;">
        <h3 style="margin-bottom:8px;">Bạn chưa lưu dịch vụ yêu thích nào</h3>
        <p class="field-hint" style="max-width:420px; margin:0 auto 20px;">
          Hãy bấm biểu tượng trái tim trên các gói dịch vụ ở trang Khám phá để lưu lại và đặt lại nhanh chóng.
        </p>
        <button type="button" class="v3-fav-rebook-btn" onclick="GDXApp.go('1.1')">
          Khám phá dịch vụ ngay &rarr;
        </button>
      </div>`
        : ""
    }

    ${
      serviceFavs.length > 0
        ? `
      <div class="v3-fav-grid">
        ${serviceFavs
          .map((f) => {
            const s = (db.services || []).find(
              (x) => String(x.service_id) === String(f.service_id),
            );
            if (!s) return "";
            const unitLabel =
              s.pricing_type === "hourly"
                ? "/giờ"
                : s.unit_label
                  ? `/${s.unit_label}`
                  : "/lần";
            return `
              <article class="v3-fav-card">
                <div class="v3-fav-card-media">
                  <img src="${s.image_url || "/assets/service-cleaning.jpg"}" alt="${s.title}">
                  <button type="button" class="v3-fav-saved-pill" onclick="GDXApp.toggleFavorite(${inlineIdentifier(s.service_id)})" title="Bỏ lưu khỏi yêu thích">
                    <span class="v3-fav-heart" aria-hidden="true">&#10084;</span>
                    <span>Đã lưu</span>
                  </button>
                </div>
                <div class="v3-fav-card-body">
                  <h2 class="v3-fav-card-title">${s.title}</h2>
                  <div class="v3-fav-card-footer">
                    <div class="v3-fav-card-price num">${formatMoney(s.price)}<span>${unitLabel}</span></div>
                    <button type="button" class="v3-fav-rebook-btn" onclick="GDXApp.go('1.2', {serviceId: ${inlineIdentifier(s.service_id)}})">
                      Đặt lại &rarr;
                    </button>
                  </div>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>`
        : ""
    }

    ${
      providerFavs.length > 0
        ? `
      <div class="v3-fav-providers-section">
        <h2 class="v3-fav-section-subtitle">Đối tác thợ yêu thích (${providerFavs.length})</h2>
        <div class="v3-fav-grid">
          ${providerFavs
            .map((f) => {
              const p = (db.provider_public_profiles || []).find(
                (x) => Number(x.provider_id) === Number(f.provider_id),
              );
              if (!p) return "";
              return `
                <article class="v3-fav-card">
                  <div style="display:flex; gap:12px; align-items:center; padding:8px 4px;">
                    <img src="${p.avatar_url}" alt="${p.full_name}" class="v3-profile-avatar" style="width:52px; height:52px;">
                    <div>
                      <div class="v3-fav-card-title" style="margin:0;">${p.full_name}</div>
                      <div class="field-hint">&#9733; ${Number(p.average_rating).toFixed(2)} (${p.total_reviews} đánh giá)</div>
                    </div>
                  </div>
                  <div class="v3-fav-card-footer" style="padding:10px 4px 4px;">
                    <button type="button" class="v3-addr-mini-btn is-del" onclick="GDXApp.toggleProviderFavorite(${p.provider_id})">Bỏ lưu</button>
                    <button type="button" class="v3-fav-rebook-btn" onclick="GDXApp.go('1.2', {providerId: ${p.provider_id}})">Đặt lịch &rarr;</button>
                  </div>
                </article>
              `;
            })
            .join("")}
        </div>
      </div>`
        : ""
    }
  </div>
`;
}

