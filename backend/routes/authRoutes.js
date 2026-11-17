const crypto = require("crypto");
const { parseBody, sendJson } = require("../utils/http");
const { isValidPhoneVN, isValidEmail } = require("../utils/validators");
const { signAuthToken } = require("../middleware/auth");
const { saveLocalDb } = require("../db/localStore");

async function handleAuthRoutes(ctx) {
  const { req, res, method, pathname, isProd, db, client, config } = ctx;

  // POST /api/auth/register
  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await parseBody(req);
    const fullName = String(body.full_name || "").trim();
    const phone = String(body.phone_number || "").trim();
    const email = String(body.email || "").trim();
    const password = String(body.password || "").trim();
    const role = body.role === "provider" ? "provider" : "customer";

    if (!fullName || !phone) {
      sendJson(res, 400, { ok: false, error: "Họ tên và số điện thoại là bắt buộc." });
      return true;
    }
    if (!isValidPhoneVN(phone)) {
      sendJson(res, 400, {
        ok: false,
        error: "Số điện thoại không hợp lệ (cần 10–11 chữ số và bắt đầu bằng số 0)."
      });
      return true;
    }
    if (email && !isValidEmail(email)) {
      sendJson(res, 400, { ok: false, error: "Địa chỉ email không đúng định dạng." });
      return true;
    }
    if (!password || password.length < 6) {
      sendJson(res, 400, {
        ok: false,
        error: "Mật khẩu là bắt buộc và phải có tối thiểu 6 ký tự."
      });
      return true;
    }

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }
      const { data: existingUser } = await client
        .from("users")
        .select("user_id")
        .eq("phone_number", phone)
        .maybeSingle();
      if (existingUser) {
        sendJson(res, 409, { ok: false, error: "Số điện thoại đã tồn tại trong cơ sở dữ liệu Supabase." });
        return true;
      }

      const userEmail = email || `${phone}@giadinhxanh.vn`;
      let authUserId = null;

      if (client.auth && client.auth.admin && config.supabaseServiceKey) {
        const { data: authData, error: authErr } = await client.auth.admin.createUser({
          email: userEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, phone_number: phone, role }
        });
        if (authErr) {
          if (authErr.message && authErr.message.toLowerCase().includes("already been registered")) {
            const { data: listData } = await client.auth.admin.listUsers();
            const found = listData && listData.users ? listData.users.find((u) => u.email === userEmail) : null;
            if (found) authUserId = found.id;
          }
          if (!authUserId) {
            sendJson(res, 400, { ok: false, error: `Lỗi Supabase Auth: ${authErr.message}` });
            return true;
          }
        } else if (authData && authData.user) {
          authUserId = authData.user.id;
        }
      } else if (client.auth && client.auth.signUp) {
        const { data: authData, error: authErr } = await client.auth.signUp({
          email: userEmail,
          password,
          options: { data: { full_name: fullName, phone_number: phone, role } }
        });
        if (authErr) {
          sendJson(res, 400, { ok: false, error: `Lỗi Supabase Auth: ${authErr.message}` });
          return true;
        }
        if (authData && authData.user) {
          authUserId = authData.user.id;
        }
      }

      if (!authUserId) authUserId = crypto.randomUUID();

      const nowIso = new Date().toISOString();
      const publicUserRow = {
        user_id: authUserId,
        full_name: fullName,
        phone_number: phone,
        role,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso
      };

      const { data: created, error: insErr } = await client.from("users").insert([publicUserRow]).select().single();
      if (insErr) {
        sendJson(res, 500, { ok: false, error: `Lỗi tạo tài khoản Supabase: ${insErr.message}` });
        return true;
      }

      const finalUser = { ...(created || publicUserRow), email: userEmail };
      sendJson(res, 201, {
        ok: true,
        token: signAuthToken(finalUser),
        user: finalUser
      });
      return true;
    }

    // Local mode
    if (db.users.some((u) => u.phone_number === phone)) {
      sendJson(res, 409, { ok: false, error: "Số điện thoại đã tồn tại (UNIQUE constraint)." });
      return true;
    }

    const newUserId = "a0000000-0000-4000-8000-" + String(Date.now()).slice(-12).padStart(12, "0");
    const nowIso = new Date().toISOString();
    const newUser = {
      user_id: newUserId,
      full_name: fullName,
      phone_number: phone,
      email: email || `${phone}@giadinhxanh.vn`,
      password,
      role,
      is_active: true,
      created_at: nowIso,
      updated_at: nowIso
    };
    db.users.push(newUser);
    saveLocalDb(db);

    const safeUser = {
      user_id: newUser.user_id,
      full_name: newUser.full_name,
      phone_number: newUser.phone_number,
      email: newUser.email,
      role: newUser.role,
      is_active: newUser.is_active,
      created_at: newUser.created_at,
      updated_at: newUser.updated_at
    };
    sendJson(res, 201, {
      ok: true,
      token: signAuthToken(safeUser),
      user: safeUser
    });
    return true;
  }

  // POST /api/auth/login
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await parseBody(req);
    const identifier = String(body.identifier || "").trim();
    const password = String(body.password || "").trim();

    if (!identifier || !password) {
      sendJson(res, 400, {
        ok: false,
        error: "Vui lòng nhập tài khoản (số điện thoại hoặc email) và mật khẩu."
      });
      return true;
    }

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }

      let targetEmail = identifier.includes("@") ? identifier : null;
      let matchedUser = null;

      if (!targetEmail) {
        const { data: uByPhone } = await client
          .from("users")
          .select("*")
          .eq("phone_number", identifier)
          .maybeSingle();

        if (uByPhone) {
          matchedUser = uByPhone;
          if (client.auth && client.auth.admin && config.supabaseServiceKey) {
            try {
              const { data: authInfo } = await client.auth.admin.getUserById(uByPhone.user_id);
              if (authInfo && authInfo.user && authInfo.user.email) {
                targetEmail = authInfo.user.email;
              }
            } catch (_) {}
          }
          if (!targetEmail) targetEmail = `${identifier}@giadinhxanh.vn`;
        } else {
          targetEmail = `${identifier}@giadinhxanh.vn`;
        }
      }

      let authUser = null;
      let sessionData = null;

      if (client.auth && client.auth.signInWithPassword) {
        const { data: signData, error: signErr } = await client.auth.signInWithPassword({
          email: targetEmail,
          password
        });

        if (signErr) {
          let retryErr = signErr;
          if (!identifier.includes("@") && targetEmail !== `${identifier}@giadinhxanh.vn`) {
            const { data: retryData, error: rErr } = await client.auth.signInWithPassword({
              email: `${identifier}@giadinhxanh.vn`,
              password
            });
            if (!rErr && retryData && retryData.user) {
              authUser = retryData.user;
              sessionData = retryData.session;
              retryErr = null;
            }
          }

          if (retryErr) {
            sendJson(res, 401, { ok: false, error: "Số điện thoại / email hoặc mật khẩu không chính xác." });
            return true;
          }
        } else if (signData && signData.user) {
          authUser = signData.user;
          sessionData = signData.session;
        }
      }

      const userId = (authUser && authUser.id) || (matchedUser && matchedUser.user_id);
      if (!matchedUser && userId) {
        const { data: u } = await client.from("users").select("*").eq("user_id", userId).maybeSingle();
        matchedUser = u;
      }

      if (!matchedUser) {
        sendJson(res, 404, { ok: false, error: "Không tìm thấy hồ sơ người dùng trong hệ thống." });
        return true;
      }

      let customerProfile = null;
      let providerProfile = null;
      if (matchedUser.role === "customer") {
        const { data: cp } = await client
          .from("customer_profiles")
          .select("*")
          .eq("user_id", matchedUser.user_id)
          .maybeSingle();
        customerProfile = cp;
      } else if (matchedUser.role === "provider") {
        const { data: pp } = await client
          .from("provider_profiles")
          .select("*")
          .eq("user_id", matchedUser.user_id)
          .maybeSingle();
        providerProfile = pp;
      }

      const finalUser = {
        ...matchedUser,
        email: (authUser && authUser.email) || targetEmail
      };
      sendJson(res, 200, {
        ok: true,
        token: signAuthToken(finalUser),
        user: finalUser,
        session: sessionData,
        customer_profile: customerProfile,
        provider_profile: providerProfile
      });
      return true;
    }

    // Local Mode
    const found = db.users.find((u) => u.phone_number === identifier || u.email === identifier);
    if (!found) {
      sendJson(res, 404, { ok: false, error: "Tài khoản không tồn tại trên hệ thống. Vui lòng đăng ký mới." });
      return true;
    }
    if (found.password && found.password !== password) {
      sendJson(res, 401, { ok: false, error: "Mật khẩu không chính xác. Vui lòng kiểm tra lại." });
      return true;
    }
    if (!found.password) {
      found.password = password;
      saveLocalDb(db);
    }

    const customerProfile = db.customer_profiles
      ? db.customer_profiles.find((c) => String(c.user_id) === String(found.user_id))
      : null;
    const providerProfile = db.provider_profiles
      ? db.provider_profiles.find((p) => String(p.user_id) === String(found.user_id))
      : null;

    const safeUser = {
      user_id: found.user_id,
      full_name: found.full_name,
      phone_number: found.phone_number,
      email: found.email,
      role: found.role,
      is_active: found.is_active,
      created_at: found.created_at,
      updated_at: found.updated_at
    };
    sendJson(res, 200, {
      ok: true,
      token: signAuthToken(safeUser),
      user: safeUser,
      customer_profile: customerProfile,
      provider_profile: providerProfile
    });
    return true;
  }

  // POST /api/auth/demo-session — Cấp phiên cho bộ chuyển vai trò nhanh (chỉ cho phép ở Local/Dev Mode)
  if (method === "POST" && pathname === "/api/auth/demo-session") {
    if (isProd) {
      sendJson(res, 403, { ok: false, error: "Không hỗ trợ chuyển nhanh tài khoản demo ở Production Mode." });
      return true;
    }
    const body = await parseBody(req);
    const requestedRole = ["customer", "provider", "admin"].includes(body.role) ? body.role : "customer";
    const found = (db.users || []).find((u) => u.role === requestedRole) || {
      user_id:
        requestedRole === "admin"
          ? "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c99"
          : requestedRole === "provider"
          ? "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b21"
          : "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      role: requestedRole,
      full_name: "Demo User"
    };
    sendJson(res, 200, {
      ok: true,
      token: signAuthToken(found),
      user: {
        user_id: found.user_id,
        full_name: found.full_name,
        role: found.role
      }
    });
    return true;
  }

  // POST /api/onboarding/customer
  if (method === "POST" && pathname === "/api/onboarding/customer") {
    const body = await parseBody(req);
    const userId =
      body.user_id ||
      (db && db.session && db.session.customer_user_id) ||
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

    if (!userId) {
      sendJson(res, 400, { ok: false, error: "user_id là bắt buộc trong luồng onboarding." });
      return true;
    }

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }
      if (body.full_name || body.phone_number) {
        const updateFields = { updated_at: new Date().toISOString() };
        if (body.full_name) updateFields.full_name = String(body.full_name).trim();
        if (body.phone_number) updateFields.phone_number = String(body.phone_number).trim();
        await client.from("users").update(updateFields).eq("user_id", userId);
      }

      const { data: existingCp } = await client
        .from("customer_profiles")
        .select("customer_id")
        .eq("user_id", userId)
        .maybeSingle();
      let cpRow;
      if (existingCp) {
        const { data: upd, error: updErr } = await client
          .from("customer_profiles")
          .update({
            ward_id: String(body.ward_id || "27403"),
            default_address: String(body.default_address || "").trim(),
            latitude: Number(body.latitude) || 10.728912,
            longitude: Number(body.longitude) || 106.712405,
            updated_at: new Date().toISOString()
          })
          .eq("customer_id", existingCp.customer_id)
          .select()
          .single();
        if (updErr) {
          sendJson(res, 500, { ok: false, error: updErr.message });
          return true;
        }
        cpRow = upd;
      } else {
        const { data: ins, error: insErr } = await client
          .from("customer_profiles")
          .insert([
            {
              user_id: userId,
              ward_id: String(body.ward_id || "27403"),
              default_address: String(body.default_address || "").trim(),
              latitude: Number(body.latitude) || 10.728912,
              longitude: Number(body.longitude) || 106.712405
            }
          ])
          .select()
          .single();
        if (insErr) {
          sendJson(res, 500, { ok: false, error: insErr.message });
          return true;
        }
        cpRow = ins;
      }
      sendJson(res, 200, { ok: true, customer_profile: cpRow });
      return true;
    }

    // Local mode
    const u = db.users.find((x) => x.user_id === userId);
    if (u) {
      if (body.full_name) u.full_name = String(body.full_name).trim();
      if (body.phone_number) u.phone_number = String(body.phone_number).trim();
      u.updated_at = new Date().toISOString();
    }
    let cp = db.customer_profiles.find((x) => x.user_id === userId);
    if (cp) {
      if (body.ward_id) cp.ward_id = String(body.ward_id);
      if (body.default_address) cp.default_address = String(body.default_address).trim();
      if (body.latitude !== undefined) cp.latitude = Number(body.latitude);
      if (body.longitude !== undefined) cp.longitude = Number(body.longitude);
      cp.updated_at = new Date().toISOString();
    } else {
      const nextCid = Math.max(100, ...db.customer_profiles.map((c) => c.customer_id || 0)) + 1;
      cp = {
        customer_id: nextCid,
        user_id: userId,
        default_address: String(body.default_address || "").trim(),
        ward_id: String(body.ward_id || "27403"),
        latitude: Number(body.latitude) || 10.728912,
        longitude: Number(body.longitude) || 106.712405,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.customer_profiles.push(cp);
    }
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, customer_profile: cp, user: u });
    return true;
  }

  // POST /api/onboarding/provider
  if (method === "POST" && pathname === "/api/onboarding/provider") {
    const body = await parseBody(req);
    const idCard = String(body.id_card_number || "").trim();
    if (!idCard) {
      sendJson(res, 400, { ok: false, error: "Số CCCD (id_card_number) là bắt buộc." });
      return true;
    }

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }
      const userId = body.user_id;
      const { data: dup } = await client
        .from("provider_profiles")
        .select("provider_id, user_id")
        .eq("id_card_number", idCard)
        .maybeSingle();
      if (dup && dup.user_id !== userId) {
        sendJson(res, 409, { ok: false, error: "Số CCCD bị trùng với hồ sơ thợ khác trong Supabase." });
        return true;
      }

      const { data: pp, error: ppErr } = await client
        .from("provider_profiles")
        .upsert([
          {
            user_id: userId,
            id_card_number: idCard,
            info: String(body.info || "").trim(),
            avatar_url: String(body.avatar_url || "/assets/provider-lan.jpg").trim(),
            verification_status: "pending",
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (ppErr) {
        sendJson(res, 500, { ok: false, error: ppErr.message });
        return true;
      }
      sendJson(res, 200, { ok: true, provider_profile: pp });
      return true;
    }

    const targetProviderId = Number(body.provider_id || 204);
    const pp = db.provider_profiles.find((p) => p.provider_id === targetProviderId);
    if (pp) {
      const duplicate = db.provider_profiles.find(
        (p) => p.id_card_number === idCard && p.provider_id !== pp.provider_id
      );
      if (duplicate) {
        sendJson(res, 409, { ok: false, error: "Số CCCD bị trùng với hồ sơ thợ khác (UNIQUE)." });
        return true;
      }
      pp.id_card_number = idCard;
      if (body.info) pp.info = String(body.info).trim();
      if (body.avatar_url) pp.avatar_url = String(body.avatar_url).trim();
      pp.verification_status = "pending";
      pp.updated_at = new Date().toISOString();
    }
    saveLocalDb(db);
    sendJson(res, 200, { ok: true, provider_profile: pp });
    return true;
  }

  // PUT /api/profile/customer
  if (method === "PUT" && (pathname === "/api/profile/customer" || pathname === "/api/customer/profile")) {
    const body = await parseBody(req);
    const customerId = Number(body.customer_id);
    const userId = body.user_id ? String(body.user_id) : null;

    if (isProd) {
      if (!client) {
        sendJson(res, 503, { ok: false, error: "Không có kết nối Supabase ở Production Mode." });
        return true;
      }

      if (userId && (body.full_name || body.phone_number)) {
        const uFields = { updated_at: new Date().toISOString() };
        if (body.full_name) uFields.full_name = String(body.full_name).trim();
        if (body.phone_number) uFields.phone_number = String(body.phone_number).trim();
        await client.from("users").update(uFields).eq("user_id", userId);
      }

      const updateData = {
        ward_id: String(body.ward_id || "27403"),
        default_address: String(body.default_address || "").trim(),
        latitude: Number(body.latitude) || 10.728912,
        longitude: Number(body.longitude) || 106.712405,
        updated_at: new Date().toISOString()
      };

      let cpQuery = client.from("customer_profiles").update(updateData);
      if (customerId && !isNaN(customerId)) {
        cpQuery = cpQuery.eq("customer_id", customerId);
      } else if (userId) {
        cpQuery = cpQuery.eq("user_id", userId);
      } else {
        sendJson(res, 400, { ok: false, error: "Cần cung cấp customer_id hoặc user_id." });
        return true;
      }

      const { data: cp, error: cpErr } = await cpQuery.select().single();
      if (cpErr) {
        sendJson(res, 500, { ok: false, error: cpErr.message });
        return true;
      }
      sendJson(res, 200, { ok: true, customer_profile: cp });
      return true;
    }

    let cp =
      customerId && !isNaN(customerId)
        ? db.customer_profiles.find((c) => c.customer_id === customerId)
        : null;
    if (!cp && userId) {
      cp = db.customer_profiles.find((c) => c.user_id === userId);
    }
    if (!cp) {
      cp = db.customer_profiles[0];
    }
    if (!cp) {
      sendJson(res, 404, { ok: false, error: "Không tìm thấy hồ sơ khách hàng." });
      return true;
    }

    const u = db.users.find((x) => x.user_id === cp.user_id || x.user_id === userId);
    if (u) {
      if (body.full_name) u.full_name = String(body.full_name).trim();
      if (body.phone_number) u.phone_number = String(body.phone_number).trim();
      u.updated_at = new Date().toISOString();
    }
    if (body.ward_id) cp.ward_id = String(body.ward_id);
    if (body.default_address !== undefined) cp.default_address = String(body.default_address).trim();
    if (body.latitude !== undefined) cp.latitude = Number(body.latitude);
    if (body.longitude !== undefined) cp.longitude = Number(body.longitude);
    cp.updated_at = new Date().toISOString();

    saveLocalDb(db);
    sendJson(res, 200, { ok: true, user: u, customer_profile: cp });
    return true;
  }

  return false;
}

module.exports = handleAuthRoutes;
