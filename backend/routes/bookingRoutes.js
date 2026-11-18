const { parseBody, sendJson } = require("../utils/http");
const {
  isUuid,
  normalizeId,
  validateScheduledTime,
  validateNonNegativeAmount
} = require("../utils/validators");
const { requireAuth } = require("../middleware/auth");
const { saveLocalDb } = require("../db/localStore");
const { dispatchNotification, logAudit } = require("../services/auditService");
const { autoExpirePendingBookings } = require("../services/bookingService");

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
  const { req, res, method, pathname, isProd, db, client } = ctx;

  // POST /api/bookings — Tạo đơn đặt lịch mới
  if (method === "POST" && pathname === "/api/bookings") {
    const body = await parseBody(req);
    const address = String(body.address || "").trim();
    const wardId = String(body.ward_id || "27403").trim();
    const serviceId = normalizeId(body.service_id);
    const customerId = normalizeId(body.customer_id);
    const rawProviderId = body.provider_id;
    const isBroadcast =
      rawProviderId === null ||
      rawProviderId === undefined ||
      rawProviderId === "broadcast" ||
      String(rawProviderId).trim() === "";
    const providerId = isBroadcast ? null : normalizeId(rawProviderId);

    if (!serviceId || !wardId || !address || !customerId) {
      sendJson(res, 400, {
        ok: false,
        error: "Vui lòng điền đầy đủ dịch vụ, khách hàng, phường/xã và địa chỉ."
      });
      return true;
    }

    const schedCheck = validateScheduledTime(body.scheduled_time);
    if (!schedCheck.ok) {
      sendJson(res, 400, { ok: false, error: schedCheck.error });
      return true;
    }
    const scheduledIso = schedCheck.iso;

    if (body.total_amount !== undefined && body.total_amount !== null) {
      const amtCheck = validateNonNegativeAmount(body.total_amount, "Tổng tiền");
      if (!amtCheck.ok) {
        sendJson(res, 400, { ok: false, error: amtCheck.error });
        return true;
      }
    }

    const useSupabase = Boolean(client) && (isProd || isUuid(String(serviceId)) || isUuid(String(customerId)));

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

      let finalProvId = targetProvId;
      if (!finalProvId) {
        const { data: anyProv } = await client.from("provider_profiles").select("provider_id").limit(1).maybeSingle();
        finalProvId = anyProv ? anyProv.provider_id : "00000000-0000-4000-8000-000000000200";
      }

      let validWardId = wardId;
      let wardTarget = "ward";
      let { data: wardList, error: wErr } = await client.from("ward").select("ward_id").eq("ward_id", validWardId).limit(1);
      if (wErr) {
        wardTarget = "wards";
        const wRes = await client.from("wards").select("ward_id").eq("ward_id", validWardId).limit(1);
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
        latitude: Number(body.latitude) || 10.728912,
        longitude: Number(body.longitude) || 106.712405,
        total_amount: Number(body.total_amount) || 180000,
        total_incidental: 0,
        notes: (isBroadcast ? "[BROADCAST_POOL] " : "") + String(body.notes || "Khách đặt lịch qua hệ thống.").trim(),
        payment_status: "unpaid"
      };

      const { data: createdBk, error: bkErr } = await client.from("bookings").insert([newBk]).select().single();
      if (bkErr) {
        sendJson(res, 500, { ok: false, error: `Lỗi tạo đơn Supabase: ${bkErr.message}` });
        return true;
      }

      if (isBroadcast && createdBk) {
        createdBk.provider_id = null;
        createdBk.dispatch_type = "broadcast";
      }

      await client.from("booking_status_history").insert([
        {
          booking_id: createdBk.booking_id,
          previous_status: null,
          new_status: "pending",
          changed_by: isUuid(String(body.changed_by || "")) ? body.changed_by : null,
          reason: "Khách hàng tạo đơn đặt lịch"
        }
      ]);

      const { data: cp } = await client
        .from("customer_profiles")
        .select("user_id")
        .eq("customer_id", resolvedCustomerId)
        .maybeSingle();
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
        actor_id: body.changed_by || resolvedCustomerId,
        action: "CREATE_BOOKING",
        target_entity: "bookings",
        target_id: createdBk.booking_id,
        details: { service_id: serviceId, provider_id: targetProvId, total_amount: newBk.total_amount },
        isProd: true,
        client
      });

      sendJson(res, 201, { ok: true, booking: createdBk });
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
      latitude: Number(body.latitude) || 10.728912,
      longitude: Number(body.longitude) || 106.712405,
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
    const rawBookingId = acceptMatch[1];
    const body = await parseBody(req);
    const providerId = body.provider_id;
    const actorUserId = body.user_id || body.changed_by;

    if (isProd || (client && isUuid(rawBookingId))) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase." });
        return true;
      }
      const { data: curBk, error: fetchErr } = await client
        .from("bookings")
        .select("*")
        .eq("booking_id", rawBookingId)
        .single();
      if (fetchErr || !curBk) {
        sendJson(res, 404, { ok: false, error: "Không tìm thấy đơn hàng." });
        return true;
      }
      if (curBk.status !== "pending") {
        sendJson(res, 409, {
          ok: false,
          expired: true,
          error: "Rất tiếc! Đơn này vừa được một đối tác khác nhận trước hoặc đã hết hạn."
        });
        return true;
      }
      let resolvedProvId = providerId;
      if (!isUuid(String(providerId)) && !isProd) {
        resolvedProvId = await resolveSupabaseProviderId(client, providerId);
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
        .select()
        .single();
      if (updErr || !updatedBk) {
        sendJson(res, 409, {
          ok: false,
          expired: true,
          error: "Đơn hàng đã có người nhận trước hoặc không còn khả dụng."
        });
        return true;
      }
      await client.from("booking_status_history").insert([
        {
          booking_id: rawBookingId,
          previous_status: "pending",
          new_status: "confirmed",
          changed_by: isUuid(String(actorUserId || "")) ? actorUserId : null,
          reason: "Đối tác đã nhận việc từ Hòm thư việc làm"
        }
      ]);
      sendJson(res, 200, { ok: true, booking: updatedBk });
      return true;
    }

    const bookingId = Number(rawBookingId);
    const bk = db.bookings.find((b) => b.booking_id === bookingId);
    if (!bk) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy đơn hàng." });
      return true;
    }
    if (bk.status !== "pending") {
      sendJson(res, 409, {
        ok: false,
        expired: true,
        error: "Rất tiếc! Đơn này vừa được một đối tác khác nhận trước hoặc đã hết hạn."
      });
      return true;
    }

    const oldStatus = bk.status;
    bk.status = "confirmed";
    bk.provider_id = Number(providerId);
    bk.dispatch_type = "direct";
    bk.updated_at = new Date().toISOString();

    const nextHistoryId = Math.max(5000, ...db.booking_status_history.map((h) => h.history_id || 0)) + 1;
    const pp = (db.provider_profiles || []).find((p) => p.provider_id === Number(providerId));
    const resolvedActor = isUuid(String(actorUserId || ""))
      ? actorUserId
      : (pp && pp.user_id) || "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b21";
    const historyRow = {
      history_id: nextHistoryId,
      booking_id: bookingId,
      previous_status: oldStatus,
      new_status: "confirmed",
      changed_by: resolvedActor,
      reason: "Đối tác đã nhận việc từ Hòm thư việc làm",
      created_at: new Date().toISOString()
    };
    db.booking_status_history.unshift(historyRow);
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, booking: bk, history: historyRow });
    return true;
  }

  // POST /api/rpc/transition-status
  if (method === "POST" && pathname === "/api/rpc/transition-status") {
    const body = await parseBody(req);
    const bookingId = normalizeId(body.booking_id);
    const newStatus = String(body.new_status || "");
    const reason = String(body.reason || "Cập nhật trạng thái qua RPC").trim();
    const actorUserId = body.changed_by || null;

    if (isProd || (client && isUuid(String(bookingId)))) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase." });
        return true;
      }
      const { data: bk, error: bkErr } = await client
        .from("bookings")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("booking_id", bookingId)
        .select()
        .single();
      if (bkErr) {
        sendJson(res, 500, { ok: false, error: bkErr.message });
        return true;
      }
      await client.from("booking_status_history").insert([
        {
          booking_id: bookingId,
          new_status: newStatus,
          changed_by: isUuid(String(actorUserId || "")) ? actorUserId : null,
          reason
        }
      ]);
      sendJson(res, 200, { ok: true, booking: bk });
      return true;
    }

    const bk = db.bookings.find((b) => String(b.booking_id) === String(bookingId));
    if (!bk) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy đơn hàng." });
      return true;
    }

    const oldStatus = bk.status;
    bk.status = newStatus;
    bk.updated_at = new Date().toISOString();

    const nextHistoryId = Math.max(5000, ...db.booking_status_history.map((h) => h.history_id || 0)) + 1;
    const historyRow = {
      history_id: nextHistoryId,
      booking_id: bookingId,
      previous_status: oldStatus,
      new_status: newStatus,
      changed_by: actorUserId || "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      reason,
      created_at: new Date().toISOString()
    };
    db.booking_status_history.unshift(historyRow);
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, booking: bk, history: historyRow });
    return true;
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
    const reason = String(body.reason || "Khách hàng yêu cầu hủy đơn").trim();
    const actorId = body.user_id || body.changed_by || null;

    if (isProd || (client && isUuid(String(bookingId)))) {
      const { data: bk, error } = await client
        .from("bookings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("booking_id", bookingId)
        .select()
        .single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      await client.from("booking_status_history").insert([
        {
          booking_id: bookingId,
          previous_status: bk ? bk.status : null,
          new_status: "cancelled",
          changed_by: isUuid(String(actorId || "")) ? actorId : null,
          reason
        }
      ]);
      sendJson(res, 200, { ok: true, booking: bk });
      return true;
    }

    const bk = (db.bookings || []).find((b) => String(b.booking_id) === String(bookingId));
    if (!bk) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy đơn hàng." });
      return true;
    }
    const oldStatus = bk.status;
    bk.status = "cancelled";
    bk.updated_at = new Date().toISOString();
    const nextHistoryId = Math.max(5000, ...db.booking_status_history.map((h) => h.history_id || 0)) + 1;
    db.booking_status_history.unshift({
      history_id: nextHistoryId,
      booking_id: bookingId,
      previous_status: oldStatus,
      new_status: "cancelled",
      changed_by: actorId || "customer",
      reason,
      created_at: new Date().toISOString()
    });
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, booking: bk });
    return true;
  }

  // POST /api/bookings/:id/start
  const bkStartMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/start$/);
  if (method === "POST" && bkStartMatch) {
    const bookingId = normalizeId(bkStartMatch[1]);
    const body = await parseBody(req);
    const actorId = body.user_id || body.changed_by || null;

    if (isProd || (client && isUuid(String(bookingId)))) {
      const { data: bk, error } = await client
        .from("bookings")
        .update({ status: "in_progress", updated_at: new Date().toISOString() })
        .eq("booking_id", bookingId)
        .select()
        .single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      await client.from("booking_status_history").insert([
        {
          booking_id: bookingId,
          previous_status: "confirmed",
          new_status: "in_progress",
          changed_by: isUuid(String(actorId || "")) ? actorId : null,
          reason: "Thợ đã có mặt và bắt đầu công việc"
        }
      ]);
      sendJson(res, 200, { ok: true, booking: bk });
      return true;
    }

    const bk = (db.bookings || []).find((b) => String(b.booking_id) === String(bookingId));
    if (!bk) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy đơn hàng." });
      return true;
    }
    const oldStatus = bk.status;
    bk.status = "in_progress";
    bk.updated_at = new Date().toISOString();
    const nextHistoryId = Math.max(5000, ...db.booking_status_history.map((h) => h.history_id || 0)) + 1;
    db.booking_status_history.unshift({
      history_id: nextHistoryId,
      booking_id: bookingId,
      previous_status: oldStatus,
      new_status: "in_progress",
      changed_by: actorId || "provider",
      reason: "Thợ đã có mặt và bắt đầu công việc",
      created_at: new Date().toISOString()
    });
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, booking: bk });
    return true;
  }

  // POST /api/bookings/:id/complete
  const bkCompleteMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/complete$/);
  if (method === "POST" && bkCompleteMatch) {
    const bookingId = normalizeId(bkCompleteMatch[1]);
    const body = await parseBody(req);
    const actorId = body.user_id || body.changed_by || null;

    if (isProd || (client && isUuid(String(bookingId)))) {
      const { data: bk, error } = await client
        .from("bookings")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("booking_id", bookingId)
        .select()
        .single();
      if (error) {
        sendJson(res, 500, { ok: false, error: error.message });
        return true;
      }
      await client.from("booking_status_history").insert([
        {
          booking_id: bookingId,
          previous_status: "in_progress",
          new_status: "completed",
          changed_by: isUuid(String(actorId || "")) ? actorId : null,
          reason: "Thợ hoàn thành công việc"
        }
      ]);
      sendJson(res, 200, { ok: true, booking: bk });
      return true;
    }

    const bk = (db.bookings || []).find((b) => String(b.booking_id) === String(bookingId));
    if (!bk) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy đơn hàng." });
      return true;
    }
    const oldStatus = bk.status;
    bk.status = "completed";
    bk.updated_at = new Date().toISOString();
    const nextHistoryId = Math.max(5000, ...db.booking_status_history.map((h) => h.history_id || 0)) + 1;
    db.booking_status_history.unshift({
      history_id: nextHistoryId,
      booking_id: bookingId,
      previous_status: oldStatus,
      new_status: "completed",
      changed_by: actorId || "provider",
      reason: "Thợ hoàn thành công việc",
      created_at: new Date().toISOString()
    });

    const cp = (db.customer_profiles || []).find((c) => String(c.customer_id) === String(bk.customer_id));
    if (cp && cp.user_id) {
      dispatchNotification(db, {
        user_id: cp.user_id,
        title: "Đơn hàng đã hoàn thành!",
        body: `Đơn #${bookingId} đã được hoàn tất. Hãy dành 30 giây để đánh giá chất lượng thợ nhé!`,
        type: "booking_completed",
        link: `/bookings/${bookingId}/tracking`,
        isProd: false
      });
    }
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, booking: bk });
    return true;
  }

  // POST /api/bookings/:id/incidental
  const bkIncMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/incidental$/);
  if (method === "POST" && bkIncMatch) {
    const authUser = requireAuth(req, res, ["provider", "admin"]);
    if (!authUser) return true;

    const bookingId = normalizeId(bkIncMatch[1]);
    const body = await parseBody(req);
    const incCheck = validateNonNegativeAmount(body.total_incidental ?? body.incidental ?? 0, "Chi phí phát sinh");
    if (!incCheck.ok) {
      sendJson(res, 400, { ok: false, error: incCheck.error });
      return true;
    }
    const incidental = incCheck.value;
    const notes = String(body.notes || "").trim();

    const bk = (db.bookings || []).find((b) => String(b.booking_id) === String(bookingId));
    if (!bk) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy đơn hàng." });
      return true;
    }
    const basePrice = Math.max(0, bk.total_amount - (bk.total_incidental || 0));
    bk.total_incidental = incidental;
    bk.total_amount = basePrice + incidental;
    if (notes) {
      bk.notes = (bk.notes ? bk.notes + "\n" : "") + `[Phát sinh: ${incidental.toLocaleString("vi-VN")} đ] ${notes}`;
    }
    bk.updated_at = new Date().toISOString();
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, booking: bk });
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
