const { saveLocalDb } = require("../db/localStore");
const { dispatchNotification } = require("./auditService");
const { sendJson } = require("../utils/http");
const { authenticateWriteOrScopedRequest } = require("../middleware/auth");
const { isUuid, validateBookingStatusTransition } = require("../utils/validators");

const inFlightAcceptLocks = new Set();

function normalizeBookingRecord(bk) {
  if (!bk || typeof bk !== "object") return bk;
  const providerId = bk.provider_id ?? null;
  const dispatchType =
    bk.dispatch_type ||
    (providerId == null || (bk.status === "pending" && String(bk.notes || "").includes("[BROADCAST_POOL]"))
      ? "broadcast"
      : "direct");
  return {
    ...bk,
    provider_id: providerId,
    dispatch_type: dispatchType,
    total_incidental: Number(bk.total_incidental || 0),
    payment_status: bk.payment_status || "unpaid"
  };
}

async function resolveActorContext(authUser, { useSupabase = false, db = null, client = null } = {}) {
  if (!authUser) return null;
  const uid = String(authUser.user_id || "").trim();
  const role = String(authUser.role || "customer");
  let customerId = null;
  let providerId = null;
  let companyId = null;

  if (useSupabase && client) {
    const [{ data: cp }, { data: pp }, { data: comp }] = await Promise.all([
      client.from("customer_profiles").select("customer_id, user_id").eq("user_id", uid).maybeSingle(),
      client
        .from("provider_profiles")
        .select("provider_id, user_id, company_id, verification_status")
        .eq("user_id", uid)
        .maybeSingle(),
      client.from("company_profiles").select("company_id, user_id").eq("user_id", uid).maybeSingle()
    ]);
    customerId = cp ? cp.customer_id : null;
    providerId = pp ? pp.provider_id : null;
    companyId = comp ? comp.company_id : pp ? pp.company_id : null;
  } else if (db) {
    const cp = (db.customer_profiles || []).find((c) => String(c.user_id) === uid);
    const pp = (db.provider_profiles || []).find((p) => String(p.user_id) === uid);
    const comp = (db.company_profiles || []).find((c) => String(c.user_id) === uid);
    customerId = cp ? cp.customer_id : null;
    providerId = pp ? pp.provider_id : null;
    companyId = comp ? comp.company_id : pp ? pp.company_id : null;
  }

  return {
    userId: authUser.user_id,
    role,
    customerId,
    providerId,
    companyId
  };
}

async function transitionBookingLifecycle(
  ctx,
  { bookingId, newStatus, defaultReason, bodyReason, allowedRoles = ["customer", "provider", "admin"], fallbackActorId = null }
) {
  const { req, res, isProd, db, client } = ctx;
  const authResult = await authenticateWriteOrScopedRequest(req, res, { isProd, client, allowedRoles });
  if (authResult.halted) return true;
  const authUser = authResult.user;

  if (bookingId === null || bookingId === undefined || String(bookingId).trim() === "") {
    sendJson(res, 400, { ok: false, code: "INVALID_INPUT", error: "Thiếu mã đơn hàng (booking_id)." });
    return true;
  }

  const useSupabase = Boolean(isProd || (client && isUuid(String(bookingId))));
  if (useSupabase && !client) {
    sendJson(res, 503, { ok: false, code: "SERVICE_UNAVAILABLE", error: "Không có kết nối Supabase." });
    return true;
  }

  let curBk = null;
  if (useSupabase) {
    const { data, error } = await client
      .from("bookings")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (!error && data) curBk = data;
  } else {
    curBk = (db.bookings || []).find((b) => String(b.booking_id) === String(bookingId)) || null;
  }

  if (!curBk) {
    sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "Không tìm thấy đơn hàng." });
    return true;
  }

  if (authUser) {
    const actor = await resolveActorContext(authUser, { useSupabase, db, client });
    if (authUser.role === "customer") {
      if (!actor.customerId || String(curBk.customer_id) !== String(actor.customerId)) {
        sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Bạn không sở hữu đơn hàng này." });
        return true;
      }
    } else if (authUser.role === "provider") {
      if (!actor.providerId || String(curBk.provider_id) !== String(actor.providerId)) {
        sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Đơn hàng này không thuộc phân công của bạn." });
        return true;
      }
    }
  }

  const transCheck = validateBookingStatusTransition(curBk.status, newStatus, authUser ? authUser.role : null);
  if (!transCheck.ok) {
    sendJson(res, transCheck.statusCode, { ok: false, code: transCheck.code, error: transCheck.error });
    return true;
  }

  const nowIso = new Date().toISOString();
  const oldStatus = curBk.status;
  const reason = String(bodyReason || defaultReason || "Cập nhật trạng thái đơn hàng").trim();

  if (useSupabase) {
    const { data: updatedBk, error: updErr } = await client
      .from("bookings")
      .update({ status: newStatus, updated_at: nowIso })
      .eq("booking_id", bookingId)
      .eq("status", oldStatus)
      .select()
      .maybeSingle();

    if (updErr || !updatedBk) {
      sendJson(res, 409, {
        ok: false,
        code: "CONFLICT",
        error: updErr ? updErr.message : "Trạng thái đơn hàng vừa thay đổi, vui lòng tải lại."
      });
      return true;
    }

    let actorUuid =
      (authUser && isUuid(String(authUser.user_id)) && authUser.user_id) ||
      (isUuid(String(fallbackActorId || "")) && fallbackActorId) ||
      null;
    if (!actorUuid) {
      const { data: cp } = await client
        .from("customer_profiles")
        .select("user_id")
        .eq("customer_id", updatedBk.customer_id)
        .maybeSingle();
      actorUuid = cp ? cp.user_id : null;
    }

    let historyRow = null;
    if (actorUuid) {
      const { data: histData } = await client
        .from("booking_status_history")
        .insert([
          {
            booking_id: bookingId,
            previous_status: oldStatus,
            new_status: newStatus,
            changed_by: actorUuid,
            reason
          }
        ])
        .select()
        .maybeSingle();
      historyRow = histData || null;
    }

    if (newStatus === "completed") {
      const { data: cp } = await client
        .from("customer_profiles")
        .select("user_id")
        .eq("customer_id", updatedBk.customer_id)
        .maybeSingle();
      if (cp && cp.user_id) {
        await dispatchNotification(null, {
          user_id: cp.user_id,
          title: "Đơn hàng đã hoàn thành!",
          body: `Đơn #${bookingId} đã được hoàn tất. Hãy dành 30 giây để đánh giá chất lượng thợ nhé!`,
          type: "booking_completed",
          link: `/bookings/${bookingId}/tracking`,
          isProd: true,
          client
        });
      }
    }

    sendJson(res, 200, { ok: true, booking: normalizeBookingRecord(updatedBk), history: historyRow });
    return true;
  }

  curBk.status = newStatus;
  curBk.updated_at = nowIso;
  if (!Array.isArray(db.booking_status_history)) db.booking_status_history = [];
  const nextHistoryId = Math.max(5000, ...db.booking_status_history.map((h) => h.history_id || 0)) + 1;
  const resolvedActor =
    (authUser && authUser.user_id) ||
    fallbackActorId ||
    (authUser && authUser.role === "provider" ? "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b21" : "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
  const historyRow = {
    history_id: nextHistoryId,
    booking_id: curBk.booking_id,
    previous_status: oldStatus,
    new_status: newStatus,
    changed_by: resolvedActor,
    reason,
    created_at: nowIso
  };
  db.booking_status_history.unshift(historyRow);

  if (newStatus === "completed") {
    const cp = (db.customer_profiles || []).find((c) => String(c.customer_id) === String(curBk.customer_id));
    if (cp && cp.user_id) {
      dispatchNotification(db, {
        user_id: cp.user_id,
        title: "Đơn hàng đã hoàn thành!",
        body: `Đơn #${curBk.booking_id} đã được hoàn tất. Hãy dành 30 giây để đánh giá chất lượng thợ nhé!`,
        type: "booking_completed",
        link: `/bookings/${curBk.booking_id}/tracking`,
        isProd: false
      });
    }
  }

  saveLocalDb(db);
  sendJson(res, 200, { ok: true, booking: normalizeBookingRecord(curBk), history: historyRow });
  return true;
}

async function autoExpirePendingBookings(db, isProd, client) {
  let count = 0;
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  if (isProd && client) {
    try {
      const { data: expiredBks } = await client
        .from("bookings")
        .select("*")
        .eq("status", "pending")
        .lt("created_at", cutoffTime);
      if (Array.isArray(expiredBks) && expiredBks.length > 0) {
        for (const bk of expiredBks) {
          await client
            .from("bookings")
            .update({ status: "auto_cancelled", updated_at: new Date().toISOString() })
            .eq("booking_id", bk.booking_id);
          await client.from("booking_status_history").insert([
            {
              booking_id: bk.booking_id,
              previous_status: "pending",
              new_status: "auto_cancelled",
              changed_by: null,
              reason: "Hệ thống tự động hủy sau 24 giờ không có thợ nhận (FR-BOOK-007)"
            }
          ]);
          const { data: cp } = await client
            .from("customer_profiles")
            .select("user_id")
            .eq("customer_id", bk.customer_id)
            .maybeSingle();
          if (cp && cp.user_id) {
            await dispatchNotification(null, {
              user_id: cp.user_id,
              title: "Đơn đặt lịch đã hết hạn",
              body: `Đơn #${bk.booking_id} đã tự động hủy do chưa có thợ nhận sau 24h. Quý khách vui lòng thử lại vào khung giờ khác.`,
              type: "booking_cancelled",
              link: "/bookings/tracking",
              isProd: true,
              client
            });
          }
          count++;
        }
      }
    } catch (e) {
      console.warn("[autoExpire Prod Error]", e.message);
    }
  } else if (db && Array.isArray(db.bookings)) {
    const expiredBks = db.bookings.filter((b) => b.status === "pending" && b.created_at && b.created_at < cutoffTime);
    for (const bk of expiredBks) {
      bk.status = "auto_cancelled";
      bk.updated_at = new Date().toISOString();
      if (!Array.isArray(db.booking_status_history)) db.booking_status_history = [];
      const nextHistoryId = Math.max(5000, ...db.booking_status_history.map((h) => h.history_id || 0)) + 1;
      db.booking_status_history.unshift({
        history_id: nextHistoryId,
        booking_id: bk.booking_id,
        previous_status: "pending",
        new_status: "auto_cancelled",
        changed_by: "system-cron",
        reason: "Hệ thống tự động hủy sau 24 giờ không có thợ nhận (FR-BOOK-007)",
        created_at: new Date().toISOString()
      });
      const cp = (db.customer_profiles || []).find((c) => Number(c.customer_id) === Number(bk.customer_id));
      if (cp && cp.user_id) {
        dispatchNotification(db, {
          user_id: cp.user_id,
          title: "Đơn đặt lịch đã hết hạn",
          body: `Đơn #${bk.booking_id} đã tự động hủy do chưa có thợ nhận sau 24h. Quý khách vui lòng thử lại vào khung giờ khác.`,
          type: "booking_cancelled",
          link: "/bookings/tracking",
          isProd: false
        });
      }
      count++;
    }
    if (count > 0) {
      saveLocalDb(db);
    }
  }
  return count;
}

module.exports = {
  autoExpirePendingBookings,
  inFlightAcceptLocks,
  normalizeBookingRecord,
  resolveActorContext,
  transitionBookingLifecycle
};
