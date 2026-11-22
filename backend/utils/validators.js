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

module.exports = {
  isValidPhoneVN,
  isValidEmail,
  isUuid,
  normalizeId,
  validateScheduledTime,
  validateNonNegativeAmount
};
