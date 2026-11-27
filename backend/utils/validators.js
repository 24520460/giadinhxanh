const VN_PHONE_REGEX = /^0[0-9]{9,10}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidPhoneVN(phone) {
  return VN_PHONE_REGEX.test(String(phone || "").trim());
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(String(email || "").trim());
}

function isUuid(val) {
  return typeof val === "string" && UUID_REGEX.test(val.trim());
}

function normalizeId(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return !isNaN(Number(s)) ? Number(s) : s;
}

/**
 * Kiểm tra scheduled_time hợp lệ và không nằm trong quá khứ (cho phép sai lệch tối đa 5 phút).
 */
function validateScheduledTime(rawTime) {
  if (!rawTime) return { ok: true, iso: new Date().toISOString() };
  const parsedMs = Date.parse(String(rawTime));
  if (!Number.isFinite(parsedMs)) {
    return { ok: false, error: "Định dạng thời gian hẹn (scheduled_time) không hợp lệ." };
  }
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  if (parsedMs < fiveMinutesAgo) {
    return {
      ok: false,
      error: "Thời gian hẹn phải từ hiện tại trở đi (không thể đặt lịch trong quá khứ)."
    };
  }
  return { ok: true, iso: new Date(parsedMs).toISOString() };
}

function validateNonNegativeAmount(val, fieldLabel = "Số tiền") {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) {
    return { ok: false, error: `${fieldLabel} phải là số không âm (>= 0).` };
  }
  return { ok: true, value: num };
}

const VALID_BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "rejected",
  "auto_cancelled"
];

const BOOKING_TRANSITIONS = {
  pending: ["confirmed", "rejected", "cancelled", "auto_cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  rejected: [],
  auto_cancelled: []
};

function validateBookingStatusTransition(currentStatus, newStatus, actorRole = null) {
  if (!VALID_BOOKING_STATUSES.includes(newStatus)) {
    return { ok: false, statusCode: 400, code: "INVALID_STATUS", error: "Trạng thái đơn hàng không hợp lệ." };
  }
  if (currentStatus === newStatus) {
    return {
      ok: false,
      statusCode: 409,
      code: "ALREADY_IN_STATUS",
      error: `Đơn hàng đã ở trạng thái '${newStatus}'.`
    };
  }
  const allowedNext = BOOKING_TRANSITIONS[currentStatus] || [];
  if (!allowedNext.includes(newStatus)) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_TRANSITION",
      error: `Không thể chuyển trạng thái đơn từ '${currentStatus}' sang '${newStatus}'.`
    };
  }
  if (actorRole === "customer") {
    if (newStatus !== "cancelled" || !["pending", "confirmed"].includes(currentStatus)) {
      return {
        ok: false,
        statusCode: 403,
        code: "FORBIDDEN_TRANSITION",
        error: "Khách hàng chỉ được phép hủy đơn đang chờ hoặc đã xác nhận."
      };
    }
  } else if (actorRole === "provider") {
    const provAllowed =
      (currentStatus === "pending" && ["confirmed", "rejected"].includes(newStatus)) ||
      (currentStatus === "confirmed" && ["in_progress", "cancelled"].includes(newStatus)) ||
      (currentStatus === "in_progress" && ["completed", "cancelled"].includes(newStatus));
    if (!provAllowed) {
      return {
        ok: false,
        statusCode: 403,
        code: "FORBIDDEN_TRANSITION",
        error: `Đối tác không được phép chuyển đơn từ '${currentStatus}' sang '${newStatus}'.`
      };
    }
  }
  return { ok: true };
}

function validateCoordinates(lat, lng, defaultLat = 10.728912, defaultLng = 106.712405) {
  if (lat == null || lat === "" || lng == null || lng === "") {
    return { ok: true, latitude: defaultLat, longitude: defaultLng };
  }
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (
    !Number.isFinite(parsedLat) ||
    !Number.isFinite(parsedLng) ||
    parsedLat < -90 ||
    parsedLat > 90 ||
    parsedLng < -180 ||
    parsedLng > 180
  ) {
    return { ok: false, error: "Tọa độ GPS (latitude/longitude) không hợp lệ." };
  }
  return { ok: true, latitude: parsedLat, longitude: parsedLng };
}

module.exports = {
  isValidPhoneVN,
  isValidEmail,
  isUuid,
  normalizeId,
  validateScheduledTime,
  validateNonNegativeAmount,
  VALID_BOOKING_STATUSES,
  BOOKING_TRANSITIONS,
  validateBookingStatusTransition,
  validateCoordinates
};
