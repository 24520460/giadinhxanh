import { apiRequest } from "../core/api.js";
import { formatDateTime, formatMoney, shortCode } from "../core/formatters.js";
import { go } from "../core/router.js";
import { state } from "../core/state.js";
import { closeModal, openModal } from "../shared/modal.js";
import { Icons, showToast } from "../shared/ui-utils.js";

// 1.7: Hồ sơ công khai của Thợ & Lịch rảnh tuần (Drawer / Schedule Dialog)
export function renderModal_1_7(el, params = {}) {
  const db = window.GDX_DB;
  const provId = params.providerId || 201;
  const p =
    db.provider_public_profiles.find((x) => x.provider_id === provId) ||
    db.provider_public_profiles[0];
  const isFavProv = (db.favorites || []).some(
    (f) =>
      Number(f.customer_id) === state.activeCustomerId &&
      Number(f.provider_id) === p.provider_id,
  );
  const revs = db.reviews.filter(
    (r) => r.provider_id === p.provider_id && r.status !== "hidden",
  );
  const skillIds = db.provider_services
    .filter((ps) => ps.provider_id === p.provider_id)
    .map((ps) => ps.service_id);
  const skills = db.services.filter((s) => skillIds.includes(s.service_id));
  const schedules = db.availability_schedules.filter(
    (a) => a.provider_id === p.provider_id && a.is_available,
  );
  const exceptions = db.availability_exceptions.filter(
    (e) => e.provider_id === p.provider_id && !e.is_available,
  );

  const days = [
    { dow: 1, label: "Thứ 2" },
    { dow: 2, label: "Thứ 3" },
    { dow: 3, label: "Thứ 4" },
    { dow: 4, label: "Thứ 5" },
    { dow: 5, label: "Thứ 6" },
    { dow: 6, label: "Thứ 7" },
    { dow: 0, label: "CN" },
  ];
  const shifts = [
    {
      id: "morning",
      name: "Ca Sáng",
      sub: "08h - 12h",
      iso: "2026-10-25T08:30",
    },
    {
      id: "afternoon",
      name: "Ca Chiều",
      sub: "13h - 17h",
      iso: "2026-10-25T13:30",
    },
    {
      id: "evening",
      name: "Ca Tối",
      sub: "17h - 21h",
      iso: "2026-10-25T18:00",
    },
  ];

  const latestReviewText =
    revs.length > 0
      ? revs[0].comment
      : p.info || "Làm việc rất sạch sẽ, đúng giờ và tinh tế.";

  el.innerHTML = `
  <div class="v3-prov-drawer">
    <div class="v3-prov-drawer-head">
      <div class="v3-prov-identity">
        <img src="${p.avatar_url || "/assets/provider-lan.jpg"}" onerror="this.onerror=null; this.src='/assets/provider-lan.jpg';" alt="${p.full_name}" class="v3-prov-avatar">
        <div>
          <h2 class="v3-prov-name">${p.full_name}</h2>
          <div class="v3-prov-badge-pill">
            <span>&#10003; Xác minh CCCD</span>
            <span>&middot;</span>
            <span class="num">&#9733; ${Number(p.average_rating).toFixed(2)} (${p.total_reviews || 42} ca)</span>
          </div>
        </div>
      </div>
      <div class="v3-prov-head-actions">
        <button type="button" class="v3-prov-icon-btn ${isFavProv ? "is-active" : ""}" onclick="GDXApp.toggleProviderFavorite(${p.provider_id}); GDXApp.openModal('1.7', {providerId: ${p.provider_id}})" title="${isFavProv ? "Bỏ lưu thợ" : "Lưu thợ yêu thích"}" aria-label="Lưu thợ">
          ${isFavProv ? "&#10084;" : "&#9825;"}
        </button>
        <button type="button" class="v3-prov-icon-btn" onclick="GDXApp.closeModal()" aria-label="Đóng">&times;</button>
      </div>
    </div>

    <div class="v3-prov-drawer-body">
      <div class="v3-prov-tags">
        ${
          skills.length > 0
            ? skills
                .map((s) => `<span class="v3-prov-tag">${s.title}</span>`)
                .join("")
            : `<span class="v3-prov-tag">Dọn dẹp nhà cửa</span><span class="v3-prov-tag">Tổng vệ sinh</span>`
        }
      </div>

      <p class="v3-prov-review-quote">
        Đánh giá gần đây: &ldquo;${latestReviewText}&rdquo;
      </p>

      <button type="button" class="v3-prov-expand-btn" onclick="document.getElementById('v3ProvExtraDetails').classList.toggle('is-open')">
        Xem lịch làm việc &amp; nhận xét (${revs.length}) &darr;
      </button>

      <div id="v3ProvExtraDetails" class="v3-prov-extra">
        <div class="schedule-table-wrap">
          <table class="schedule-table">
            <thead>
              <tr>
                <th>Ca / Ngày</th>
                ${days.map((d) => `<th>${d.label}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${shifts
                .map(
                  (sh, sIdx) => `
                <tr>
                  <td class="shift-name">${sh.name}<br><small>${sh.sub}</small></td>
                  ${days
                    .map((d) => {
                      const hasSchedule =
                        schedules.length === 0 ||
                        schedules.some(
                          (sc) => Number(sc.day_of_week) === d.dow,
                        );
                      const isEveningOff =
                        sIdx === 2 && (d.dow === 0 || d.dow === 3);
                      const isAvail = hasSchedule && !isEveningOff;
                      return `
                      <td>
                        ${
                          isAvail
                            ? `<button type="button" class="slot-btn is-available" onclick="GDXApp.selectScheduleSlotInModal(this, '${d.label} - ${sh.name} (${sh.sub})', '${sh.iso}')">Trống</button>`
                            : `<span class="slot-btn is-busy">Nghỉ</span>`
                        }
                      </td>`;
                    })
                    .join("")}
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
        ${
          exceptions.length > 0
            ? `<div class="field-hint">Ngày nghỉ đột xuất: <strong>${exceptions.map((ex) => `${ex.exception_date} (${ex.reason || "Bận cá nhân"})`).join(", ")}</strong></div>`
            : ""
        }
        <div class="selected-slot-box" id="modalSelectedSlotBox">
          <span style="font-size:0.875rem; font-weight:600; color:var(--color-primary);">Ca hẹn đã chọn:</span>
          <strong id="modalSelectedSlotLabel" style="font-family:var(--font-heading); color:var(--color-primary);">Sáng mai (08h - 12h)</strong>
        </div>
        ${
          revs.length > 0
            ? `<div class="form-stack" style="gap:8px;">
                ${revs
                  .map(
                    (r) => `
                  <div class="panel-subtle">
                    <div style="display:flex; justify-content:space-between;">
                      ${Icons.starRow(r.rating)}
                      <span class="field-hint num">Đơn #${shortCode(r.booking_id)}</span>
                    </div>
                    <div style="margin-top:4px; font-size:0.875rem;">"${r.comment}"</div>
                  </div>`,
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </div>

    <div class="v3-prov-drawer-foot">
      <button type="button" class="v3-prov-cta-btn" onclick="GDXApp.closeModal(); GDXApp.go('1.2', {serviceId: ${skills[0] ? skills[0].service_id : 101}, providerId: ${p.provider_id}})">
        Chọn thợ này để đặt lịch &rarr;
      </button>
    </div>
  </div>
`;
}

export function selectScheduleSlotInModal(btn, label, isoTime) {
  const dialog = document.getElementById("appModal");
  if (dialog) {
    dialog.querySelectorAll(".slot-btn.is-selected").forEach((b) => {
      b.classList.remove("is-selected");
      b.classList.add("is-available");
      b.textContent = "Trống";
    });
  }
  btn.classList.remove("is-available");
  btn.classList.add("is-selected");
  btn.textContent = "✓ Chọn";
  const labelEl = document.getElementById("modalSelectedSlotLabel");
  if (labelEl) labelEl.textContent = label;
  if (isoTime) state.wizardDraft.scheduled_time = isoTime;
}

// 1.8: Cổng Thanh toán hóa đơn (Checkout Modal)
export function renderModal_1_8(el, params = {}) {
  const db = window.GDX_DB;
  const bk =
    db.bookings.find((b) => b.booking_id === (params.bookingId || 1042)) ||
    db.bookings[0];
  const svc = db.services.find((s) => s.service_id === bk.service_id);
  const total = bk.total_amount + bk.total_incidental;
  state.checkoutSelectedPayMethod = "bank";

  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">1.8. Xác nhận Thanh toán Hóa đơn #${shortCode(bk.booking_id)}</div>
      <div class="field-hint">Kiểm tra chi phí dịch vụ và chọn phương thức thanh toán</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <div class="modal-body form-stack">
    <div class="panel-subtle form-stack" style="gap:8px;">
      <div class="slip-row">
        <span>Gói dịch vụ</span>
        <span class="slip-dots"></span>
        <strong>${svc ? svc.title : "Dịch vụ"}</strong>
      </div>
      <div class="slip-row">
        <span>Phí dịch vụ cơ bản</span>
        <span class="slip-dots"></span>
        <strong class="num">${formatMoney(bk.total_amount)}</strong>
      </div>
      <div class="slip-row">
        <span>Chi phí vật tư phát sinh</span>
        <span class="slip-dots"></span>
        <strong class="num">${formatMoney(bk.total_incidental)}</strong>
      </div>
      <div class="slip-total">
        <strong>Tổng số tiền thanh toán</strong>
        <span class="slip-total-price num">${formatMoney(total)}</span>
      </div>
    </div>

    <div class="field-group">
      <label class="field-label">Chọn phương thức thanh toán</label>
      <div class="choice-grid-2">
        <label class="choice-card is-selected" id="payMethodBankCard" style="cursor:pointer;" onclick="GDXApp.setCheckoutPayMethod('bank')">
          <input type="radio" name="payMethod" value="bank" checked>
          <div>
            <div style="font-weight:600; display:flex; align-items:center; gap:6px;">
              <span>Chuyển khoản VietQR</span>
              <span class="badge badge-primary" style="font-size:11px; padding:1px 6px;">Napas 24/7</span>
            </div>
            <div class="field-hint">Quét mã QR chuyển khoản tự động qua ngân hàng</div>
          </div>
        </label>
        <label class="choice-card" id="payMethodCashCard" style="cursor:pointer;" onclick="GDXApp.setCheckoutPayMethod('cash')">
          <input type="radio" name="payMethod" value="cash">
          <div>
            <div style="font-weight:600;">Tiền mặt khi nghiệm thu</div>
            <div class="field-hint">Thanh toán trực tiếp sau khi kiểm tra kết quả</div>
          </div>
        </label>
      </div>
    </div>
  </div>
  <div class="modal-footer">
    <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Để sau</button>
    <button type="button" class="btn btn-primary" onclick="GDXApp.submitInvoicePayment('${bk.booking_id}')">
      Xác nhận thanh toán (${formatMoney(total)}) &rarr;
    </button>
  </div>
`;
}

export function setCheckoutPayMethod(method) {
  state.checkoutSelectedPayMethod = method;
  const bCard = document.getElementById("payMethodBankCard");
  const cCard = document.getElementById("payMethodCashCard");
  if (bCard && cCard) {
    if (method === "bank") {
      bCard.classList.add("is-selected");
      cCard.classList.remove("is-selected");
      const r = bCard.querySelector('input[type="radio"]');
      if (r) r.checked = true;
    } else {
      cCard.classList.add("is-selected");
      bCard.classList.remove("is-selected");
      const r = cCard.querySelector('input[type="radio"]');
      if (r) r.checked = true;
    }
  }
}

export function submitInvoicePayment(bookingId) {
  const method = state.checkoutSelectedPayMethod || "bank";
  closeModal();
  if (method === "bank") {
    go("1.8", { bookingId, payMethod: "bank" });
  } else {
    confirmBookingPayment(bookingId, "CASH");
  }
}

export function confirmBookingPayment(bookingId, method = "CASH") {
  const bk = window.GDX_DB.bookings.find(
    (b) => String(b.booking_id) === String(bookingId),
  );
  if (bk) bk.payment_status = "paid";
  const actorId =
    typeof state.activeUserId === "string" &&
    /^[0-9a-f-]{36}$/i.test(state.activeUserId)
      ? state.activeUserId
      : "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  apiRequest(`/api/bookings/${bookingId}/pay`, {
    method: "POST",
    body: JSON.stringify({
      booking_id: bookingId,
      method,
      changed_by: actorId,
    }),
  });
  closeModal();
  showToast(`Đã ghi nhận thanh toán hóa đơn #${bookingId} thành công!`);
  go(state.currentScreen, { bookingId });
}

let qrTimerInterval = null;

// 1.8: Trang quét QR Chuyển khoản giả định (VietQR Payment Gateway)
export function renderScreen_1_8(container, params = {}) {
  if (qrTimerInterval) {
    clearInterval(qrTimerInterval);
    qrTimerInterval = null;
  }

  const db = window.GDX_DB;
  const bookingId =
    params.bookingId != null
      ? params.bookingId
      : db.bookings[0]
        ? db.bookings[0].booking_id
        : 1042;
  const bk =
    db.bookings.find((b) => String(b.booking_id) === String(bookingId)) ||
    db.bookings[0];
  const svc = db.services.find((s) => s.service_id === bk.service_id);
  const total = (bk.total_amount || 0) + (bk.total_incidental || 0);
  const transferMemo = `GDX ${shortCode(bk.booking_id).replace(/^GDX-?/, "")}`;

  container.innerHTML = `
  <div class="v3-vietqr-wrap">
    <div class="v3-vietqr-card">
      <div class="v3-vietqr-head">
        <h1 class="v3-vietqr-title">Thanh toán VietQR tức thì</h1>
        <div class="v3-vietqr-timer-pill" id="qrCountdownContainer">
          <span aria-hidden="true">&#9201;</span>
          <span>Còn <strong id="qrCountdownSec" class="num">10s</strong></span>
        </div>
      </div>

      <div class="v3-vietqr-body" id="vietqrMainGrid">
        <!-- Left: QR Code Box -->
        <div class="v3-vietqr-qr-box">
          <img src="/assets/rickroll-vietqr.svg" alt="Mã VietQR Chuyển khoản" class="v3-vietqr-qr-img">
        </div>

        <!-- Right: Amount, Memo, Bank & Action -->
        <div class="v3-vietqr-info">
          <div class="v3-vietqr-amount num">${formatMoney(total)}</div>

          <div class="v3-vietqr-meta-group">
            <div class="v3-vietqr-memo" onclick="GDXApp.copyText('${transferMemo}', this)" title="Bấm để sao chép nội dung">
              Nội dung: <span class="num">${transferMemo}</span>
            </div>
            <div class="v3-vietqr-bank" onclick="GDXApp.copyText('0888668999', this)" title="Bấm để sao chép số tài khoản">
              Vietcombank &middot; <span class="num">0888 668 999</span>
            </div>
          </div>

          <button type="button" class="v3-vietqr-confirm-btn" onclick="GDXApp.executeQrPaymentSuccess('${bk.booking_id}')">
            Tôi đã chuyển khoản &rarr;
          </button>

          <button type="button" class="v3-vietqr-back-link" onclick="GDXApp.cancelQrPayment('${bk.booking_id}')">
            &larr; Quay lại đơn hàng #${shortCode(bk.booking_id)}
          </button>
        </div>
      </div>

      <!-- Success Result (Initially hidden) -->
      <div id="vietqrSuccessState" class="panel form-stack vietqr-success-card" style="display:none; max-width:600px; margin:20px auto 0;">
        <div class="vietqr-success-icon">&#10003;</div>
        <h2 style="font-size:1.4rem; color:var(--color-primary); font-family:var(--font-heading); margin-bottom:4px;">
          Thanh toán Thành Công!
        </h2>
        <p class="field-hint" style="margin-bottom:16px;">
          Đã xác nhận giao dịch thanh toán <strong class="num">${formatMoney(total)}</strong> qua Vietcombank Napas 24/7.
        </p>
        <div class="panel-subtle" style="font-size:0.875rem; text-align:left; gap:8px;">
          <div class="slip-row">
            <span>Mã giao dịch ngân hàng</span>
            <span class="slip-dots"></span>
            <strong id="txIdDisplay" class="num">VCB-QR...</strong>
          </div>
          <div class="slip-row">
            <span>Đơn hàng</span>
            <span class="slip-dots"></span>
            <strong>#${shortCode(bk.booking_id)} (${svc ? svc.title : ""})</strong>
          </div>
          <div class="slip-row">
            <span>Trạng thái cơ sở dữ liệu</span>
            <span class="slip-dots"></span>
            <span class="badge badge-positive">bookings.payment_status = 'paid'</span>
          </div>
        </div>
        <div class="field-hint" style="margin-top:14px;">
          Đang chuyển về màn hình Theo dõi đơn hàng...
        </div>
      </div>
    </div>
  </div>
`;

  // Start 10-second countdown
  let remaining = 10;
  const progressEl = document.getElementById("qrProgressBar");
  const secEl = document.getElementById("qrCountdownSec");

  qrTimerInterval = setInterval(() => {
    remaining--;
    if (secEl) secEl.textContent = `${remaining}s`;
    if (progressEl) {
      const pct = ((10 - remaining) / 10) * 100;
      progressEl.style.width = `${pct}%`;
    }

    if (remaining <= 0) {
      clearInterval(qrTimerInterval);
      qrTimerInterval = null;
      executeQrPaymentSuccess(bk.booking_id);
    }
  }, 1000);
}

export async function executeQrPaymentSuccess(bookingId) {
  if (qrTimerInterval) {
    clearInterval(qrTimerInterval);
    qrTimerInterval = null;
  }

  const db = window.GDX_DB;
  const bk =
    (bookingId != null
      ? db.bookings.find((b) => String(b.booking_id) === String(bookingId))
      : null) || db.bookings[0];
  if (!bk) return;

  const actualId = bk.booking_id;
  const total = (bk.total_amount || 0) + (bk.total_incidental || 0);
  const txId = "VCB-QR" + Date.now().toString().slice(-7);
  const nowIso = new Date().toISOString();

  const mainGrid = document.getElementById("vietqrMainGrid");
  const successCard = document.getElementById("vietqrSuccessState");
  const txDisplay = document.getElementById("txIdDisplay");
  if (mainGrid) mainGrid.style.display = "none";
  if (successCard) {
    successCard.style.display = "block";
    if (txDisplay) txDisplay.textContent = txId;
  }

  bk.payment_status = "paid";
  bk.paid_at = nowIso;
  bk.updated_at = nowIso;

  const actorUuid =
    typeof state.activeUserId === "string" &&
    /^[0-9a-f-]{36}$/i.test(state.activeUserId)
      ? state.activeUserId
      : "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  if (!Array.isArray(db.booking_status_history))
    db.booking_status_history = [];
  db.booking_status_history.unshift({
    history_id: Date.now(),
    booking_id: actualId,
    previous_status: bk.status,
    new_status: bk.status,
    changed_by: actorUuid,
    reason: `[VIETQR AUTO-CONFIRM] Khách hàng quét mã QR chuyển khoản thành công ${formatMoney(total)} (Mã GD: ${txId})`,
    created_at: nowIso,
  });

  try {
    await apiRequest(`/api/bookings/${actualId}/pay`, {
      method: "POST",
      body: JSON.stringify({
        booking_id: actualId,
        method: "VIETQR_BANK_TRANSFER",
        transaction_id: txId,
        amount: total,
        changed_by: actorUuid,
      }),
    });
  } catch (err) {
    console.warn("Payment API record warning:", err);
  }

  showToast(
    `🎉 Đã xác nhận thanh toán hóa đơn #${actualId} thành công qua VietQR!`,
  );

  setTimeout(() => {
    go("1.3", { bookingId: actualId });
  }, 1800);
}

export function cancelQrPayment(bookingId) {
  if (qrTimerInterval) {
    clearInterval(qrTimerInterval);
    qrTimerInterval = null;
  }
  go("1.3", { bookingId });
}


// 1.9: Đánh giá & Chấm điểm Thợ
export function renderModal_1_9(el, params = {}) {
  const db = window.GDX_DB;
  const bk =
    db.bookings.find(
      (b) => String(b.booking_id) === String(params.bookingId || 1040),
    ) ||
    db.bookings[1] ||
    db.bookings[0];
  const prov = db.provider_public_profiles.find(
    (p) => p.provider_id === bk.provider_id,
  );
  const quickTags = [
    "✓ Đúng giờ",
    "✓ Sạch sẽ tỉ mỉ",
    "✓ Nhiệt tình",
    "✓ Thân thiện",
  ];

  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">Đánh giá chất lượng ca làm việc · #${shortCode(bk.booking_id)}</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <form onsubmit="event.preventDefault(); GDXApp.submitBookingReview('${bk.booking_id}', this);">
    <div class="modal-body form-stack">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="${prov ? prov.avatar_url : "/assets/provider-tuan.jpg"}" alt="Thợ" style="width:48px; height:48px; border-radius:50%; object-fit:cover;">
        <div>
          <strong>${prov ? prov.full_name : "Phạm Quốc Tuấn"}</strong>
          <div class="field-hint">Mỗi đánh giá giúp cộng đồng chọn được thợ tận tâm</div>
        </div>
      </div>

      <div class="field-group">
        <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
          <div class="star-picker" id="reviewStarPicker">
            ${[1, 2, 3, 4, 5]
              .map(
                (n) => `
              <button type="button" class="star-btn ${n <= state.reviewRating ? "is-selected" : ""}" style="color:${n <= state.reviewRating ? "#E07A5F" : "#CBD5E1"};" onclick="GDXApp.setReviewStars(${n}, '${bk.booking_id}')">
                ${Icons.star(n <= state.reviewRating)}
              </button>`,
              )
              .join("")}
          </div>
          <strong style="font-size:20px; color:#E07A5F;" class="num">${state.reviewRating}.0 / 5</strong>
        </div>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${quickTags
          .map(
            (tag) =>
              `<button type="button" class="filter-chip" aria-pressed="false" onclick="const pressed=this.getAttribute('aria-pressed')==='true'; this.setAttribute('aria-pressed', pressed?'false':'true'); const ta=document.getElementById('revComment'); if(ta && !pressed && !ta.value.includes('${tag.replace("✓ ", "")}')) ta.value = (ta.value ? ta.value + ', ' : '') + '${tag.replace("✓ ", "")}';">${tag}</button>`,
          )
          .join("")}
      </div>

      <div class="field-group">
        <label class="field-label" for="revComment">Góp ý thêm</label>
        <textarea id="revComment" name="comment" class="textarea" rows="3" required placeholder="Cô Lan dọn dẹp rất kỹ, gia đình rất hài lòng...">Thợ đến đúng giờ, thao tác cẩn thận, dọn dẹp sạch sẽ khu vực làm việc trước khi ra về.</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Quay lại</button>
      <button type="submit" class="btn btn-primary" style="flex:1;">Gửi đánh giá (${state.reviewRating} sao) &rarr;</button>
    </div>
  </form>
`;
}

export function setReviewStars(n, bookingId) {
  state.reviewRating = n;
  openModal("1.9", { bookingId });
}

export function submitBookingReview(bookingId, form) {
  const db = window.GDX_DB;
  const bk = db.bookings.find(
    (b) => String(b.booking_id) === String(bookingId),
  );
  if (!bk) return;

  db.reviews.unshift({
    review_id: Date.now(),
    booking_id: bookingId,
    customer_id: bk.customer_id,
    provider_id: bk.provider_id,
    rating: state.reviewRating,
    comment: form.comment.value,
    created_at: new Date().toISOString(),
  });

  apiRequest("/api/reviews", {
    method: "POST",
    body: JSON.stringify({
      booking_id: bookingId,
      customer_id: bk.customer_id,
      provider_id: bk.provider_id,
      rating: state.reviewRating,
      comment: form.comment.value,
    }),
  });

  closeModal();
  showToast(
    "Cảm ơn bạn! Đánh giá đã được ghi nhận và cập nhật điểm uy tín của thợ.",
  );
  go(state.currentScreen);
}

// 1.10: Xác nhận Hủy lịch hẹn
export function renderModal_1_10(el, params = {}) {
  const bookingId = params.bookingId || 1043;
  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title" style="color:#991B1B;">Xác nhận hủy lịch #${shortCode(bookingId)}</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <form onsubmit="event.preventDefault(); GDXApp.confirmCancelBooking('${bookingId}', this);">
    <div class="modal-body form-stack">
      <div class="field-group">
        <label class="field-label" for="cancelReason">Lý do hủy lịch</label>
        <textarea id="cancelReason" name="reason" class="textarea" rows="3" required>Gia đình có việc đột xuất, xin hẹn lại vào cuối tuần sau.</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Quay lại</button>
      <button type="submit" class="btn btn-danger">Xác nhận hủy</button>
    </div>
  </form>
`;
}

export function confirmCancelBooking(bookingId, form) {
  const db = window.GDX_DB;
  const bk = db.bookings.find((b) => b.booking_id === bookingId);
  const nowIso = new Date().toISOString();
  const actorUuid =
    typeof state.activeUserId === "string" &&
    /^[0-9a-f-]{36}$/i.test(state.activeUserId)
      ? state.activeUserId
      : "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  if (bk) {
    const oldStatus = bk.status;
    bk.status = "cancelled";
    db.booking_status_history.unshift({
      history_id: Date.now(),
      booking_id: bookingId,
      previous_status: oldStatus,
      old_status: oldStatus,
      new_status: "cancelled",
      changed_by: actorUuid,
      reason: form.reason.value,
      created_at: nowIso,
      changed_at: nowIso,
    });
  }
  apiRequest(`/api/bookings/${bookingId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ user_id: actorUuid, reason: form.reason.value }),
  });
  closeModal();
  showToast(`Đã hủy lịch hẹn #${bookingId}`);
  go(state.currentScreen);
}

// 1.11: Trung tâm Hỗ trợ & Gửi khiếu nại
export function renderModal_1_11(el, params = {}) {
  const db = window.GDX_DB;
  const ticketId = params.ticketId;

  if (ticketId) {
    const t = (db.support_tickets || []).find(
      (x) => Number(x.ticket_id) === Number(ticketId),
    ) || {
      ticket_id: ticketId,
      subject: "Phiếu hỗ trợ",
      description: "",
      status: "open",
      priority: "medium",
    };
    const messages = (db.ticket_messages || []).filter(
      (m) =>
        Number(m.ticket_id) === Number(t.ticket_id) &&
        m.visibility !== "internal",
    );

    el.innerHTML = `
    <div class="modal-header">
      <div>
        <div class="modal-title">Phiếu hỗ trợ #${shortCode(t.ticket_id)}: ${t.subject}</div>
        <div class="field-hint">Trạng thái: <strong>${t.status}</strong> · Mức độ: <strong>${t.priority}</strong> · Đơn #${t.booking_id || "N/A"}</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="GDXApp.openModal('1.11')">&larr; Tất cả phiếu</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
      </div>
    </div>
    <div class="modal-body form-stack">
      <div class="panel-subtle">
        <strong style="font-size:14px;">Nội dung sự việc:</strong>
        <p class="field-hint" style="margin-top:6px; font-size:13.5px; line-height:1.5;">${t.description || "Không có mô tả."}</p>
        ${t.image_url ? `<div style="margin-top:10px;"><div class="field-hint" style="margin-bottom:4px;">Hình ảnh đính kèm:</div><img src="${t.image_url}" alt="Ảnh phiếu hỗ trợ" style="max-width:100%; max-height:220px; border-radius:8px; border:1px solid var(--color-border);"></div>` : ""}
        <div class="field-hint" style="margin-top:8px; font-size:12px;">Ngày gửi: <strong>${formatDateTime(t.created_at || new Date().toISOString())}</strong></div>
      </div>

      <div style="margin-top:10px;">
        <strong style="font-size:14px; font-family:var(--font-heading);">Trao đổi với Quản trị &amp; Điều phối (${messages.length}):</strong>
        <div class="ticket-thread" style="margin-top:8px; display:flex; flex-direction:column; gap:10px;">
          ${
            messages.length === 0
              ? '<div class="field-hint">Chưa có phản hồi mới. Nhân viên hỗ trợ sẽ phản hồi trong vòng 15-30 phút.</div>'
              : messages
                  .map((m) => {
                    const isMine =
                      m.sender_role === "customer" ||
                      m.sender_id === state.activeUserId;
                    const senderName = isMine
                      ? "Bạn"
                      : m.sender_role === "admin"
                        ? "Bộ phận Hỗ trợ / CSKH"
                        : "Đối tác thợ";
                    return `
              <div class="ticket-msg-card" style="padding:10px 14px; border-radius:10px; border:1px solid var(--color-border); background:${isMine ? "var(--color-primary-subtle, #f0fdf4)" : "var(--color-surface)"}; margin-left:${isMine ? "24px" : "0"}; margin-right:${isMine ? "0" : "24px"};">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="font-size:13px; color:${isMine ? "var(--color-primary)" : "inherit"};">${senderName}</strong>
                    <span class="badge ${isMine ? "badge-positive" : "badge-info"}" style="font-size:10.5px;">${m.sender_role || "user"}</span>
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
        <strong style="font-size:13px; margin-bottom:6px; display:block;">Gửi thêm thông tin trao đổi:</strong>
        <form onsubmit="event.preventDefault(); GDXApp.sendTicketReply(${t.ticket_id}, this);">
          <div class="field-group">
            <textarea name="reply_content" class="textarea" rows="2" placeholder="Nhập nội dung cần hỗ trợ thêm hoặc câu hỏi phản hồi..." required></textarea>
          </div>
          <div style="display:flex; justify-content:flex-end; margin-top:8px;">
            <button type="submit" class="btn btn-primary btn-sm">Gửi phản hồi &rarr;</button>
          </div>
        </form>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Đóng</button>
    </div>
  `;
    return;
  }

  const myBookings = (db.bookings || []).filter(
    (b) => b.customer_id === state.activeCustomerId,
  );
  const defaultBookingId =
    params.bookingId || (myBookings[0] ? myBookings[0].booking_id : 1042);
  const myTickets = (db.support_tickets || []).filter(
    (t) =>
      t.user_id === state.activeUserId ||
      !t.user_id ||
      state.userRole === "customer",
  );
  const shortCode = (rawId) => {
    const s = String(rawId || "");
    return s.length > 8 ? `GDX-${s.slice(-4).toUpperCase()}` : s;
  };
  const statusLabelVi = (st) =>
    ({
      open: "Đang mở",
      in_progress: "Đang xử lý",
      resolved: "Đã giải quyết",
      closed: "Đã đóng",
      pending: "Chờ xác nhận",
      accepted: "Đã nhận việc",
      completed: "Hoàn thành",
      cancelled: "Đã hủy",
    })[st] || st;

  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">Trung tâm Hỗ trợ</div>
      <div class="field-hint">Đội ngũ CSKH phản hồi trong vòng 15 phút</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">Đóng ✕</button>
  </div>
  <div class="v3-seg-tabs" role="tablist">
    <button type="button" class="v3-seg-tab is-active" onclick="this.parentElement.querySelectorAll('.v3-seg-tab').forEach(b=>b.classList.remove('is-active')); this.classList.add('is-active'); document.getElementById('tkTabNew').style.display='block'; document.getElementById('tkTabList').style.display='none';">
      Gửi yêu cầu mới
    </button>
    <button type="button" class="v3-seg-tab" onclick="this.parentElement.querySelectorAll('.v3-seg-tab').forEach(b=>b.classList.remove('is-active')); this.classList.add('is-active'); document.getElementById('tkTabNew').style.display='none'; document.getElementById('tkTabList').style.display='block';">
      Phiếu của tôi (${myTickets.length})
    </button>
  </div>
  <div id="tkTabNew">
    <form onsubmit="event.preventDefault(); GDXApp.submitSupportTicket(this);">
      <div class="modal-body form-stack">
        <div class="form-row-2">
          <div class="field-group">
            <label class="field-label" for="tkBookingId">Đơn hàng liên quan</label>
            <select id="tkBookingId" name="booking_id" class="select">
              ${(db.bookings || [])
                .map(
                  (b) =>
                    `<option value="${b.booking_id}" ${b.booking_id === defaultBookingId ? "selected" : ""}>#${shortCode(b.booking_id)} · ${statusLabelVi(b.status)}</option>`,
                )
                .join("")}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label" for="tkPriority">Mức độ ưu tiên</label>
            <select id="tkPriority" name="priority" class="select">
              <option value="medium" selected>Bình thường</option>
              <option value="high">Cao</option>
              <option value="urgent">Khẩn cấp</option>
              <option value="low">Thấp</option>
            </select>
          </div>
        </div>

        <div class="field-group">
          <label class="field-label" for="tkSubject">Tiêu đề yêu cầu</label>
          <input type="text" id="tkSubject" name="subject" class="input" required placeholder="Ví dụ: Cần hỗ trợ đổi giờ hẹn hoặc kiểm tra chi phí">
        </div>

        <div class="field-group">
          <label class="field-label" for="tkDesc">Mô tả chi tiết</label>
          <textarea id="tkDesc" name="description" class="textarea" rows="3" required placeholder="Nhập nội dung cần bộ phận điều phối hỗ trợ..."></textarea>
        </div>

        <div class="form-row-2">
          <div class="field-group">
            <label class="field-label" for="tkImageFile">Ảnh minh chứng (tùy chọn)</label>
            <label for="tkImageFile" class="v3-upload-btn">📎 Chọn ảnh từ thiết bị</label>
            <input type="file" id="tkImageFile" accept="image/*" style="display:none;" onchange="GDXApp.handleSupportImageSelect(this)">
          </div>
          <div class="field-group">
            <label class="field-label" for="tkImageUrl">Hoặc dán link ảnh</label>
            <input type="url" id="tkImageUrl" name="image_url" class="input" placeholder="https://...">
          </div>
        </div>
        <div id="tkImagePreview" style="display:${state.supportTicketImageDraft ? "block" : "none"};">
          ${state.supportTicketImageDraft ? `<img src="${state.supportTicketImageDraft}" alt="Xem trước ảnh đính kèm" style="max-height:140px; border-radius:12px; border:1px solid var(--color-border);">` : ""}
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="GDXApp.closeModal()">Đóng</button>
        <button type="submit" class="btn btn-primary">Gửi phiếu hỗ trợ &rarr;</button>
      </div>
    </form>
  </div>
  <div id="tkTabList" class="modal-body form-stack" style="display:none; max-height:62vh; overflow-y:auto;">
    ${myTickets
      .map(
        (t) => `
      <div class="v3-ticket-card">
        <div style="min-width:0; flex:1;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="v3-ticket-code">#${shortCode(t.ticket_id)}</span>
            <strong style="font-size:14px; color:#16201C;">${t.subject}</strong>
          </div>
          <div class="field-hint" style="margin-top:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>Đơn #${shortCode(t.booking_id)}</span>
            <span>·</span>
            <span>${statusLabelVi(t.status)}</span>
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" style="white-space:nowrap;" onclick="GDXApp.openModal('1.11', { ticketId: '${t.ticket_id}' })">
          Xem trao đổi &rarr;
        </button>
      </div>`,
      )
      .join("")}
    ${myTickets.length === 0 ? '<div class="field-hint" style="text-align:center; padding:24px 0;">Bạn chưa gửi phiếu hỗ trợ nào.</div>' : ""}
  </div>
`;
}

export function handleSupportImageSelect(input) {
  const file = input && input.files && input.files[0];
  if (!file) {
    state.supportTicketImageDraft = null;
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    state.supportTicketImageDraft =
      e.target && e.target.result ? String(e.target.result) : null;
    const previewEl = document.getElementById("tkImagePreview");
    if (previewEl && state.supportTicketImageDraft) {
      previewEl.style.display = "block";
      previewEl.innerHTML = `<img src="${state.supportTicketImageDraft}" alt="Xem trước ảnh đính kèm" style="max-height:140px; border-radius:8px; border:1px solid var(--color-border);">`;
    }
  };
  reader.readAsDataURL(file);
}

export function submitSupportTicket(form) {
  const db = window.GDX_DB;
  const urlInput =
    form.image_url && form.image_url.value
      ? form.image_url.value.trim()
      : "";
  const imageUrl = state.supportTicketImageDraft || urlInput || null;
  const newTicket = {
    ticket_id: Date.now(),
    user_id: state.activeUserId,
    booking_id: Number(form.booking_id.value),
    subject: form.subject.value,
    description: form.description.value,
    image_url: imageUrl,
    priority: form.priority.value,
    status: "open",
    created_at: new Date().toISOString(),
  };
  state.supportTicketImageDraft = null;
  db.support_tickets.unshift(newTicket);
  apiRequest("/api/support-tickets", {
    method: "POST",
    body: JSON.stringify(newTicket),
  });
  closeModal();
  showToast("Đã gửi phiếu hỗ trợ tới bộ phận Quản trị!");
}

