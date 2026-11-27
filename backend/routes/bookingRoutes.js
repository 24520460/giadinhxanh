const { parseBody, sendJson } = require("../utils/http");
const {
  isUuid,
  normalizeId,
  validateScheduledTime,
  validateNonNegativeAmount,
  validateCoordinates
} = require("../utils/validators");
const {
  requireAuth,
  requireAuthAsync,
  authenticateWriteOrScopedRequest
} = require("../middleware/auth");
const { saveLocalDb } = require("../db/localStore");
const { dispatchNotification, logAudit } = require("../services/auditService");
const {
  autoExpirePendingBookings,
  inFlightAcceptLocks,
  normalizeBookingRecord,
  resolveActorContext,
  transitionBookingLifecycle
} = require("../services/bookingService");

async function resolveSupabaseCustomerId(client, rawCustomerId) {
  if (isUuid(String(rawCustomerId))) return String(rawCustomerId).trim();
  const { data: list } = await client.from("customer_profiles").select("customer_id").limit(5);
  if (Array.isArray(list) && list.length > 0) {
    return list[0].customer_id;
  }
  return null;
}

async function resolveSupabaseProviderId(client, rawProviderId) {
  if (!rawProviderId) return null;
  if (isUuid(String(rawProviderId))) return String(rawProviderId).trim();
  const { data: list } = await client.from("provider_profiles").select("provider_id").limit(5);
  if (Array.isArray(list) && list.length > 0) {
    return list[0].provider_id;
  }
  return null;
}

async function handleBookingRoutes(ctx) {
  const { req, res, method, pathname, searchParams, isProd, db, client } = ctx;

  // GET /api/bookings — Lấy danh sách đơn theo quyền từ Bearer Token
  if (method === "GET" && pathname === "/api/bookings") {
    const authUser = await requireAuthAsync(req, res, client, ["customer", "provider", "company", "admin"]);
    if (!authUser) return true;

    const statusFilter = searchParams ? String(searchParams.get("status") || "").trim() : "";
    const actor = await resolveActorContext(authUser, { useSupabase: Boolean(isProd), db, client });

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, code: "SERVICE_UNAVAILABLE", error: "Không có kết nối Supabase." });
        return true;
      }
      let query = client.from("bookings").select("*").order("created_at", { ascending: false }).limit(100);
      if (statusFilter) query = query.eq("status", statusFilter);

      if (authUser.role === "customer") {
        if (!actor || !actor.customerId) {
          sendJson(res, 200, { ok: true, bookings: [] });
          return true;
        }
        query = query.eq("customer_id", actor.customerId);
      } else if (authUser.role === "provider") {
        if (actor && actor.providerId) {
          query = query.or(`provider_id.eq.${actor.providerId},and(status.eq.pending,provider_id.is.null)`);
        } else {
          query = query.eq("status", "pending").is("provider_id", null);
        }
      } else if (authUser.role === "company") {
        if (!actor || !actor.companyId) {
          sendJson(res, 200, { ok: true, bookings: [] });
          return true;
        }
        query = query.eq("company_id", actor.companyId);
      }

      const { data: list, error: listErr } = await query;
      if (listErr) {
        sendJson(res, 500, { ok: false, code: "DB_ERROR", error: listErr.message });
        return true;
      }
      sendJson(res, 200, { ok: true, bookings: (list || []).map(normalizeBookingRecord) });
      return true;
    }

    let bookings = db.bookings || [];
    if (statusFilter) {
      bookings = bookings.filter((b) => b.status === statusFilter);
    }
    if (authUser.role === "customer") {
      bookings = actor && actor.customerId
        ? bookings.filter((b) => String(b.customer_id) === String(actor.customerId))
        : [];
    } else if (authUser.role === "provider") {
      bookings = bookings.filter(
        (b) =>
          (actor && actor.providerId && String(b.provider_id) === String(actor.providerId)) ||
          (b.status === "pending" && (b.provider_id === null || b.provider_id === undefined))
      );
    } else if (authUser.role === "company") {
      const compProvIds = new Set(
        (db.provider_profiles || [])
          .filter((p) => actor && actor.companyId && String(p.company_id) === String(actor.companyId))
          .map((p) => String(p.provider_id))
      );
      bookings = bookings.filter(
        (b) =>
          (actor && actor.companyId && String(b.company_id) === String(actor.companyId)) ||
          (b.provider_id != null && compProvIds.has(String(b.provider_id)))
      );
    }
    sendJson(res, 200, { ok: true, bookings: bookings.map(normalizeBookingRecord) });
    return true;
  }

  // GET /api/bookings/:id — Lấy chi tiết đơn theo quyền từ Bearer Token
  const getDetailMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (method === "GET" && getDetailMatch) {
    const rawBookingId = getDetailMatch[1];
    const authUser = await requireAuthAsync(req, res, client, ["customer", "provider", "company", "admin"]);
    if (!authUser) return true;

    const useSupabase = Boolean(isProd || (client && isUuid(rawBookingId)));
    if (useSupabase) {
      if (!client) {
        sendJson(res, 503, { ok: false, code: "SERVICE_UNAVAILABLE", error: "Không có kết nối Supabase." });
        return true;
      }
      const { data: bk, error: bkErr } = await client
        .from("bookings")
        .select("*")
        .eq("booking_id", rawBookingId)
        .maybeSingle();
      if (bkErr || !bk) {
        sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "Không tìm thấy đơn hàng." });
        return true;
      }
      const actor = await resolveActorContext(authUser, { useSupabase: true, db, client });
      if (authUser.role === "customer") {
        if (!actor || !actor.customerId || String(bk.customer_id) !== String(actor.customerId)) {
          sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Bạn không có quyền xem đơn hàng của người khác." });
          return true;
        }
      } else if (authUser.role === "provider") {
        const isOpenPool = bk.status === "pending" && (bk.provider_id === null || bk.provider_id === undefined);
        if (!isOpenPool && (!actor || !actor.providerId || String(bk.provider_id) !== String(actor.providerId))) {
          sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Đơn hàng này không thuộc phân công của bạn." });
          return true;
        }
      } else if (authUser.role === "company") {
        if (!actor || !actor.companyId || String(bk.company_id) !== String(actor.companyId)) {
          sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Đơn hàng này không thuộc công ty của bạn." });
          return true;
        }
      }
      const { data: history } = await client
        .from("booking_status_history")
        .select("*")
        .eq("booking_id", rawBookingId)
        .order("created_at", { ascending: false });
      sendJson(res, 200, { ok: true, booking: normalizeBookingRecord(bk), history: history || [] });
      return true;
    }

    const bk = (db.bookings || []).find((b) => String(b.booking_id) === String(rawBookingId));
    if (!bk) {
      sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "Không tìm thấy đơn hàng." });
      return true;
    }
    const actor = await resolveActorContext(authUser, { useSupabase: false, db, client });
    if (authUser.role === "customer") {
      if (!actor || !actor.customerId || String(bk.customer_id) !== String(actor.customerId)) {
        sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Bạn không có quyền xem đơn hàng của người khác." });
        return true;
      }
    } else if (authUser.role === "provider") {
      const isOpenPool = bk.status === "pending" && (bk.provider_id === null || bk.provider_id === undefined);
      if (!isOpenPool && (!actor || !actor.providerId || String(bk.provider_id) !== String(actor.providerId))) {
        sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Đơn hàng này không thuộc phân công của bạn." });
        return true;
      }
    } else if (authUser.role === "company") {
      if (!actor || !actor.companyId || String(bk.company_id) !== String(actor.companyId)) {
        sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Đơn hàng này không thuộc công ty của bạn." });
        return true;
      }
    }
    const history = (db.booking_status_history || []).filter(
      (h) => String(h.booking_id) === String(rawBookingId)
    );
    sendJson(res, 200, { ok: true, booking: normalizeBookingRecord(bk), history });
    return true;
  }

  // POST /api/bookings — Tạo đơn đặt lịch mới
  if (method === "POST" && pathname === "/api/bookings") {
    const authResult = await authenticateWriteOrScopedRequest(req, res, {
      isProd,
      client,
      allowedRoles: ["customer", "admin"]
    });
    if (authResult.halted) return true;
    const authUser = authResult.user;

    const body = await parseBody(req);
    const address = String(body.address || "").trim();
    const wardId = String(body.ward_id || "27403").trim();
    const serviceId = normalizeId(body.service_id);
    const rawProviderId = body.provider_id;
    const isBroadcast =
      rawProviderId === null ||
      rawProviderId === undefined ||
      rawProviderId === "broadcast" ||
      String(rawProviderId).trim() === "";
    const providerId = isBroadcast ? null : normalizeId(rawProviderId);

    const schedCheck = validateScheduledTime(body.scheduled_time);
    if (!schedCheck.ok) {
      sendJson(res, 400, { ok: false, code: "INVALID_INPUT", error: schedCheck.error });
      return true;
    }
    const scheduledIso = schedCheck.iso;

    if (body.total_amount !== undefined && body.total_amount !== null) {
      const amtCheck = validateNonNegativeAmount(body.total_amount, "Tổng tiền");
      if (!amtCheck.ok) {
        sendJson(res, 400, { ok: false, code: "INVALID_INPUT", error: amtCheck.error });
        return true;
      }
    }

    const coordCheck = validateCoordinates(body.latitude, body.longitude);
    if (!coordCheck.ok) {
      sendJson(res, 400, { ok: false, code: "INVALID_INPUT", error: coordCheck.error });
      return true;
    }

    const useSupabase = Boolean(client) && (isProd || isUuid(String(serviceId)) || isUuid(String(body.customer_id || "")));
    let customerId = normalizeId(body.customer_id);
    if (authUser && authUser.role === "customer") {
      const actor = await resolveActorContext(authUser, { useSupabase, db, client });
      if (!actor || !actor.customerId) {
        sendJson(res, 403, {
          ok: false,
          code: "PROFILE_NOT_FOUND",
          error: "Tài khoản khách hàng chưa có hồ sơ đặt lịch."
        });
        return true;
      }
      customerId = actor.customerId;
    }

    if (!serviceId || !wardId || !address || !customerId) {
      sendJson(res, 400, {
        ok: false,
        code: "INVALID_INPUT",
        error: "Vui lòng điền đầy đủ dịch vụ, khách hàng, phường/xã và địa chỉ."
      });
      return true;
    }

    if (useSupabase) {
      let resolvedCustomerId = isUuid(String(customerId)) ? String(customerId).trim() : null;
      if (!resolvedCustomerId) {
        if (isProd) {
          sendJson(res, 400, { ok: false, error: "Mã khách hàng (customer_id) phải là UUID hợp lệ." });
          return true;
        }
        resolvedCustomerId = await resolveSupabaseCustomerId(client, customerId);
        if (!resolvedCustomerId) {
          sendJson(res, 400, { ok: false, error: "Không tìm thấy hồ sơ khách hàng tương ứng trên Supabase." });
          return true;
        }
      }

      let targetProvId = null;
      if (!isBroadcast) {
        targetProvId = isUuid(String(providerId)) ? String(providerId).trim() : null;
        if (!targetProvId && !isProd) {
          targetProvId = await resolveSupabaseProviderId(client, providerId);
        }
        if (!targetProvId && isProd) {
          sendJson(res, 400, { ok: false, error: "Mã đối tác thợ (provider_id) phải là UUID hợp lệ." });
          return true;
        }
      }

      if (targetProvId) {
        const reqDate = scheduledIso.slice(0, 10);
        const { data: exceptions } = await client
          .from("availability_exceptions")
          .select("*")
          .eq("provider_id", targetProvId)
          .eq("exception_date", reqDate);
        if (exceptions && exceptions.some((ex) => ex.is_available !== true)) {
          sendJson(res, 409, {
            ok: false,
            conflict: true,
            error:
              "Thợ đã đăng ký nghỉ làm hoặc bận vào ngày này. Vui lòng chọn ngày khác hoặc để hệ thống tìm thợ tự động."
          });
          return true;
        }

        const reqTime = new Date(scheduledIso).getTime();
        const { data: existingBks } = await client
          .from("bookings")
          .select("booking_id, scheduled_time, status")
          .eq("provider_id", targetProvId)
          .in("status", ["confirmed", "in_progress"]);
        if (existingBks && existingBks.length > 0) {
          const conflict = existingBks.some((b) => {
            const bTime = new Date(b.scheduled_time).getTime();
            return Math.abs(reqTime - bTime) < 2 * 60 * 60 * 1000;
          });
          if (conflict) {
            sendJson(res, 409, {
              ok: false,
              conflict: true,
              error:
                "Thợ đã có lịch hẹn trùng hoặc quá sát khung giờ này (cần cách tối thiểu 2 giờ). Vui lòng chọn giờ khác hoặc tìm thợ tự động."
            });
            return true;
          }
        }
      }

      const { data: svcRow } = await client
        .from("services")
        .select("service_id, price")
        .eq("service_id", serviceId)
        .maybeSingle();
      if (!svcRow) {
        sendJson(res, 404, { ok: false, code: "SERVICE_NOT_FOUND", error: "Không tìm thấy dịch vụ được chọn." });
        return true;
      }

      const finalProvId = targetProvId || null;

      let validWardId = wardId;
      let wardTarget = "wards";
      let { data: wardList, error: wErr } = await client.from("wards").select("ward_id").eq("ward_id", validWardId).limit(1);
      if (wErr) {
        wardTarget = "ward";
        const wRes = await client.from("ward").select("ward_id").eq("ward_id", validWardId).limit(1);
        wardList = wRes.data;
      }
      if (!wardList || wardList.length === 0) {
        const { data: fallbackWards } = await client.from(wardTarget).select("ward_id").limit(1);
        if (fallbackWards && fallbackWards.length > 0) {
          validWardId = fallbackWards[0].ward_id;
        }
      }

      const newBk = {
        customer_id: resolvedCustomerId,
        provider_id: finalProvId,
        service_id: serviceId,
        scheduled_time: scheduledIso,
        status: "pending",
        address,
        ward_id: validWardId,
        latitude: coordCheck.latitude,
        longitude: coordCheck.longitude,
        total_amount: Number(body.total_amount) || Number(svcRow.price) || 180000,
        total_incidental: 0,
        notes: (isBroadcast ? "[BROADCAST_POOL] " : "") + String(body.notes || "Khách đặt lịch qua hệ thống.").trim(),
        payment_status: "unpaid"
      };

      const { data: createdBk, error: bkErr } = await client.from("bookings").insert([newBk]).select().single();
      if (bkErr) {
        sendJson(res, 500, { ok: false, code: "DB_ERROR", error: `Lỗi tạo đơn Supabase: ${bkErr.message}` });
        return true;
      }

      const { data: cp } = await client
        .from("customer_profiles")
        .select("user_id")
        .eq("customer_id", resolvedCustomerId)
        .maybeSingle();

      const historyActorId =
        (authUser && isUuid(String(authUser.user_id)) && authUser.user_id) ||
        (isUuid(String(body.changed_by || "")) && body.changed_by) ||
        (cp && cp.user_id) ||
        null;

      let historyRow = null;
      if (historyActorId) {
        const { data: histData } = await client
          .from("booking_status_history")
          .insert([
            {
              booking_id: createdBk.booking_id,
              previous_status: null,
              new_status: "pending",
              changed_by: historyActorId,
              reason: "Khách hàng tạo đơn đặt lịch"
            }
          ])
          .select()
          .maybeSingle();
        historyRow = histData || null;
      }

      if (cp && cp.user_id) {
        await dispatchNotification(null, {
          user_id: cp.user_id,
          title: "Đặt lịch thành công!",
          body: `Đơn #${createdBk.booking_id} đã được tạo thành công. Hệ thống đang tiến hành điều phối thợ.`,
          type: "booking_created",
          link: `/bookings/${createdBk.booking_id}/tracking`,
          isProd: true,
          client
        });
      }

      await logAudit(null, {
        actor_id: historyActorId || resolvedCustomerId,
        action: "CREATE_BOOKING",
        target_entity: "bookings",
        target_id: createdBk.booking_id,
        details: { service_id: serviceId, provider_id: finalProvId, total_amount: newBk.total_amount },
        isProd: true,
        client
      });

      sendJson(res, 201, { ok: true, booking: normalizeBookingRecord(createdBk), history: historyRow });
      return true;
    }

    // Local mode
    const svc = db.services.find((s) => String(s.service_id) === String(serviceId));
    const nextId = Math.max(1040, ...db.bookings.map((b) => (typeof b.booking_id === "number" ? b.booking_id : 0))) + 1;
    const nowIso = new Date().toISOString();
    const chosenProviderId = isBroadcast ? null : providerId;

    if (chosenProviderId) {
      const reqDate = scheduledIso.slice(0, 10);
      const isDayOff = (db.availability_exceptions || []).some(
        (ex) =>
          String(ex.provider_id) === String(chosenProviderId) &&
          ex.exception_date === reqDate &&
          ex.is_available !== true
      );
      if (isDayOff) {
        sendJson(res, 409, {
          ok: false,
          conflict: true,
          error:
            "Thợ đã đăng ký nghỉ làm hoặc bận vào ngày này. Vui lòng chọn ngày khác hoặc để hệ thống tìm thợ tự động."
        });
        return true;
      }

      const reqTime = new Date(scheduledIso).getTime();
      const hasConflict = (db.bookings || []).some((b) => {
        if (String(b.provider_id) !== String(chosenProviderId)) return false;
        if (!["confirmed", "in_progress"].includes(b.status)) return false;
        const bTime = new Date(b.scheduled_time).getTime();
        return Math.abs(reqTime - bTime) < 2 * 60 * 60 * 1000;
      });
      if (hasConflict) {
        sendJson(res, 409, {
          ok: false,
          conflict: true,
          error:
            "Thợ đã có lịch hẹn trùng hoặc quá sát khung giờ này (cần cách tối thiểu 2 giờ). Vui lòng chọn giờ khác hoặc tìm thợ tự động."
        });
        return true;
      }
    }

    const chosenProv = chosenProviderId
      ? (db.provider_profiles || []).find((p) => String(p.provider_id) === String(chosenProviderId))
      : null;
    const resolvedCompanyId =
      body.company_id || (svc && svc.company_id) || (chosenProv && chosenProv.company_id) || 501;

    const newBooking = {
      booking_id: nextId,
      customer_id: customerId,
      provider_id: chosenProviderId,
      company_id: resolvedCompanyId,
      dispatch_type: isBroadcast ? "broadcast" : "direct",
      service_id: serviceId,
      scheduled_time: scheduledIso,
      status: "pending",
      address,
      ward_id: wardId,
      latitude: coordCheck.latitude,
      longitude: coordCheck.longitude,
      total_amount: Number(body.total_amount) || (svc ? svc.price : 180000),
      total_incidental: 0,
      notes: (isBroadcast ? "[BROADCAST_POOL] " : "") + String(body.notes || "Khách đặt lịch qua Booking Wizard.").trim(),
      payment_status: "unpaid",
      created_at: nowIso,
      updated_at: nowIso
    };

    db.bookings.unshift(newBooking);
    const nextHistoryId = Math.max(5000, ...db.booking_status_history.map((h) => h.history_id || 0)) + 1;
    const historyRow = {
      history_id: nextHistoryId,
      booking_id: nextId,
      previous_status: null,
      new_status: "pending",
      changed_by: body.changed_by || "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      reason: "Khách hàng tạo đơn đặt lịch qua Booking Wizard 1.2",
      created_at: nowIso
    };
    db.booking_status_history.unshift(historyRow);

    const cp = (db.customer_profiles || []).find((c) => String(c.customer_id) === String(customerId));
    if (cp && cp.user_id) {
      dispatchNotification(db, {
        user_id: cp.user_id,
        title: "Đặt lịch thành công!",
        body: `Đơn #${nextId} đã được tạo thành công. Hệ thống đang tiến hành điều phối thợ.`,
        type: "booking_created",
        link: `/bookings/${nextId}/tracking`,
        isProd: false
      });
    }

    if (chosenProviderId) {
      const pp = (db.provider_profiles || []).find((p) => String(p.provider_id) === String(chosenProviderId));
      if (pp && pp.user_id) {
        dispatchNotification(db, {
          user_id: pp.user_id,
          title: "Đơn đặt lịch trực tiếp mới",
          body: `Khách hàng vừa đặt đơn #${nextId} trực tiếp với bạn vào ${newBooking.scheduled_time.slice(0, 16)}.`,
          type: "booking_created",
          link: "/provider/shift",
          isProd: false
        });
      }
    }

    logAudit(db, {
      actor_id: body.changed_by || customerId,
      action: "CREATE_BOOKING",
      target_entity: "bookings",
      target_id: nextId,
      details: { service_id: serviceId, provider_id: chosenProviderId, total_amount: newBooking.total_amount },
      isProd: false
    });

    saveLocalDb(db);
    sendJson(res, 201, { ok: true, booking: newBooking, history: historyRow });
    return true;
  }

  // POST /api/bookings/:id/accept
  const acceptMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/accept$/);
  if (method === "POST" && acceptMatch) {
    const authResult = await authenticateWriteOrScopedRequest(req, res, {
      isProd,
      client,
      allowedRoles: ["provider", "admin"]
    });
    if (authResult.halted) return true;
    const authUser = authResult.user;

    const rawBookingId = acceptMatch[1];
    const body = await parseBody(req);
    const useSupabase = Boolean(isProd || (client && isUuid(rawBookingId)));

    let providerId = normalizeId(body.provider_id);
    let actorUserId = (authUser && authUser.user_id) || body.user_id || body.changed_by || null;
    if (authUser && authUser.role === "provider") {
      const actor = await resolveActorContext(authUser, { useSupabase, db, client });
      if (!actor || !actor.providerId) {
        sendJson(res, 403, {
          ok: false,
          code: "PROFILE_NOT_FOUND",
          error: "Tài khoản đối tác chưa có hồ sơ hành nghề."
        });
        return true;
      }
      providerId = actor.providerId;
      actorUserId = authUser.user_id;
    }

    const lockKey = String(rawBookingId);
    if (inFlightAcceptLocks.has(lockKey)) {
      sendJson(res, 409, {
        ok: false,
        code: "BOOKING_ALREADY_TAKEN",
        expired: true,
        error: "Đơn hàng đang được xử lý nhận bởi đối tác khác."
      });
      return true;
    }
    inFlightAcceptLocks.add(lockKey);

    try {
      if (useSupabase) {
        if (!client) {
          sendJson(res, 503, { ok: false, code: "SERVICE_UNAVAILABLE", error: "Không có kết nối Supabase." });
          return true;
        }
        const { data: curBk, error: fetchErr } = await client
          .from("bookings")
          .select("*")
          .eq("booking_id", rawBookingId)
          .single();
        if (fetchErr || !curBk) {
          sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "Không tìm thấy đơn hàng." });
          return true;
        }
        if (curBk.status !== "pending") {
          sendJson(res, 409, {
            ok: false,
            code: "BOOKING_ALREADY_TAKEN",
            expired: true,
            error: "Rất tiếc! Đơn này vừa được một đối tác khác nhận trước hoặc đã hết hạn."
          });
          return true;
        }
        let resolvedProvId = providerId;
        if (!isUuid(String(resolvedProvId)) && !isProd) {
          resolvedProvId = await resolveSupabaseProviderId(client, resolvedProvId);
        }
        if (!isUuid(String(resolvedProvId))) {
          sendJson(res, 400, { ok: false, code: "INVALID_INPUT", error: "Thiếu mã đối tác thợ (provider_id) hợp lệ." });
          return true;
        }
        if (curBk.provider_id && String(curBk.provider_id) !== String(resolvedProvId)) {
          sendJson(res, 409, {
            ok: false,
            code: "BOOKING_ALREADY_TAKEN",
            expired: true,
            error: "Đơn hàng đã được chỉ định hoặc nhận bởi đối tác khác."
          });
          return true;
        }

        const { data: updatedBk, error: updErr } = await client
          .from("bookings")
          .update({
            status: "confirmed",
            provider_id: resolvedProvId,
            updated_at: new Date().toISOString()
          })
          .eq("booking_id", rawBookingId)
          .eq("status", "pending")
          .or(`provider_id.is.null,provider_id.eq.${resolvedProvId}`)
          .select()
          .maybeSingle();
        if (updErr || !updatedBk) {
          sendJson(res, 409, {
            ok: false,
            code: "BOOKING_ALREADY_TAKEN",
            expired: true,
            error: "Đơn hàng đã có người nhận trước hoặc không còn khả dụng."
          });
          return true;
        }

        let historyRow = null;
        if (isUuid(String(actorUserId || ""))) {
          const { data: histData } = await client
            .from("booking_status_history")
            .insert([
              {
                booking_id: rawBookingId,
                previous_status: "pending",
                new_status: "confirmed",
                changed_by: actorUserId,
                reason: "Đối tác đã nhận việc từ Hòm thư việc làm"
              }
            ])
            .select()
            .maybeSingle();
          historyRow = histData || null;
        }
        sendJson(res, 200, { ok: true, booking: normalizeBookingRecord(updatedBk), history: historyRow });
        return true;
      }

      const bk = db.bookings.find((b) => String(b.booking_id) === String(rawBookingId));
      if (!bk) {
        sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "Không tìm thấy đơn hàng." });
        return true;
      }
      if (bk.status !== "pending") {
        sendJson(res, 409, {
          ok: false,
          code: "BOOKING_ALREADY_TAKEN",
          expired: true,
          error: "Rất tiếc! Đơn này vừa được một đối tác khác nhận trước hoặc đã hết hạn."
        });
        return true;
      }
      if (providerId == null || providerId === "") {
        sendJson(res, 400, { ok: false, code: "INVALID_INPUT", error: "Thiếu mã đối tác thợ (provider_id)." });
        return true;
      }
      if (bk.provider_id != null && String(bk.provider_id) !== String(providerId)) {
        sendJson(res, 409, {
          ok: false,
          code: "BOOKING_ALREADY_TAKEN",
          expired: true,
          error: "Đơn hàng đã được chỉ định cho đối tác khác."
        });
        return true;
      }

      const oldStatus = bk.status;
      bk.status = "confirmed";
      bk.provider_id = providerId;
      bk.dispatch_type = "direct";
      bk.updated_at = new Date().toISOString();

      const nextHistoryId = Math.max(5000, ...db.booking_status_history.map((h) => h.history_id || 0)) + 1;
      const pp = (db.provider_profiles || []).find((p) => String(p.provider_id) === String(providerId));
      const resolvedActor = isUuid(String(actorUserId || ""))
        ? actorUserId
        : (pp && pp.user_id) || "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b21";
      const historyRow = {
        history_id: nextHistoryId,
        booking_id: bk.booking_id,
        previous_status: oldStatus,
        new_status: "confirmed",
        changed_by: resolvedActor,
        reason: "Đối tác đã nhận việc từ Hòm thư việc làm",
        created_at: new Date().toISOString()
      };
      db.booking_status_history.unshift(historyRow);
      saveLocalDb(db);
      sendJson(res, 200, { ok: true, booking: normalizeBookingRecord(bk), history: historyRow });
      return true;
    } finally {
      inFlightAcceptLocks.delete(lockKey);
    }
  }

  // POST /api/rpc/transition-status
  if (method === "POST" && pathname === "/api/rpc/transition-status") {
    const body = await parseBody(req);
    const bookingId = normalizeId(body.booking_id);
    const newStatus = String(body.new_status || "").trim();
    return await transitionBookingLifecycle(ctx, {
      bookingId,
      newStatus,
      defaultReason: "Cập nhật trạng thái qua RPC",
      bodyReason: body.reason,
      allowedRoles: ["customer", "provider", "admin"],
      fallbackActorId: body.changed_by || null
    });
  }

  // POST /api/rpc/update-incidental — Yêu cầu xác thực Provider/Admin và chỉ chấp nhận số >= 0
  if (method === "POST" && pathname === "/api/rpc/update-incidental") {
    const authUser = requireAuth(req, res, ["provider", "admin"]);
    if (!authUser) return true;

    const body = await parseBody(req);
    const bookingId = normalizeId(body.booking_id);
    const incCheck = validateNonNegativeAmount(body.total_incidental, "Chi phí phát sinh");
    if (!incCheck.ok) {
      sendJson(res, 400, { ok: false, error: incCheck.error });
      return true;
    }
    const incidental = incCheck.value;
    const notes = String(body.notes || "").trim();

    if (isProd || (client && isUuid(String(bookingId)))) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase." });
        return true;
      }
      const { data: curBk } = await client
        .from("bookings")
        .select("total_amount, total_incidental")
        .eq("booking_id", bookingId)
        .single();
      const basePrice = curBk ? Math.max(0, curBk.total_amount - curBk.total_incidental) : 0;
      const { data: updatedBk, error: updErr } = await client
        .from("bookings")
        .update({
          total_incidental: incidental,
          total_amount: basePrice + incidental,
          updated_at: new Date().toISOString()
        })
        .eq("booking_id", bookingId)
        .select()
        .single();
      if (updErr) {
        sendJson(res, 500, { ok: false, error: updErr.message });
        return true;
      }
      sendJson(res, 200, { ok: true, booking: updatedBk });
      return true;
    }

    const bk = db.bookings.find((b) => String(b.booking_id) === String(bookingId));
    if (!bk) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy đơn hàng." });
      return true;
    }
    const basePrice = Math.max(0, bk.total_amount - (bk.total_incidental || 0));
    bk.total_incidental = incidental;
    bk.total_amount = basePrice + incidental;
    bk.updated_at = new Date().toISOString();
    if (notes) {
      bk.notes = (bk.notes ? bk.notes + "\n" : "") + `[Phát sinh: ${incidental} đ] ${notes}`;
    }
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, booking: bk });
    return true;
  }

  // POST /api/rpc/confirm-payment & POST /api/bookings/:id/pay
  if (
    method === "POST" &&
    (pathname === "/api/rpc/confirm-payment" || (pathname.startsWith("/api/bookings/") && pathname.endsWith("/pay")))
  ) {
    const body = await parseBody(req);
    let bookingId = body.booking_id != null ? body.booking_id : null;
    if (!bookingId && pathname.startsWith("/api/bookings/")) {
      const parts = pathname.split("/");
      const bIdx = parts.indexOf("bookings");
      if (bIdx !== -1 && bIdx + 1 < parts.length) {
        bookingId = parts[bIdx + 1];
      }
    }
    bookingId = normalizeId(bookingId);
    const methodType = body.method || "VIETQR_BANK_TRANSFER";
    const txId = body.transaction_id || `VCB-${Date.now().toString().slice(-8)}`;
    const nowIso = new Date().toISOString();

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }
      const { data: bk, error: bkErr } = await client
        .from("bookings")
        .update({ payment_status: "paid", updated_at: nowIso })
        .eq("booking_id", bookingId)
        .select()
        .single();
      if (bkErr) {
        sendJson(res, 500, { ok: false, error: bkErr.message });
        return true;
      }

      try {
        const actorId = isUuid(String(body.changed_by || ""))
          ? body.changed_by
          : "bcba1d58-caef-4122-a4be-e8819b459ef9";
        await client.from("booking_status_history").insert([
          {
            booking_id: bookingId,
            previous_status: bk ? bk.status : "in_progress",
            new_status: bk ? bk.status : "in_progress",
            changed_by: actorId,
            reason: `[THANH TOÁN THÀNH CÔNG] Đã thanh toán qua ${
              methodType === "VIETQR_BANK_TRANSFER" ? "VietQR Ngân hàng (Vietcombank)" : "Tiền mặt"
            } (Mã GD: ${txId})`,
            created_at: nowIso
          }
        ]);
      } catch (_) {}

      sendJson(res, 200, { ok: true, booking: bk, transaction_id: txId, payment_status: "paid", paid_at: nowIso });
      return true;
    }

    const bk = db.bookings.find(
      (b) => String(b.booking_id) === String(bookingId) || (Number(b.booking_id) && Number(b.booking_id) === Number(bookingId))
    );

    if (!bk && client) {
      try {
        const { data: remoteBk, error: remErr } = await client
          .from("bookings")
          .update({ payment_status: "paid", updated_at: nowIso })
          .eq("booking_id", bookingId)
          .select()
          .single();
        if (!remErr && remoteBk) {
          try {
            let actorId = isUuid(String(body.changed_by || "")) ? body.changed_by : null;
            if (!actorId && remoteBk.customer_id) {
              const { data: cp } = await client
                .from("customer_profiles")
                .select("user_id")
                .eq("customer_id", remoteBk.customer_id)
                .maybeSingle();
              actorId = cp ? cp.user_id : null;
            }
            if (actorId) {
              await client.from("booking_status_history").insert([
                {
                  booking_id: bookingId,
                  previous_status: remoteBk.status,
                  new_status: remoteBk.status,
                  changed_by: actorId,
                  reason: `[THANH TOÁN THÀNH CÔNG] Đã thanh toán qua ${
                    methodType === "VIETQR_BANK_TRANSFER" ? "VietQR Ngân hàng (Vietcombank)" : "Tiền mặt"
                  } (Mã GD: ${txId})`,
                  created_at: nowIso
                }
              ]);
            }
          } catch (_) {}
          sendJson(res, 200, {
            ok: true,
            booking: remoteBk,
            transaction_id: txId,
            payment_status: "paid",
            paid_at: nowIso
          });
          return true;
        }
      } catch (_) {}
    }

    if (!bk) {
      sendJson(res, 404, { ok: false, error: `Không tìm thấy đơn hàng #${bookingId}.` });
      return true;
    }
    bk.payment_status = "paid";
    bk.updated_at = nowIso;

    if (!Array.isArray(db.booking_status_history)) db.booking_status_history = [];
    const actorUuid = isUuid(String(body.changed_by || ""))
      ? body.changed_by
      : "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    db.booking_status_history.unshift({
      history_id: Date.now(),
      booking_id: bookingId,
      previous_status: bk.status,
      new_status: bk.status,
      changed_by: actorUuid,
      reason: `[THANH TOÁN THÀNH CÔNG] Đã thanh toán qua ${
        methodType === "VIETQR_BANK_TRANSFER" ? "VietQR Ngân hàng (Vietcombank)" : "Tiền mặt"
      } (Mã GD: ${txId})`,
      created_at: nowIso
    });

    saveLocalDb(db);
    sendJson(res, 200, { ok: true, booking: bk, transaction_id: txId, payment_status: "paid", paid_at: nowIso });
    return true;
  }

  // POST /api/rpc/admin-adjust — Yêu cầu quyền Admin RBAC
  if (method === "POST" && pathname === "/api/rpc/admin-adjust") {
    const adminUser = requireAuth(req, res, ["admin"]);
    if (!adminUser) return true;

    const body = await parseBody(req);
    const bookingId = normalizeId(body.booking_id);
    if (body.total_amount !== undefined) {
      const amtCheck = validateNonNegativeAmount(body.total_amount, "Tổng tiền điều chỉnh");
      if (!amtCheck.ok) {
        sendJson(res, 400, { ok: false, error: amtCheck.error });
        return true;
      }
    }

    if (isProd || (client && isUuid(String(bookingId)))) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase." });
        return true;
      }
      const updates = { updated_at: new Date().toISOString() };
      if (body.provider_id !== undefined) updates.provider_id = normalizeId(body.provider_id);
      if (body.status) updates.status = body.status;
      if (body.payment_status) updates.payment_status = body.payment_status;
      if (body.total_amount !== undefined) updates.total_amount = Number(body.total_amount);
      const { data: bk, error: err } = await client
        .from("bookings")
        .update(updates)
        .eq("booking_id", bookingId)
        .select()
        .single();
      if (err) {
        sendJson(res, 500, { ok: false, error: err.message });
        return true;
      }
      await logAudit(null, {
        actor_id: adminUser.user_id,
        action: "ADMIN_ADJUST_BOOKING",
        target_entity: "bookings",
        target_id: bookingId,
        details: updates,
        isProd: true,
        client
      });
      sendJson(res, 200, { ok: true, booking: bk });
      return true;
    }

    const bk = db.bookings.find((b) => String(b.booking_id) === String(bookingId));
    if (!bk) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy đơn hàng." });
      return true;
    }
    if (body.provider_id !== undefined) bk.provider_id = normalizeId(body.provider_id);
    if (body.status) bk.status = body.status;
    if (body.payment_status) bk.payment_status = body.payment_status;
    if (body.total_amount !== undefined) bk.total_amount = Number(body.total_amount);
    bk.updated_at = new Date().toISOString();
    logAudit(db, {
      actor_id: adminUser.user_id,
      action: "ADMIN_ADJUST_BOOKING",
      target_entity: "bookings",
      target_id: bookingId,
      details: body,
      isProd: false
    });
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, booking: bk });
    return true;
  }

  // POST /api/bookings/:id/cancel
  const bkCancelMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/cancel$/);
  if (method === "POST" && bkCancelMatch) {
    const bookingId = normalizeId(bkCancelMatch[1]);
    const body = await parseBody(req);
    return await transitionBookingLifecycle(ctx, {
      bookingId,
      newStatus: "cancelled",
      defaultReason: "Khách hàng yêu cầu hủy đơn",
      bodyReason: body.reason,
      allowedRoles: ["customer", "provider", "admin"],
      fallbackActorId: body.user_id || body.changed_by || null
    });
  }

  // POST /api/bookings/:id/start
  const bkStartMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/start$/);
  if (method === "POST" && bkStartMatch) {
    const bookingId = normalizeId(bkStartMatch[1]);
    const body = await parseBody(req);
    return await transitionBookingLifecycle(ctx, {
      bookingId,
      newStatus: "in_progress",
      defaultReason: "Thợ đã có mặt và bắt đầu công việc",
      bodyReason: body.reason,
      allowedRoles: ["provider", "admin"],
      fallbackActorId: body.user_id || body.changed_by || null
    });
  }

  // POST /api/bookings/:id/complete
  const bkCompleteMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/complete$/);
  if (method === "POST" && bkCompleteMatch) {
    const bookingId = normalizeId(bkCompleteMatch[1]);
    const body = await parseBody(req);
    return await transitionBookingLifecycle(ctx, {
      bookingId,
      newStatus: "completed",
      defaultReason: "Thợ hoàn thành công việc",
      bodyReason: body.reason,
      allowedRoles: ["provider", "admin"],
      fallbackActorId: body.user_id || body.changed_by || null
    });
  }

  // POST/PATCH /api/bookings/:id/incidental
  const bkIncMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/incidental$/);
  if ((method === "POST" || method === "PATCH") && bkIncMatch) {
    const authUser = await requireAuthAsync(req, res, client, ["provider", "admin"]);
    if (!authUser) return true;

    const bookingId = normalizeId(bkIncMatch[1]);
    const body = await parseBody(req);
    const incCheck = validateNonNegativeAmount(body.total_incidental ?? body.incidental ?? 0, "Chi phí phát sinh");
    if (!incCheck.ok) {
      sendJson(res, 400, { ok: false, code: "INVALID_INPUT", error: incCheck.error });
      return true;
    }
    const incidental = incCheck.value;
    const notes = String(body.notes || body.incidental_Specify || "").trim();
    const useSupabase = Boolean(isProd || (client && isUuid(String(bookingId))));

    if (useSupabase) {
      if (!client) {
        sendJson(res, 503, { ok: false, code: "SERVICE_UNAVAILABLE", error: "Không có kết nối Supabase." });
        return true;
      }
      const { data: curBk, error: curErr } = await client
        .from("bookings")
        .select("*")
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (curErr || !curBk) {
        sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "Không tìm thấy đơn hàng." });
        return true;
      }
      if (authUser.role === "provider") {
        const actor = await resolveActorContext(authUser, { useSupabase: true, db, client });
        if (!actor || !actor.providerId || String(curBk.provider_id) !== String(actor.providerId)) {
          sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Đơn hàng này không thuộc phân công của bạn." });
          return true;
        }
      }
      const basePrice = Math.max(0, Number(curBk.total_amount || 0) - Number(curBk.total_incidental || 0));
      const { data: updatedBk, error: updErr } = await client
        .from("bookings")
        .update({
          total_incidental: incidental,
          total_amount: basePrice + incidental,
          updated_at: new Date().toISOString()
        })
        .eq("booking_id", bookingId)
        .select()
        .single();
      if (updErr) {
        sendJson(res, 500, { ok: false, code: "DB_ERROR", error: updErr.message });
        return true;
      }
      sendJson(res, 200, { ok: true, booking: normalizeBookingRecord(updatedBk) });
      return true;
    }

    const bk = (db.bookings || []).find((b) => String(b.booking_id) === String(bookingId));
    if (!bk) {
      sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "Không tìm thấy đơn hàng." });
      return true;
    }
    if (authUser.role === "provider") {
      const actor = await resolveActorContext(authUser, { useSupabase: false, db, client });
      if (!actor || !actor.providerId || String(bk.provider_id) !== String(actor.providerId)) {
        sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Đơn hàng này không thuộc phân công của bạn." });
        return true;
      }
    }
    const basePrice = Math.max(0, bk.total_amount - (bk.total_incidental || 0));
    bk.total_incidental = incidental;
    bk.total_amount = basePrice + incidental;
    if (notes) {
      bk.notes = (bk.notes ? bk.notes + "\n" : "") + `[Phát sinh: ${incidental.toLocaleString("vi-VN")} đ] ${notes}`;
    }
    bk.updated_at = new Date().toISOString();
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, booking: normalizeBookingRecord(bk) });
    return true;
  }

  // POST /api/rpc/auto-expire
  if (method === "POST" && pathname === "/api/rpc/auto-expire") {
    const expiredCount = await autoExpirePendingBookings(db, isProd, client);
    sendJson(res, 200, {
      ok: true,
      message: `Đã kiểm tra và tự động hủy ${expiredCount} đơn hàng pending quá 24h.`,
      expired_count: expiredCount
    });
    return true;
  }

  return false;
}

module.exports = handleBookingRoutes;
