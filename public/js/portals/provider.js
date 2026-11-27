import { apiRequest } from "../core/api.js";
import { calcDistanceKm, escapeHtml, formatCccd, formatDateTime, formatMoney, formatTimer, getServiceImage, paymentBadge, shortCode } from "../core/formatters.js";
import { go } from "../core/router.js";
import { state } from "../core/state.js";
import { closeModal, openModal } from "../shared/modal.js";
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
let pendingJobBoardLoad;
let jobBoardPartner;
const dismissedJobsByPartner = new Map();
const acceptingJobIds = new Set();

function getJobBoardUser() {
  if (state.currentUser || !state.authToken) return state.currentUser;
  if (!state.isProduction && state.viewMode === "dev" && state.userRole === "provider" && state.activeUserId) {
    return { user_id: state.activeUserId, role: "provider" };
  }
  try {
    // Bootstrap lúc khởi động có thể lỗi trước khi phiên được khôi phục.
    if (localStorage.getItem("gdx_auth_token") === state.authToken) {
      return JSON.parse(localStorage.getItem("gdx_auth_user"));
    }
  } catch (_) {}
  return null;
}

async function loadJobBoard(authToken) {
  if (
    !pendingJobBoardLoad ||
    pendingJobBoardLoad.authToken !== authToken ||
    pendingJobBoardLoad.isProduction !== state.isProduction
  ) {
    pendingJobBoardLoad = {
      authToken,
      isProduction: state.isProduction,
      response: apiRequest("/api/bootstrap", { cache: "no-store" }),
    };
  }
  const load = pendingJobBoardLoad;
  const result = await load.response;
  if (pendingJobBoardLoad === load) pendingJobBoardLoad = null;
  return result;
}

function isBroadcastJob(booking) {
  return booking.dispatch_type !== "direct" && (
    booking.dispatch_type === "broadcast" ||
    booking.provider_id == null ||
    (typeof booking.notes === "string" && booking.notes.startsWith("[BROADCAST_POOL]"))
  );
}

function renderJobBoardMessage(list, title, { detail, loading, error, retry } = {}) {
  list.setAttribute("aria-busy", String(Boolean(loading)));
  list.innerHTML = `
    <div class="empty-state-card">
      <div role="${error ? "alert" : "status"}">
        <strong>${escapeHtml(title)}</strong>
        ${detail ? `<p class="field-hint">${escapeHtml(detail)}</p>` : ""}
      </div>
      ${retry ? '<button type="button" class="v3-job-accept-btn">Tải lại</button>' : ""}
    </div>`;
  if (retry) list.querySelector("button").addEventListener("click", () => go("2.1"));
}

function renderAvailableJob(booking, service, ward, provider) {
  const isBroadcast = isBroadcastJob(booking);
  const coordinates = [provider.lattitude, provider.longtitude, booking.latitude, booking.longitude].map(Number);
  const distance = isBroadcast && coordinates.every((value) => Number.isFinite(value) && value !== 0)
    ? ` &middot; Cách ${calcDistanceKm(...coordinates)} km`
    : "";
  const title = service?.title || (booking.service_id == null ? "Dịch vụ" : `Dịch vụ #${booking.service_id}`);
  const duration = Number(service?.estimated_duration);
  const address = [booking.address, ward?.name].filter(Boolean).join(", ");
  const id = escapeHtml(String(booking.booking_id));

  return `
    <article class="v3-job-card">
      <img src="${escapeHtml(getServiceImage(service))}" alt="${escapeHtml(title)}" class="v3-job-thumb">
      <div class="v3-job-main">
        <span class="v3-job-badge ${isBroadcast ? "is-broadcast" : "is-direct"}">
          ${isBroadcast ? `&#9889; Đơn khu vực${distance}` : "&#9733; Khách chỉ định đích danh"}
        </span>
        <h2 class="v3-job-title">${escapeHtml(title)}${duration > 0 ? ` (~${duration} phút)` : ""}</h2>
        <div class="v3-job-meta">
          Chờ nhận &middot; <span class="num">${escapeHtml(formatDateTime(booking.scheduled_time))}</span>${address ? ` &middot; ${escapeHtml(address)}` : ""}
        </div>
      </div>
      <div class="v3-job-right">
        <div class="v3-job-price num">${booking.total_amount == null ? "—" : formatMoney(booking.total_amount)}</div>
        <div class="v3-job-actions">
          <button type="button" class="v3-job-skip-btn" data-job-action="dismiss" data-booking-id="${id}">Bỏ qua</button>
          <button type="button" class="v3-job-accept-btn" data-job-action="accept" data-booking-id="${id}">Nhận việc ngay &rarr;</button>
        </div>
      </div>
    </article>`;
}

function rememberJobForExistingActions(booking) {
  // Các màn và thao tác hiện có tra đơn qua bộ nhớ dùng chung.
  const bookings = window.GDX_DB.bookings;
  const existing = bookings.find((item) => String(item.booking_id) === String(booking.booking_id));
  if (existing) return existing.booking_id;
  bookings.push({ ...booking });
  return booking.booking_id;
}

function setJobActionBusy(button, busy) {
  button.disabled = busy;
  if (button.dataset.jobAction === "accept") {
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? "Đang nhận việc…" : "Nhận việc ngay →";
  }
}

function setBookingAcceptanceBusy(bookingId, busy) {
  document.querySelectorAll(".v3-jobs-list [data-job-action]").forEach((button) => {
    if (button.dataset.bookingId === bookingId) setJobActionBusy(button, busy);
  });
}

export async function renderScreen_2_1(container) {
  jobBoardPartner = null;
  container.innerHTML = `
    <div class="v3-jobs-page">
      <div class="v3-jobs-header">
        <h1 class="v3-jobs-title">Việc làm mới quanh khu vực của bạn</h1>
      </div>
      <div class="v3-jobs-list"></div>
    </div>`;
  const page = container.firstElementChild;
  const list = page.querySelector(".v3-jobs-list");
  const user = getJobBoardUser();
  const authToken = state.authToken;
  if (!authToken || user?.role !== "provider" || !user.user_id) {
    renderJobBoardMessage(list, "Vui lòng đăng nhập bằng tài khoản Đối tác để xem việc chờ nhận.");
    return;
  }

  renderJobBoardMessage(list, "Đang tải việc chờ nhận…", { loading: true });
  const result = await loadJobBoard(authToken);
  const currentUser = getJobBoardUser();
  if (
    container.firstElementChild !== page ||
    state.currentScreen !== "2.1" ||
    state.authToken !== authToken ||
    currentUser?.role !== "provider" ||
    String(currentUser.user_id) !== String(user.user_id)
  ) return;

  const db = result?.db;
  if (
    !result?.ok ||
    !Array.isArray(db?.bookings) ||
    !Array.isArray(db.provider_profiles) ||
    !Array.isArray(db.services)
  ) {
    renderJobBoardMessage(list, "Không thể tải danh sách việc chờ nhận.", {
      detail: result?.error || "Vui lòng tải lại để thử kết nối với máy chủ.",
      error: true,
      retry: true,
    });
    return;
  }

  const provider = db.provider_profiles.find((profile) => String(profile.user_id) === String(user.user_id));
  if (!provider?.provider_id) {
    renderJobBoardMessage(list, "Không tìm thấy hồ sơ Đối tác cho tài khoản này.", { error: true, retry: true });
    return;
  }

  state.currentUser ??= user;
  state.activeUserId = user.user_id;
  state.activeProviderId = provider.provider_id;

  const isOnline = provider.is_available_online;
  page.querySelector(".v3-jobs-header").insertAdjacentHTML("beforeend", `
    <button type="button" class="v3-jobs-status-pill ${isOnline ? "is-online" : "is-offline"}" onclick="GDXApp.openModal('2.5')" style="border:none; cursor:pointer;" title="Cập nhật trạng thái nhận việc & GPS">
      <span class="v3-jobs-status-dot" aria-hidden="true"></span>
      <span>${isOnline ? "Đang bật nhận việc" : "Đang tạm nghỉ"}</span>
    </button>`);

  const providerId = String(provider.provider_id);
  const activeJob = db.bookings.find(
    (booking) => String(booking.provider_id) === providerId &&
      (booking.status === "in_progress" || booking.status === "confirmed"),
  );
  if (activeJob) {
    list.insertAdjacentHTML("beforebegin", `
      <div class="active-booking-banner" style="border-radius:16px;">
        <div class="active-booking-banner-info">
          <span class="status-dot is-online"></span>
          <div>
            <strong>Ca làm hiện tại: Đơn #${escapeHtml(shortCode(activeJob.booking_id))} (${activeJob.status === "in_progress" ? "Đang thực hiện" : "Đã xác nhận"})</strong>
            <div class="field-hint">${escapeHtml(activeJob.address)} &middot; <strong class="num">${activeJob.total_amount == null ? "—" : formatMoney(activeJob.total_amount)}</strong></div>
          </div>
        </div>
        <button type="button" class="v3-job-accept-btn" style="height:38px;">
          Mở ca đang làm &rarr;
        </button>
      </div>`);
    page.querySelector(".active-booking-banner button").addEventListener("click", () => {
      go("2.2", { bookingId: rememberJobForExistingActions(activeJob) });
    });
  }

  const excludedIds = new Set(state.expiredJobIds.map(String));
  const dismissedIds = dismissedJobsByPartner.get(String(user.user_id));
  const wardId = state.jobBoardFilter.wardId;
  const availableJobs = db.bookings.filter((booking) => {
    const id = String(booking.booking_id);
    return booking.booking_id != null && booking.status === "pending" &&
      (isBroadcastJob(booking) || String(booking.provider_id) === providerId) &&
      (wardId === "all" || String(booking.ward_id) === String(wardId)) &&
      !excludedIds.has(id) && !dismissedIds?.has(id);
  });
  const jobsById = new Map(availableJobs.map((booking) => [String(booking.booking_id), booking]));
  jobBoardPartner = { authToken, userId: user.user_id, providerId: provider.provider_id, jobsById };

  if (!availableJobs.length) {
    renderJobBoardMessage(list, "Hiện chưa có việc mới quanh khu vực của bạn", {
      detail: "Đơn khu vực và đơn chỉ định cho bạn sẽ hiển thị tại đây khi có việc chờ nhận.",
      retry: true,
    });
    return;
  }

  const wards = Array.isArray(db.wards) && db.wards.length ? db.wards : db.ward ?? [];
  list.setAttribute("aria-busy", "false");
  list.innerHTML = availableJobs.map((booking) => {
    const service = db.services.find((entry) => String(entry.service_id) === String(booking.service_id));
    const ward = wards.find((entry) => String(entry.ward_id) === String(booking.ward_id));
    return renderAvailableJob(booking, service, ward, provider);
  }).join("");

  list.querySelectorAll("[data-job-action]").forEach((button) => {
    const booking = jobsById.get(button.dataset.bookingId);
    if (acceptingJobIds.has(button.dataset.bookingId)) setJobActionBusy(button, true);
    button.addEventListener("click", () => {
      if (button.dataset.jobAction === "dismiss") {
        dismissJob(booking.booking_id);
      } else {
        acceptJob(booking.booking_id);
      }
    });
  });
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
  const user = state.currentUser;
  if (user?.role !== "provider" || !user.user_id) return;
  const userId = String(user.user_id);
  if (!dismissedJobsByPartner.has(userId)) dismissedJobsByPartner.set(userId, new Set());
  dismissedJobsByPartner.get(userId).add(String(bookingId));
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

function isCurrentJobBoardPartner(partner) {
  return partner && state.authToken === partner.authToken &&
    state.currentUser?.role === "provider" &&
    String(state.currentUser.user_id) === String(partner.userId) &&
    String(state.activeProviderId) === String(partner.providerId);
}

export async function acceptJob(bookingId) {
  const id = String(bookingId ?? "").trim();
  if (!id || acceptingJobIds.has(id)) return;

  const partner = jobBoardPartner;
  if (!isCurrentJobBoardPartner(partner)) {
    showToast("Vui lòng đăng nhập và tải danh sách việc bằng tài khoản Đối tác để nhận đơn.");
    return;
  }
  if (state.currentScreen !== "2.1" || !partner.jobsById.has(id)) {
    showToast("Đơn này không khả dụng trong danh sách việc của bạn.");
    return;
  }

  acceptingJobIds.add(id);
  setBookingAcceptanceBusy(id, true);
  try {
    const result = await apiRequest(`/api/bookings/${encodeURIComponent(id)}/accept`, {
      method: "POST",
      body: JSON.stringify({ provider_id: partner.providerId, user_id: partner.userId }),
    });

    if (!isCurrentJobBoardPartner(partner)) return;

    // The booking route includes expired: true in every HTTP 409 response.
    if (result?.expired === true) {
      showToast("Đơn này không còn khả dụng. Danh sách việc sẽ được tải lại.");
      if (state.currentScreen === "2.1") {
        pendingJobBoardLoad = null;
        go("2.1", state.currentRouteParams, { skipHistory: true });
      }
      return;
    }

    if (result?.ok !== true) {
      showToast(result?.error || "Không thể nhận đơn lúc này. Vui lòng thử lại.");
      return;
    }

    const booking = result.booking;
    if (
      booking?.status !== "confirmed" ||
      String(booking.booking_id) !== id ||
      String(booking.provider_id) !== String(partner.providerId)
    ) {
      showToast("Máy chủ chưa xác nhận đơn này cho tài khoản Đối tác của bạn.");
      return;
    }

    const bookings = window.GDX_DB.bookings;
    const index = bookings.findIndex((item) => String(item.booking_id) === id);
    if (index === -1) bookings.unshift(booking);
    else bookings[index] = booking;

    showToast(`Đã nhận đơn #${booking.booking_id} thành công!`);
    if (state.currentScreen === "2.1") {
      state.selectedBookingId = booking.booking_id;
      go("2.2", { bookingId: booking.booking_id });
    }
  } finally {
    acceptingJobIds.delete(id);
    setBookingAcceptanceBusy(id, false);
  }
}

// 2.2: Ca làm việc hiện tại (Live Timer)
let currentShiftView;
const pendingShiftRequests = new Map();
const shiftStatusLabels = {
  pending: "Chờ nhận",
  confirmed: "Đã nhận ca",
  in_progress: "Ca đang thực hiện",
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy",
  auto_cancelled: "Đã hết hạn",
};

function isVisibleShift(view) {
  return view && currentShiftView === view && state.currentScreen === "2.2" &&
    view.container.contains(view.card);
}

function isOwnedShift(view, status) {
  return isVisibleShift(view) && isCurrentJobBoardPartner(view.partner) &&
    view.booking?.status === status &&
    String(view.booking.provider_id) === String(view.partner.providerId);
}

function syncShiftBooking(booking) {
  const bookings = window.GDX_DB.bookings;
  const index = bookings.findIndex((item) => String(item.booking_id) === String(booking.booking_id));
  if (index === -1) bookings.unshift(booking);
  else bookings[index] = booking;
}

function renderShiftMessage(view, message, { loading = false, retry = false } = {}) {
  view.card.innerHTML = `
    <p class="v3-shift-summary" role="${loading ? "status" : "alert"}">${escapeHtml(message)}</p>
    ${loading ? "" : `<div class="v3-shift-dock">
      <button type="button" class="v3-shift-btn-muted" data-shift-back>Quay lại danh sách việc</button>
      ${retry ? '<button type="button" class="v3-shift-btn-primary" data-shift-retry>Tải lại</button>' : ""}
    </div>`}`;
  view.card.querySelector("[data-shift-back]")?.addEventListener("click", () => go("2.1"));
  view.card.querySelector("[data-shift-retry]")?.addEventListener("click", () => {
    renderScreen_2_2(view.container, { bookingId: view.id });
  });
}

function shiftEventTime(history, id, status) {
  return (history || []).reduce((latest, item) => {
    if (String(item.booking_id) !== id || item.new_status !== status) return latest;
    const time = Date.parse(item.created_at || item.changed_at);
    return Number.isFinite(time) ? Math.max(latest, time) : latest;
  }, 0);
}

function stopShiftTimer() {
  if (state.liveTimerInterval !== null) clearInterval(state.liveTimerInterval);
  state.liveTimerInterval = null;
}

function updateShiftTimerDisplay(view) {
  const seconds = state.liveTimerSeconds;
  const estimate = Number(view.service?.estimated_duration) * 60;
  const progress = estimate > 0 ? Math.min(100, Math.round((seconds / estimate) * 100)) : 0;
  view.card.querySelector("#liveShiftTimerDisplay").textContent = formatTimer(seconds);
  view.card.querySelector(".v3-shift-pct").textContent = estimate > 0 ? `Đã làm ${progress}% ca` : "";
  view.card.querySelector("[data-shift-progress]").setAttribute("stroke-dashoffset", 603.19 * (1 - progress / 100));

  const isRunning = state.liveTimerInterval !== null;
  const toggle = view.card.querySelector("[data-shift-timer]");
  if (toggle) toggle.setAttribute("aria-pressed", String(isRunning));
  view.card.querySelector("[data-shift-timer-status]").textContent =
    view.booking.status === "in_progress" ? (isRunning ? "Đồng hồ đang chạy" : "Đồng hồ đang tạm dừng") : "";
}

function runShiftTimer(view) {
  stopShiftTimer();
  const startedAt = Date.now() - state.liveTimerSeconds * 1000;
  state.liveTimerInterval = setInterval(() => {
    if (!isOwnedShift(view, "in_progress")) {
      stopShiftTimer();
      return;
    }
    state.liveTimerSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    updateShiftTimerDisplay(view);
  }, 1000);
  updateShiftTimerDisplay(view);
}

function getShiftCompletionButton(id) {
  const dialog = document.getElementById("appModal");
  const button = dialog?.open ? dialog.querySelector("[data-shift-complete-id]") : null;
  return button?.dataset.shiftCompleteId === id ? button : null;
}

function setShiftControlsBusy(view) {
  const busy = pendingShiftRequests.has(view.id);
  view.card.querySelectorAll("[data-shift-action], [data-shift-timer]").forEach((button) => {
    button.disabled = busy;
    if (button.dataset.shiftAction === "start") {
      button.setAttribute("aria-busy", String(busy));
      button.textContent = busy ? "Đang bắt đầu..." : "Bắt đầu làm việc →";
    }
  });
  const confirm = getShiftCompletionButton(view.id);
  if (confirm) {
    confirm.disabled = busy;
    confirm.setAttribute("aria-busy", String(busy));
    confirm.textContent = busy ? "Đang hoàn thành..." : "Xác nhận hoàn thành ca làm →";
  }
}

function setShiftActionError(view, action, message) {
  const alert = action === "complete" && getShiftCompletionButton(view.id)
    ? document.getElementById("appModal").querySelector("[data-shift-completion-error]")
    : view.card.querySelector("[data-shift-error]");
  if (alert) {
    alert.textContent = message;
    alert.hidden = !message;
  } else if (message) {
    showToast(message);
  }
}

function renderShiftDetails(view) {
  const { booking, service, customer } = view;
  const running = booking.status === "in_progress";
  const canStart = booking.status === "confirmed";
  const summary = [service?.title, customer ? `KH: ${customer}` : "", booking.address].filter(Boolean).join(" · ");
  const ring = `
      <svg class="v3-shift-ring-svg" width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
        <circle cx="110" cy="110" r="96" fill="none" stroke="#E2E8F0" stroke-width="10"></circle>
        <circle cx="110" cy="110" r="96" fill="none" stroke="#1B3B2B" stroke-width="10"
          stroke-linecap="round" stroke-dasharray="603.19" data-shift-progress
          transform="rotate(-90 110 110)"></circle>
      </svg>
      <div class="v3-shift-ring-center">
        <div class="v3-shift-timer num" id="liveShiftTimerDisplay"></div>
        <div class="v3-shift-pct"></div>
      </div>`;
  view.card.innerHTML = `
      <div class="v3-shift-status-pill ${booking.status === "completed" ? "is-done" : ""}">
        <span class="v3-shift-status-dot" aria-hidden="true"></span>
        <span>${shiftStatusLabels[booking.status] || "Trạng thái chưa xác định"} &middot; #${escapeHtml(shortCode(booking.booking_id))}</span>
      </div>
      ${running ? `<button type="button" class="v3-shift-ring-wrap" data-shift-timer
        aria-label="Tạm dừng hoặc tiếp tục đồng hồ" style="border:0; background:none; padding:0;">${ring}</button>`
        : `<div class="v3-shift-ring-wrap" style="cursor:default;">${ring}</div>`}
      ${summary ? `<div class="v3-shift-summary">${escapeHtml(summary)}</div>` : ""}
      ${running || canStart ? `<div class="v3-shift-dock">
        ${typeof booking.booking_id === "number" ? `
          <button type="button" class="v3-shift-btn-muted" data-shift-action="2.7">Kê khai vật tư</button>
          <button type="button" class="v3-shift-btn-danger" data-shift-action="2.9">Báo cáo sự cố</button>` : ""}
        ${canStart ? '<button type="button" class="v3-shift-btn-primary" data-shift-action="start">Bắt đầu làm việc &rarr;</button>'
          : '<button type="button" class="v3-shift-btn-primary" data-shift-action="2.8">Hoàn thành &amp; Nghiệm thu &rarr;</button>'}
      </div>` : '<button type="button" class="v3-shift-btn-muted" data-shift-back>Quay lại danh sách việc</button>'}
      <p class="v3-shift-summary" role="alert" data-shift-error hidden></p>
      <div class="v3-shift-sub-meta">
        <span>Thu nhập dự kiến <strong class="num">${booking.total_amount == null ? "—" : formatMoney(booking.total_amount)}</strong></span>
        <span data-shift-timer-status></span>
      </div>`;
  view.card.querySelector("[data-shift-timer]")?.addEventListener("click", toggleShiftTimer);
  view.card.querySelector("[data-shift-back]")?.addEventListener("click", () => go("2.1"));
  view.card.querySelectorAll("[data-shift-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.shiftAction;
      if (action === "start") startShiftWork(booking.booking_id);
      else openModal(action, { bookingId: booking.booking_id });
    });
  });
  updateShiftTimerDisplay(view);
  setShiftControlsBusy(view);
}

export async function renderScreen_2_2(container, params = {}) {
  stopShiftTimer();
  state.liveTimerSeconds = 0;
  container.innerHTML = '<div class="v3-shift-wrap"><div class="v3-shift-card"></div></div>';
  const id = String(params.bookingId ?? "").trim();
  const view = { id, container, card: container.querySelector(".v3-shift-card") };
  currentShiftView = view;
  if (!id) {
    renderShiftMessage(view, "Bạn chưa chọn ca làm. Hãy chọn một ca từ danh sách việc.");
    return;
  }
  const user = getJobBoardUser();
  const authToken = state.authToken;
  if (!authToken || user?.role !== "provider" || !user.user_id) {
    renderShiftMessage(view, "Vui lòng đăng nhập bằng tài khoản Đối tác để xem ca làm.");
    return;
  }

  renderShiftMessage(view, "Đang tải ca làm việc...", { loading: true });
  const pending = pendingShiftRequests.get(id);
  if (pending) {
    await pending;
    if (!isVisibleShift(view) || state.authToken !== authToken) return;
  }
  const result = pending
    ? await apiRequest("/api/bootstrap", { cache: "no-store" })
    : await loadJobBoard(authToken);
  const currentUser = getJobBoardUser();
  if (!isVisibleShift(view) || state.authToken !== authToken ||
    currentUser?.role !== "provider" || String(currentUser.user_id) !== String(user.user_id)) return;

  const db = result?.db;
  if (result?.ok !== true || !Array.isArray(db?.bookings) || !Array.isArray(db.provider_profiles)) {
    renderShiftMessage(view, result?.error || "Không thể tải ca làm từ máy chủ.", { retry: true });
    return;
  }
  const provider = db.provider_profiles.find((profile) => String(profile.user_id) === String(user.user_id));
  const booking = db.bookings.find((item) => String(item.booking_id) === id);
  if (!provider?.provider_id || !booking || String(booking.provider_id) !== String(provider.provider_id)) {
    renderShiftMessage(view, "Không tìm thấy ca làm trong các đơn của bạn.");
    return;
  }

  state.currentUser ??= user;
  state.activeUserId = user.user_id;
  state.activeProviderId = provider.provider_id;
  view.partner = { authToken, userId: user.user_id, providerId: provider.provider_id };
  view.booking = booking;
  view.service = (db.services || []).find((item) => String(item.service_id) === String(booking.service_id));
  const customer = (db.customer_profiles || []).find((item) => String(item.customer_id) === String(booking.customer_id));
  view.customer = customer && (db.users || []).find((item) => String(item.user_id) === String(customer.user_id))?.full_name;

  syncShiftBooking(booking);
  const startedAt = shiftEventTime(db.booking_status_history, id, "in_progress");
  const endedAt = booking.status === "completed"
    ? shiftEventTime(db.booking_status_history, id, "completed")
    : Date.now();
  if (startedAt && endedAt && (booking.status === "in_progress" || booking.status === "completed")) {
    state.liveTimerSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  }
  renderShiftDetails(view);
  if (booking.status === "in_progress") runShiftTimer(view);
}

export function toggleShiftTimer() {
  const view = currentShiftView;
  if (!isOwnedShift(view, "in_progress") || pendingShiftRequests.has(view.id)) return;
  if (state.liveTimerInterval !== null) {
    stopShiftTimer();
    updateShiftTimerDisplay(view);
    showToast("Đã tạm dừng đồng hồ ca làm");
  } else {
    runShiftTimer(view);
    showToast("Đang tính giờ ca làm việc");
  }
}

async function submitShiftAction(bookingId, action, fromStatus, toStatus) {
  const id = String(bookingId ?? "").trim();
  const view = currentShiftView;
  if (!isOwnedShift(view, fromStatus) || view.id !== id) {
    showToast("Ca làm này không khả dụng cho thao tác đã chọn.");
    return;
  }
  if (pendingShiftRequests.has(id)) return;

  setShiftActionError(view, action, "");
  const request = apiRequest(`/api/bookings/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    body: JSON.stringify({ user_id: view.partner.userId }),
  });
  pendingShiftRequests.set(id, request);
  setShiftControlsBusy(view);
  try {
    const result = await request;
    if (!isCurrentJobBoardPartner(view.partner)) return;

    const booking = result?.booking;
    const valid = result?.ok === true && booking?.status === toStatus &&
      String(booking.booking_id) === id &&
      String(booking.provider_id) === String(view.partner.providerId);
    if (!valid) {
      const message = result?.ok === true
        ? "Phản hồi của máy chủ chưa xác nhận đúng ca làm và trạng thái yêu cầu."
        : result?.error || "Không thể cập nhật ca làm. Vui lòng thử lại.";
      if (isVisibleShift(view)) setShiftActionError(view, action, message);
      return;
    }

    syncShiftBooking(booking);
    if (!isVisibleShift(view)) return;
    view.booking = booking;
    if (action === "start") {
      const startedAt = Date.parse(booking.updated_at);
      state.liveTimerSeconds = Number.isFinite(startedAt)
        ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
        : 0;
      renderShiftDetails(view);
      runShiftTimer(view);
      showToast(`Đã bắt đầu thực hiện ca làm #${shortCode(booking.booking_id)}`);
    } else {
      stopShiftTimer();
      if (getShiftCompletionButton(id)) closeModal();
      showToast(`Đã hoàn tất nghiệm thu đơn #${shortCode(booking.booking_id)}!`);
      go("2.3");
    }
  } finally {
    pendingShiftRequests.delete(id);
    if (isVisibleShift(view)) setShiftControlsBusy(view);
  }
}

export function startShiftWork(bookingId) {
  return submitShiftAction(bookingId, "start", "confirmed", "in_progress");
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
  const bookings = Array.isArray(window.GDX_DB?.bookings) ? window.GDX_DB.bookings : [];
  const targetId = params.bookingId ?? state.activeBookingId ?? 1042;
  const bk =
    bookings.find((b) => String(b.booking_id) === String(targetId)) || bookings[0];
  if (!bk) {
    el.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">2.7. Kê khai Chi phí vật tư phát sinh</div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">&times;</button>
      </div>
      <div class="modal-body"><p role="alert">Không tìm thấy đơn hàng để kê khai chi phí.</p></div>`;
    return;
  }
  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">2.7. Kê khai Chi phí vật tư phát sinh · Đơn #${shortCode(bk.booking_id)}</div>
      <div class="field-hint">Cập nhật bookings.total_incidental và giải trình incidental_Specify</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">&times;</button>
  </div>
  <form onsubmit="event.preventDefault(); GDXApp.saveIncidentalCost('${escapeHtml(String(bk.booking_id))}', this);">
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

export async function saveIncidentalCost(bookingId, form) {
  const totalIncidental = Number(form.total_incidental.value);
  const incidentalSpecify = form.incidental_Specify.value;
  const res = await apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}/incidental`, {
    method: "PATCH",
    body: JSON.stringify({
      total_incidental: totalIncidental,
      incidental_Specify: incidentalSpecify,
    }),
  });
  if (!res || res.ok !== true) {
    showToast((res && res.error) || "Không thể cập nhật chi phí vật tư phát sinh.");
    return;
  }
  const bk = (window.GDX_DB?.bookings || []).find(
    (b) => String(b.booking_id) === String(bookingId),
  );
  if (bk) {
    bk.total_incidental = res.booking?.total_incidental ?? totalIncidental;
    bk.total_amount = res.booking?.total_amount ?? bk.total_amount;
    bk.incidental_Specify = incidentalSpecify;
  }
  closeModal();
  showToast("Đã cập nhật chi phí vật tư phát sinh!");
  go(state.currentScreen, { bookingId });
}

// 2.8: Nghiệm thu & Hoàn thành Ca làm
export function renderModal_2_8(el, params = {}) {
  const view = currentShiftView;
  const id = String(params.bookingId ?? "");
  if (!isOwnedShift(view, "in_progress") || view.id !== id) {
    el.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">Nghiệm thu ca làm</div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">&times;</button>
      </div>
      <div class="modal-body"><p role="alert">Hãy mở ca đang thực hiện của bạn để nghiệm thu.</p></div>`;
    return;
  }

  const booking = view.booking;
  const incidental = Number(booking.total_incidental) || 0;
  const busy = pendingShiftRequests.has(id);
  el.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">Nghiệm thu &amp; Hoàn thành Ca làm #${escapeHtml(shortCode(booking.booking_id))}</div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">&times;</button>
    </div>
    <div class="modal-body form-stack">
      <div class="panel-subtle form-stack" style="gap:8px;">
        <div class="slip-row">
          <span>Tiền công dịch vụ</span>
          <span class="slip-dots"></span>
          <strong class="num">${booking.total_amount == null ? "—" : formatMoney(Number(booking.total_amount) - incidental)}</strong>
        </div>
        <div class="slip-row">
          <span>Vật tư phát sinh</span>
          <span class="slip-dots"></span>
          <strong class="num">${formatMoney(incidental)}</strong>
        </div>
        <div class="slip-total">
          <strong>Tổng cộng nghiệm thu</strong>
          <span class="slip-total-price num">${booking.total_amount == null ? "—" : formatMoney(booking.total_amount)}</span>
        </div>
      </div>
      <p role="alert" data-shift-completion-error hidden></p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Quay lại</button>
      <button type="button" class="btn btn-primary" data-shift-complete-id="${escapeHtml(id)}" aria-busy="${busy}" ${busy ? "disabled" : ""}>
        ${busy ? "Đang hoàn thành..." : "Xác nhận hoàn thành ca làm →"}
      </button>
    </div>`;
  el.querySelector("[data-shift-complete-id]").addEventListener("click", () => completeJobShift(booking.booking_id));
}

export function completeJobShift(bookingId) {
  return submitShiftAction(bookingId, "complete", "in_progress", "completed");
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

