const crypto = require("crypto");
const { parseBody, sendJson } = require("../utils/http");
const { normalizeId } = require("../utils/validators");
const { saveLocalDb, recomputeProviderRating } = require("../db/localStore");
const { dispatchNotification, logAudit } = require("../services/auditService");

async function handleCustomerRoutes(ctx) {
  const { req, res, method, pathname, searchParams, isProd, db, client } = ctx;

  // POST /api/reviews
  if (method === "POST" && pathname === "/api/reviews") {
    const body = await parseBody(req);
    const bookingId = normalizeId(body.booking_id);
    const rating = Math.min(5, Math.max(1, Number(body.rating) || 5));
    const comment = String(body.comment || "").trim();

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }
      const { data: bk } = await client
        .from("bookings")
        .select("customer_id, provider_id")
        .eq("booking_id", bookingId)
        .single();
      const { data: rev, error: revErr } = await client
        .from("reviews")
        .insert([
          {
            booking_id: bookingId,
            customer_id: bk ? bk.customer_id : body.customer_id,
            provider_id: bk ? bk.provider_id : body.provider_id,
            rating,
            comment: comment || "Khách hàng hài lòng với dịch vụ."
          }
        ])
        .select()
        .single();
      if (revErr) {
        sendJson(res, 500, { ok: false, error: revErr.message });
        return true;
      }
      sendJson(res, 201, { ok: true, review: rev });
      return true;
    }

    const bk = db.bookings.find((b) => String(b.booking_id) === String(bookingId));
    const nextRevId = Math.max(800, ...db.reviews.map((r) => r.review_id || 0)) + 1;
    const rev = {
      review_id: nextRevId,
      booking_id: bookingId,
      customer_id: bk ? bk.customer_id : 101,
      provider_id: bk ? bk.provider_id : 201,
      rating,
      comment: comment || "Khách hàng hài lòng với chất lượng dịch vụ.",
      created_at: new Date().toISOString()
    };
    db.reviews.unshift(rev);
    if (bk && bk.provider_id) recomputeProviderRating(db, bk.provider_id);
    saveLocalDb(db);
    sendJson(res, 201, { ok: true, review: rev });
    return true;
  }

  // PUT /api/reviews/:id
  const revPutMatch = pathname.match(/^\/api\/reviews\/([^/]+)$/);
  if (method === "PUT" && revPutMatch) {
    const reviewId = Number(revPutMatch[1]);
    const body = await parseBody(req);
    const rating = Math.min(5, Math.max(1, Number(body.rating) || 5));
    const comment = String(body.comment || "").trim();

    if (isProd && client) {
      const { data: rev, error } = await client
        .from("reviews")
        .update({ rating, comment })
        .eq("review_id", reviewId)
        .select()
        .single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 200, { ok: true, review: rev });
      return true;
    }

    const rev = (db.reviews || []).find((r) => Number(r.review_id) === reviewId);
    if (!rev) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy đánh giá." });
      return true;
    }
    rev.rating = rating;
    rev.comment = comment;
    if (rev.provider_id) recomputeProviderRating(db, rev.provider_id);
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, review: rev });
    return true;
  }

  // POST /api/favorites/toggle
  if (method === "POST" && pathname === "/api/favorites/toggle") {
    const body = await parseBody(req);
    const customerId = normalizeId(body.customer_id) || 101;
    const serviceId = body.service_id ? normalizeId(body.service_id) : null;
    const providerId = body.provider_id ? normalizeId(body.provider_id) : null;

    if (!serviceId && !providerId) {
      sendJson(res, 400, { ok: false, error: "Cần truyền service_id hoặc provider_id để lưu yêu thích." });
      return true;
    }

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }
      let query = client.from("favorites").select("favorite_id").eq("customer_id", customerId);
      if (serviceId) query = query.eq("service_id", serviceId);
      if (providerId) query = query.eq("provider_id", providerId);
      const { data: existing } = await query.maybeSingle();

      if (existing) {
        await client.from("favorites").delete().eq("favorite_id", existing.favorite_id);
        sendJson(res, 200, { ok: true, added: false, type: serviceId ? "service" : "provider" });
        return true;
      }
      const newRow = { customer_id: customerId };
      if (serviceId) newRow.service_id = serviceId;
      if (providerId) newRow.provider_id = providerId;
      await client.from("favorites").insert([newRow]);
      sendJson(res, 200, { ok: true, added: true, type: serviceId ? "service" : "provider" });
      return true;
    }

    let idx = -1;
    if (serviceId) {
      idx = db.favorites.findIndex(
        (f) => String(f.customer_id) === String(customerId) && String(f.service_id) === String(serviceId)
      );
    } else if (providerId) {
      idx = db.favorites.findIndex(
        (f) => String(f.customer_id) === String(customerId) && String(f.provider_id) === String(providerId)
      );
    }

    let added = false;
    if (idx >= 0) {
      db.favorites.splice(idx, 1);
    } else {
      db.favorites.push({
        favorite_id: Date.now(),
        customer_id: customerId,
        service_id: serviceId,
        provider_id: providerId,
        created_at: new Date().toISOString()
      });
      added = true;
    }
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, added, type: serviceId ? "service" : "provider", favorites: db.favorites });
    return true;
  }

  // GET /api/favorites
  if (method === "GET" && pathname === "/api/favorites") {
    const customerId = normalizeId(searchParams.get("customer_id")) || 101;
    if (isProd && client) {
      const { data: favs } = await client.from("favorites").select("*").eq("customer_id", customerId);
      sendJson(res, 200, { ok: true, favorites: favs || [] });
      return true;
    }
    const favs = (db.favorites || []).filter((f) => String(f.customer_id) === String(customerId));
    const serviceIds = favs.filter((f) => f.service_id).map((f) => String(f.service_id));
    const providerIds = favs.filter((f) => f.provider_id).map((f) => String(f.provider_id));
    const services = (db.services || []).filter((s) => serviceIds.includes(String(s.service_id)));
    const providers = (db.provider_public_profiles || []).filter((p) => providerIds.includes(String(p.provider_id)));
    sendJson(res, 200, { ok: true, favorites: favs, services, providers });
    return true;
  }

  // POST /api/support-tickets
  if (method === "POST" && pathname === "/api/support-tickets") {
    const body = await parseBody(req);
    const nowIso = new Date().toISOString();

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }
      const { data: tk, error: tkErr } = await client
        .from("support_tickets")
        .insert([
          {
            user_id: body.user_id,
            booking_id: body.booking_id ? normalizeId(body.booking_id) : null,
            subject: String(body.subject || "Yêu cầu hỗ trợ").trim(),
            status: "open",
            priority: body.priority || "medium"
          }
        ])
        .select()
        .single();
      if (tkErr) {
        sendJson(res, 500, { ok: false, error: tkErr.message });
        return true;
      }
      sendJson(res, 201, { ok: true, ticket: tk });
      return true;
    }

    const nextId = Math.max(700, ...db.support_tickets.map((t) => t.ticket_id || 0)) + 1;
    const ticket = {
      ticket_id: nextId,
      user_id: body.user_id || "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      booking_id: body.booking_id ? normalizeId(body.booking_id) : null,
      subject: String(body.subject || "Yêu cầu hỗ trợ").trim(),
      status: "open",
      priority: body.priority || "medium",
      created_at: nowIso,
      updated_at: nowIso
    };
    db.support_tickets.unshift(ticket);
    saveLocalDb(db);
    sendJson(res, 201, { ok: true, ticket });
    return true;
  }

  // GET & POST /api/tickets/:id/messages
  const ticketMsgMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/messages$/);
  if (method === "GET" && ticketMsgMatch) {
    const ticketId = Number(ticketMsgMatch[1]);
    const role = searchParams.get("role") || "customer";

    if (isProd && client) {
      let query = client
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (role !== "admin") {
        query = query.eq("visibility", "public");
      }
      const { data: msgs, error } = await query;
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 200, { ok: true, messages: msgs || [] });
      return true;
    }

    let msgs = (db.ticket_messages || []).filter((m) => Number(m.ticket_id) === ticketId);
    if (role !== "admin") {
      msgs = msgs.filter((m) => m.visibility === "public" || !m.visibility);
    }
    sendJson(res, 200, { ok: true, messages: msgs });
    return true;
  }

  if (method === "POST" && ticketMsgMatch) {
    const ticketId = Number(ticketMsgMatch[1]);
    const body = await parseBody(req);
    const content = String(body.content || "").trim();
    const visibility = body.visibility === "internal" ? "internal" : "public";
    const senderId = body.sender_id || "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const senderRole = body.sender_role || "customer";

    if (!content) {
      sendJson(res, 400, { ok: false, error: "Nội dung phản hồi không được để trống." });
      return true;
    }

    const nowIso = new Date().toISOString();
    const newMsg = {
      message_id: isProd
        ? crypto.randomUUID()
        : Math.max(900, ...(db.ticket_messages || []).map((m) => (typeof m.message_id === "number" ? m.message_id : 0))) + 1,
      ticket_id: ticketId,
      sender_id: senderId,
      sender_role: senderRole,
      content,
      visibility,
      created_at: nowIso
    };

    if (isProd && client) {
      const { data: insMsg, error: insErr } = await client.from("ticket_messages").insert([newMsg]).select().single();
      if (insErr) {
        sendJson(res, 500, { ok: false, error: insErr.message });
        return true;
      }
      await client.from("support_tickets").update({ updated_at: nowIso }).eq("ticket_id", ticketId);
      sendJson(res, 201, { ok: true, message: insMsg });
      return true;
    }

    if (!Array.isArray(db.ticket_messages)) db.ticket_messages = [];
    db.ticket_messages.push(newMsg);
    const tk = (db.support_tickets || []).find((t) => Number(t.ticket_id) === ticketId);
    if (tk) {
      tk.updated_at = nowIso;
      if (senderRole === "admin" && visibility === "public" && tk.user_id) {
        dispatchNotification(db, {
          user_id: tk.user_id,
          title: `Phản hồi mới cho phiếu #${ticketId}`,
          body: `Admin đã phản hồi: "${content.slice(0, 80)}${content.length > 80 ? "..." : ""}"`,
          type: "ticket_reply",
          link: "/support",
          isProd: false
        });
      }
    }
    saveLocalDb(db);
    sendJson(res, 201, { ok: true, message: newMsg });
    return true;
  }

  // PATCH /api/tickets/:id/status
  const ticketStatusMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/status$/);
  if (method === "PATCH" && ticketStatusMatch) {
    const ticketId = Number(ticketStatusMatch[1]);
    const body = await parseBody(req);
    const newStatus = body.status;
    const newPriority = body.priority;
    const actorId = body.actor_id || "admin";

    if (isProd && client) {
      const updates = { updated_at: new Date().toISOString() };
      if (newStatus) updates.status = newStatus;
      if (newPriority) updates.priority = newPriority;
      const { data: updatedTk, error } = await client
        .from("support_tickets")
        .update(updates)
        .eq("ticket_id", ticketId)
        .select()
        .single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      await logAudit(null, {
        actor_id: actorId,
        action: "UPDATE_TICKET_STATUS",
        target_entity: "support_tickets",
        target_id: ticketId,
        details: updates,
        isProd: true,
        client
      });
      sendJson(res, 200, { ok: true, ticket: updatedTk });
      return true;
    }

    const tk = (db.support_tickets || []).find((t) => Number(t.ticket_id) === ticketId);
    if (!tk) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy phiếu hỗ trợ." });
      return true;
    }
    if (newStatus) tk.status = newStatus;
    if (newPriority) tk.priority = newPriority;
    tk.updated_at = new Date().toISOString();
    logAudit(db, {
      actor_id: actorId,
      action: "UPDATE_TICKET_STATUS",
      target_entity: "support_tickets",
      target_id: ticketId,
      details: { status: newStatus, priority: newPriority },
      isProd: false
    });
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, ticket: tk });
    return true;
  }

  // Sổ địa chỉ khách hàng
  if (method === "GET" && pathname === "/api/customer/addresses") {
    const customerId = normalizeId(searchParams.get("customer_id")) || 101;
    if (isProd && client) {
      const { data: addrs, error } = await client.from("customer_addresses").select("*").eq("customer_id", customerId);
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 200, { ok: true, addresses: addrs || [] });
      return true;
    }
    const addrs = (db.customer_addresses || []).filter((a) => String(a.customer_id) === String(customerId));
    sendJson(res, 200, { ok: true, addresses: addrs });
    return true;
  }

  if (method === "POST" && pathname === "/api/customer/addresses") {
    const body = await parseBody(req);
    const customerId = normalizeId(body.customer_id) || 101;
    const tag = String(body.tag || "Nhà riêng").trim();
    const streetAddress = String(body.street_address || "").trim();
    const wardId = String(body.ward_id || "27403");
    const isDefault = Boolean(body.is_default);

    if (!streetAddress) {
      sendJson(res, 400, { ok: false, error: "Địa chỉ đường/phố là bắt buộc." });
      return true;
    }

    const nowIso = new Date().toISOString();
    const nextId = isProd
      ? crypto.randomUUID()
      : Math.max(10, ...(db.customer_addresses || []).map((a) => (typeof a.address_id === "number" ? a.address_id : 0))) + 1;
    const newAddr = {
      address_id: nextId,
      customer_id: customerId,
      tag,
      street_address: streetAddress,
      ward_id: wardId,
      latitude: Number(body.latitude) || 10.728912,
      longitude: Number(body.longitude) || 106.712405,
      is_default: isDefault,
      created_at: nowIso
    };

    if (isProd && client) {
      if (isDefault) {
        await client.from("customer_addresses").update({ is_default: false }).eq("customer_id", customerId);
      }
      const { data: created, error } = await client.from("customer_addresses").insert([newAddr]).select().single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 201, { ok: true, address: created });
      return true;
    }

    if (!Array.isArray(db.customer_addresses)) db.customer_addresses = [];
    if (isDefault) {
      db.customer_addresses.forEach((a) => {
        if (String(a.customer_id) === String(customerId)) a.is_default = false;
      });
    }
    db.customer_addresses.push(newAddr);
    saveLocalDb(db);
    sendJson(res, 201, { ok: true, address: newAddr });
    return true;
  }

  const addrMatch = pathname.match(/^\/api\/customer\/addresses\/([^/]+)$/);
  if (method === "PUT" && addrMatch) {
    const addressId = addrMatch[1];
    const body = await parseBody(req);
    const isDefault = Boolean(body.is_default);

    if (isProd && client) {
      const { data: cur } = await client
        .from("customer_addresses")
        .select("customer_id")
        .eq("address_id", addressId)
        .single();
      if (isDefault && cur) {
        await client.from("customer_addresses").update({ is_default: false }).eq("customer_id", cur.customer_id);
      }
      const updates = {};
      if (body.tag) updates.tag = String(body.tag).trim();
      if (body.street_address) updates.street_address = String(body.street_address).trim();
      if (body.ward_id) updates.ward_id = String(body.ward_id);
      if (body.latitude) updates.latitude = Number(body.latitude);
      if (body.longitude) updates.longitude = Number(body.longitude);
      if (body.is_default !== undefined) updates.is_default = isDefault;
      const { data: upd, error } = await client
        .from("customer_addresses")
        .update(updates)
        .eq("address_id", addressId)
        .select()
        .single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 200, { ok: true, address: upd });
      return true;
    }

    const addr = (db.customer_addresses || []).find((a) => String(a.address_id) === String(addressId));
    if (!addr) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy địa chỉ." });
      return true;
    }
    if (isDefault) {
      (db.customer_addresses || []).forEach((a) => {
        if (String(a.customer_id) === String(addr.customer_id)) a.is_default = false;
      });
    }
    if (body.tag) addr.tag = String(body.tag).trim();
    if (body.street_address) addr.street_address = String(body.street_address).trim();
    if (body.ward_id) addr.ward_id = String(body.ward_id);
    if (body.latitude) addr.latitude = Number(body.latitude);
    if (body.longitude) addr.longitude = Number(body.longitude);
    if (body.is_default !== undefined) addr.is_default = isDefault;
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, address: addr });
    return true;
  }

  if (method === "DELETE" && addrMatch) {
    const addressId = addrMatch[1];
    if (isProd && client) {
      const { error } = await client.from("customer_addresses").delete().eq("address_id", addressId);
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 200, { ok: true, message: "Đã xóa địa chỉ." });
      return true;
    }
    db.customer_addresses = (db.customer_addresses || []).filter((a) => String(a.address_id) !== String(addressId));
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, message: "Đã xóa địa chỉ." });
    return true;
  }

  // Notifications
  if (method === "GET" && pathname === "/api/notifications") {
    const userId = searchParams.get("user_id");
    if (isProd && client) {
      let q = client.from("notifications").select("*").order("created_at", { ascending: false });
      if (userId) q = q.eq("user_id", userId);
      const { data: notifs, error } = await q;
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      sendJson(res, 200, { ok: true, notifications: notifs || [] });
      return true;
    }
    let notifs = db.notifications || [];
    if (userId) {
      notifs = notifs.filter((n) => String(n.user_id) === String(userId));
    }
    sendJson(res, 200, { ok: true, notifications: notifs });
    return true;
  }

  const notifReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if ((method === "POST" || method === "PATCH") && notifReadMatch) {
    const notifId = notifReadMatch[1];
    if (isProd && client) {
      await client.from("notifications").update({ is_read: true }).eq("notification_id", notifId);
      sendJson(res, 200, { ok: true, message: "Đã đánh dấu đã đọc" });
      return true;
    }
    const notif = (db.notifications || []).find((n) => String(n.notification_id) === String(notifId));
    if (notif) notif.is_read = true;
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, message: "Đã đánh dấu đã đọc" });
    return true;
  }

  if (method === "POST" && pathname === "/api/notifications/read-all") {
    const body = await parseBody(req);
    const userId = body.user_id;
    if (isProd && client) {
      let q = client.from("notifications").update({ is_read: true });
      if (userId) q = q.eq("user_id", userId);
      await q;
      sendJson(res, 200, { ok: true, message: "Đã đọc tất cả thông báo" });
      return true;
    }
    (db.notifications || []).forEach((n) => {
      if (!userId || String(n.user_id) === String(userId)) {
        n.is_read = true;
      }
    });
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, message: "Đã đọc tất cả thông báo" });
    return true;
  }

  return false;
}

module.exports = handleCustomerRoutes;
