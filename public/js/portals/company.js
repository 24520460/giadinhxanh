import { apiRequest, refreshClientPublicProviders } from "../core/api.js";
import { escapeQuotes, formatCccd, formatDateTime, formatMoney, shortCode } from "../core/formatters.js";
import { go } from "../core/router.js";
import { state } from "../core/state.js";
import { closeModal } from "../shared/modal.js";
import { showToast } from "../shared/ui-utils.js";

// =====================================================================
// SCREEN RENDERERS: PHÂN HỆ 4 (COMPANY PORTAL: 4.1 – 4.3)
// =====================================================================

export function getActiveCompanyProfile() {
  const db = window.GDX_DB;
  const companies = db.company_profiles || [];
  return (
    companies.find(
      (c) => String(c.company_id) === String(state.activeCompanyId),
    ) ||
    companies.find((c) => c.verification_status === "verified") ||
    companies[0] || {
      company_id: 501,
      company_name: "Công ty An Bình Home Care",
      tax_code: "0316123456",
      verification_status: "verified",
      address: "TP.HCM",
      phone_number: "0909100501",
    }
  );
}

// 4.1: Tổng quan Công ty Đối tác & Đơn hàng
export function renderScreen_4_1(container) {
  const db = window.GDX_DB;
  const comp = getActiveCompanyProfile();
  const myStaff = (db.provider_profiles || []).filter(
    (p) => Number(p.company_id) === Number(comp.company_id),
  );
  const myStaffIds = myStaff.map((p) => Number(p.provider_id));
  const myServices = (db.services || []).filter(
    (s) => Number(s.company_id) === Number(comp.company_id),
  );
  const mySvcIds = myServices.map((s) => Number(s.service_id));
  const myBookings = (db.bookings || []).filter(
    (b) =>
      Number(b.company_id) === Number(comp.company_id) ||
      myStaffIds.includes(Number(b.provider_id)) ||
      mySvcIds.includes(Number(b.service_id)),
  );
  const revenue = myBookings
    .filter((b) => b.payment_status === "paid" || b.status === "completed")
    .reduce(
      (sum, b) =>
        sum + Number(b.total_amount || 0) + Number(b.total_incidental || 0),
      0,
    );

  const miniBarsHtml = `
  <div class="v3-kpi-bars" aria-hidden="true">
    <span style="height:10px;"></span>
    <span style="height:16px;"></span>
    <span style="height:22px;"></span>
    <span style="height:28px;"></span>
    <span class="is-peak" style="height:36px;"></span>
  </div>
`;

  const getBookingPill = (status) => {
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
    <div class="v3-svc-admin-header">
      <div>
        <h1 class="v3-admin-title">${comp.company_name}</h1>
        <div class="field-hint num" style="margin-top:4px;">
          MST: <strong>${comp.tax_code}</strong> &middot; ${comp.address || "TP.HCM"} &middot;
          <span style="color:#1B4332; font-weight:700;">${comp.verification_status === "verified" ? "&#10003; Đã xác minh" : comp.verification_status}</span>
        </div>
      </div>
      <div class="v3-svc-admin-actions">
        <button type="button" class="v3-svc-admin-btn-light" onclick="GDXApp.go('4.2')">Nhân viên (${myStaff.length})</button>
        <button type="button" class="v3-svc-admin-btn-dark" onclick="GDXApp.go('4.3')">Dịch vụ (${myServices.length})</button>
      </div>
    </div>

    <div class="v3-kpi-grid-4">
      <div class="v3-kpi-card is-clickable" onclick="GDXApp.go('4.2')">
        <div>
          <div class="v3-kpi-label">Nhân viên Thợ</div>
          <div class="v3-kpi-value num">${myStaff.length} người</div>
          <div class="v3-kpi-sub">Quản lý đội ngũ &rarr;</div>
        </div>
        ${miniBarsHtml}
      </div>

      <div class="v3-kpi-card is-clickable" onclick="GDXApp.go('4.3')">
        <div>
          <div class="v3-kpi-label">Dịch vụ Công ty</div>
          <div class="v3-kpi-value num">${myServices.length} gói</div>
          <div class="v3-kpi-sub">Cấu hình biểu giá &rarr;</div>
        </div>
        ${miniBarsHtml}
      </div>

      <div class="v3-kpi-card">
        <div>
          <div class="v3-kpi-label">Đơn hàng tiếp nhận</div>
          <div class="v3-kpi-value num">${myBookings.length} đơn</div>
          <div class="v3-kpi-sub">Liên kết thợ / dịch vụ</div>
        </div>
        ${miniBarsHtml}
      </div>

      <div class="v3-kpi-card">
        <div>
          <div class="v3-kpi-label">Doanh thu ghi nhận</div>
          <div class="v3-kpi-value num">${formatMoney(revenue)}</div>
          <div class="v3-kpi-sub">Đã hoàn thành / thanh toán</div>
        </div>
        ${miniBarsHtml}
      </div>
    </div>

    <section class="v3-admin-dispatch-panel">
      <div class="v3-admin-dispatch-head">
        <h2 class="v3-admin-dispatch-title">Đơn đặt lịch thuộc Công ty (${myBookings.length})</h2>
      </div>

      <div class="v3-dispatch-list">
        ${
          myBookings.length === 0
            ? `<div class="field-hint" style="text-align:center; padding:28px;">Chưa có đơn hàng nào thuộc Công ty.</div>`
            : myBookings
                .map((b) => {
                  const svc = (db.services || []).find(
                    (s) => Number(s.service_id) === Number(b.service_id),
                  );
                  const prov = (db.provider_profiles || []).find(
                    (p) => Number(p.provider_id) === Number(b.provider_id),
                  );
                  const provUser = prov
                    ? (db.users || []).find(
                        (u) => String(u.user_id) === String(prov.user_id),
                      )
                    : null;
                  const pill = getBookingPill(b.status);
                  return `
                <div class="v3-dispatch-row" style="grid-template-columns: 120px minmax(0, 1.5fr) 160px 130px;">
                  <div class="v3-dispatch-code num">#${shortCode(b.booking_id)}</div>
                  <div class="v3-dispatch-info">
                    <div class="v3-dispatch-svc">${svc ? svc.title : `Dịch vụ #${b.service_id}`}</div>
                    <div class="v3-dispatch-meta">
                      Thợ: ${provUser ? provUser.full_name : b.provider_id ? `Thợ #${b.provider_id}` : "Chờ nhận (Pool)"} &middot;
                      <span class="num">${formatDateTime(b.scheduled_time)}</span>
                    </div>
                  </div>
                  <div>
                    <span class="v3-booking-pill ${pill.cls}">
                      <span class="v3-booking-pill-icon" aria-hidden="true">${pill.dot}</span>
                      <span>${pill.text}</span>
                    </span>
                  </div>
                  <div class="v3-dispatch-amount num">${formatMoney(b.total_amount)}</div>
                </div>`;
                })
                .join("")
        }
      </div>
    </section>
  </div>
`;
}

// 4.2: Quản lý Nhân viên Thợ (Company Staff Management)
export function renderScreen_4_2(container) {
  const db = window.GDX_DB;
  const comp = getActiveCompanyProfile();
  const allStaff = (db.provider_profiles || []).filter(
    (p) => Number(p.company_id) === Number(comp.company_id),
  );
  const kw = (state.companyStaffFilter || "").trim().toLowerCase();
  const staffList = allStaff.filter((p) => {
    if (!kw) return true;
    const u = (db.users || []).find(
      (x) => String(x.user_id) === String(p.user_id),
    );
    const nameMatch = u && (u.full_name || "").toLowerCase().includes(kw);
    const phoneMatch = u && (u.phone_number || "").includes(kw);
    const cccdMatch = (p.id_card_number || "").includes(kw);
    return Boolean(nameMatch || phoneMatch || cccdMatch);
  });

  container.innerHTML = `
  <div class="v3-kyc-page">
    <div class="v3-svc-admin-header">
      <div>
        <h1 class="v3-kyc-title">Đội ngũ Nhân viên Thợ (${staffList.length})</h1>
      </div>
      <div class="v3-svc-admin-actions">
        <input
          type="text"
          id="companyStaffSearchInput"
          class="v3-profile-input"
          style="height:42px; width:280px; background:#FFFFFF;"
          value="${escapeQuotes(state.companyStaffFilter || "")}"
          placeholder="Tìm theo tên, SĐT, CCCD..."
          oninput="GDXApp.setCompanyStaffFilter(this.value)"
        >
        <button type="button" class="v3-svc-admin-btn-dark" onclick="GDXApp.openModal('4.4')">+ Thêm nhân viên Thợ</button>
      </div>
    </div>

    <div class="v3-kyc-list">
      ${staffList
        .map((p) => {
          const u = (db.users || []).find(
            (x) => String(x.user_id) === String(p.user_id),
          );
          const isActive = u ? u.is_active !== false : true;
          const assignedIds = (db.provider_services || [])
            .filter(
              (ps) => Number(ps.provider_id) === Number(p.provider_id),
            )
            .map((ps) => Number(ps.service_id));
          const assignedSvcs = (db.services || []).filter((s) =>
            assignedIds.includes(Number(s.service_id)),
          );

          return `
          <article class="v3-kyc-row">
            <img src="${p.avatar_url || "/assets/provider-lan.jpg"}" onerror="this.onerror=null; this.src='/assets/provider-lan.jpg';" alt="${u ? u.full_name : "Thợ"}" class="v3-kyc-avatar" style="object-fit:cover;">

            <div class="v3-kyc-info">
              <div class="v3-kyc-name">
                ${u ? u.full_name : `Nhân viên #${shortCode(p.provider_id)}`} &middot;
                <span class="num" style="font-weight:600; color:#64748B;">&#9733; ${Number(p.average_rating || 5).toFixed(2)}</span>
              </div>
              <div class="v3-kyc-meta">
                SĐT: <span class="num">${u ? u.phone_number : "—"}</span> &middot;
                CCCD: <span class="num">${formatCccd(p.id_card_number)}</span> &middot;
                ${assignedSvcs.length > 0 ? assignedSvcs.map((s) => s.title).join(", ") : "Chưa phân công dịch vụ"}
              </div>
            </div>

            <div>
              <span class="v3-booking-pill ${isActive ? "is-completed" : "is-cancelled"}">
                <span class="v3-booking-pill-icon" aria-hidden="true">${isActive ? "✓" : "✕"}</span>
                <span>${isActive ? "Đang hoạt động" : "Đã khóa"}</span>
              </span>
            </div>

            <div class="v3-kyc-actions">
              <button type="button" class="v3-kyc-btn-light" onclick="GDXApp.openModal('4.4', {providerId: ${p.provider_id}})">
                Phân công
              </button>
              <button type="button" class="${isActive ? "v3-kyc-btn-danger" : "v3-kyc-btn-primary"}" onclick="GDXApp.companyToggleProviderBan(${p.provider_id})">
                ${isActive ? "Khóa (Ban)" : "Mở khóa"}
              </button>
            </div>
          </article>`;
        })
        .join("")}
      ${staffList.length === 0 ? '<div class="panel empty-state-card" style="border-radius:20px;">Chưa có nhân viên Thợ nào khớp với tìm kiếm.</div>' : ""}
    </div>
  </div>
`;
}

export function setCompanyStaffFilter(val) {
  state.companyStaffFilter = val || "";
  const activeId = document.activeElement && document.activeElement.id;
  go("4.2");
  if (activeId === "companyStaffSearchInput") {
    const inp = document.getElementById("companyStaffSearchInput");
    if (inp) {
      inp.focus();
      const len = inp.value.length;
      inp.setSelectionRange(len, len);
    }
  }
}

export async function companyToggleProviderBan(providerId) {
  const db = window.GDX_DB;
  const prov = (db.provider_profiles || []).find(
    (p) => Number(p.provider_id) === Number(providerId),
  );
  if (!prov) return;
  const u = (db.users || []).find(
    (x) => String(x.user_id) === String(prov.user_id),
  );
  if (u) {
    u.is_active = !u.is_active;
  }
  refreshClientPublicProviders();
  await apiRequest(`/api/company/providers/${providerId}/toggle-ban`, {
    method: "PATCH",
    body: JSON.stringify({ company_id: prov.company_id }),
  });
  showToast(
    `Nhân viên ${u ? u.full_name : `#${providerId}`}: ${!u || u.is_active ? "Đã mở khóa tài khoản" : "Đã khóa tài khoản"}`,
  );
  if (state.currentScreen === "4.2") go("4.2");
}

// 4.3: Quản lý Dịch vụ & Bảng giá Công ty
export function renderScreen_4_3(container) {
  const db = window.GDX_DB;
  const comp = getActiveCompanyProfile();
  const myServices = (db.services || []).filter(
    (s) => Number(s.company_id) === Number(comp.company_id),
  );

  container.innerHTML = `
  <div class="v3-svc-admin-page">
    <div class="v3-svc-admin-header">
      <h1 class="v3-svc-admin-title">Dịch vụ &amp; Bảng giá (${comp.company_name})</h1>
      <button type="button" class="v3-svc-admin-btn-dark" onclick="GDXApp.openModal('4.5')">+ Tạo dịch vụ mới</button>
    </div>

    <div class="v3-svc-admin-list">
      ${
        myServices.length === 0
          ? `<div class="panel empty-state-card" style="border-radius:20px; text-align:center; padding:42px 24px;">Công ty chưa tạo dịch vụ nào.</div>`
          : myServices
              .map((s) => {
                const cat = (db.service_categories || []).find(
                  (c) => Number(c.category_id) === Number(s.category_id),
                );
                const unit = s.pricing_type === "hourly" ? "/giờ" : "/lần";
                return `
              <article class="v3-svc-admin-row" style="grid-template-columns: 112px minmax(0, 1fr) auto auto;">
                <img src="${s.image_url || "/assets/cleaning-livingroom.jpg"}" alt="${s.title}" class="v3-svc-admin-thumb">
                <div class="v3-svc-admin-info">
                  <div class="v3-svc-admin-name">${s.title}</div>
                  <div class="v3-svc-admin-price num">
                    Đơn giá: ${formatMoney(s.price)}${unit} &middot; ~${s.estimated_duration} phút
                    ${cat ? ` &middot; ${cat.name}` : ""}
                  </div>
                </div>
                <button type="button" class="v3-booking-pill ${s.is_active ? "is-completed" : "is-cancelled"}" style="border:none; cursor:pointer;" onclick="GDXApp.companyToggleService(${s.service_id})" title="Bấm để bật/tắt dịch vụ">
                  <span class="v3-booking-pill-icon" aria-hidden="true">${s.is_active ? "✓" : "✕"}</span>
                  <span>${s.is_active ? "Đang mở" : "Tạm ẩn"}</span>
                </button>
                <button type="button" class="v3-svc-admin-edit-btn" onclick="GDXApp.openModal('4.5', {serviceId: ${s.service_id}})">
                  Chỉnh sửa
                </button>
              </article>`;
              })
              .join("")
      }
    </div>
  </div>
`;
}

export async function companyToggleService(serviceId) {
  const db = window.GDX_DB;
  const svc = (db.services || []).find(
    (s) => Number(s.service_id) === Number(serviceId),
  );
  if (!svc) return;
  svc.is_active = !svc.is_active;
  await apiRequest(`/api/company/services/${serviceId}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ company_id: svc.company_id }),
  });
  showToast(
    `Dịch vụ "${svc.title}": ${svc.is_active ? "Đã mở bán" : "Đã tạm ẩn"}`,
  );
  if (state.currentScreen === "4.3") go("4.3");
  else if (state.currentScreen === "3.2") go("3.2");
}


// 4.4: Thêm nhân viên Thợ / Phân công dịch vụ (Company Modal)
export function renderModal_4_4(el, params = {}) {
  const db = window.GDX_DB;
  const comp = getActiveCompanyProfile();
  const companySvcs = (db.services || []).filter(
    (s) => Number(s.company_id) === Number(comp.company_id),
  );
  const svcsToShow =
    companySvcs.length > 0 ? companySvcs : db.services || [];

  if (params.providerId) {
    const prov = (db.provider_profiles || []).find(
      (p) => Number(p.provider_id) === Number(params.providerId),
    );
    const u = prov
      ? (db.users || []).find(
          (x) => String(x.user_id) === String(prov.user_id),
        )
      : null;
    const assignedIds = (db.provider_services || [])
      .filter((ps) => Number(ps.provider_id) === Number(params.providerId))
      .map((ps) => Number(ps.service_id));

    el.innerHTML = `
    <div class="modal-header">
      <div>
        <div class="modal-title">Phân công Dịch vụ cho Thợ: ${u ? u.full_name : `#${shortCode(params.providerId)}`}</div>
        <div class="field-hint">Cập nhật bảng provider_services bởi ${comp.company_name}</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
    </div>
    <form onsubmit="event.preventDefault(); GDXApp.companyUpdateProviderServices(${params.providerId}, this);">
      <div class="modal-body form-stack">
        <div class="choice-grid-2">
          ${svcsToShow
            .map(
              (s) => `
            <label class="choice-card">
              <input type="checkbox" name="serviceIds" value="${s.service_id}" ${assignedIds.includes(Number(s.service_id)) ? "checked" : ""}>
              <div>
                <div style="font-weight:600;">${s.title}</div>
                <div class="field-hint num">${formatMoney(s.price)}</div>
              </div>
            </label>`,
            )
            .join("")}
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Hủy</button>
        <button type="submit" class="btn btn-primary">Lưu phân công dịch vụ</button>
      </div>
    </form>
  `;
    return;
  }

  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">4.4. Thêm Hồ sơ Nhân viên Thợ mới</div>
      <div class="field-hint">Tạo tài khoản role: provider thuộc ${comp.company_name} (#${shortCode(comp.company_id)})</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <form onsubmit="event.preventDefault(); GDXApp.companyAddProvider(this);">
    <div class="modal-body form-stack">
      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="cpProvName">Họ và tên nhân viên</label>
          <input type="text" id="cpProvName" name="full_name" class="input" required placeholder="Nguyễn Văn An">
        </div>
        <div class="field-group">
          <label class="field-label" for="cpProvPhone">Số điện thoại đăng nhập</label>
          <input type="tel" id="cpProvPhone" name="phone_number" class="input" required placeholder="0908111222">
        </div>
      </div>
      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="cpProvEmail">Email (tùy chọn)</label>
          <input type="email" id="cpProvEmail" name="email" class="input" placeholder="nhanvien@company.vn">
        </div>
        <div class="field-group">
          <label class="field-label" for="cpProvPass">Mật khẩu cấp cho Thợ</label>
          <input type="password" id="cpProvPass" name="password" class="input" value="123456" minlength="6" required>
        </div>
      </div>
      <div class="field-group">
        <label class="field-label" for="cpProvCccd">Số CCCD (id_card_number)</label>
        <input type="text" id="cpProvCccd" name="id_card_number" class="input" required placeholder="079099001122">
      </div>
      <div class="field-group">
        <label class="field-label" for="cpProvInfo">Mô tả kinh nghiệm chuyên môn</label>
        <textarea id="cpProvInfo" name="info" class="textarea" rows="2" required>Nhân viên kỹ thuật chính thức của ${comp.company_name}, tác phong chuẩn mực.</textarea>
      </div>
      <div class="field-group">
        <label class="field-label">Phân công dịch vụ đảm nhiệm</label>
        <div class="choice-grid-2">
          ${svcsToShow
            .map(
              (s) => `
            <label class="choice-card">
              <input type="checkbox" name="serviceIds" value="${s.service_id}" checked>
              <span style="font-size:13.5px; font-weight:600;">${s.title}</span>
            </label>`,
            )
            .join("")}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Hủy</button>
      <button type="submit" class="btn btn-primary">Tạo hồ sơ Thợ &rarr;</button>
    </div>
  </form>
`;
}

export async function companyAddProvider(form) {
  const db = window.GDX_DB;
  const comp = getActiveCompanyProfile();
  const serviceIds = Array.from(
    form.querySelectorAll('input[name="serviceIds"]:checked'),
  ).map((el) => Number(el.value));
  const payload = {
    company_id: comp.company_id,
    full_name: form.full_name.value.trim(),
    phone_number: form.phone_number.value.trim(),
    email: form.email ? form.email.value.trim() : "",
    password: form.password ? form.password.value : "123456",
    id_card_number: form.id_card_number.value.trim(),
    info: form.info.value.trim(),
    service_ids: serviceIds,
    ward_ids: ["27403"],
  };

  const res = await apiRequest("/api/company/providers", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (res && res.ok && res.provider_profile && res.user) {
    db.users.push(res.user);
    db.provider_profiles.push(res.provider_profile);
    serviceIds.forEach((sid) => {
      db.provider_services.push({
        provider_id: res.provider_profile.provider_id,
        service_id: sid,
      });
    });
    refreshClientPublicProviders();
    closeModal();
    showToast(`Đã thêm nhân viên Thợ ${res.user.full_name}!`);
    if (state.currentScreen === "4.2") go("4.2");
  } else {
    showToast(
      (res && res.error) ||
        "Không thể tạo hồ sơ Thợ. Kiểm tra số điện thoại hoặc CCCD.",
    );
  }
}

export async function companyUpdateProviderServices(providerId, form) {
  const db = window.GDX_DB;
  const comp = getActiveCompanyProfile();
  const serviceIds = Array.from(
    form.querySelectorAll('input[name="serviceIds"]:checked'),
  ).map((el) => Number(el.value));
  await apiRequest(`/api/company/providers/${providerId}/services`, {
    method: "PUT",
    body: JSON.stringify({
      company_id: comp.company_id,
      service_ids: serviceIds,
    }),
  });
  db.provider_services = (db.provider_services || []).filter(
    (ps) => Number(ps.provider_id) !== Number(providerId),
  );
  serviceIds.forEach((sid) => {
    db.provider_services.push({
      provider_id: Number(providerId),
      service_id: sid,
    });
  });
  closeModal();
  showToast("Đã cập nhật dịch vụ phân công cho nhân viên!");
  if (state.currentScreen === "4.2") go("4.2");
}

// 4.5: Thêm / Chỉnh sửa Dịch vụ Công ty (Company Modal)
export function renderModal_4_5(el, params = {}) {
  const db = window.GDX_DB;
  const comp = getActiveCompanyProfile();
  const editing = params.serviceId
    ? (db.services || []).find(
        (s) => Number(s.service_id) === Number(params.serviceId),
      )
    : null;

  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">4.5. ${editing ? `Chỉnh sửa Dịch vụ #${shortCode(editing.service_id)}` : "Tạo Dịch vụ mới cho Công ty"}</div>
      <div class="field-hint">Bảng: services (company_id = #${shortCode(comp.company_id)})</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <form onsubmit="event.preventDefault(); GDXApp.companySaveService(${editing ? editing.service_id : "null"}, this);">
    <div class="modal-body form-stack">
      <div class="field-group">
        <label class="field-label" for="cpSvcTitle">Tên gói dịch vụ</label>
        <input type="text" id="cpSvcTitle" name="title" class="input" value="${editing ? editing.title : ""}" required placeholder="Ví dụ: Tổng vệ sinh chung cư cao cấp">
      </div>
      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="cpSvcCat">Danh mục</label>
          <select id="cpSvcCat" name="category_id" class="select">
            ${(db.service_categories || [])
              .map(
                (c) =>
                  `<option value="${c.category_id}" ${editing && Number(editing.category_id) === Number(c.category_id) ? "selected" : ""}>${c.name}</option>`,
              )
              .join("")}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="cpSvcType">Cách tính giá</label>
          <select id="cpSvcType" name="pricing_type" class="select">
            <option value="hourly" ${editing && editing.pricing_type === "hourly" ? "selected" : ""}>Theo giờ (hourly)</option>
            <option value="fixed" ${editing && editing.pricing_type === "fixed" ? "selected" : ""}>Trọn gói (fixed)</option>
          </select>
        </div>
      </div>
      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="cpSvcPrice">Đơn giá (VNĐ)</label>
          <input type="number" id="cpSvcPrice" name="price" class="input num" value="${editing ? editing.price : 120000}" min="10000" step="5000" required>
        </div>
        <div class="field-group">
          <label class="field-label" for="cpSvcDur">Thời lượng ước tính (phút)</label>
          <input type="number" id="cpSvcDur" name="estimated_duration" class="input num" value="${editing ? editing.estimated_duration : 120}" min="30" step="30" required>
        </div>
      </div>
      <div class="field-group">
        <label class="field-label" for="cpSvcDesc">Mô tả chi tiết</label>
        <textarea id="cpSvcDesc" name="description" class="textarea" rows="2">${editing ? editing.description : ""}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Hủy</button>
      <button type="submit" class="btn btn-primary">Lưu dịch vụ Công ty</button>
    </div>
  </form>
`;
}

export async function companySaveService(serviceId, form) {
  const db = window.GDX_DB;
  const comp = getActiveCompanyProfile();
  const payload = {
    company_id: comp.company_id,
    category_id: Number(form.category_id.value),
    title: form.title.value.trim(),
    pricing_type: form.pricing_type.value,
    price: Number(form.price.value),
    estimated_duration: Number(form.estimated_duration.value),
    description: form.description ? form.description.value.trim() : "",
  };

  if (serviceId) {
    const res = await apiRequest(`/api/company/services/${serviceId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    const existing = (db.services || []).find(
      (s) => Number(s.service_id) === Number(serviceId),
    );
    if (existing) Object.assign(existing, (res && res.service) || payload);
  } else {
    const res = await apiRequest("/api/company/services", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (res && res.ok && res.service) {
      db.services.push(res.service);
    }
  }

  closeModal();
  showToast("Đã lưu dịch vụ của Công ty!");
  if (state.currentScreen === "4.3") go("4.3");
}

