const crypto = require("crypto");
const { saveLocalDb } = require("../db/localStore");

async function dispatchNotification(db, { user_id, title, body, type, link, isProd, client }) {
  const notif = {
    notification_id: isProd
      ? crypto.randomUUID()
      : Math.max(900, ...(db?.notifications || []).map((n) => (typeof n.notification_id === "number" ? n.notification_id : 0))) + 1,
    user_id: String(user_id),
    title: String(title || "Thông báo"),
    body: String(body || ""),
    type: String(type || "system"),
    link: link || null,
    is_read: false,
    created_at: new Date().toISOString()
  };

  if (isProd && client) {
    try {
      await client.from("notifications").insert([notif]);
    } catch (e) {
      console.warn("[dispatchNotification Prod Warning]", e.message);
    }
  } else if (db) {
    if (!Array.isArray(db.notifications)) db.notifications = [];
    db.notifications.unshift(notif);
    saveLocalDb(db);
  }
  return notif;
}

async function logAudit(db, { actor_id, action, target_entity, target_id, details, isProd, client }) {
  const logRow = {
    log_id: isProd
      ? crypto.randomUUID()
      : Math.max(9000, ...(db?.audit_logs || []).map((a) => (typeof a.log_id === "number" ? a.log_id : 0))) + 1,
    actor_id: actor_id || "system",
    action: String(action),
    target_entity: String(target_entity),
    target_id: target_id ? String(target_id) : null,
    details: typeof details === "object" ? JSON.stringify(details) : String(details || ""),
    created_at: new Date().toISOString()
  };

  if (isProd && client) {
    try {
      await client.from("audit_logs").insert([logRow]);
    } catch (e) {
      console.warn("[logAudit Prod Warning]", e.message);
    }
  } else if (db) {
    if (!Array.isArray(db.audit_logs)) db.audit_logs = [];
    db.audit_logs.unshift(logRow);
    saveLocalDb(db);
  }
  return logRow;
}

module.exports = {
  dispatchNotification,
  logAudit
};
