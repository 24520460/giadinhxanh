import { apiRequest, refreshClientPublicProviders } from "../core/api.js";
import { formatDateTime, formatMoney, priorityBadge, shortCode } from "../core/formatters.js";
import { go } from "../core/router.js";
import { state } from "../core/state.js";
import { companyToggleService } from "./company.js";
import { closeModal } from "../shared/modal.js";
import { Icons, showToast } from "../shared/ui-utils.js";

// =====================================================================
// REVIEW MODERATION MODULE (FR-REV-005)
// =====================================================================
export async function moderateReview(reviewId, status, reason = "") {
  const db = window.GDX_DB;
  const rev = (db.reviews || []).find((r) => r.review_id === reviewId);
  if (!rev) return;
  rev.status = status;
  rev.moderation_reason = reason;

  await apiRequest(`/api/admin/reviews/${reviewId}/moderate`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      moderation_reason: reason,
      actor_id: state.activeUserId,
    }),
  });

  showToast(
    status === "hidden"
      ? `Đã ẩn bài đánh giá #${reviewId} (Lý do: ${reason})`
      : `Đã mở lại bài đánh giá #${reviewId}`,
  );
  if (state.currentScreen === "3.4") go("3.4");
}

export function openModerateReviewDialog(reviewId) {
  const reason = prompt(
    "Nhập lý do ẩn nhận xét vi phạm (VD: Ngôn từ không phù hợp, nội dung sai sự thật):",
    "Vi phạm quy tắc cộng đồng",
  );
  if (reason !== null && reason.trim()) {
    moderateReview(reviewId, "hidden", reason.trim());
  }
}

// =====================================================================

// =====================================================================
// SCREEN RENDERERS: PHÂN HỆ 3 (ADMIN PORTAL: 3.1 – 3.4)
// =====================================================================

// 3.1: Tổng quan Vận hành & Điều phối Đơn hàng
export function renderScreen_3_1(container) {
  const db = window.GDX_DB;
  const totalRevenue = db.bookings
    .filter((b) => b.payment_status === "paid")
    .reduce((sum, b) => sum + b.total_amount + b.total_incidental, 0);
  const pendingKycCount = db.provider_profiles.filter(
    (p) => p.verification_status === "pending",
  ).length;
  const openTicketsCount = db.support_tickets.filter(
    (t) => t.status !== "resolved" && t.status !== "closed",
  ).length;

  const filteredBookings =
    state.adminDispatchFilter === "all"
      ? db.bookings
      : db.bookings.filter((b) => b.status === state.adminDispatchFilter);

  const inProgressCount = db.bookings.filter(
    (b) => b.status === "in_progress",
  ).length;
  const pendingCount = db.bookings.filter(
    (b) => b.status === "pending",
  ).length;

  const miniBarsHtml = `
  <div class="v3-kpi-bars" aria-hidden="true">
    <span style="height:10px;"></span>
    <span style="height:16px;"></span>
    <span style="height:22px;"></span>
    <span style="height:28px;"></span>
    <span class="is-peak" style="height:36px;"></span>
  </div>
`;

  const getAdminPill = (status) => {
    switch (status) {
      case "in_progress":
        return { cls: "is-progress", dot: "●", text: "Đang thực hiện" };
      case "confirmed":
        return { cls: "is-progress", dot: "●", text: "Đã nhận việc" };
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

  container.innerHTML = `
  <div class="v3-admin-page">
    <h1 class="v3-admin-title">Trung tâm Điều phối &amp; Vận hành</h1>

    <div class="v3-kpi-grid-4">
      <div class="v3-kpi-card">
        <div>
          <div class="v3-kpi-label">Doanh thu đã thu</div>
          <div class="v3-kpi-value num">${formatMoney(totalRevenue)}</div>
          <div class="v3-kpi-sub">+18% tuần này</div>
        </div>
        ${miniBarsHtml}
      </div>

      <div class="v3-kpi-card">
        <div>
          <div class="v3-kpi-label">Tổng đơn đặt lịch</div>
          <div class="v3-kpi-value num">${db.bookings.length} đơn</div>
          <div class="v3-kpi-sub">${inProgressCount} đang làm &middot; ${pendingCount} chờ</div>
        </div>
        ${miniBarsHtml}
      </div>

      <div class="v3-kpi-card is-clickable" onclick="GDXApp.go('3.3')" title="Đi tới duyệt hồ sơ KYC">
        <div>
          <div class="v3-kpi-label">Hồ sơ chờ KYC</div>
          <div class="v3-kpi-value num">${pendingKycCount} hồ sơ</div>
          <div class="v3-kpi-sub">Cần duyệt hôm nay</div>
        </div>
        ${miniBarsHtml}
      </div>

      <div class="v3-kpi-card is-clickable" onclick="GDXApp.go('3.4')" title="Đi tới xử lý phiếu hỗ trợ">
        <div>
          <div class="v3-kpi-label">Phiếu hỗ trợ mở</div>
          <div class="v3-kpi-value num">${openTicketsCount} phiếu</div>
          <div class="v3-kpi-sub">SLA &lt; 15 phút</div>
        </div>
        ${miniBarsHtml}
      </div>
    </div>

    <section class="v3-admin-dispatch-panel">
      <div class="v3-admin-dispatch-head">
        <h2 class="v3-admin-dispatch-title">Điều phối lịch hẹn thời gian thực</h2>
        <div class="v3-appointments-filters">
          <button type="button" class="v3-appt-filter-pill ${state.adminDispatchFilter === "all" ? "is-active" : ""}" onclick="GDXApp.setAdminDispatchFilter('all')">Tất cả</button>
          <button type="button" class="v3-appt-filter-pill ${state.adminDispatchFilter === "pending" ? "is-active" : ""}" onclick="GDXApp.setAdminDispatchFilter('pending')">Chờ nhận</button>
          <button type="button" class="v3-appt-filter-pill ${state.adminDispatchFilter === "in_progress" ? "is-active" : ""}" onclick="GDXApp.setAdminDispatchFilter('in_progress')">Đang làm</button>
          <button type="button" class="v3-appt-filter-pill ${state.adminDispatchFilter === "completed" ? "is-active" : ""}" onclick="GDXApp.setAdminDispatchFilter('completed')">Hoàn thành</button>
        </div>
      </div>

      <div class="v3-dispatch-list">
        ${
          filteredBookings.length === 0
            ? `<div class="field-hint" style="text-align:center; padding:28px;">Không có đơn hàng nào trong trạng thái này.</div>`
            : filteredBookings
                .map((b) => {
                  const cust = db.customer_profiles.find(
                    (c) => c.customer_id === b.customer_id,
                  );
                  const custU = cust
                    ? db.users.find((u) => u.user_id === cust.user_id)
                    : null;
                  const svc = db.services.find(
                    (s) => s.service_id === b.service_id,
                  );
                  const prov = db.provider_public_profiles.find(
                    (p) => p.provider_id === b.provider_id,
                  );
                  const pill = getAdminPill(b.status);

                  return `
                <div class="v3-dispatch-row">
                  <div class="v3-dispatch-code num">#${shortCode(b.booking_id)}</div>

                  <div class="v3-dispatch-info">
                    <div class="v3-dispatch-svc">${svc ? svc.title : "Dịch vụ"}</div>
                    <div class="v3-dispatch-meta">
                      KH: ${custU ? custU.full_name : "Khách #" + b.customer_id} &middot;
                      Thợ: ${prov ? prov.full_name : "Chưa gán thợ"}
                    </div>
                  </div>

                  <div>
                    <span class="v3-booking-pill ${pill.cls}">
                      <span class="v3-booking-pill-icon" aria-hidden="true">${pill.dot}</span>
                      <span>${pill.text}</span>
                    </span>
                  </div>

                  <div class="v3-dispatch-amount num">${formatMoney(b.total_amount + b.total_incidental)}</div>

                  <div>
                    <button type="button" class="v3-dispatch-audit-btn" onclick="GDXApp.openModal('3.5', {bookingId: ${b.booking_id}})">
                      Kiểm toán &rarr;
                    </button>
                  </div>
                </div>`;
                })
                .join("")
        }
      </div>
    </section>
  </div>
`;
}

export function setAdminDispatchFilter(f) {
  state.adminDispatchFilter = f;
  go("3.1");
}

// 3.2: Quản lý Danh mục Gốc & Giám sát Dịch vụ Công ty
export function renderScreen_3_2(container) {
  const db = window.GDX_DB;
  const rootCats = db.service_categories.filter(
    (c) => c.parent_id === null,
  );

  container.innerHTML = `
  <div class="v3-svc-admin-page">
    <div class="v3-svc-admin-header">
      <h1 class="v3-svc-admin-title">Danh mục dịch vụ &amp; Cấu hình biểu giá</h1>
      <div class="v3-svc-admin-actions">
        <button type="button" class="v3-svc-admin-btn-light" onclick="GDXApp.openModal('3.6')">
          + Thêm danh mục
        </button>
        <button type="button" class="v3-svc-admin-btn-dark" onclick="GDXApp.openModal('3.7')">
          + Thêm dịch vụ
        </button>
      </div>
    </div>

    <div class="v3-svc-admin-list">
      ${db.services
        .map((s) => {
          const unit = s.pricing_type === "hourly" ? "/giờ" : "/lần";
          return `
          <article class="v3-svc-admin-row">
            <img src="${s.image_url || "/assets/service-cleaning.jpg"}" alt="${s.title}" class="v3-svc-admin-thumb">
            <div class="v3-svc-admin-info">
              <div class="v3-svc-admin-name">${s.title}</div>
              <div class="v3-svc-admin-price num">Đơn giá niêm yết: ${formatMoney(s.price)}${unit}</div>
            </div>
            <button type="button" class="v3-svc-admin-edit-btn" onclick="GDXApp.openModal('3.7', {serviceId: ${s.service_id}})">
              Chỉnh sửa
            </button>
          </article>`;
        })
        .join("")}
    </div>

    <div>
      <button type="button" class="v3-prov-expand-btn" onclick="document.getElementById('v3AdminCatTree').classList.toggle('is-open')">
        Xem cây danh mục gốc (${rootCats.length}) &darr;
      </button>
      <div id="v3AdminCatTree" class="v3-skills-config-panel form-stack" style="margin-top:12px;">
        ${rootCats
          .map((rc) => {
            const children = db.service_categories.filter(
              (c) => c.parent_id === rc.category_id,
            );
            return `
            <div class="panel-subtle" style="padding:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>${rc.name}</strong>
                <span class="field-hint num">ID #${shortCode(rc.category_id)}</span>
              </div>
              ${
                children.length > 0
                  ? `<div style="margin-top:8px; padding-left:12px; border-left:2px solid var(--accent); display:flex; flex-direction:column; gap:6px;">
                      ${children
                        .map(
                          (ch) => `
                        <div style="display:flex; justify-content:space-between; font-size:13px;">
                          <span>&#8627; ${ch.name}</span>
                          <span class="field-hint num">#${shortCode(ch.category_id)}</span>
                        </div>`,
                        )
                        .join("")}
                    </div>`
                  : ""
              }
            </div>`;
          })
          .join("")}
      </div>
    </div>
  </div>
`;
}

export function toggleServiceActive(serviceId) {
  return companyToggleService(serviceId);
}

// 3.3: Xét duyệt Hồ sơ Công ty Đối tác (Company Verification)
export function renderScreen_3_3(container) {
  const db = window.GDX_DB;
  const companies = db.company_profiles || [];
  const pendingCount = companies.filter(
    (c) => c.verification_status === "pending",
  ).length;

  const getKycPill = (status, isActive) => {
    if (!isActive)
      return { cls: "is-cancelled", dot: "✕", text: "Đã khóa tài khoản" };
    if (status === "verified")
      return { cls: "is-completed", dot: "✓", text: "Đã xác minh" };
    if (status === "pending")
      return { cls: "is-pending", dot: "●", text: "Chờ thẩm định" };
    return { cls: "is-cancelled", dot: "✕", text: "Đã từ chối" };
  };

  const getInitials = (name) => {
    const words = String(name || "DN")
      .trim()
      .split(/\s+/);
    return words
      .slice(-2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  };

  container.innerHTML = `
  <div class="v3-kyc-page">
    <div class="v3-kyc-header">
      <h1 class="v3-kyc-title">Hàng chờ xét duyệt hồ sơ Công ty Đối tác (${pendingCount > 0 ? pendingCount : companies.length})</h1>
    </div>

    <div class="v3-kyc-list">
      ${companies
        .map((c) => {
          const u = db.users.find(
            (x) => String(x.user_id) === String(c.user_id),
          );
          const staffCount = (db.provider_profiles || []).filter(
            (p) => Number(p.company_id) === Number(c.company_id),
          ).length;
          const svcCount = (db.services || []).filter(
            (s) => Number(s.company_id) === Number(c.company_id),
          ).length;
          const isActive = u ? u.is_active !== false : true;
          const pill = getKycPill(c.verification_status, isActive);

          return `
          <article class="v3-kyc-row">
            <div class="v3-kyc-avatar" aria-hidden="true">${getInitials(c.company_name)}</div>

            <div class="v3-kyc-info">
              <div class="v3-kyc-name">
                ${c.company_name} &middot; <span class="num">MST: ${c.tax_code}</span>
              </div>
              <div class="v3-kyc-meta">
                ${c.address || "Chưa cập nhật địa chỉ"} &middot;
                SĐT: <span class="num">${c.phone_number || (u ? u.phone_number : "—")}</span> &middot;
                ${staffCount} thợ &middot; ${svcCount} dịch vụ
              </div>
            </div>

            <div>
              <span class="v3-booking-pill ${pill.cls}">
                <span class="v3-booking-pill-icon" aria-hidden="true">${pill.dot}</span>
                <span>${pill.text}</span>
              </span>
            </div>

            <div class="v3-kyc-actions">
              ${
                c.verification_status !== "verified"
                  ? `<button type="button" class="v3-kyc-btn-primary" onclick="GDXApp.verifyCompanyKyc(${c.company_id}, 'verified')">Phê duyệt</button>`
                  : ""
              }
              ${
                c.verification_status !== "rejected"
                  ? `<button type="button" class="v3-kyc-btn-danger" onclick="GDXApp.verifyCompanyKyc(${c.company_id}, 'rejected')">Từ chối</button>`
                  : ""
              }
              <button type="button" class="v3-kyc-btn-light" onclick="GDXApp.toggleCompanyActive(${c.company_id})">
                ${isActive ? "Khóa" : "Mở khóa"}
              </button>
            </div>
          </article>`;
        })
        .join("")}
    </div>
  </div>
`;
}


export async function verifyCompanyKyc(companyId, newStatus) {
  const db = window.GDX_DB;
  const comp = (db.company_profiles || []).find(
    (c) => Number(c.company_id) === Number(companyId),
  );
  if (!comp) return;
  comp.verification_status = newStatus;
  refreshClientPublicProviders();
  await apiRequest(`/api/admin/companies/${companyId}/verify`, {
    method: "PATCH",
    body: JSON.stringify({ verification_status: newStatus }),
  });
  showToast(
    `Đã cập nhật Công ty #${companyId} (${comp.company_name}) sang trạng thái: ${newStatus}`,
  );
  if (state.currentScreen === "3.3") go("3.3");
}

export async function toggleCompanyActive(companyId) {
  const db = window.GDX_DB;
  const comp = (db.company_profiles || []).find(
    (c) => Number(c.company_id) === Number(companyId),
  );
  if (!comp) return;
  const u = (db.users || []).find(
    (x) => String(x.user_id) === String(comp.user_id),
  );
  if (u) {
    u.is_active = !u.is_active;
  }
  refreshClientPublicProviders();
  await apiRequest(`/api/admin/companies/${companyId}/toggle-active`, {
    method: "PATCH",
  });
  showToast(
    `Công ty ${comp.company_name}: ${!u || u.is_active ? "Đã mở khóa" : "Đã tạm khóa"}`,
  );
  if (state.currentScreen === "3.3") go("3.3");
}

export function updateProviderKyc(providerId, newStatus) {
  const db = window.GDX_DB;
  const prov = db.provider_profiles.find(
    (p) => p.provider_id === providerId,
  );
  if (!prov) return;
  prov.verification_status = newStatus;
  refreshClientPublicProviders();
  apiRequest(`/api/admin/kyc/${providerId}`, {
    method: "PATCH",
    body: JSON.stringify({ verification_status: newStatus }),
  });
  showToast(
    `Đã cập nhật hồ sơ #${providerId} sang trạng thái: ${newStatus}`,
  );
  closeModal();
  if (state.currentScreen === "3.3") go("3.3");
}

// 3.4: Quản lý Người dùng, Khiếu nại & Đánh giá
export function renderScreen_3_4(container) {
  const db = window.GDX_DB;
  state.admin34Tab = state.admin34Tab || "tickets";
  const activeTab = state.admin34Tab;

  const getTicketPill = (status) => {
    if (status === "resolved" || status === "closed") {
      return { cls: "is-completed", dot: "✓", text: "Đã giải quyết" };
    }
    if (status === "in_progress") {
      return { cls: "is-progress", dot: "●", text: "Đang xử lý" };
    }
    return { cls: "is-progress", dot: "●", text: "Đang xử lý" };
  };

  container.innerHTML = `
  <div class="v3-admin-users-page">
    <div class="v3-admin-users-header">
      <h1 class="v3-admin-users-title">Quản lý Người dùng &amp; Phiếu khiếu nại</h1>
      <div class="v3-seg-tabs" role="tablist" aria-label="Phân mục quản trị">
        <button type="button" class="v3-seg-tab ${activeTab === "tickets" ? "is-active" : ""}" onclick="GDXApp.setAdmin34Tab('tickets')">
          Phiếu khiếu nại (${db.support_tickets.length})
        </button>
        <button type="button" class="v3-seg-tab ${activeTab === "users" ? "is-active" : ""}" onclick="GDXApp.setAdmin34Tab('users')">
          Tài khoản (${db.users.length})
        </button>
        <button type="button" class="v3-seg-tab ${activeTab === "reviews" ? "is-active" : ""}" onclick="GDXApp.setAdmin34Tab('reviews')">
          Đánh giá &amp; Nhật ký
        </button>
      </div>
    </div>

    ${
      activeTab === "tickets"
        ? `
      <div class="v3-ticket-admin-list">
        ${
          db.support_tickets.length === 0
            ? `<div class="panel" style="text-align:center; padding:42px 24px; border-radius:20px;">Hiện chưa có phiếu khiếu nại nào.</div>`
            : db.support_tickets
                .map((t) => {
                  const u = db.users.find((x) => x.user_id === t.user_id);
                  const pill = getTicketPill(t.status);
                  return `
                <article class="v3-ticket-admin-row">
                  <div class="v3-ticket-admin-info">
                    <div class="v3-ticket-admin-title">
                      Phiếu <span class="num">#${shortCode(t.ticket_id)}</span> &middot; ${t.subject}
                    </div>
                    <div class="v3-ticket-admin-meta">
                      Khách: ${u ? u.full_name : "Người dùng"}
                      ${t.booking_id ? ` &middot; Đơn <span class="num">#${shortCode(t.booking_id)}</span>` : ""}
                    </div>
                  </div>

                  <div>
                    <span class="v3-booking-pill ${pill.cls}">
                      <span class="v3-booking-pill-icon" aria-hidden="true">${pill.dot}</span>
                      <span>${pill.text}</span>
                    </span>
                  </div>

                  <div>
                    <button type="button" class="v3-ticket-admin-btn" onclick="GDXApp.openModal('3.9', {ticketId: ${t.ticket_id}})">
                      Xử lý phiếu &rarr;
                    </button>
                  </div>
                </article>`;
                })
                .join("")
        }
      </div>`
        : activeTab === "users"
          ? `
      <div class="panel form-stack" style="border-radius:24px;">
        <h2 class="panel-title">Danh sách Tài khoản hệ thống (users)</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Họ và tên</th>
                <th>Số điện thoại</th>
                <th>Vai trò</th>
                <th>Quyền truy cập (is_active)</th>
              </tr>
            </thead>
            <tbody>
              ${db.users
                .map(
                  (u) => `
                <tr>
                  <td class="num">#${shortCode(u.user_id)}</td>
                  <td><strong>${u.full_name}</strong></td>
                  <td class="num">${u.phone_number}</td>
                  <td><span class="badge badge-info">${u.role}</span></td>
                  <td>
                    <label class="toggle-switch">
                      <input type="checkbox" ${u.is_active ? "checked" : ""} onchange="GDXApp.toggleUserActive('${u.user_id}')">
                      <span>${u.is_active ? "Hoạt động" : "Đang khóa"}</span>
                    </label>
                  </td>
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`
          : `
      <div class="form-stack">
        <div class="panel form-stack" style="border-radius:24px;">
          <h2 class="panel-title">Kiểm duyệt Nhận xét &amp; Đánh giá (reviews)</h2>
          ${db.reviews
            .map((r) => {
              const isHidden = r.status === "hidden";
              return `
            <div class="panel-subtle" style="display:flex; justify-content:space-between; align-items:center; gap:12px; opacity:${isHidden ? "0.75" : "1"}; border-left: 3px solid ${isHidden ? "var(--color-danger, #ef4444)" : "var(--color-success, #10b981)"};">
              <div>
                <div style="display:flex; align-items:center; gap:8px;">
                  ${Icons.starRow(r.rating)}
                  <span class="field-hint num">Đơn #${shortCode(r.booking_id)} &middot; Thợ #${shortCode(r.provider_id)}</span>
                  ${
                    isHidden
                      ? `<span class="badge badge-negative" style="font-size:11px;">Đã ẩn (${r.moderation_reason || "Vi phạm"})</span>`
                      : `<span class="badge badge-positive" style="font-size:11px;">Đang hiển thị</span>`
                  }
                </div>
                <div style="margin-top:4px; font-size:13.5px;">"${r.comment}"</div>
              </div>
              <div style="display:flex; gap:6px;">
                ${
                  isHidden
                    ? `<button type="button" class="btn btn-secondary btn-sm" onclick="GDXApp.moderateReview(${r.review_id}, 'published')">Mở lại</button>`
                    : `<button type="button" class="btn btn-danger btn-sm" onclick="GDXApp.openModerateReviewDialog(${r.review_id})">Ẩn vi phạm</button>`
                }
              </div>
            </div>`;
            })
            .join("")}
        </div>

        <div class="panel form-stack" style="border-radius:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 class="panel-title">Nhật ký Hệ thống &amp; Thao tác Quản trị (audit_logs)</h2>
              <p class="field-hint" style="margin-top:2px;">Ghi nhận minh bạch mọi hành động nhạy cảm</p>
            </div>
            <span class="badge badge-info">${(db.audit_logs || []).length} bản ghi</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người thực hiện</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                ${(db.audit_logs || [])
                  .slice(0, 15)
                  .map((al) => {
                    const actor = (db.users || []).find(
                      (u) =>
                        u.user_id === al.actor_id ||
                        String(u.user_id) === String(al.actor_id),
                    );
                    const actorName = actor
                      ? actor.full_name
                      : `#${shortCode(al.actor_id)}`;
                    const detailsStr =
                      typeof al.details === "object"
                        ? JSON.stringify(al.details)
                        : String(al.details || "");
                    return `
                    <tr>
                      <td class="num" style="white-space:nowrap; font-size:12px;">${formatDateTime(al.created_at)}</td>
                      <td><strong>${actorName}</strong></td>
                      <td><code>${al.action}</code></td>
                      <td><span class="badge badge-subtle">${al.target_entity} ${al.target_id ? `#${shortCode(al.target_id)}` : ""}</span></td>
                      <td style="font-size:12px; color:var(--color-muted); max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${detailsStr}">
                        ${detailsStr}
                      </td>
                    </tr>`;
                  })
                  .join("")}
                ${!db.audit_logs || db.audit_logs.length === 0 ? `<tr><td colspan="5" class="empty-cell">Chưa có nhật ký ghi nhận</td></tr>` : ""}
              </tbody>
            </table>
          </div>
        </div>
      </div>`
    }
  </div>
`;
}

export function setAdmin34Tab(tab) {
  state.admin34Tab = tab;
  go("3.4");
}

export function toggleUserActive(userId) {
  const u = window.GDX_DB.users.find(
    (x) => String(x.user_id) === String(userId),
  );
  if (!u) return;
  u.is_active = !u.is_active;
  refreshClientPublicProviders();
  apiRequest(`/api/admin/users/${userId}/toggle-active`, {
    method: "PATCH",
  });
  showToast(
    `Tài khoản ${u.full_name}: ${u.is_active ? "Đã mở khóa" : "Đã tạm khóa"}`,
  );
  go("3.4");
}

export function deleteReview(reviewId) {
  const db = window.GDX_DB;
  db.reviews = db.reviews.filter((r) => r.review_id !== reviewId);
  apiRequest(`/api/admin/reviews/${reviewId}`, { method: "DELETE" });
  showToast(
    `Đã gỡ đánh giá #${reviewId} và cập nhật lại điểm trung bình thợ`,
  );
  go("3.4");
}


// 3.5: Chi tiết Đơn hàng & Nhật ký trạng thái (Admin Drawer)
export function renderModal_3_5(el, params = {}) {
  const db = window.GDX_DB;
  const bk =
    db.bookings.find((b) => b.booking_id === (params.bookingId || 1042)) ||
    db.bookings[0];
  const history = db.booking_status_history.filter(
    (h) => h.booking_id === bk.booking_id,
  );

  el.innerHTML = `
  <div class="v3-prov-drawer">
    <div class="v3-prov-drawer-head" style="align-items:center;">
      <h2 class="v3-prov-name" style="font-size:19px;">Chi tiết đơn #${shortCode(bk.booking_id)} &amp; Audit Log</h2>
      <button type="button" class="v3-prov-icon-btn" onclick="GDXApp.closeModal()" aria-label="Đóng">&times;</button>
    </div>

    <form class="v3-prov-drawer-body" style="gap:20px;" onsubmit="event.preventDefault(); GDXApp.adminForceStatus(${bk.booking_id}, this);">
      <div class="v3-profile-field">
        <label for="admReason">Ghi chú / Thông tin</label>
        <input type="text" id="admReason" name="reason" class="v3-profile-input" style="background:#FFFFFF;" placeholder="Nhập nội dung cập nhật..." required>
      </div>

      <div class="v3-profile-field">
        <label for="admStatusSelect">Trạng thái đơn hàng</label>
        <select id="admStatusSelect" name="status" class="v3-profile-input" style="background:#FFFFFF;">
          <option value="pending" ${bk.status === "pending" ? "selected" : ""}>Chờ nhận (pending)</option>
          <option value="confirmed" ${bk.status === "confirmed" ? "selected" : ""}>Đã xác nhận (confirmed)</option>
          <option value="in_progress" ${bk.status === "in_progress" ? "selected" : ""}>Đang thực hiện (in_progress)</option>
          <option value="completed" ${bk.status === "completed" ? "selected" : ""}>Hoàn thành (completed)</option>
          <option value="cancelled" ${bk.status === "cancelled" ? "selected" : ""}>Hủy đơn (cancelled)</option>
        </select>
      </div>

      <button type="submit" class="v3-prov-cta-btn" style="margin-top:8px;">
        Lưu &amp; Xác nhận
      </button>

      <button type="button" class="v3-prov-expand-btn" onclick="document.getElementById('v3AdminAuditExtra').classList.toggle('is-open')">
        Xem chi tiết đơn &amp; lịch sử (${history.length}) &darr;
      </button>

      <div id="v3AdminAuditExtra" class="v3-prov-extra">
        <div class="panel-subtle form-stack" style="gap:6px;">
          <div><strong>Địa chỉ:</strong> ${bk.address}</div>
          <div><strong>Tổng thanh toán:</strong> <span class="num">${formatMoney(bk.total_amount + bk.total_incidental)}</span></div>
          <div><strong>Ghi chú khách:</strong> ${bk.notes || "Không có"}</div>
        </div>
        <div class="audit-timeline">
          ${history
            .map(
              (h) => `
            <div class="audit-item">
              <div><strong>${h.old_status || h.previous_status || "Mới"} &rarr; ${h.new_status}</strong> &middot; <span class="field-hint num">${formatDateTime(h.changed_at || h.created_at)}</span></div>
              <div class="field-hint">${h.reason}</div>
            </div>`,
            )
            .join("")}
        </div>
      </div>
    </form>
  </div>
`;
}

export function adminForceStatus(bookingId, form) {
  const db = window.GDX_DB;
  const bk = db.bookings.find((b) => b.booking_id === bookingId);
  const nowIso = new Date().toISOString();
  const adminUserId =
    typeof state.activeUserId === "string" &&
    /^[0-9a-f-]{36}$/i.test(state.activeUserId)
      ? state.activeUserId
      : "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c99";
  if (bk) {
    const oldStatus = bk.status;
    bk.status = form.status.value;
    db.booking_status_history.unshift({
      history_id: Date.now(),
      booking_id: bookingId,
      previous_status: oldStatus,
      old_status: oldStatus,
      new_status: form.status.value,
      changed_by: adminUserId,
      reason: form.reason.value,
      created_at: nowIso,
      changed_at: nowIso,
    });
  }
  closeModal();
  showToast(`Đã cập nhật trạng thái đơn #${bookingId}`);
  if (state.currentScreen === "3.1") go("3.1");
}

// 3.6: Thêm / Sửa Danh mục Dịch vụ
export function renderModal_3_6(el) {
  const rootCats = window.GDX_DB.service_categories.filter(
    (c) => c.parent_id === null,
  );
  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">3.6. Thêm Danh mục Dịch vụ mới</div>
      <div class="field-hint">Bảng: service_categories (name, description, parent_id)</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <form onsubmit="event.preventDefault(); GDXApp.saveCategoryModal(this);">
    <div class="modal-body form-stack">
      <div class="field-group">
        <label class="field-label" for="catName">Tên danh mục (service_categories.name)</label>
        <input type="text" id="catName" name="name" class="input" required placeholder="Ví dụ: Chăm sóc cây cảnh ban công">
      </div>
      <div class="field-group">
        <label class="field-label" for="catParent">Danh mục cha (parent_id)</label>
        <select id="catParent" name="parent_id" class="select">
          <option value="">-- Danh mục gốc (Cấp 1) --</option>
          ${rootCats.map((c) => `<option value="${c.category_id}">${c.name}</option>`).join("")}
        </select>
      </div>
      <div class="field-group">
        <label class="field-label" for="catDesc">Mô tả danh mục (description)</label>
        <textarea id="catDesc" name="description" class="textarea" rows="2" required>Dịch vụ cắt tỉa, thay đất và chăm sóc cây xanh tại căn hộ gia đình.</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Hủy</button>
      <button type="submit" class="btn btn-primary">Lưu danh mục</button>
    </div>
  </form>
`;
}

export function saveCategoryModal(form) {
  const db = window.GDX_DB;
  db.service_categories.push({
    category_id:
      Math.max(...db.service_categories.map((c) => c.category_id)) + 1,
    name: form.name.value,
    description: form.description.value,
    parent_id: form.parent_id.value ? Number(form.parent_id.value) : null,
  });
  closeModal();
  showToast("Đã thêm danh mục dịch vụ mới!");
  if (state.currentScreen === "3.2") go("3.2");
}

// 3.7: Thêm / Sửa Gói Dịch vụ & Giá
export function renderModal_3_7(el, params = {}) {
  const db = window.GDX_DB;
  const existing = params.serviceId
    ? db.services.find((s) => s.service_id === params.serviceId)
    : null;

  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">3.7. ${existing ? `Cập nhật Gói dịch vụ #${shortCode(existing.service_id)}` : "Thêm Gói Dịch vụ & Niêm yết giá"}</div>
      <div class="field-hint">Bảng: services (category_id, title, pricing_type, price, estimated_duration)</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <form onsubmit="event.preventDefault(); GDXApp.saveServiceModal(this, ${existing ? existing.service_id : "null"});">
    <div class="modal-body form-stack">
      <div class="field-group">
        <label class="field-label" for="svcTitle">Tên gói dịch vụ (services.title)</label>
        <input type="text" id="svcTitle" name="title" class="input" value="${existing ? existing.title : "Vệ sinh máy giặt lồng ngang tại nhà"}" required>
      </div>
      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="svcCat">Thuộc danh mục (category_id)</label>
          <select id="svcCat" name="category_id" class="select">
            ${db.service_categories
              .map(
                (c) =>
                  `<option value="${c.category_id}" ${existing && existing.category_id === c.category_id ? "selected" : ""}>${c.name}</option>`,
              )
              .join("")}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="svcType">Cách tính phí (pricing_type)</label>
          <select id="svcType" name="pricing_type" class="select">
            <option value="fixed" ${existing && existing.pricing_type === "fixed" ? "selected" : ""}>Trọn gói cố định (fixed)</option>
            <option value="hourly" ${existing && existing.pricing_type === "hourly" ? "selected" : ""}>Tính theo giờ (hourly)</option>
          </select>
        </div>
      </div>
      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="svcPrice">Đơn giá niêm yết (VNĐ - price)</label>
          <input type="number" id="svcPrice" name="price" class="input num" value="${existing ? existing.price : 250000}" min="10000" step="5000" required>
        </div>
        <div class="field-group">
          <label class="field-label" for="svcDur">Thời lượng ước tính (phút - estimated_duration)</label>
          <input type="number" id="svcDur" name="estimated_duration" class="input num" value="${existing ? existing.estimated_duration : 90}" min="15" step="15" required>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Hủy</button>
      <button type="submit" class="btn btn-primary">Lưu gói dịch vụ</button>
    </div>
  </form>
`;
}

export function saveServiceModal(form, existingId) {
  const db = window.GDX_DB;
  if (existingId) {
    const s = db.services.find((x) => x.service_id === existingId);
    if (s) {
      s.title = form.title.value;
      s.category_id = Number(form.category_id.value);
      s.pricing_type = form.pricing_type.value;
      s.price = Number(form.price.value);
      s.estimated_duration = Number(form.estimated_duration.value);
    }
  } else {
    db.services.push({
      service_id: Math.max(...db.services.map((x) => x.service_id)) + 1,
      category_id: Number(form.category_id.value),
      title: form.title.value,
      image_url: "/assets/service-laundry.jpg",
      pricing_type: form.pricing_type.value,
      price: Number(form.price.value),
      estimated_duration: Number(form.estimated_duration.value),
      is_active: true,
    });
  }
  closeModal();
  showToast("Đã lưu thông tin gói dịch vụ!");
  if (state.currentScreen === "3.2") go("3.2");
}

// 3.8: Chi tiết Hồ sơ KYC & Duyệt Thợ
export function renderModal_3_8(el, params = {}) {
  const db = window.GDX_DB;
  const p =
    db.provider_profiles.find(
      (x) => x.provider_id === (params.providerId || 204),
    ) || db.provider_profiles[3];
  const u = db.users.find((x) => x.user_id === p.user_id);

  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">3.8. Đối chiếu Hồ sơ Pháp lý &amp; CCCD Đối tác #${shortCode(p.provider_id)}</div>
      <div class="field-hint">Bảng: provider_profiles (id_card_number, verification_status)</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <div class="modal-body form-stack">
    <div style="display:flex; align-items:center; gap:14px;">
      <img src="${p.avatar_url}" alt="Avatar" class="provider-avatar-lg">
      <div>
        <strong style="font-size:17px;">${u ? u.full_name : ""}</strong>
        <div class="field-hint num">Số CCCD: <strong>${p.id_card_number}</strong> · SĐT: ${u ? u.phone_number : ""}</div>
      </div>
    </div>
    <div class="panel-subtle">
      <strong>Kinh nghiệm chuyên môn khai báo:</strong>
      <p class="field-hint" style="margin-top:4px;">${p.info}</p>
    </div>
  </div>
  <div class="modal-footer">
    <button type="button" class="btn btn-danger" onclick="GDXApp.updateProviderKyc(${p.provider_id}, 'rejected')">Từ chối hồ sơ (rejected)</button>
    <button type="button" class="btn btn-primary" onclick="GDXApp.updateProviderKyc(${p.provider_id}, 'verified')">Phê duyệt chính thức (verified) &rarr;</button>
  </div>
`;
}

// 3.9: Xử lý Phiếu Hỗ trợ (Support Ticket Detail)
export function renderModal_3_9(el, params = {}) {
  const db = window.GDX_DB;
  const ticketId = params.ticketId || 701;
  const t = (db.support_tickets || []).find(
    (x) => Number(x.ticket_id) === Number(ticketId),
  ) ||
    db.support_tickets[0] || {
      ticket_id: ticketId,
      subject: "Phiếu hỗ trợ",
      description: "",
      status: "open",
      priority: "medium",
    };
  const messages = (db.ticket_messages || []).filter(
    (m) => Number(m.ticket_id) === Number(t.ticket_id),
  );

  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">3.9. Xử lý Phiếu Hỗ trợ #${shortCode(t.ticket_id)}</div>
      <div class="field-hint">Cập nhật support_tickets &amp; Trao đổi đối soát (ticket_messages)</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <div class="modal-body form-stack">
    <div class="panel-subtle">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${t.subject}</strong>
        ${priorityBadge(t.priority)}
      </div>
      <p class="field-hint" style="margin-top:6px; font-size:13.5px; line-height:1.5;">${t.description || "Không có mô tả chi tiết."}</p>
      ${t.image_url ? `<div style="margin-top:10px;"><div class="field-hint" style="margin-bottom:4px;">Hình ảnh đính kèm:</div><img src="${t.image_url}" alt="Ảnh phiếu hỗ trợ" style="max-width:100%; max-height:220px; border-radius:8px; border:1px solid var(--color-border);"></div>` : ""}
      <div class="field-hint" style="margin-top:8px; font-size:12px;">Đơn hàng: <strong>#${t.booking_id ? shortCode(t.booking_id) : "N/A"}</strong> · Ngày tạo: <strong>${formatDateTime(t.created_at || new Date().toISOString())}</strong></div>
    </div>

    <form onsubmit="event.preventDefault(); GDXApp.updateSupportTicket(${t.ticket_id}, this);">
      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="admTkStatus">Trạng thái xử lý (ticket_status)</label>
          <select id="admTkStatus" name="status" class="select">
            <option value="open" ${t.status === "open" ? "selected" : ""}>Mới tiếp nhận (open)</option>
            <option value="in_progress" ${t.status === "in_progress" ? "selected" : ""}>Đang xử lý (in_progress)</option>
            <option value="resolved" ${t.status === "resolved" ? "selected" : ""}>Đã giải quyết (resolved)</option>
            <option value="closed" ${t.status === "closed" ? "selected" : ""}>Đóng phiếu (closed)</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="admTkPrio">Mức độ ưu tiên (ticket_priority)</label>
          <select id="admTkPrio" name="priority" class="select">
            <option value="low" ${t.priority === "low" ? "selected" : ""}>Thấp (low)</option>
            <option value="medium" ${t.priority === "medium" ? "selected" : ""}>Trung bình (medium)</option>
            <option value="high" ${t.priority === "high" ? "selected" : ""}>Cao (high)</option>
            <option value="urgent" ${t.priority === "urgent" ? "selected" : ""}>Khẩn cấp (urgent)</option>
          </select>
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; margin-top:8px;">
        <button type="submit" class="btn btn-secondary btn-sm">Cập nhật trạng thái</button>
      </div>
    </form>

    <div style="margin-top:12px;">
      <strong style="font-size:14px; font-family:var(--font-heading);">Lịch sử trao đổi &amp; Ghi chú nội bộ (${messages.length}):</strong>
      <div class="ticket-thread" style="margin-top:8px; display:flex; flex-direction:column; gap:10px;">
        ${
          messages.length === 0
            ? '<div class="field-hint">Chưa có tin nhắn nào trong phiếu này.</div>'
            : messages
                .map((m) => {
                  const isInternal = m.visibility === "internal";
                  const sender = (db.users || []).find(
                    (u) =>
                      u.user_id === m.sender_id ||
                      String(u.user_id) === String(m.sender_id),
                  );
                  const senderName = sender
                    ? sender.full_name
                    : m.sender_role === "admin"
                      ? "Điều phối viên"
                      : m.sender_role === "provider"
                        ? "Đối tác thợ"
                        : "Khách hàng";
                  return `
            <div class="ticket-msg-card ${isInternal ? "is-internal" : ""}" style="padding:10px 14px; border-radius:10px; border:1px solid ${isInternal ? "#fcd34d" : "var(--color-border)"}; background:${isInternal ? "#fffbeb" : "var(--color-surface)"};">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <strong style="font-size:13px;">${senderName}</strong>
                  <span class="badge ${m.sender_role === "admin" ? "badge-info" : "badge-subtle"}" style="font-size:10.5px;">${m.sender_role || "user"}</span>
                  ${isInternal ? '<span class="badge-internal-note" style="font-size:11px; font-weight:600; color:#b45309; background:#fef3c7; padding:2px 6px; border-radius:4px;">🔒 Ghi chú nội bộ</span>' : ""}
                </div>
                <span class="field-hint" style="font-size:11px;">${formatDateTime(m.created_at)}</span>
              </div>
              <div style="font-size:13.5px; line-height:1.5; color:var(--color-text);">${m.message_body || m.content || ""}</div>
            </div>
          `;
                })
                .join("")
        }
      </div>
    </div>

    <div style="margin-top:12px; padding:12px; border-radius:10px; background:var(--color-bg-subtle, #f8fafc); border:1px solid var(--color-border);">
      <strong style="font-size:13px; margin-bottom:6px; display:block;">Gửi phản hồi hoặc thêm ghi chú nội bộ:</strong>
      <form onsubmit="event.preventDefault(); GDXApp.sendTicketReply(${t.ticket_id}, this);">
        <div class="field-group">
          <textarea name="reply_content" class="textarea" rows="2" placeholder="Nhập câu trả lời gửi khách hàng hoặc ghi chú đối soát nội bộ..." required></textarea>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
          <label style="font-size:12.5px; display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none;">
            <input type="checkbox" name="is_internal" value="1">
            <span>🔒 Đánh dấu <strong>Ghi chú nội bộ</strong> (Khách không nhìn thấy)</span>
          </label>
          <button type="submit" class="btn btn-primary btn-sm">Gửi phản hồi &rarr;</button>
        </div>
      </form>
    </div>
  </div>
  <div class="modal-footer">
    <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Đóng</button>
  </div>
`;
}

export async function updateSupportTicket(ticketId, form) {
  const status = form.status ? form.status.value : null;
  const priority = form.priority ? form.priority.value : null;
  const t = window.GDX_DB.support_tickets.find(
    (x) => Number(x.ticket_id) === Number(ticketId),
  );
  if (t) {
    if (status) t.status = status;
    if (priority) t.priority = priority;
  }
  await apiRequest(`/api/tickets/${ticketId}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      priority,
      actor_id: state.activeUserId,
    }),
  });
  showToast(`Đã cập nhật phiếu hỗ trợ #${ticketId}`);
  if (state.currentScreen === "3.4") go("3.4");
}

