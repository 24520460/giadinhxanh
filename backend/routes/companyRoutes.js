const crypto = require("crypto");
const { parseBody, sendJson } = require("../utils/http");
const { isValidPhoneVN, isValidEmail, validateNonNegativeAmount } = require("../utils/validators");
const { requireAuth } = require("../middleware/auth");
const { saveLocalDb, computeProviderPublicProfiles } = require("../db/localStore");
const { dispatchNotification, logAudit } = require("../services/auditService");

function resolveCompanyForUser(db, user, requestedCompanyId = null) {
  const companies = db.company_profiles || [];
  if (requestedCompanyId) {
    const byCid = companies.find((c) => String(c.company_id) === String(requestedCompanyId));
    if (byCid && (user.role === "admin" || String(byCid.user_id) === String(user.user_id))) {
      return byCid;
    }
  }
  return companies.find((c) => String(c.user_id) === String(user.user_id)) || null;
}

async function handleCompanyRoutes(ctx) {
  const { req, res, method, pathname, isProd, db, client } = ctx;

  // POST /api/onboarding/company — Thiết lập / Đăng ký hồ sơ Công ty (0.3 mới)
  if (method === "POST" && pathname === "/api/onboarding/company") {
    const body = await parseBody(req);
    const userId = body.user_id;
    const companyName = String(body.company_name || "").trim();
    const taxCode = String(body.tax_code || "").trim();
    const address = String(body.address || "").trim();
    const wardId = String(body.ward_id || "27403").trim();
    const phone = String(body.phone_number || "").trim();
    const description = String(body.description || "").trim();

    if (!userId || !companyName || !taxCode || !address) {
      sendJson(res, 400, {
        ok: false,
        error: "Vui lòng nhập đầy đủ Tên công ty, Mã số thuế/GPKD và Địa chỉ trụ sở."
      });
      return true;
    }

    if (isProd && client) {
      const { data: dup } = await client
        .from("company_profiles")
        .select("company_id, user_id")
        .eq("tax_code", taxCode)
        .maybeSingle();
      if (dup && String(dup.user_id) !== String(userId)) {
        sendJson(res, 409, { ok: false, error: "Mã số thuế đã được đăng ký bởi một công ty khác." });
        return true;
      }
      const { data: comp, error } = await client
        .from("company_profiles")
        .upsert([
          {
            user_id: userId,
            company_name: companyName,
            tax_code: taxCode,
            address,
            ward_id: wardId,
            phone_number: phone,
            description,
            logo_url: body.logo_url || "/assets/cleaning-livingroom.jpg",
            verification_status: "pending",
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 200, { ok: true, company_profile: comp });
      return true;
    }

    if (!Array.isArray(db.company_profiles)) db.company_profiles = [];
    const dup = db.company_profiles.find(
      (c) => c.tax_code === taxCode && String(c.user_id) !== String(userId)
    );
    if (dup) {
      sendJson(res, 409, { ok: false, error: "Mã số thuế đã được đăng ký bởi một công ty khác." });
      return true;
    }

    let comp = db.company_profiles.find((c) => String(c.user_id) === String(userId));
    const nowIso = new Date().toISOString();
    if (comp) {
      comp.company_name = companyName;
      comp.tax_code = taxCode;
      comp.address = address;
      comp.ward_id = wardId;
      if (phone) comp.phone_number = phone;
      comp.description = description;
      if (body.logo_url) comp.logo_url = String(body.logo_url);
      comp.verification_status = "pending";
      comp.updated_at = nowIso;
    } else {
      const nextCid = Math.max(500, ...db.company_profiles.map((c) => Number(c.company_id) || 0)) + 1;
      comp = {
        company_id: nextCid,
        user_id: userId,
        company_name: companyName,
        tax_code: taxCode,
        address,
        ward_id: wardId,
        phone_number: phone || "0280000000",
        description,
        logo_url: body.logo_url || "/assets/cleaning-livingroom.jpg",
        verification_status: "pending",
        created_at: nowIso,
        updated_at: nowIso
      };
      db.company_profiles.push(comp);
    }

    const u = (db.users || []).find((x) => String(x.user_id) === String(userId));
    if (u) {
      u.full_name = companyName;
      u.updated_at = nowIso;
    }
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, company_profile: comp, user: u });
    return true;
  }

  if (!pathname.startsWith("/api/company/")) {
    return false;
  }

  const companyUser = requireAuth(req, res, ["company", "admin"]);
  if (!companyUser) return true;

  // POST /api/company/providers — Company thêm hồ sơ nhân viên (Provider)
  if (method === "POST" && pathname === "/api/company/providers") {
    const body = await parseBody(req);
    const fullName = String(body.full_name || "").trim();
    const phone = String(body.phone_number || "").trim();
    const email = String(body.email || "").trim();
    const idCard = String(body.id_card_number || "").trim();
    const password = String(body.password || "123456").trim();
    const info = String(body.info || "").trim();
    const avatarUrl = String(body.avatar_url || "/assets/provider-lan.jpg").trim();
    const serviceIds = Array.isArray(body.service_ids) ? body.service_ids : [];
    const wardIds = Array.isArray(body.ward_ids) ? body.ward_ids : [];

    if (!fullName || !phone || !idCard) {
      sendJson(res, 400, { ok: false, error: "Họ tên, Số điện thoại và Số CCCD của nhân viên là bắt buộc." });
      return true;
    }
    if (!isValidPhoneVN(phone)) {
      sendJson(res, 400, { ok: false, error: "Số điện thoại nhân viên không hợp lệ (10–11 số, bắt đầu bằng 0)." });
      return true;
    }
    if (email && !isValidEmail(email)) {
      sendJson(res, 400, { ok: false, error: "Email nhân viên không đúng định dạng." });
      return true;
    }
    if (password.length < 6) {
      sendJson(res, 400, { ok: false, error: "Mật khẩu tối thiểu 6 ký tự." });
      return true;
    }

    const comp = resolveCompanyForUser(db, companyUser, body.company_id);
    if (!comp) {
      sendJson(res, 403, { ok: false, error: "Không tìm thấy hồ sơ Công ty hợp lệ cho tài khoản này." });
      return true;
    }
    if (comp.verification_status !== "verified" && companyUser.role !== "admin") {
      sendJson(res, 403, { ok: false, error: "Công ty chưa được Admin xác minh nên chưa thể thêm nhân viên." });
      return true;
    }

    if ((db.users || []).some((u) => u.phone_number === phone)) {
      sendJson(res, 409, { ok: false, error: "Số điện thoại đã tồn tại trong hệ thống." });
      return true;
    }
    if ((db.provider_profiles || []).some((p) => p.id_card_number === idCard)) {
      sendJson(res, 409, { ok: false, error: "Số CCCD đã tồn tại trong hồ sơ nhân viên khác." });
      return true;
    }

    const nowIso = new Date().toISOString();
    const newUserId = crypto.randomUUID();
    const newUser = {
      user_id: newUserId,
      full_name: fullName,
      phone_number: phone,
      email: email || `${phone}@giadinhxanh.vn`,
      password,
      role: "provider",
      is_active: true,
      created_at: nowIso,
      updated_at: nowIso
    };
    db.users.push(newUser);

    const nextProvId = Math.max(200, ...(db.provider_profiles || []).map((p) => Number(p.provider_id) || 0)) + 1;
    const newProv = {
      provider_id: nextProvId,
      user_id: newUserId,
      company_id: comp.company_id,
      info: info || `Nhân viên kỹ thuật thuộc ${comp.company_name}`,
      id_card_number: idCard,
      avatar_url: avatarUrl,
      verification_status: "verified",
      average_rating: 5.0,
      total_reviews: 0,
      lattitude: 10.7412,
      longtitude: 106.7021,
      is_available_online: true,
      created_at: nowIso,
      updated_at: nowIso
    };
    db.provider_profiles.push(newProv);

    if (!Array.isArray(db.provider_services)) db.provider_services = [];
    serviceIds.forEach((sid, idx) => {
      db.provider_services.push({
        id_pro_ser: Date.now() + idx,
        provider_id: nextProvId,
        service_id: isNaN(Number(sid)) ? sid : Number(sid)
      });
    });

    if (!Array.isArray(db.provider_areas)) db.provider_areas = [];
    const targetWards = wardIds.length > 0 ? wardIds : [comp.ward_id || "27403"];
    targetWards.forEach((wid, idx) => {
      db.provider_areas.push({
        area_id: Date.now() + 100 + idx,
        provider_id: nextProvId,
        ward_id: String(wid)
      });
    });

    db.provider_public_profiles = computeProviderPublicProfiles(db);
    logAudit(db, {
      actor_id: companyUser.user_id,
      action: "COMPANY_CREATE_PROVIDER",
      target_entity: "provider_profiles",
      target_id: nextProvId,
      details: { company_id: comp.company_id, full_name: fullName },
      isProd: false
    });
    saveLocalDb(db);

    sendJson(res, 201, { ok: true, user: newUser, provider_profile: newProv });
    return true;
  }

  // PATCH /api/company/providers/:id/toggle-ban — Company Ban / Mở ban nhân viên
  const provBanMatch = pathname.match(/^\/api\/company\/providers\/([^/]+)\/toggle-ban$/);
  if (method === "PATCH" && provBanMatch) {
    const providerId = Number(provBanMatch[1]);
    const body = await parseBody(req);
    const comp = resolveCompanyForUser(db, companyUser, body.company_id);
    if (!comp && companyUser.role !== "admin") {
      sendJson(res, 403, { ok: false, error: "Không tìm thấy hồ sơ Công ty hợp lệ." });
      return true;
    }

    const pp = (db.provider_profiles || []).find((p) => Number(p.provider_id) === providerId);
    if (!pp) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy hồ sơ nhân viên." });
      return true;
    }
    if (companyUser.role !== "admin" && String(pp.company_id) !== String(comp.company_id)) {
      sendJson(res, 403, { ok: false, error: "Bạn không có quyền khóa/mở khóa nhân viên của công ty khác." });
      return true;
    }

    const u = (db.users || []).find((x) => String(x.user_id) === String(pp.user_id));
    const nextActive = u ? !u.is_active : pp.verification_status === "banned";
    if (u) {
      u.is_active = nextActive;
      u.updated_at = new Date().toISOString();
    }
    pp.verification_status = nextActive ? "verified" : "banned";
    if (!nextActive) pp.is_available_online = false;
    pp.updated_at = new Date().toISOString();

    db.provider_public_profiles = computeProviderPublicProfiles(db);
    logAudit(db, {
      actor_id: companyUser.user_id,
      action: nextActive ? "COMPANY_UNBAN_PROVIDER" : "COMPANY_BAN_PROVIDER",
      target_entity: "provider_profiles",
      target_id: providerId,
      details: { company_id: pp.company_id, is_active: nextActive },
      isProd: false
    });
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, is_active: nextActive, provider_profile: pp });
    return true;
  }

  // PUT /api/company/providers/:id/services — Company gán dịch vụ & khu vực cho nhân viên
  const provSvcMatch = pathname.match(/^\/api\/company\/providers\/([^/]+)\/services$/);
  if (method === "PUT" && provSvcMatch) {
    const providerId = Number(provSvcMatch[1]);
    const body = await parseBody(req);
    const comp = resolveCompanyForUser(db, companyUser, body.company_id);
    const pp = (db.provider_profiles || []).find((p) => Number(p.provider_id) === providerId);
    if (!pp) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy nhân viên." });
      return true;
    }
    if (companyUser.role !== "admin" && (!comp || String(pp.company_id) !== String(comp.company_id))) {
      sendJson(res, 403, { ok: false, error: "Không có quyền cập nhật nhân viên của công ty khác." });
      return true;
    }
    if (Array.isArray(body.service_ids)) {
      db.provider_services = (db.provider_services || []).filter((ps) => Number(ps.provider_id) !== providerId);
      body.service_ids.forEach((sid, idx) => {
        db.provider_services.push({
          id_pro_ser: Date.now() + idx,
          provider_id: providerId,
          service_id: isNaN(Number(sid)) ? sid : Number(sid)
        });
      });
    }
    if (Array.isArray(body.ward_ids)) {
      db.provider_areas = (db.provider_areas || []).filter((pa) => Number(pa.provider_id) !== providerId);
      body.ward_ids.forEach((wid, idx) => {
        db.provider_areas.push({
          area_id: Date.now() + 200 + idx,
          provider_id: providerId,
          ward_id: String(wid)
        });
      });
    }
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, provider_profile: pp });
    return true;
  }

  // POST /api/company/services — Company tạo dịch vụ mới
  if (method === "POST" && pathname === "/api/company/services") {
    const body = await parseBody(req);
    const comp = resolveCompanyForUser(db, companyUser, body.company_id);
    if (!comp) {
      sendJson(res, 403, { ok: false, error: "Không tìm thấy hồ sơ Công ty hợp lệ." });
      return true;
    }
    const title = String(body.title || "").trim();
    if (!title) {
      sendJson(res, 400, { ok: false, error: "Tên dịch vụ là bắt buộc." });
      return true;
    }
    const priceCheck = validateNonNegativeAmount(body.price ?? 100000, "Đơn giá dịch vụ");
    if (!priceCheck.ok) {
      sendJson(res, 400, { ok: false, error: priceCheck.error });
      return true;
    }

    const nextId = Math.max(300, ...(db.services || []).map((s) => Number(s.service_id) || 0)) + 1;
    const nowIso = new Date().toISOString();
    const newSvc = {
      service_id: nextId,
      category_id: Number(body.category_id) || 1,
      company_id: comp.company_id,
      title,
      description: String(body.description || "").trim(),
      price: priceCheck.value,
      pricing_type: body.pricing_type === "fixed" ? "fixed" : "hourly",
      estimated_duration: Number(body.estimated_duration || body.duration_minutes) || 120,
      is_active: true,
      image_url: String(body.image_url || "/assets/cleaning-livingroom.jpg"),
      created_at: nowIso,
      updated_at: nowIso
    };
    db.services.push(newSvc);
    logAudit(db, {
      actor_id: companyUser.user_id,
      action: "COMPANY_CREATE_SERVICE",
      target_entity: "services",
      target_id: nextId,
      details: { company_id: comp.company_id, title },
      isProd: false
    });
    saveLocalDb(db);
    sendJson(res, 201, { ok: true, service: newSvc });
    return true;
  }

  // PUT /api/company/services/:id & PATCH /api/company/services/:id/toggle
  const svcToggleMatch = pathname.match(/^\/api\/company\/services\/([^/]+)\/toggle$/);
  if ((method === "PATCH" || method === "POST") && svcToggleMatch) {
    const svcId = Number(svcToggleMatch[1]);
    const body = await parseBody(req);
    const comp = resolveCompanyForUser(db, companyUser, body.company_id);
    const svc = (db.services || []).find((s) => Number(s.service_id) === svcId);
    if (!svc) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy dịch vụ." });
      return true;
    }
    if (companyUser.role !== "admin" && (!comp || String(svc.company_id) !== String(comp.company_id))) {
      sendJson(res, 403, { ok: false, error: "Bạn không có quyền chỉnh dịch vụ của công ty khác." });
      return true;
    }
    svc.is_active = !svc.is_active;
    svc.updated_at = new Date().toISOString();
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, is_active: svc.is_active, service: svc });
    return true;
  }

  const svcEditMatch = pathname.match(/^\/api\/company\/services\/([^/]+)$/);
  if (method === "PUT" && svcEditMatch) {
    const svcId = Number(svcEditMatch[1]);
    const body = await parseBody(req);
    const comp = resolveCompanyForUser(db, companyUser, body.company_id);
    const svc = (db.services || []).find((s) => Number(s.service_id) === svcId);
    if (!svc) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy dịch vụ." });
      return true;
    }
    if (companyUser.role !== "admin" && (!comp || String(svc.company_id) !== String(comp.company_id))) {
      sendJson(res, 403, { ok: false, error: "Bạn không có quyền chỉnh dịch vụ của công ty khác." });
      return true;
    }
    if (body.title) svc.title = String(body.title).trim();
    if (body.description !== undefined) svc.description = String(body.description).trim();
    if (body.price !== undefined) {
      const pCheck = validateNonNegativeAmount(body.price, "Đơn giá");
      if (!pCheck.ok) {
        sendJson(res, 400, { ok: false, error: pCheck.error });
        return true;
      }
      svc.price = pCheck.value;
    }
    if (body.category_id) svc.category_id = Number(body.category_id);
    if (body.pricing_type) svc.pricing_type = body.pricing_type === "fixed" ? "fixed" : "hourly";
    if (body.estimated_duration) svc.estimated_duration = Number(body.estimated_duration);
    svc.updated_at = new Date().toISOString();
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, service: svc });
    return true;
  }

  return false;
}

module.exports = handleCompanyRoutes;
