import { apiRequest } from "../core/api.js";
import { formatDateTime } from "../core/formatters.js";
import { go } from "../core/router.js";
import { state } from "../core/state.js";
import { showToast } from "./ui-utils.js";

// =====================================================================
// IN-APP NOTIFICATIONS MODULE (FR-NOTIF-001)
// =====================================================================
export async function fetchNotifications() {
  if (!state.activeUserId) return;
  const res = await apiRequest(
    `/api/notifications?user_id=${state.activeUserId}`,
  );
  if (res && res.ok && Array.isArray(res.notifications)) {
    state.notifications = res.notifications;
    const unread = state.notifications.filter((n) => !n.is_read).length;
    state.unreadNotifCount = unread;
    const badge = document.getElementById("notifBadgeCount");
    if (badge) {
      if (unread > 0) {
        badge.textContent = unread > 9 ? "9+" : String(unread);
        badge.style.display = "inline-flex";
      } else {
        badge.style.display = "none";
      }
    }
  }
}

export function toggleNotificationsDrawer(forceState) {
  const drawer = document.getElementById("notificationsDrawer");
  if (!drawer) return;
  const isCurrentlyOpen =
    !drawer.hidden &&
    drawer.style.display !== "none" &&
    !drawer.classList.contains("is-hidden");
  const shouldOpen =
    typeof forceState === "boolean" ? forceState : !isCurrentlyOpen;

  if (shouldOpen) {
    renderNotificationsList();
    drawer.hidden = false;
    drawer.style.display = "flex";
    drawer.classList.remove("is-hidden");
  } else {
    drawer.hidden = true;
    drawer.style.display = "none";
    drawer.classList.add("is-hidden");
  }
}

export function closeNotificationsDrawer() {
  toggleNotificationsDrawer(false);
}

export function renderNotificationsList() {
  const listEl = document.getElementById("notificationsList");
  if (!listEl) return;
  const notifs = state.notifications || [];
  if (notifs.length === 0) {
    listEl.innerHTML = `
    <div class="notif-empty">
      <div style="font-size:24px; margin-bottom:6px;">📭</div>
      <div>Bạn chưa có thông báo mới nào</div>
    </div>
  `;
    return;
  }

  listEl.innerHTML = notifs
    .map((n) => {
      let icon = "🔔";
      if (n.type === "booking_created" || n.type === "booking_confirmed")
        icon = "📅";
      else if (n.type === "booking_completed") icon = "⭐";
      else if (n.type === "booking_cancelled") icon = "❌";
      else if (n.type === "ticket_reply") icon = "💬";
      else if (n.type === "kyc_update") icon = "🛡️";

      return `
    <div class="notif-item ${n.is_read ? "" : "is-unread"}" onclick="GDXApp.handleNotificationClick('${n.notification_id}', '${n.link || ""}')">
      <div class="notif-icon-wrap">${icon}</div>
      <div class="notif-content">
        <div class="notif-title">${n.title}</div>
        <div class="notif-body">${n.body}</div>
        <div class="notif-time">${formatDateTime(n.created_at)}</div>
      </div>
      ${!n.is_read ? `<span class="status-dot is-online" style="width:8px; height:8px; margin-top:6px; flex-shrink:0;"></span>` : ""}
    </div>
  `;
    })
    .join("");
}

export async function handleNotificationClick(notifId, link) {
  await markNotificationRead(notifId);
  const drawer = document.getElementById("notificationsDrawer");
  if (drawer) drawer.hidden = true;
  if (link && link.startsWith("#")) {
    const screenId = link.slice(1);
    go(screenId);
  }
}

export async function markNotificationRead(notifId) {
  const n = (state.notifications || []).find(
    (x) => String(x.notification_id) === String(notifId),
  );
  if (n) n.is_read = true;
  await apiRequest(`/api/notifications/${notifId}/read`, {
    method: "POST",
  });
  fetchNotifications();
  renderNotificationsList();
}

export async function markAllNotificationsRead() {
  (state.notifications || []).forEach((n) => {
    n.is_read = true;
  });
  await apiRequest("/api/notifications/read-all", {
    method: "POST",
    body: JSON.stringify({ user_id: state.activeUserId }),
  });
  fetchNotifications();
  renderNotificationsList();
  showToast("Đã đánh dấu tất cả thông báo là đã đọc");
}

