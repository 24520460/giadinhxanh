const { parseBody, sendJson } = require("../utils/http");
const { requireAuth } = require("../middleware/auth");
const { saveLocalDb, recomputeProviderRating } = require("../db/localStore");
const { dispatchNotification, logAudit } = require("../services/auditService");

async function handleAdminRoutes(ctx) {
  const { req, res, method, pathname, isProd, db, client } = ctx;

  if (!pathname.startsWith("/api/admin/")) {
    return false;
  }

  // Bảo vệ toàn bộ nhóm /api/admin/* bằng xác thực Admin RBAC
  const adminUser = requireAuth(req, res, ["admin"]);
  if (!adminUser) return true;

  // PATCH /api/admin/kyc/:providerId
  if (method === "PATCH" && pathname.startsWith("/api/admin/kyc/")) {
    const providerId = Number(pathname.split("/").pop());
    const body = await parseBody(req);
    const actorId = adminUser.user_id || body.actor_id || "admin";

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }
      const { data: pp, error: err } = await client
        .from("provider_profiles")
        .update({
          verification_status: body.verification_status,
          updated_at: new Date().toISOString()
        })
        .eq("provider_id", providerId)
        .select()
        .single();
      if (err) {
        sendJson(res, 500, { ok: false, error: err.message });
        return true;
      }
      await logAudit(null, {
        actor_id: actorId,
        action: "UPDATE_KYC_STATUS",
        target_entity: "provider_profiles",
        target_id: providerId,
        details: { status: body.verification_status },
        isProd: true,
        client
      });
      sendJson(res, 200, { ok: true, provider_profile: pp });
      return true;
    }

    const pp = db.provider_profiles.find((p) => p.provider_id === providerId);
    if (!pp) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy hồ sơ thợ." });
      return true;
    }
    if (body.verification_status) pp.verification_status = body.verification_status;
    pp.updated_at = new Date().toISOString();
    logAudit(db, {
      actor_id: actorId,
      action: "UPDATE_KYC_STATUS",
      target_entity: "provider_profiles",
      target_id: providerId,
      details: { status: body.verification_status },
      isProd: false
    });
    if (pp.user_id) {
      dispatchNotification(db, {
        user_id: pp.user_id,
        title: body.verification_status === "verified" ? "Hồ sơ đối tác đã được phê duyệt!" : "Cập nhật hồ sơ đối tác",
        body:
          body.verification_status === "verified"
            ? "Chúc mừng bạn đã hoàn tất xác thực CCCD và có thể nhận đơn ngay bây giờ."
            : `Hồ sơ xác thực của bạn chuyển sang trạng thái: ${body.verification_status}`,
        type: "kyc_update",
        link: "/provider/jobs",
        isProd: false
      });
    }
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, provider_profile: pp });
    return true;
  }

  // PATCH /api/admin/reviews/:id/moderate
  const revModMatch = pathname.match(/^\/api\/admin\/reviews\/([^/]+)\/moderate$/);
  if (method === "PATCH" && revModMatch) {
    const reviewId = Number(revModMatch[1]);
    const body = await parseBody(req);
    const status = body.status === "hidden" ? "hidden" : "published";
    const reason = String(body.moderation_reason || "").trim();
    const actorId = adminUser.user_id || body.actor_id || "admin";

    if (isProd && client) {
      const { data: rev, error } = await client
        .from("reviews")
        .update({ status, moderation_reason: reason })
        .eq("review_id", reviewId)
        .select()
        .single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      await logAudit(null, {
        actor_id: actorId,
        action: status === "hidden" ? "HIDE_REVIEW" : "UNHIDE_REVIEW",
        target_entity: "reviews",
        target_id: reviewId,
        details: { reason },
        isProd: true,
        client
      });
      sendJson(res, 200, { ok: true, review: rev });
      return true;
    }

    const rev = (db.reviews || []).find((r) => Number(r.review_id) === reviewId);
    if (!rev) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy đánh giá." });
      return true;
    }
    rev.status = status;
    rev.moderation_reason = reason;
    if (rev.provider_id) recomputeProviderRating(db, rev.provider_id);
    logAudit(db, {
      actor_id: actorId,
      action: status === "hidden" ? "HIDE_REVIEW" : "UNHIDE_REVIEW",
      target_entity: "reviews",
      target_id: reviewId,
      details: { reason },
      isProd: false
    });
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, review: rev });
    return true;
  }

  // DELETE /api/admin/reviews/:id
  const revDelMatch = pathname.match(/^\/api\/admin\/reviews\/([^/]+)$/);
  if (method === "DELETE" && revDelMatch) {
    const reviewId = Number(revDelMatch[1]);
    if (isProd && client) {
      await client
        .from("reviews")
        .update({ status: "hidden", moderation_reason: "Gỡ bởi Admin" })
        .eq("review_id", reviewId);
      sendJson(res, 200, { ok: true, message: "Đã gỡ bài đánh giá" });
      return true;
    }
    const rev = (db.reviews || []).find((r) => Number(r.review_id) === reviewId);
    if (rev) {
      rev.status = "hidden";
      rev.moderation_reason = "Gỡ bởi Admin";
      if (rev.provider_id) recomputeProviderRating(db, rev.provider_id);
      saveLocalDb(db);
    }
    sendJson(res, 200, { ok: true, message: "Đã gỡ bài đánh giá" });
    return true;
  }

  // GET /api/admin/audit-logs
  if (method === "GET" && pathname === "/api/admin/audit-logs") {
    if (isProd && client) {
      const { data: logs, error } = await client
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 200, { ok: true, audit_logs: logs || [] });
      return true;
    }
    sendJson(res, 200, { ok: true, audit_logs: db.audit_logs || [] });
    return true;
  }

  // PATCH /api/admin/users/:id/toggle-active
  const userToggleMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/toggle-active$/);
  if (method === "PATCH" && userToggleMatch) {
    const userId = userToggleMatch[1];
    if (isProd && client) {
      const { data: u } = await client.from("users").select("is_active, full_name").eq("user_id", userId).single();
      if (!u) {
        sendJson(res, 404, { ok: false, error: "Không tìm thấy người dùng." });
        return true;
      }
      const nextActive = !u.is_active;
      await client.from("users").update({ is_active: nextActive }).eq("user_id", userId);
      await logAudit(null, {
        actor_id: adminUser.user_id,
        action: nextActive ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        target_entity: "users",
        target_id: userId,
        details: { user: u.full_name, is_active: nextActive },
        isProd: true,
        client
      });
      sendJson(res, 200, { ok: true, is_active: nextActive });
      return true;
    }

    const u = (db.users || []).find((x) => String(x.user_id) === String(userId));
    if (!u) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy người dùng." });
      return true;
    }
    u.is_active = !u.is_active;
    logAudit(db, {
      actor_id: adminUser.user_id,
      action: u.is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER",
      target_entity: "users",
      target_id: userId,
      details: { user: u.full_name, is_active: u.is_active },
      isProd: false
    });
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, is_active: u.is_active });
    return true;
  }

  // PATCH|POST /api/admin/services/:id/toggle
  const svcToggleMatch = pathname.match(/^\/api\/admin\/services\/([^/]+)\/toggle$/);
  if ((method === "PATCH" || method === "POST") && svcToggleMatch) {
    const serviceId = Number(svcToggleMatch[1]);
    if (isProd && client) {
      const { data: s } = await client.from("services").select("is_active, title").eq("service_id", serviceId).single();
      if (!s) {
        sendJson(res, 404, { ok: false, error: "Không tìm thấy dịch vụ." });
        return true;
      }
      const nextActive = !s.is_active;
      await client.from("services").update({ is_active: nextActive }).eq("service_id", serviceId);
      await logAudit(null, {
        actor_id: adminUser.user_id,
        action: nextActive ? "ACTIVATE_SERVICE" : "DEACTIVATE_SERVICE",
        target_entity: "services",
        target_id: serviceId,
        details: { service: s.title, is_active: nextActive },
        isProd: true,
        client
      });
      sendJson(res, 200, { ok: true, is_active: nextActive });
      return true;
    }

    const s = (db.services || []).find((x) => Number(x.service_id) === serviceId);
    if (!s) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy dịch vụ." });
      return true;
    }
    s.is_active = !s.is_active;
    logAudit(db, {
      actor_id: adminUser.user_id,
      action: s.is_active ? "ACTIVATE_SERVICE" : "DEACTIVATE_SERVICE",
      target_entity: "services",
      target_id: serviceId,
      details: { service: s.title, is_active: s.is_active },
      isProd: false
    });
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, is_active: s.is_active });
    return true;
  }

  // POST /api/admin/services
  if (method === "POST" && pathname === "/api/admin/services") {
    const body = await parseBody(req);
    const title = String(body.title || "").trim();
    const price = Number(body.price) || 100000;
    const categoryId = Number(body.category_id) || 1;
    if (!title) {
      sendJson(res, 400, { ok: false, error: "Tên dịch vụ là bắt buộc." });
      return true;
    }

    if (isProd && client) {
      const { data: created, error } = await client
        .from("services")
        .insert([
          {
            title,
            price,
            category_id: categoryId,
            duration_minutes: Number(body.duration_minutes) || 120,
            pricing_type: body.pricing_type || "hourly",
            description: body.description || "",
            image_url: body.image_url || "/assets/cleaning-livingroom.jpg",
            is_active: true
          }
        ])
        .select()
        .single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 201, { ok: true, service: created });
      return true;
    }

    const nextId = Math.max(100, ...(db.services || []).map((s) => Number(s.service_id) || 0)) + 1;
    const newSvc = {
      service_id: nextId,
      category_id: categoryId,
      title,
      price,
      duration_minutes: Number(body.duration_minutes) || 120,
      pricing_type: body.pricing_type || "hourly",
      description: body.description || "",
      image_url: body.image_url || "/assets/cleaning-livingroom.jpg",
      is_active: true
    };
    db.services.push(newSvc);
    saveLocalDb(db);
    sendJson(res, 201, { ok: true, service: newSvc });
    return true;
  }

  // POST /api/admin/categories
  if (method === "POST" && pathname === "/api/admin/categories") {
    const body = await parseBody(req);
    const categoryName = String(body.category_name || "").trim();
    if (!categoryName) {
      sendJson(res, 400, { ok: false, error: "Tên danh mục là bắt buộc." });
      return true;
    }

    if (isProd && client) {
      const { data: created, error } = await client
        .from("service_categories")
        .insert([
          {
            category_name: categoryName,
            slug: body.slug || categoryName.toLowerCase().replace(/\s+/g, "-"),
            description: body.description || "",
            status: true
          }
        ])
        .select()
        .single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 201, { ok: true, category: created });
      return true;
    }

    const nextId = Math.max(1, ...(db.service_categories || []).map((c) => Number(c.category_id) || 0)) + 1;
    const newCat = {
      category_id: nextId,
      category_name: categoryName,
      slug: body.slug || categoryName.toLowerCase().replace(/\s+/g, "-"),
      description: body.description || "",
      status: true
    };
    db.service_categories.push(newCat);
    saveLocalDb(db);
    sendJson(res, 201, { ok: true, category: newCat });
    return true;
  }

  return false;
}

module.exports = handleAdminRoutes;
