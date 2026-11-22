const { sendJson } = require("../utils/http");
const { fetchBootstrapData } = require("../db/bootstrap");
const { resetLocalDb } = require("../db/localStore");
const { reverseGeocode } = require("../services/geoService");

async function handleSystemRoutes(ctx) {
  const { res, method, pathname, searchParams, isProd, db, client, config } = ctx;

  if (method === "GET" && pathname === "/api/status") {
    let supabaseReachable = false;
    let supabaseMessage = "";

    if (client) {
      try {
        let testRes = await client.from("provinces").select("provinceId").limit(1);
        if (testRes.error) {
          testRes = await client.from("province").select("provinceId").limit(1);
        }
        const pingErr = testRes.error;
        if (!pingErr) {
          supabaseReachable = true;
          supabaseMessage = isProd
            ? "Đang chạy chế độ Production Mode (Zero Mock Data) — Kết nối trực tiếp Supabase PostgreSQL."
            : "Đã kết nối trực tiếp tới Supabase PostgreSQL qua @supabase/supabase-js.";
        } else {
          supabaseMessage = `Đã nhận khóa từ .env.local nhưng truy vấn bảng 'provinces'/'province' trả về: ${pingErr.message}`;
        }
      } catch (err) {
        supabaseMessage = `Lỗi kết nối tới Supabase: ${err.message}`;
      }
    } else {
      supabaseMessage = isProd
        ? "Production Mode yêu cầu cấu hình Supabase hợp lệ trong .env.local. Đã ngắt hoàn toàn nạp dữ liệu mẫu."
        : "Đang vận hành trên Persistent Local SQL Store (backend/data/local-db.json).";
    }

    const tableCounts = {};
    if (isProd && supabaseReachable) {
      try {
        const [pRes, wRes, uRes, bRes, rRes] = await Promise.all([
          client.from("provinces").select("provinceId", { count: "exact", head: true }),
          client.from("wards").select("ward_id", { count: "exact", head: true }),
          client.from("users").select("user_id", { count: "exact", head: true }),
          client.from("bookings").select("booking_id", { count: "exact", head: true }),
          client.from("reviews").select("review_id", { count: "exact", head: true })
        ]);
        tableCounts.province = pRes.count ?? (pRes.error ? 0 : 34);
        tableCounts.ward = wRes.count ?? (wRes.error ? 0 : 3321);
        tableCounts.users = uRes.count || 0;
        tableCounts.bookings = bRes.count || 0;
        tableCounts.reviews = rRes.count || 0;
      } catch (_) {}
    } else if (db) {
      tableCounts.province = (db.province || []).length;
      tableCounts.ward = (db.ward || []).length;
      tableCounts.users = (db.users || []).length;
      tableCounts.customer_profiles = (db.customer_profiles || []).length;
      tableCounts.provider_profiles = (db.provider_profiles || []).length;
      tableCounts.service_categories = (db.service_categories || []).length;
      tableCounts.services = (db.services || []).length;
      tableCounts.bookings = (db.bookings || []).length;
      tableCounts.reviews = (db.reviews || []).length;
      tableCounts.support_tickets = (db.support_tickets || []).length;
      tableCounts.customer_addresses = (db.customer_addresses || []).length;
      tableCounts.ticket_messages = (db.ticket_messages || []).length;
      tableCounts.notifications = (db.notifications || []).length;
      tableCounts.audit_logs = (db.audit_logs || []).length;
      tableCounts.ai_conversations = (db.ai_conversations || []).length;
      tableCounts.ai_messages = (db.ai_messages || []).length;
    }

    sendJson(res, 200, {
      ok: true,
      mode: isProd ? "production" : supabaseReachable ? "supabase" : "local_sql_store",
      isProduction: isProd,
      envFile: ".env.local",
      hasSupabaseUrl: Boolean(config.supabaseUrl),
      hasAnonKey: Boolean(config.supabaseAnonKey),
      hasServiceRoleKey: Boolean(config.supabaseServiceKey),
      supabaseUrlPreview: config.supabaseUrl
        ? config.supabaseUrl.replace(/^(https?:\/\/[^.]+)\..*$/, "$1.supabase.co")
        : null,
      supabaseReachable,
      message: supabaseMessage,
      tableCounts
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/bootstrap") {
    const boot = await fetchBootstrapData(isProd);
    if (isProd && !boot.ok) {
      sendJson(res, 503, boot);
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      mode: boot.mode,
      isProduction: isProd,
      connected: boot.connected,
      db: boot.data
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/supabase/reset-local") {
    if (isProd) {
      sendJson(res, 403, {
        ok: false,
        error: "Không thể reset dữ liệu mẫu ở chế độ Production Mode (Zero Mock Data)."
      });
      return true;
    }
    const fresh = resetLocalDb();
    sendJson(res, 200, {
      ok: true,
      message: "Đã khôi phục dữ liệu mẫu gốc từ db-mock.js vào local-db.json.",
      tableCounts: {
        users: fresh.users.length,
        bookings: fresh.bookings.length,
        services: fresh.services.length
      }
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/geo/reverse") {
    const rawLat = searchParams.get("lat");
    const rawLng = searchParams.get("lng");

    if (!rawLat || !rawLng) {
      sendJson(res, 400, { ok: false, error: "Vĩ độ (lat) và kinh độ (lng) không được để trống." });
      return true;
    }

    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      sendJson(res, 400, { ok: false, error: "Vĩ độ (lat) và kinh độ (lng) không hợp lệ." });
      return true;
    }

    const result = await reverseGeocode(lat, lng);
    sendJson(res, 200, result);
    return true;
  }

  return false;
}

module.exports = handleSystemRoutes;
