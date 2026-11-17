const { saveLocalDb } = require("../db/localStore");
const { dispatchNotification } = require("./auditService");

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
  autoExpirePendingBookings
};
