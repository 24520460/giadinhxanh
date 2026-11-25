import { state } from "./state.js";

// --- DISTANCE HELPER (Haversine formula from DB lat/lng columns) ---
export function calcDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return "1.8";
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(0.4, R * c).toFixed(1);
}


export function formatMoney(amount) {
  return (
    new Intl.NumberFormat("vi-VN").format(Math.round(Number(amount) || 0)) +
    " đ"
  );
}

export function shortCode(rawId) {
  const s = String(rawId || "");
  return s.length > 8 ? `GDX-${s.slice(-4).toUpperCase()}` : s;
}

export function formatCccd(rawCccd) {
  const s = String(rawCccd || "").trim();
  if (!s) return "—";
  if (/^TEST-ID-/i.test(s) || s.length > 12) {
    return `079••••${s.slice(-4)}`;
  }
  return s.length >= 8 ? `${s.slice(0, 3)}••••${s.slice(-4)}` : s;
}

export function formatDateTime(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTimeOnly(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function escapeQuotes(str) {
  return String(str || "")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;");
}

export function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

export function inlineIdentifier(value) {
  return typeof value === "number"
    ? String(value)
    : `'${escapeQuotes(value)}'`;
}

export function formatStatusLabel(st) {
  const map = {
    pending: "Chờ xác nhận",
    confirmed: "Đã nhận việc",
    in_progress: "Đang thực hiện",
    completed: "Hoàn thành",
    cancelled: "Đã hủy",
    auto_cancelled: "Tự động hủy (24h)",
    rejected: "Từ chối",
    unpaid: "Chưa thanh toán",
    paid: "Đã thanh toán",
    refunded: "Đã hoàn tiền",
    open: "Đang mở",
    resolved: "Đã giải quyết",
    closed: "Đã đóng",
    verified: "Đã xác minh",
    low: "Thấp",
    medium: "Bình thường",
    high: "Khẩn cấp",
    urgent: "Nghiêm trọng",
  };
  return state.viewMode === "user"
    ? map[st] || st
    : `${map[st] || st} (${st})`;
}


export function formatSeconds(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function formatTimer(sec) {
  return formatSeconds(sec);
}

export function statusBadge(st) {
  const cls =
    {
      pending: "badge-warning",
      confirmed: "badge-info",
      in_progress: "badge-info",
      completed: "badge-positive",
      cancelled: "badge-negative",
      auto_cancelled: "badge-negative",
      rejected: "badge-negative",
    }[st] || "badge-neutral";
  return `<span class="badge ${cls}">${formatStatusLabel(st)}</span>`;
}

export function paymentBadge(st) {
  const cls =
    {
      paid: "badge-positive",
      unpaid: "badge-warning",
      refunded: "badge-neutral",
    }[st] || "badge-neutral";
  return `<span class="badge ${cls}">${formatStatusLabel(st)}</span>`;
}

export function priorityBadge(st) {
  const cls =
    {
      urgent: "badge-negative",
      high: "badge-warning",
      medium: "badge-info",
      low: "badge-neutral",
    }[st] || "badge-neutral";
  return `<span class="badge ${cls}">${formatStatusLabel(st)}</span>`;
}


export function cleanTechnicalLabelText(str) {
  if (!str) return str;
  return str
    .replace(
      /\s*\((?:users|auth\.users|customer_profiles|company_profiles|provider_profiles|provider_public_profiles|provider_services|provider_areas|availability_schedules|availability_exceptions|bookings|booking_status_history|reviews|favorites|support_tickets|service_categories|services|province|ward)[^)]*\)/gi,
      "",
    )
    .replace(
      /\s*\((?:ward_id|id_card_number|tax_code|company_id|default_address|category_id|parent_id|pricing_type|total_incidental|total_amount|payment_status|status|priority|subject|exception_date|day_of_week|base_price|Charts\.bars|Charts\.line|verification_status|ticket_status|ticket_priority|booking_id|image_url|is_active|UNIQUE|0\.\.6)[^)]*\)/gi,
      "",
    )
    .replace(
      /\b(?:pending|confirmed|in_progress|completed|cancelled|rejected|unpaid|paid|refunded|open|resolved|closed|verified)\b/g,
      (match) => {
        const map = {
          pending: "Chờ xác nhận",
          confirmed: "Đã xác nhận",
          in_progress: "Đang thực hiện",
          completed: "Hoàn thành",
          cancelled: "Đã hủy",
          rejected: "Từ chối",
          unpaid: "Chưa thanh toán",
          paid: "Đã thanh toán",
          refunded: "Đã hoàn tiền",
          open: "Đang mở",
          resolved: "Đã giải quyết",
          closed: "Đã đóng",
          verified: "Đã xác minh",
        };
        return map[match] || match;
      },
    );
}


export function isCookingService(s) {
  if (!s) return false;
  const t = (s.title || "").toLowerCase();
  const slug = (s.slug || "").toLowerCase();
  return (
    t.includes("nấu") ||
    t.includes("cơm") ||
    t.includes("bếp") ||
    t.includes("cooking") ||
    slug.includes("nau-an") ||
    String(s.category_id).endsWith("302") ||
    s.category_id === 2 ||
    s.category_id === "2"
  );
}

export function getServiceImage(s) {
  if (!s) return "/assets/cleaning-livingroom.jpg";
  if (s.image_url) return s.image_url;
  const t = (s.title || "").toLowerCase();
  if (t.includes("nấu") || t.includes("cơm"))
    return "/assets/cooking-family-meal.jpg";
  if (t.includes("đầu bếp") || t.includes("tiệc"))
    return "/assets/cooking-chef-prep.jpg";
  if (t.includes("deep") || t.includes("sâu") || t.includes("tổng vệ sinh"))
    return "/assets/cleaning-deep.jpg";
  if (isCookingService(s)) return "/assets/cooking-family-meal.jpg";
  return "/assets/cleaning-livingroom.jpg";
}


export function getLocalDateTimeOffset(days, hours, minutes) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getDefaultUpcomingTimeLocal() {
  return getLocalDateTimeOffset(1, 9, 0);
}

export function getMinDateTimeLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

