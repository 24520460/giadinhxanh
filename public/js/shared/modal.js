import { apiRequest } from "../core/api.js";
import { formatMoney } from "../core/formatters.js";
import { state } from "../core/state.js";
import { applyUserModeCleanups, closeTopLayer, showToast } from "./ui-utils.js";

export const MODAL_RENDERERS = {};
export function registerModalRenderers(map) {
  Object.assign(MODAL_RENDERERS, map);
}

// TICKET MESSAGES & INTERNAL NOTES (FR-TKT-005)
// =====================================================================
export async function sendTicketReply(ticketId, form) {
  const content = form.reply_content.value.trim();
  if (!content) return;
  const isInternal = form.is_internal ? form.is_internal.checked : false;

  const res = await apiRequest(`/api/tickets/${ticketId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      sender_id: state.activeUserId,
      sender_role:
        state.userRole === "admin"
          ? "admin"
          : state.userRole === "provider"
            ? "provider"
            : "customer",
      content,
      visibility: isInternal ? "internal" : "public",
    }),
  });

  if (res && res.ok) {
    if (!Array.isArray(window.GDX_DB.ticket_messages))
      window.GDX_DB.ticket_messages = [];
    window.GDX_DB.ticket_messages.push(res.message);
    form.reply_content.value = "";
    showToast(
      isInternal
        ? "Đã lưu ghi chú nội bộ thành công"
        : "Đã gửi phản hồi tới người dùng",
    );
    openModal(state.userRole === "admin" ? "3.9" : "1.11", { ticketId });
  } else {
    showToast(res ? res.error : "Lỗi khi gửi phản hồi");
  }
}


// =====================================================================
// 15 MODALS & DRAWERS (1.7 – 1.11, 2.6 – 2.9, 3.5 – 3.9, SUPABASE_STATUS, CATALOG)
// =====================================================================
export function openModal(modalId, params = {}) {
  const dialog = document.getElementById("appModal");
  const content = document.getElementById("modalInnerContent");
  if (!dialog || !content) return;

  dialog.className = "modal-dialog";
  if (
    modalId === "1.7" ||
    modalId === "1.11" ||
    modalId === "2.9" ||
    modalId === "3.5"
  ) {
    dialog.classList.add("is-drawer");
  }

  const modalRenderer = MODAL_RENDERERS[modalId];
  if (typeof modalRenderer === "function") {
    modalRenderer(content, params);
  } else if (modalId === "SUPABASE_STATUS") {
    renderModal_SupabaseStatus(content);
  } else if (modalId === "CATALOG") {
    renderModal_Catalog(content);
  } else {
    content.innerHTML = `<div class="modal-body"><p>Hộp thoại ${modalId}</p></div>`;
  }

  applyUserModeCleanups(content, modalId);
  if (!dialog.open) {
    dialog.showModal();
  }
}

export function closeModal() {
  const dialog = document.getElementById("appModal");
  if (!dialog) return;
  state.activeModal = null;
  try {
    if (dialog.open) {
      closeTopLayer(dialog);
    } else {
      if (typeof dialog.close === "function") dialog.close();
      dialog.removeAttribute("open");
    }
  } catch (_e) {
    dialog.removeAttribute("open");
  }
}


// SUPABASE_STATUS Modal (Dev Mode)
export function renderModal_SupabaseStatus(el) {
  const b = state.backend;
  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">Trạng thái kết nối Backend &amp; Supabase (.env.local)</div>
      <div class="field-hint">Kiểm tra cấu hình SUPABASE_URL và SUPABASE_ANON_KEY</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <div class="modal-body form-stack">
    <div class="panel-subtle form-stack" style="gap:8px;">
      <div class="slip-row">
        <span>Chế độ dữ liệu hiện tại</span>
        <span class="slip-dots"></span>
        <span class="badge ${b.mode === "supabase" ? "badge-positive" : "badge-info"}">${b.mode === "supabase" ? "Supabase PostgreSQL Live" : "Local JSON Store (Fallback)"}</span>
      </div>
      <div class="slip-row">
        <span>Trạng thái cấu hình .env.local</span>
        <span class="slip-dots"></span>
        <strong>${b.supabaseConfigured ? "Đã cấu hình đầy đủ" : "Chưa điền khóa API"}</strong>
      </div>
      <div class="field-hint">${b.message}</div>
    </div>
  </div>
  <div class="modal-footer">
    <button type="button" class="btn btn-primary" onclick="GDXApp.closeModal()">Đã hiểu</button>
  </div>
`;
}

// CATALOG Pricing Modal
export function renderModal_Catalog(el) {
  const svcs = window.GDX_DB.services.filter((s) => s.is_active);
  el.innerHTML = `
  <div class="modal-header">
    <div>
      <div class="modal-title">Biểu giá niêm yết Dịch vụ Gia Đình Xanh</div>
      <div class="field-hint">Đơn giá minh bạch từ bảng services</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="GDXApp.closeModal()">✕</button>
  </div>
  <div class="modal-body">
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Gói dịch vụ</th>
            <th>Hình thức</th>
            <th class="num">Thời lượng</th>
            <th class="num">Đơn giá</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${svcs
            .map(
              (s) => `
            <tr>
              <td><strong>${s.title}</strong></td>
              <td>${s.pricing_type === "hourly" ? "Theo giờ" : "Trọn gói"}</td>
              <td class="num">~${s.estimated_duration} phút</td>
              <td class="num"><strong style="color:var(--accent);">${formatMoney(s.price)}</strong></td>
              <td>
                <button type="button" class="btn btn-primary btn-sm" onclick="GDXApp.closeModal(); GDXApp.go('1.2', {serviceId: ${s.service_id}})">
                  Đặt lịch
                </button>
              </td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  </div>
`;
}

