import { apiRequest } from "../core/api.js";
import { calcDistanceKm, formatCccd, formatDateTime, formatMoney, formatTimer, getServiceImage, paymentBadge, shortCode } from "../core/formatters.js";
import { go } from "../core/router.js";
import { state } from "../core/state.js";
import { closeModal } from "../shared/modal.js";
import { Icons, showToast } from "../shared/ui-utils.js";


// --- COMPONENT 2.5: PROVIDER STATUS & GPS TOGGLE ---
export function toggleProviderOnline() {
  const prov = window.GDX_DB.provider_profiles.find(
    (p) => p.provider_id === state.activeProviderId,
  );
  if (!prov) return;
  prov.is_available_online = !prov.is_available_online;

  const dot = document.getElementById("providerOnlineDot");
  const label = document.getElementById("providerOnlineLabel");
  if (dot && label) {
    if (prov.is_available_online) {
      dot.className = "status-dot is-online";
      label.textContent = "Đang nhận việc";
    } else {
      dot.className = "status-dot";
      label.textContent = "Tạm dừng nhận đơn";
    }
  }
  apiRequest("/api/provider/online-gps", {
    method: "PATCH",
    body: JSON.stringify({
      provider_id: state.activeProviderId,
      is_available_online: prov.is_available_online,
    }),
  });
  showToast(
    `Trạng thái nhận việc: ${prov.is_available_online ? "Đang trực tuyến" : "Tạm nghỉ"}`,
  );
  if (state.currentScreen === "2.1") go("2.1");
}

export function refreshProviderGPS() {
  const prov = window.GDX_DB.provider_profiles.find(
    (p) => p.provider_id === state.activeProviderId,
  );
  if (!prov) return;
  prov.lattitude = Number(
    (prov.lattitude + (Math.random() - 0.5) * 0.002).toFixed(6),
  );
  prov.longtitude = Number(
    (prov.longtitude + (Math.random() - 0.5) * 0.002).toFixed(6),
  );

  const gpsEl = document.getElementById("providerGpsText");
  if (gpsEl) gpsEl.textContent = `${prov.lattitude}, ${prov.longtitude}`;
  apiRequest("/api/provider/online-gps", {
    method: "PATCH",
    body: JSON.stringify({
      provider_id: state.activeProviderId,
      lattitude: prov.lattitude,
      longtitude: prov.longtitude,
    }),
  });
  showToast(`Đã cập nhật tọa độ: ${prov.lattitude}, ${prov.longtitude}`);
  if (state.currentScreen === "2.1" || state.currentScreen === "2.2")
    go(state.currentScreen);
}


// =====================================================================
// SCREEN RENDERERS: PHÂN HỆ 2 (PROVIDER PORTAL: 2.1 – 2.4)
// =====================================================================

// 2.1: Hòm thư nhận việc làm (Job Inbox & Dispatch Board)
export function renderScreen_2_1(container) {
  const db = window.GDX_DB;
  const prov = (db.provider_profiles || []).find(
    (p) => p.provider_id === state.activeProviderId,
  ) ||
    (db.provider_profiles || [])[0] || {
      provider_id: 201,
      full_name: "Đặng Thị Mai Lan",
      lattitude: 10.7412,
      longtitude: 106.7021,
      is_available_online: true,
    };

  state.inboxTab = state.inboxTab || "available";
  state.expiredJobIds = state.expiredJobIds || [];
  state.dismissedJobIds = state.dismissedJobIds || [];

  const activeJob = (db.bookings || []).find(
    (b) =>
      b.provider_id === prov.provider_id &&
      (b.status === "in_progress" || b.status === "confirmed"),
  );

  // Việc khả dụng trong hộp thư
  const availableJobs = (db.bookings || []).filter((b) => {
    if (b.status !== "pending") return false;
    if (state.expiredJobIds.includes(b.booking_id)) return false;
    if (state.dismissedJobIds.includes(b.booking_id)) return false;
    if (
      b.provider_id !== null &&
      b.provider_id !== undefined &&
      b.provider_id !== prov.provider_id &&
      b.dispatch_type !== "broadcast"
    ) {
      return false;
    }
    if (
      state.jobBoardFilter.wardId !== "all" &&
      b.ward_id !== state.jobBoardFilter.wardId
    )
      return false;
    return true;
  });

  // Việc đã hết hạn (do đối tác khác nhận trước hoặc bị hết hiệu lực)
  const expiredJobs = (db.bookings || []).filter((b) => {
    if (state.expiredJobIds.includes(b.booking_id)) return true;
    if (
      b.status === "confirmed" &&
      b.provider_id &&
      b.provider_id !== prov.provider_id
    ) {
      return true;
    }
    return false;
  });

  container.innerHTML = `
  <div class="v3-jobs-page">
    <div class="v3-jobs-header">
      <h1 class="v3-jobs-title">Việc làm mới quanh khu vực của bạn</h1>
      <button type="button" class="v3-jobs-status-pill ${prov.is_available_online ? "is-online" : "is-offline"}" onclick="GDXApp.openModal('2.5')" style="border:none; cursor:pointer;" title="Cập nhật trạng thái nhận việc & GPS">
        <span class="v3-jobs-status-dot" aria-hidden="true"></span>
        <span>${prov.is_available_online ? "Đang bật nhận việc" : "Đang tạm nghỉ"}</span>
      </button>
    </div>

    ${
      activeJob
        ? `
      <div class="active-booking-banner" style="border-radius:16px;">
        <div class="active-booking-banner-info">
          <span class="status-dot is-online"></span>
          <div>
            <strong>Ca làm hiện tại: Đơn #${shortCode(activeJob.booking_id)} (${activeJob.status === "in_progress" ? "Đang thực hiện" : "Đã xác nhận"})</strong>
            <div class="field-hint">${activeJob.address} &middot; <strong class="num">${formatMoney(activeJob.total_amount + activeJob.total_incidental)}</strong></div>
          </div>
        </div>
        <button type="button" class="v3-job-accept-btn" style="height:38px;" onclick="GDXApp.go('2.2', {bookingId: ${activeJob.booking_id}})">
          Mở ca đang làm &rarr;
        </button>
      </div>`
        : ""
    }

    <div class="v3-jobs-list">
      ${
        availableJobs.length === 0
          ? `
          <div class="panel" style="text-align:center; padding:48px 24px; border-radius:20px;">
            <strong style="font-size:17px; display:block; margin-bottom:6px;">Hiện chưa có việc mới quanh khu vực của bạn</strong>
            <p class="field-hint" style="max-width:440px; margin:0 auto 18px;">
              Các đơn rải chung và yêu cầu chỉ định riêng từ khách hàng sẽ tự động hiển thị tại đây ngay khi phát sinh.
            </p>
            <button type="button" class="v3-job-accept-btn" onclick="GDXApp.go('1.2')">Tạo thử một đơn đặt lịch mới &rarr;</button>
          </div>`
          : availableJobs
              .map((b) => {
                const svc = (db.services || []).find(
                  (s) => s.service_id === b.service_id,
                );
                const w = (db.ward || []).find(
                  (x) => x.ward_id === b.ward_id,
                );
                const distKm = calcDistanceKm(
                  prov.lattitude || 10.7412,
                  prov.longtitude || 106.7021,
                  b.latitude || 10.7412,
                  b.longitude || 106.7021,
                );
                const isBroadcast =
                  !b.provider_id ||
                  b.dispatch_type === "broadcast" ||
                  (b.notes && b.notes.includes("[BROADCAST"));
                const locationLabel = w
                  ? `${b.address ? b.address + ", " : ""}${w.name}`
                  : b.address;

                return `
              <article class="v3-job-card">
                <img src="${getServiceImage(svc)}" alt="${svc ? svc.title : "Dịch vụ"}" class="v3-job-thumb">

                <div class="v3-job-main">
                  <span class="v3-job-badge ${isBroadcast ? "is-broadcast" : "is-direct"}">
                    ${
                      isBroadcast
                        ? `&#9889; Đơn khu vực &middot; Cách ${distKm} km`
                        : `&#9733; Khách chỉ định đích danh`
                    }
                  </span>
                  <h2 class="v3-job-title">${svc ? svc.title : "Dịch vụ"} (~${svc ? svc.estimated_duration : 120} phút)</h2>
                  <div class="v3-job-meta">
                    <span class="num">${formatDateTime(b.scheduled_time)}</span> &middot; ${locationLabel}
                  </div>
                </div>

                <div class="v3-job-right">
                  <div class="v3-job-price num">${formatMoney(b.total_amount)}</div>
                  <div class="v3-job-actions">
                    <button type="button" class="v3-job-skip-btn" onclick="GDXApp.dismissJob(${b.booking_id})">
                      Bỏ qua
                    </button>
                    <button type="button" class="v3-job-accept-btn" onclick="GDXApp.acceptJob(${b.booking_id})">
                      Nhận việc ngay &rarr;
                    </button>
                  </div>
                </div>
              </article>`;
              })
              .join("")
      }
    </div>
  </div>
`;
}

export function setJobBoardWard(wardId) {
  state.jobBoardFilter.wardId = wardId;
  go("2.1");
}

export function setInboxTab(tab) {
  state.inboxTab = tab;
  go("2.1");
}

export function dismissJob(bookingId) {
  if (!state.dismissedJobIds) state.dismissedJobIds = [];
  state.dismissedJobIds.push(bookingId);
  showToast(`Đã tạm ẩn đơn #${bookingId} khỏi hộp thư.`);
  go("2.1");
}

export function simulateJobExpired(bookingId) {
  if (!state.expiredJobIds) state.expiredJobIds = [];
  if (!state.expiredJobIds.includes(bookingId))
    state.expiredJobIds.push(bookingId);
  const db = window.GDX_DB;
  const bk = (db.bookings || []).find((b) => b.booking_id === bookingId);
  if (bk) {
    bk.status = "confirmed";
    bk.provider_id = 202; // Nguyen Van Tuan took it
  }
  showToast(
    `Mô phỏng: Đơn #${bookingId} vừa được đối tác Nguyễn Văn Tuấn nhận trước! Đơn đã chuyển sang tab Expired.`,
  );
  state.inboxTab = "expired";
  go("2.1");
}

export async function acceptJob(bookingId) {
  const db = window.GDX_DB;
  const bk = (db.bookings || []).find((b) => b.booking_id === bookingId);
  if (!bk) return;

  const provId = state.activeProviderId || 201;
  const activeProv = (db.provider_profiles || []).find(
    (p) => p.provider_id === provId,
  );
  const provUserId =
    state.activeUserId ||
    (activeProv && activeProv.user_id) ||
    "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b21";

  // Concurrency check via API
  const res = await apiRequest(`/api/bookings/${bookingId}/accept`, {
    method: "POST",
    body: JSON.stringify({
      provider_id: provId,
      user_id: provUserId,
    }),
  });

  if (res && res.expired) {
    if (!state.expiredJobIds) state.expiredJobIds = [];
    if (!state.expiredJobIds.includes(bookingId))
      state.expiredJobIds.push(bookingId);
    bk.status = "confirmed";
    bk.provider_id = 202; // Taken by another provider
    showToast(
      "Rất tiếc! Đơn này vừa được một đối tác khác nhận trước ít giây hoặc đã hết hạn.",
    );
    state.inboxTab = "expired";
    go("2.1");
    return;
  }

  if (!res || !res.ok) {
    showToast(res && res.error ? res.error : "Không thể nhận đơn lúc này.");
    return;
  }

  const nowIso = new Date().toISOString();
  bk.provider_id = provId;
  bk.status = "confirmed";
  bk.dispatch_type = "direct";
  db.booking_status_history.unshift({
    history_id: Date.now(),
    booking_id: bookingId,
    previous_status: "pending",
    old_status: "pending",
    new_status: "confirmed",
    changed_by: provUserId,
    reason: "Đối tác đã xác nhận nhận việc từ Hòm thư việc làm",
    created_at: nowIso,
    changed_at: nowIso,
  });
  state.selectedBookingId = bookingId;
  showToast(
    `Đã nhận đơn #${bookingId} thành công! Chuyển sang màn hình Ca làm việc.`,
  );
  go("2.2", { bookingId });
}

// 2.2: Ca làm việc hiện tại (Live Timer)
export function renderScreen_2_2(container, params = {}) {
  const db = window.GDX_DB;
  const bk =
    (params.bookingId &&
      db.bookings.find((b) => b.booking_id === Number(params.bookingId))) ||
    db.bookings.find((b) => b.booking_id === 1042) ||
    db.bookings[0];
  const svc = db.services.find((s) => s.service_id === bk.service_id);
  const cust = db.customer_profiles.find(
    (c) => c.customer_id === bk.customer_id,
  );
  const custUser = cust
    ? db.users.find((u) => u.user_id === cust.user_id)
    : null;
  const estSeconds = ((svc && svc.estimated_duration) || 120) * 60;
  const shiftPct = Math.min(
    100,
    Math.max(
      5,
      Math.round(((state.liveTimerSeconds || 0) / estSeconds) * 100),
    ),
  );
  const ringCircumference = 603.19;
  const ringOffset = (ringCircumference * (1 - shiftPct / 100)).toFixed(2);
  const statusLabelMap = {
    pending: "Chờ bắt đầu",
    confirmed: "Đã nhận ca",
    in_progress: "Ca đang thực hiện",
    completed: "Đã hoàn thành",
    cancelled: "Đã hủy",
  };
  const shiftStatusLabel = statusLabelMap[bk.status] || "Ca đang thực hiện";
  const customerName = custUser ? custUser.full_name : "Nguyễn Minh Thảo";

  container.innerHTML = `
  <div class="v3-shift-wrap">
    <div class="v3-shift-card">
      <div class="v3-shift-status-pill ${bk.status === "completed" ? "is-done" : ""}">
        <span class="v3-shift-status-dot" aria-hidden="true"></span>
        <span>${shiftStatusLabel} &middot; #${shortCode(bk.booking_id)}</span>
      </div>

      <div class="v3-shift-ring-wrap" onclick="GDXApp.toggleShiftTimer()" title="Bấm để tạm dừng / tiếp tục đồng hồ">
        <svg class="v3-shift-ring-svg" width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
          <circle cx="110" cy="110" r="96" fill="none" stroke="#E2E8F0" stroke-width="10"></circle>
          <circle
            cx="110"
            cy="110"
            r="96"
            fill="none"
            stroke="#1B3B2B"
            stroke-width="10"
            stroke-linecap="round"
            stroke-dasharray="${ringCircumference}"
            stroke-dashoffset="${ringOffset}"
            transform="rotate(-90 110 110)"
          ></circle>
        </svg>
        <div class="v3-shift-ring-center">
          <div class="v3-shift-timer num" id="liveShiftTimerDisplay">${formatTimer(state.liveTimerSeconds)}</div>
          <div class="v3-shift-pct">Đã làm ${shiftPct}% ca</div>
        </div>
      </div>

      <div class="v3-shift-summary">
        ${svc ? svc.title : "Dọn dẹp nhà cửa theo giờ"} &middot; KH: ${customerName} &middot; ${bk.address}
      </div>

      <div class="v3-shift-dock">
        <button type="button" class="v3-shift-btn-muted" onclick="GDXApp.openModal('2.7', {bookingId: ${bk.booking_id}})">
          Kê khai vật tư
        </button>
        <button type="button" class="v3-shift-btn-danger" onclick="GDXApp.openModal('2.9', {bookingId: ${bk.booking_id}})">
          Báo cáo sự cố
        </button>
        ${
          bk.status === "confirmed"
            ? `<button type="button" class="v3-shift-btn-primary" onclick="GDXApp.startShiftWork(${bk.booking_id})">
                Bắt đầu làm việc &rarr;
              </button>`
            : `<button type="button" class="v3-shift-btn-primary" onclick="GDXApp.openModal('2.8', {bookingId: ${bk.booking_id}})">
                Hoàn thành &amp; Nghiệm thu &rarr;
              </button>`
        }
      </div>

      <div class="v3-shift-sub-meta">
        <span>Thu nhập dự kiến: <strong class="num">${formatMoney((bk.total_amount || 0) + (bk.total_incidental || 0))}</strong></span>
        <span>&middot;</span>
        <span>${state.liveTimerInterval ? "Đồng hồ đang chạy" : "Đồng hồ đang tạm dừng (bấm vòng tròn để chạy)"}</span>
      </div>
    </div>
  </div>
`;
}

export function toggleShiftTimer() {
  if (state.liveTimerInterval) {
    clearInterval(state.liveTimerInterval);
    state.liveTimerInterval = null;
    showToast("Đã tạm dừng đồng hồ ca làm");
  } else {
    state.liveTimerInterval = setInterval(() => {
      state.liveTimerSeconds += 1;
      const el = document.getElementById("liveShiftTimerDisplay");
      if (el) el.textContent = formatTimer(state.liveTimerSeconds);
    }, 1000);
    showToast("Đang tính giờ ca làm việc");
  }
  if (state.currentScreen === "2.2") go("2.2");
}

export function startShiftWork(bookingId) {
  const bk = window.GDX_DB.bookings.find((b) => b.booking_id === bookingId);
  if (bk) bk.status = "in_progress";
  showToast(`Đã bắt đầu thực hiện ca làm #${bookingId}`);
  go("2.2", { bookingId });
}

// 2.3: Ví Thu Nhập & Lịch Ca
export function renderScreen_2_3(container) {
  const db = window.GDX_DB;
  const prov =
    db.provider_profiles.find(
      (p) => p.provider_id === state.activeProviderId,
    ) || db.provider_profiles[0];
  const completedPaid = db.bookings.filter(
    (b) =>
      b.provider_id === state.activeProviderId &&
      b.status === "completed" &&
      b.payment_status === "paid",
  );
  const totalEarned = completedPaid.reduce(
    (acc, b) => acc + b.total_amount + b.total_incidental,
    0,
  );
  const schedules = db.availability_schedules.filter(
    (s) => s.provider_id === state.activeProviderId,
  );
  const exceptions = db.availability_exceptions.filter(
    (e) => e.provider_id === state.activeProviderId,
  );
  const myReviews = db.reviews.filter(
    (r) => r.provider_id === state.activeProviderId,
  );
  const dayNames = [
    "Chủ nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];

  const miniBarsHtml = `
  <div class="v3-kpi-bars" aria-hidden="true">
    <span style="height:10px;"></span>
    <span style="height:16px;"></span>
    <span style="height:22px;"></span>
    <span style="height:28px;"></span>
    <span class="is-peak" style="height:36px;"></span>
  </div>
`;

  container.innerHTML = `
  <div class="v3-wallet-page">
    <div class="v3-wallet-header">
      <h1 class="v3-wallet-title">Ví thu nhập &amp; Lịch ca làm việc</h1>
      <button type="button" class="v3-wallet-primary-btn" onclick="GDXApp.openModal('2.6', {tab: 'schedule'})">
        Thiết lập lịch cố định
      </button>
    </div>

    <div class="v3-kpi-grid-3">
      <div class="v3-kpi-card">
        <div>
          <div class="v3-kpi-label">Số dư khả dụng</div>
          <div class="v3-kpi-value num">${formatMoney(totalEarned)}</div>
          <div class="v3-kpi-sub">Rút tiền tức thì</div>
        </div>
        ${miniBarsHtml}
      </div>

      <div class="v3-kpi-card">
        <div>
          <div class="v3-kpi-label">Thu nhập tuần này</div>
          <div class="v3-kpi-value num">${formatMoney(totalEarned)}</div>
          <div class="v3-kpi-sub">+22% so với tuần trước</div>
        </div>
        ${miniBarsHtml}
      </div>

      <div class="v3-kpi-card">
        <div>
          <div class="v3-kpi-label">Tổng ca hoàn thành</div>
          <div class="v3-kpi-value num">${completedPaid.length} ca</div>
          <div class="v3-kpi-sub">&#9733; ${prov.average_rating || "4.95"} đánh giá</div>
        </div>
        ${miniBarsHtml}
      </div>
    </div>

    <div class="grid-12" style="margin-top:8px;">
    <div class="col-7 form-stack">
      <div class="panel form-stack">
        <h2 class="panel-title">Lịch sử thu nhập các ca đã hoàn tất</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Dịch vụ thực hiện</th>
                <th>Ngày hẹn</th>
                <th class="num">Tổng thu</th>
                <th>Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              ${completedPaid
                .map((b) => {
                  const s = db.services.find(
                    (x) => x.service_id === b.service_id,
                  );
                  return `
                  <tr>
                    <td class="num"><strong>#${shortCode(b.booking_id)}</strong></td>
                    <td>${s ? s.title : ""}</td>
                    <td class="num">${formatDateTime(b.scheduled_time)}</td>
                    <td class="num"><strong>${formatMoney(b.total_amount + b.total_incidental)}</strong></td>
                    <td>${paymentBadge(b.payment_status)}</td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel form-stack">
        <h2 class="panel-title">Nhận xét của khách hàng dành cho bạn (${myReviews.length})</h2>
        ${myReviews
          .map(
            (r) => `
          <div class="panel-subtle" style="display:flex; justify-content:space-between; gap:12px;">
            <div>
              ${Icons.starRow(r.rating)}
              <div style="margin-top:4px; font-size:13.5px;">"${r.comment}"</div>
            </div>
            <span class="field-hint num">Đơn #${shortCode(r.booking_id)}</span>
          </div>`,
          )
          .join("")}
      </div>
    </div>

    <div class="col-5 form-stack">
      <div class="panel form-stack">
        <div class="panel-header" style="margin-bottom:0;">
          <h2 class="panel-title">Lịch làm việc định kỳ (availability_schedules)</h2>
          <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.openModal('2.6', {tab: 'schedule'})">Sửa lịch</button>
        </div>
        ${schedules
          .map(
            (s) => `
          <div class="slip-row">
            <strong>${dayNames[s.day_of_week]}</strong>
            <span class="slip-dots"></span>
            <span class="badge badge-positive num">${s.start_time} – ${s.end_time}</span>
          </div>`,
          )
          .join("")}
      </div>

      <div class="panel form-stack">
        <div class="panel-header" style="margin-bottom:0;">
          <h2 class="panel-title">Lịch nghỉ phép đột xuất (availability_exceptions)</h2>
          <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.openModal('2.6', {tab: 'exception'})">+ Thêm</button>
        </div>
        ${exceptions
          .map(
            (e) => `
          <div class="panel-subtle">
            <div style="display:flex; justify-content:space-between;">
              <strong class="num">Ngày ${e.exception_date}</strong>
              <span class="badge badge-warning">${e.start_time} – ${e.end_time}</span>
            </div>
            <div class="field-hint" style="margin-top:4px;">Lý do: ${e.reason}</div>
          </div>`,
          )
          .join("")}
      </div>
    </div>
  </div>
  </div>
`;
}

// 2.4: Cấu hình Năng lực & Khu vực
export function renderScreen_2_4(container) {
  const db = window.GDX_DB;
  const prov =
    db.provider_profiles.find(
      (p) => p.provider_id === state.activeProviderId,
    ) || db.provider_profiles[0];
  const mySvcIds = db.provider_services
    .filter((ps) => ps.provider_id === state.activeProviderId)
    .map((ps) => ps.service_id);
  const myWardIds = db.provider_areas
    .filter((pa) => pa.provider_id === state.activeProviderId)
    .map((pa) => pa.ward_id);
  const comp = (db.company_profiles || []).find(
    (c) => Number(c.company_id) === Number(prov.company_id),
  );
  const assignedServices = (db.services || []).filter((s) =>
    mySvcIds.includes(s.service_id),
  );

  const areaWards = (db.ward || []).filter((w) =>
    myWardIds.includes(w.ward_id),
  );
  const areaLabel =
    areaWards.length > 0
      ? areaWards
          .map((w) => w.name.replace("Phường ", "P. "))
          .slice(0, 2)
          .join(", ")
      : "Quận 7";

  container.innerHTML = `
  <div class="v3-skills-page">
    <div class="v3-skills-header">
      <h1 class="v3-skills-title">Năng lực chuyên môn &amp; Khu vực hoạt động</h1>
      <button type="button" class="v3-track-chip-btn" onclick="document.getElementById('v3ProviderConfigPanel').classList.toggle('is-open')">
        Chỉnh sửa hồ sơ &amp; Khu vực
      </button>
    </div>

    <div class="v3-skills-layout">
      <!-- Left: Assigned Skill Cards Grid (Figma 2.4 1:1) -->
      <div class="v3-skill-grid">
        ${
          assignedServices.length > 0
            ? assignedServices
                .map(
                  (s) => `
              <article class="v3-skill-card">
                <div class="v3-skill-card-media">
                  <img src="${getServiceImage(s)}" alt="${s.title}">
                  <span class="v3-skill-status-pill">&#10003; Đang bật</span>
                </div>
                <div class="v3-skill-card-title">${s.title}</div>
              </article>`,
                )
                .join("")
            : `<div class="panel" style="padding:28px; border-radius:18px;">Chưa có dịch vụ nào được Công ty phân công.</div>`
        }
      </div>

      <!-- Right: Sage-Green Area Radius Map Card (Figma 2.4 1:1) -->
      <div class="v3-area-map-card">
        <div class="v3-tracking-map-grid" aria-hidden="true"></div>
        <div class="v3-track-map-pin">
          <span aria-hidden="true">&#128205;</span>
          <span>Bán kính hoạt động: 5 km &middot; ${areaLabel}</span>
        </div>
      </div>
    </div>

    <!-- Expandable Provider Bio & Ward Config Form -->
    <form id="v3ProviderConfigPanel" class="v3-skills-config-panel form-stack" onsubmit="event.preventDefault(); GDXApp.saveProviderConfig(this);">
      <div style="display:flex; align-items:center; gap:14px;">
        <img src="${prov.avatar_url || "/assets/provider-lan.jpg"}" onerror="this.onerror=null; this.src='/assets/provider-lan.jpg';" alt="Avatar" class="provider-avatar-lg">
        <div>
          <h2 class="panel-title" style="margin:0;">Hồ sơ công khai &amp; Giới thiệu kinh nghiệm</h2>
          <div class="field-hint">
            Trạng thái: <strong style="color:var(--positive);">${prov.verification_status}</strong> &middot; CCCD: <span class="num">${formatCccd(prov.id_card_number)}</span>
            ${comp ? ` &middot; Công ty: <strong>${comp.company_name}</strong>` : ""}
          </div>
        </div>
      </div>

      <div class="field-group">
        <label class="field-label" for="cfgProvInfo">Giới thiệu kinh nghiệm hiển thị với khách hàng</label>
        <textarea id="cfgProvInfo" name="info" class="textarea" rows="2" required>${prov.info}</textarea>
      </div>

      <div>
        <div class="field-label" style="margin-bottom:8px;">Phường / Xã đăng ký hoạt động</div>
        <div class="choice-grid-3">
          ${db.ward
            .filter((w) => w.provinceId === "79")
            .map(
              (w) => `
            <label class="choice-card">
              <input type="checkbox" name="wardIds" value="${w.ward_id}" ${myWardIds.includes(w.ward_id) ? "checked" : ""}>
              <div>
                <div style="font-weight:600;">${w.name}</div>
                <div class="field-hint num">Mã: ${w.ward_id}</div>
              </div>
            </label>`,
            )
            .join("")}
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end;">
        <button type="submit" class="v3-wallet-primary-btn">Lưu thông tin &amp; khu vực nhận việc</button>
      </div>
    </form>
  </div>
`;
}

export async function saveProviderConfig(form) {
  const db = window.GDX_DB;
  const prov = db.provider_profiles.find(
    (p) => p.provider_id === state.activeProviderId,
  );
  const wardIds = Array.from(
    form.querySelectorAll('input[name="wardIds"]:checked'),
  ).map((el) => el.value);
  if (prov && form.info) prov.info = form.info.value;
  if (wardIds.length > 0) {
    db.provider_areas = db.provider_areas.filter(
      (pa) => Number(pa.provider_id) !== Number(state.activeProviderId),
    );
    wardIds.forEach((wid) => {
      db.provider_areas.push({
        provider_id: state.activeProviderId,
        ward_id: wid,
      });
    });
  }
  await apiRequest("/api/provider/capabilities", {
    method: "PUT",
    body: JSON.stringify({
      provider_id: state.activeProviderId,
      info: form.info ? form.info.value : "",
      ward_ids: wardIds,
    }),
  });
  showToast("Đã lưu thông tin mô tả và khu vực nhận việc!");
  go("2.4");
}


// 2.6: Kê khai Chi phí phát sinh
// 2.5: Thanh trạng thái Nhận việc & GPS
export function renderModal_2_5(el) {
  const db = window.GDX_DB;
  const prov = (db.provider_profiles || []).find(
    (p) => p.provider_id === state.activeProviderId,
  ) ||
    (db.provider_profiles || [])[0] || {
      provider_id: 201,
      is_available_online: true,
      lattitude: 10.7412,
      longtitude: 106.7021,
    };

  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">2.5. Thanh trạng thái Nhận việc &amp; GPS</div>
      <div class="field-hint">Bảng: provider_profiles (is_available_online, lattitude, longtitude)</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">&times;</button>
  </div>
  <form onsubmit="event.preventDefault(); GDXApp.saveProviderOnlineGps(this);">
    <div class="modal-body form-stack">
      <label class="choice-card" style="padding:14px 16px;">
        <input type="checkbox" name="is_available_online" ${prov.is_available_online ? "checked" : ""}>
        <div>
          <div style="font-weight:700;">Bật nhận việc trực tuyến</div>
          <div class="field-hint">Cho phép hệ thống gửi đơn khu vực và đơn chỉ định mới về hòm thư của bạn</div>
        </div>
      </label>
      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="provGpsLat">Vĩ độ hiện tại (lattitude)</label>
          <input type="number" step="0.000001" id="provGpsLat" name="lattitude" class="input num" value="${prov.lattitude || 10.7412}" required>
        </div>
        <div class="field-group">
          <label class="field-label" for="provGpsLng">Kinh độ hiện tại (longtitude)</label>
          <input type="number" step="0.000001" id="provGpsLng" name="longtitude" class="input num" value="${prov.longtitude || 106.7021}" required>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Hủy</button>
      <button type="submit" class="btn btn-primary">Lưu trạng thái &amp; GPS</button>
    </div>
  </form>
`;
}

export function saveProviderOnlineGps(form) {
  const db = window.GDX_DB;
  const prov =
    (db.provider_profiles || []).find(
      (p) => p.provider_id === state.activeProviderId,
    ) || (db.provider_profiles || [])[0];
  if (prov) {
    prov.is_available_online = Boolean(form.is_available_online.checked);
    prov.lattitude = Number(form.lattitude.value);
    prov.longtitude = Number(form.longtitude.value);
  }
  closeModal();
  showToast(
    prov && prov.is_available_online
      ? "Đã bật nhận việc & cập nhật GPS!"
      : "Đã chuyển sang trạng thái tạm nghỉ",
  );
  go(state.currentScreen);
}

// 2.6: Thiết lập Lịch cố định & Xin nghỉ phép
export function renderModal_2_6(el, params = {}) {
  const activeTab = params.tab === "exception" ? "exception" : "schedule";
  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">2.6. Thiết lập Lịch cố định &amp; Xin nghỉ phép</div>
      <div class="field-hint">Bảng: availability_schedules, availability_exceptions</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">&times;</button>
  </div>
  <div class="modal-body form-stack">
    <div class="v3-seg-tabs" role="tablist">
      <button type="button" class="v3-seg-tab ${activeTab === "schedule" ? "is-active" : ""}" onclick="GDXApp.openModal('2.6', {tab: 'schedule'})">
        Lịch làm việc định kỳ
      </button>
      <button type="button" class="v3-seg-tab ${activeTab === "exception" ? "is-active" : ""}" onclick="GDXApp.openModal('2.6', {tab: 'exception'})">
        Xin nghỉ phép đột xuất
      </button>
    </div>

    ${
      activeTab === "schedule"
        ? `
      <form class="form-stack" onsubmit="event.preventDefault(); GDXApp.addWeeklySchedule(this);">
        <div class="field-group">
          <label class="field-label" for="schDay">Thứ trong tuần (day_of_week)</label>
          <select id="schDay" name="day_of_week" class="select">
            <option value="1">Thứ Hai (1)</option>
            <option value="2">Thứ Ba (2)</option>
            <option value="3">Thứ Tư (3)</option>
            <option value="4">Thứ Năm (4)</option>
            <option value="5">Thứ Sáu (5)</option>
            <option value="6" selected>Thứ Bảy (6)</option>
            <option value="0">Chủ Nhật (0)</option>
          </select>
        </div>
        <div class="form-row-2">
          <div class="field-group">
            <label class="field-label" for="schStart">Giờ bắt đầu (start_time)</label>
            <input type="time" id="schStart" name="start_time" class="input num" value="08:00" required>
          </div>
          <div class="field-group">
            <label class="field-label" for="schEnd">Giờ kết thúc (end_time)</label>
            <input type="time" id="schEnd" name="end_time" class="input num" value="17:30" required>
          </div>
        </div>
        <div class="modal-footer" style="padding-inline:0; padding-bottom:0;">
          <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Hủy</button>
          <button type="submit" class="btn btn-primary">Lưu khung giờ làm việc</button>
        </div>
      </form>`
        : `
      <form class="form-stack" onsubmit="event.preventDefault(); GDXApp.addExceptionSchedule(this);">
        <div class="field-group">
          <label class="field-label" for="excDate">Ngày xin nghỉ (exception_date)</label>
          <input type="date" id="excDate" name="exception_date" class="input num" value="2026-10-28" required>
        </div>
        <div class="form-row-2">
          <div class="field-group">
            <label class="field-label" for="excStart">Từ giờ (start_time)</label>
            <input type="time" id="excStart" name="start_time" class="input num" value="08:00" required>
          </div>
          <div class="field-group">
            <label class="field-label" for="excEnd">Đến giờ (end_time)</label>
            <input type="time" id="excEnd" name="end_time" class="input num" value="18:00" required>
          </div>
        </div>
        <div class="field-group">
          <label class="field-label" for="excReason">Lý do nghỉ phép (reason)</label>
          <input type="text" id="excReason" name="reason" class="input" value="Về quê giải quyết việc gia đình" required>
        </div>
        <div class="modal-footer" style="padding-inline:0; padding-bottom:0;">
          <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Hủy</button>
          <button type="submit" class="btn btn-primary">Xác nhận đăng ký nghỉ</button>
        </div>
      </form>`
    }
  </div>
`;
}

export function addWeeklySchedule(form) {
  window.GDX_DB.availability_schedules.push({
    availability_id: Date.now(),
    provider_id: state.activeProviderId,
    day_of_week: Number(form.day_of_week.value),
    start_time: form.start_time.value,
    end_time: form.end_time.value,
  });
  closeModal();
  showToast("Đã cập nhật khung giờ làm việc định kỳ!");
  if (state.currentScreen === "2.3") go("2.3");
}

export function addExceptionSchedule(form) {
  window.GDX_DB.availability_exceptions.push({
    exception_id: Date.now(),
    provider_id: state.activeProviderId,
    exception_date: form.exception_date.value,
    start_time: form.start_time.value,
    end_time: form.end_time.value,
    reason: form.reason.value,
  });
  closeModal();
  showToast("Đã đăng ký lịch nghỉ phép đột xuất!");
  if (state.currentScreen === "2.3") go("2.3");
}

// 2.7: Kê khai Chi phí phát sinh (Incidental Cost)
export function renderModal_2_7(el, params = {}) {
  const bk =
    window.GDX_DB.bookings.find(
      (b) => b.booking_id === (params.bookingId || 1042),
    ) || window.GDX_DB.bookings[0];
  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">2.7. Kê khai Chi phí vật tư phát sinh · Đơn #${shortCode(bk.booking_id)}</div>
      <div class="field-hint">Cập nhật bookings.total_incidental và giải trình incidental_Specify</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">&times;</button>
  </div>
  <form onsubmit="event.preventDefault(); GDXApp.saveIncidentalCost(${bk.booking_id}, this);">
    <div class="modal-body form-stack">
      <div class="field-group">
        <label class="field-label" for="incAmount">Số tiền vật tư phát sinh (VNĐ - total_incidental &gt;= 0)</label>
        <input type="number" id="incAmount" name="total_incidental" class="input num" value="${bk.total_incidental || 30000}" min="0" step="5000" required>
      </div>
      <div class="field-group">
        <label class="field-label" for="incSpec">Giải trình chi tiết hạng mục (incidental_Specify)</label>
        <textarea id="incSpec" name="incidental_Specify" class="textarea" rows="3" required>${bk.incidental_Specify || "Mua thêm 01 chai dung dịch tẩy cặn kính chuyên dụng theo sự đồng ý của chủ nhà"}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Hủy</button>
      <button type="submit" class="btn btn-primary">Lưu kê khai chi phí</button>
    </div>
  </form>
`;
}

export function saveIncidentalCost(bookingId, form) {
  const bk = window.GDX_DB.bookings.find((b) => b.booking_id === bookingId);
  if (bk) {
    bk.total_incidental = Number(form.total_incidental.value);
    bk.incidental_Specify = form.incidental_Specify.value;
  }
  apiRequest(`/api/bookings/${bookingId}/incidental`, {
    method: "PATCH",
    body: JSON.stringify({
      total_incidental: Number(form.total_incidental.value),
      incidental_Specify: form.incidental_Specify.value,
    }),
  });
  closeModal();
  showToast("Đã cập nhật chi phí vật tư phát sinh!");
  go(state.currentScreen, { bookingId });
}

// 2.8: Nghiệm thu & Hoàn thành Ca làm
export function renderModal_2_8(el, params = {}) {
  const bk =
    window.GDX_DB.bookings.find(
      (b) => b.booking_id === (params.bookingId || 1042),
    ) || window.GDX_DB.bookings[0];
  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">2.8. Nghiệm thu &amp; Hoàn thành Ca làm #${shortCode(bk.booking_id)}</div>
      <div class="field-hint">Chuyển status = 'completed' và ghi nhận vào booking_status_history</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">&times;</button>
  </div>
  <div class="modal-body form-stack">
    <div class="panel-subtle form-stack" style="gap:8px;">
      <div class="slip-row">
        <span>Tiền công dịch vụ</span>
        <span class="slip-dots"></span>
        <strong class="num">${formatMoney(bk.total_amount)}</strong>
      </div>
      <div class="slip-row">
        <span>Vật tư phát sinh</span>
        <span class="slip-dots"></span>
        <strong class="num">${formatMoney(bk.total_incidental)}</strong>
      </div>
      <div class="slip-total">
        <strong>Tổng cộng nghiệm thu</strong>
        <span class="slip-total-price num">${formatMoney(bk.total_amount + bk.total_incidental)}</span>
      </div>
    </div>
  </div>
  <div class="modal-footer">
    <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Quay lại</button>
    <button type="button" class="btn btn-primary" onclick="GDXApp.completeJobShift(${bk.booking_id})">
      Xác nhận hoàn thành ca làm &rarr;
    </button>
  </div>
`;
}

export function completeJobShift(bookingId) {
  const db = window.GDX_DB;
  const bk = db.bookings.find((b) => b.booking_id === bookingId);
  const nowIso = new Date().toISOString();
  const activeProv = (db.provider_profiles || []).find(
    (p) => p.provider_id === (state.activeProviderId || 201),
  );
  const provUserId =
    state.activeUserId ||
    (activeProv && activeProv.user_id) ||
    "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b21";
  if (bk) {
    bk.status = "completed";
    db.booking_status_history.unshift({
      history_id: Date.now(),
      booking_id: bookingId,
      previous_status: "in_progress",
      old_status: "in_progress",
      new_status: "completed",
      changed_by: provUserId,
      reason: "Hoàn tất nghiệm thu công việc tại nhà khách hàng",
      created_at: nowIso,
      changed_at: nowIso,
    });
  }
  apiRequest(`/api/bookings/${bookingId}/complete`, { method: "POST" });
  closeModal();
  showToast(`Đã hoàn tất nghiệm thu đơn #${bookingId}!`);
  go("2.3");
}

// 2.9: Báo cáo Sự cố / Hỗ trợ Đối tác (Drawer)
export function renderModal_2_9(el, params = {}) {
  const db = window.GDX_DB;
  const bk =
    (params.bookingId &&
      db.bookings.find((b) => b.booking_id === Number(params.bookingId))) ||
    db.bookings.find((b) => b.provider_id === state.activeProviderId) ||
    db.bookings[0];

  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">2.9. Báo cáo Sự cố / Hỗ trợ Đối tác</div>
      <div class="field-hint">Bảng: support_tickets, bookings · Gửi khẩn cấp tới bộ phận điều phối</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">&times;</button>
  </div>
  <form onsubmit="event.preventDefault(); GDXApp.submitProviderIncident(this);">
    <div class="modal-body form-stack">
      <div class="field-group">
        <label class="field-label" for="provIncBooking">Mã ca làm liên quan</label>
        <input type="text" id="provIncBooking" class="input num" value="#${shortCode(bk.booking_id)}" readonly>
        <input type="hidden" name="booking_id" value="${bk.booking_id}">
      </div>
      <div class="field-group">
        <label class="field-label" for="provIncSubject">Loại sự cố</label>
        <select id="provIncSubject" name="subject" class="select">
          <option value="Không liên lạc được với khách hàng">Không liên lạc được với khách hàng</option>
          <option value="Địa chỉ không chính xác / Khó tiếp cận">Địa chỉ không chính xác / Khó tiếp cận</option>
          <option value="Khách yêu cầu thay đổi phạm vi công việc">Khách yêu cầu thay đổi phạm vi công việc</option>
          <option value="Sự cố an toàn / Hỏng hóc thiết bị">Sự cố an toàn / Hỏng hóc thiết bị</option>
        </select>
      </div>
      <div class="field-group">
        <label class="field-label" for="provIncDesc">Mô tả chi tiết sự cố</label>
        <textarea id="provIncDesc" name="description" class="textarea" rows="4" placeholder="Mô tả tình huống cần điều phối viên hỗ trợ..." required></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Hủy</button>
      <button type="submit" class="btn btn-danger">Gửi báo cáo sự cố</button>
    </div>
  </form>
`;
}

export function submitProviderIncident(form) {
  const db = window.GDX_DB;
  const ticket = {
    ticket_id: Date.now(),
    user_id: state.activeUserId || "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b21",
    booking_id: Number(form.booking_id.value),
    subject: form.subject.value,
    description: form.description.value,
    status: "open",
    created_at: new Date().toISOString(),
  };
  if (Array.isArray(db.support_tickets)) {
    db.support_tickets.unshift(ticket);
  }
  apiRequest("/api/support-tickets", {
    method: "POST",
    body: JSON.stringify(ticket),
  });
  closeModal();
  showToast("Đã gửi báo cáo sự cố tới bộ phận điều phối!");
}

