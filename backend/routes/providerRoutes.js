const { parseBody, sendJson } = require("../utils/http");
const { saveLocalDb } = require("../db/localStore");

async function handleProviderRoutes(ctx) {
  const { req, res, method, pathname, isProd, db, client } = ctx;

  if (method === "PATCH" && pathname === "/api/provider/online-gps") {
    const body = await parseBody(req);
    const providerId = Number(body.provider_id || 201);

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }
      const updates = { updated_at: new Date().toISOString() };
      if (typeof body.is_available_online === "boolean") updates.is_available_online = body.is_available_online;
      if (body.lattitude !== undefined) updates.lattitude = Number(body.lattitude);
      if (body.longtitude !== undefined) updates.longtitude = Number(body.longtitude);
      const { data: pp, error: err } = await client
        .from("provider_profiles")
        .update(updates)
        .eq("provider_id", providerId)
        .select()
        .single();
      if (err) {
        sendJson(res, 500, { ok: false, error: err.message });
        return true;
      }
      sendJson(res, 200, { ok: true, provider_profile: pp });
      return true;
    }

    const pp = db.provider_profiles.find((p) => p.provider_id === providerId);
    if (!pp) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy hồ sơ thợ." });
      return true;
    }
    if (typeof body.is_available_online === "boolean") pp.is_available_online = body.is_available_online;
    if (body.lattitude !== undefined) pp.lattitude = Number(body.lattitude);
    if (body.longtitude !== undefined) pp.longtitude = Number(body.longtitude);
    pp.updated_at = new Date().toISOString();
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, provider_profile: pp });
    return true;
  }

  if (method === "PUT" && pathname === "/api/provider/capabilities") {
    const body = await parseBody(req);
    const providerId = Number(body.provider_id || 201);

    if (Array.isArray(body.service_ids)) {
      sendJson(res, 403, {
        ok: false,
        error: "Quyền gán/quản lý dịch vụ thuộc về Công ty chủ quản. Thợ không thể tự đăng ký dịch vụ."
      });
      return true;
    }

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }
      if (Array.isArray(body.ward_ids)) {
        await client.from("provider_areas").delete().eq("provider_id", providerId);
        const pAreas = body.ward_ids.map((wid) => ({ provider_id: providerId, ward_id: String(wid) }));
        if (pAreas.length > 0) await client.from("provider_areas").insert(pAreas);
      }
      sendJson(res, 200, { ok: true, message: "Đã cập nhật hồ sơ thợ vào Supabase." });
      return true;
    }

    const pp = db.provider_profiles.find((p) => p.provider_id === providerId);
    if (!pp) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy hồ sơ thợ." });
      return true;
    }
    if (body.info !== undefined) pp.info = String(body.info).trim();
    if (body.avatar_url !== undefined) pp.avatar_url = String(body.avatar_url).trim();
    pp.updated_at = new Date().toISOString();

    if (Array.isArray(body.ward_ids)) {
      db.provider_areas = db.provider_areas.filter((pa) => pa.provider_id !== providerId);
      body.ward_ids.forEach((wid, idx) => {
        db.provider_areas.push({ area_id: Date.now() + idx, provider_id: providerId, ward_id: String(wid) });
      });
    }
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, provider_profile: pp });
    return true;
  }

  return false;
}

module.exports = handleProviderRoutes;
