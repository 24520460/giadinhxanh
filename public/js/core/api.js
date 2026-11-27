import { formatMoney } from "./formatters.js";
import { go } from "./router.js";
import { state } from "./state.js";
import { fetchNotifications } from "../shared/notifications.js";
import { showToast } from "../shared/ui-utils.js";

// --- BACKEND API & SUPABASE (.env.local) CLIENT HELPER ---
export async function apiRequest(endpoint, options = {}) {
  try {
    const sep = endpoint.includes("?") ? "&" : "?";
    const modeParam = state.isProduction ? `${sep}mode=production` : "";
    const headers = {
      "Content-Type": "application/json",
      ...(state.isProduction ? { "x-gdx-mode": "production" } : {}),
      ...(state.authToken
        ? { Authorization: `Bearer ${state.authToken}` }
        : {}),
      ...options.headers,
    };
    const res = await fetch(endpoint + modeParam, {
      headers,
      ...options,
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function syncActiveIdentityWithDb() {
  if (state.isProduction || state.currentUser) return;
  const db = window.GDX_DB;
  if (!db) return;

  if (Array.isArray(db.services) && db.services.length > 0) {
    const hasSel = db.services.some(
      (s) => String(s.service_id) === String(state.selectedServiceId),
    );
    if (!hasSel) {
      state.selectedServiceId = db.services[0].service_id;
    }
  }

  if (
    Array.isArray(db.customer_profiles) &&
    db.customer_profiles.length > 0
  ) {
    const matchCp = db.customer_profiles.find(
      (c) => String(c.customer_id) === String(state.activeCustomerId),
    );
    if (!matchCp) {
      state.activeCustomerId = db.customer_profiles[0].customer_id;
      if (state.currentPortal === 1 && db.customer_profiles[0].user_id) {
        state.activeUserId = db.customer_profiles[0].user_id;
      }
    }
  }

  if (
    Array.isArray(db.provider_profiles) &&
    db.provider_profiles.length > 0
  ) {
    const matchPp = db.provider_profiles.find(
      (p) => String(p.provider_id) === String(state.activeProviderId),
    );
    if (!matchPp) {
      state.activeProviderId = db.provider_profiles[0].provider_id;
      if (state.currentPortal === 2 && db.provider_profiles[0].user_id) {
        state.activeUserId = db.provider_profiles[0].user_id;
      }
    }
  }

  if (
    Array.isArray(db.company_profiles) &&
    db.company_profiles.length > 0
  ) {
    const matchComp = db.company_profiles.find(
      (c) => String(c.company_id) === String(state.activeCompanyId),
    );
    if (!matchComp) {
      state.activeCompanyId = db.company_profiles[0].company_id;
      if (state.currentPortal === 4 && db.company_profiles[0].user_id) {
        state.activeUserId = db.company_profiles[0].user_id;
      }
    }
  }
}

export async function refreshDemoToken(role) {
  if (state.isProduction || (state.currentUser && state.viewMode !== "dev")) return;
  const res = await apiRequest("/api/auth/demo-session", {
    method: "POST",
    body: JSON.stringify({ role }),
  });
  if (res && res.ok && res.token) {
    state.authToken = res.token;
    if (res.user) {
      state.activeUserId = res.user.user_id;
      state.userRole = res.user.role;
    }
    if (
      state.viewMode === "dev" &&
      (state.currentScreen === "2.1" || state.currentScreen === "2.2") &&
      state.userRole === "provider"
    ) {
      go(state.currentScreen, state.currentRouteParams || {}, { skipHistory: true });
    }
  }
}

export async function syncWithBackend() {
  state.customerServiceLoadStatus = "loading";
  const [statusRes, bootRes] = await Promise.all([
    apiRequest("/api/status"),
    apiRequest("/api/bootstrap"),
  ]);

  if (statusRes && statusRes.ok) {
    state.backendStatus = statusRes;
    if (statusRes.isProduction) {
      state.isProduction = true;
      if (state.viewMode !== "dev") {
        state.viewMode = "production";
      }
    }
    const dot = document.getElementById("backendConnDot");
    const label = document.getElementById("backendConnLabel");
    if (dot && label) {
      dot.className = "status-dot is-online";
      if (state.isProduction) {
        label.textContent = statusRes.supabaseReachable
          ? "Production · Supabase Live"
          : "Production · Cold Start";
      } else {
        label.textContent = statusRes.supabaseReachable
          ? "Supabase · Connected"
          : "API · .env.local";
      }
    }
  }

  const hasServiceData = Boolean(
    bootRes &&
    bootRes.ok &&
    bootRes.db &&
    Array.isArray(bootRes.db.services),
  );
  state.customerServiceLoadError = hasServiceData
    ? null
    : (bootRes && bootRes.error) ||
      "Không thể tải danh sách dịch vụ từ máy chủ.";
  state.customerServiceLoadStatus = hasServiceData ? "loaded" : "error";

  if (hasServiceData) {
    const db = window.GDX_DB;
    const remote = bootRes.db;

    if (state.isProduction) {
      // Zero Mock Data: Dọn sạch mọi dữ liệu mẫu giả định
      const mockTables = [
        "users",
        "customer_profiles",
        "company_profiles",
        "provider_profiles",
        "provider_services",
        "provider_areas",
        "availability_schedules",
        "availability_exceptions",
        "bookings",
        "booking_status_history",
        "reviews",
        "favorites",
        "support_tickets",
      ];
      mockTables.forEach((t) => {
        db[t] = [];
      });
      db.provider_public_profiles = [];
    }

    const tables = [
      "province",
      "provinces",
      "ward",
      "wards",
      "users",
      "customer_profiles",
      "company_profiles",
      "provider_profiles",
      "service_categories",
      "services",
      "provider_services",
      "provider_areas",
      "availability_schedules",
      "availability_exceptions",
      "bookings",
      "booking_status_history",
      "reviews",
      "favorites",
      "support_tickets",
      "customer_addresses",
      "ticket_messages",
      "notifications",
      "audit_logs",
      "ai_conversations",
      "ai_messages",
    ];
    tables.forEach((t) => {
      if (Array.isArray(remote[t])) {
        if (t === "service_categories") {
          db[t] = remote[t]
            .filter((c) => {
              const n = (c.category_name || c.name || "").toLowerCase();
              const slug = (c.slug || "").toLowerCase();
              return (
                !n.includes("repair") &&
                !n.includes("sửa") &&
                !slug.includes("repair") &&
                !n.includes("archived")
              );
            })
            .map((c) => ({ ...c, name: c.category_name || c.name }));
        } else if (t === "services") {
          db[t] = remote[t]
            .filter((s) => {
              const title = (s.title || "").toLowerCase();
              return (
                !title.includes("repair") &&
                !title.includes("sửa") &&
                !title.includes("appliance")
              );
            })
            .map((s) => {
              const title = (s.title || "").toLowerCase();
              let img = s.image_url;
              if (!img) {
                if (title.includes("nấu") || title.includes("cơm"))
                  img = "/assets/cooking-family-meal.jpg";
                else if (
                  title.includes("đầu bếp") ||
                  title.includes("tiệc")
                )
                  img = "/assets/cooking-chef-prep.jpg";
                else if (
                  title.includes("deep") ||
                  title.includes("sâu") ||
                  title.includes("tổng vệ sinh")
                )
                  img = "/assets/cleaning-deep.jpg";
                else img = "/assets/cleaning-livingroom.jpg";
              }
              return { ...s, image_url: img };
            });
        } else if (t === "bookings") {
          db[t] = remote[t].map((b) => {
            if (
              b.notes &&
              b.notes.includes("[BROADCAST_POOL]") &&
              b.status === "pending"
            ) {
              return {
                ...b,
                provider_id: null,
                dispatch_type: "broadcast",
              };
            }
            return b;
          });
        } else {
          db[t] = remote[t];
        }
      }
    });

    // Đồng bộ alias 2 chiều giữa province / provinces và ward / wards
    if (Array.isArray(remote.provinces) && remote.provinces.length > 0) {
      db.province = remote.provinces;
      db.provinces = remote.provinces;
    } else if (
      Array.isArray(remote.province) &&
      remote.province.length > 0
    ) {
      db.provinces = remote.province;
    }
    if (Array.isArray(remote.wards) && remote.wards.length > 0) {
      db.ward = remote.wards;
      db.wards = remote.wards;
    } else if (Array.isArray(remote.ward) && remote.ward.length > 0) {
      db.wards = remote.ward;
    }

    if (Array.isArray(remote.provider_public_profiles)) {
      db.provider_public_profiles = remote.provider_public_profiles;
    }

    // Khôi phục phiên đăng nhập thực tế từ localStorage nếu có
    try {
      const savedUserRaw = localStorage.getItem("gdx_auth_user");
      const savedToken = localStorage.getItem("gdx_auth_token");
      if (savedToken) state.authToken = savedToken;
      if (savedUserRaw) {
        const savedUser = JSON.parse(savedUserRaw);
        const found = (db.users || []).find(
          (u) => u.user_id === savedUser.user_id,
        );
        state.currentUser = found || savedUser;
        state.activeUserId = (found || savedUser).user_id;
        state.userRole = (found || savedUser).role;
        const cp = (db.customer_profiles || []).find(
          (c) => String(c.user_id) === String(state.activeUserId),
        );
        if (cp) {
          state.activeCustomerId = cp.customer_id;
          state.wizardDraft.ward_id = cp.ward_id;
          state.wizardDraft.address = cp.default_address;
          state.wizardDraft.latitude = cp.latitude;
          state.wizardDraft.longitude = cp.longitude;
        }
        const pp = (db.provider_profiles || []).find(
          (p) => String(p.user_id) === String(state.activeUserId),
        );
        if (pp) state.activeProviderId = pp.provider_id;
        const comp = (db.company_profiles || []).find(
          (c) => String(c.user_id) === String(state.activeUserId),
        );
        if (comp) state.activeCompanyId = comp.company_id;
      }
    } catch (_) {}

    syncActiveIdentityWithDb();
    fetchNotifications();
  } else {
    window.GDX_DB.services = [];
  }
  go(state.currentScreen, state.currentRouteParams || {}, {
    skipHistory: true,
  });
}

export async function refreshCustomerServices() {
  state.customerServiceLoadStatus = "loading";
  state.customerServiceLoadError = null;
  window.GDX_DB.services = [];
  go(state.currentScreen, state.currentRouteParams || {});
  await syncWithBackend();
  if (state.customerServiceLoadError) {
    showToast(state.customerServiceLoadError);
  }
}


// --- SUPABASE RPC EXECUTION ---
export const RPC = {
  transitionBookingStatus(bookingId, newStatus, reason) {
    const db = window.GDX_DB;
    const b = db.bookings.find(
      (item) => item.booking_id === Number(bookingId),
    );
    if (!b)
      return {
        success: false,
        message: `Không tìm thấy đơn hàng #${bookingId}`,
      };
    const prevStatus = b.status;
    b.status = newStatus;
    b.updated_at = new Date().toISOString();

    db.booking_status_history.unshift({
      history_id: Date.now(),
      booking_id: b.booking_id,
      previous_status: prevStatus,
      new_status: newStatus,
      changed_by: state.activeUserId,
      reason: reason || "Chuyển trạng thái theo quy trình tác nghiệp",
      created_at: new Date().toISOString(),
    });

    apiRequest("/api/rpc/transition-status", {
      method: "POST",
      body: JSON.stringify({
        booking_id: b.booking_id,
        new_status: newStatus,
        reason: reason || "Chuyển trạng thái theo quy trình tác nghiệp",
        changed_by: state.activeUserId,
      }),
    });

    return { success: true, booking: b, prevStatus, newStatus };
  },

  updateIncidentalCost(bookingId, incidentalCost, note) {
    const db = window.GDX_DB;
    const b = db.bookings.find(
      (item) => item.booking_id === Number(bookingId),
    );
    if (!b)
      return {
        success: false,
        message: `Không tìm thấy đơn hàng #${bookingId}`,
      };

    const cost = Number(incidentalCost) || 0;
    const basePrice = Math.max(0, b.total_amount - b.total_incidental);
    const newTotal = basePrice + cost;

    b.total_incidental = cost;
    b.total_amount = newTotal;
    b.updated_at = new Date().toISOString();
    if (note) {
      b.notes =
        (b.notes ? b.notes + "\n" : "") +
        `[Phát sinh: ${formatMoney(cost)}] ${note}`;
    }

    db.booking_status_history.unshift({
      history_id: Date.now(),
      booking_id: b.booking_id,
      previous_status: b.status,
      new_status: b.status,
      changed_by: state.activeUserId,
      reason: `Cập nhật chi phí phát sinh: ${formatMoney(cost)} -> Tổng mới: ${formatMoney(newTotal)}. Lý do: ${note || "Vật tư bổ sung"}`,
      created_at: new Date().toISOString(),
    });

    apiRequest("/api/rpc/update-incidental", {
      method: "POST",
      body: JSON.stringify({
        booking_id: b.booking_id,
        total_incidental: cost,
        notes: note,
        changed_by: state.activeUserId,
      }),
    });

    return {
      success: true,
      total_incidental: cost,
      total_amount: newTotal,
    };
  },

  confirmPayment(bookingId, method = "DIRECT_CONFIRM") {
    const db = window.GDX_DB;
    const b = db.bookings.find(
      (item) => item.booking_id === Number(bookingId),
    );
    if (!b)
      return {
        success: false,
        message: `Không tìm thấy đơn hàng #${bookingId}`,
      };

    b.payment_status = "paid";
    b.updated_at = new Date().toISOString();

    db.booking_status_history.unshift({
      history_id: Date.now(),
      booking_id: b.booking_id,
      previous_status: b.status,
      new_status: b.status,
      changed_by: state.activeUserId,
      reason: `Khách hàng xác nhận đã thanh toán ${formatMoney(b.total_amount)} (${method})`,
      created_at: new Date().toISOString(),
    });

    apiRequest("/api/rpc/confirm-payment", {
      method: "POST",
      body: JSON.stringify({
        booking_id: b.booking_id,
        changed_by: state.activeUserId,
      }),
    });

    return { success: true, booking: b };
  },

  adminAdjustPaymentAndRefund(
    bookingId,
    incidental,
    total,
    paymentStatus,
    bookingStatus,
    reason,
    newProviderId,
  ) {
    const db = window.GDX_DB;
    const b = db.bookings.find(
      (item) => item.booking_id === Number(bookingId),
    );
    if (!b)
      return {
        success: false,
        message: `Không tìm thấy đơn hàng #${bookingId}`,
      };

    const prevStatus = b.status;
    const prevPay = b.payment_status;

    if (incidental !== undefined && incidental !== "")
      b.total_incidental = Number(incidental);
    if (total !== undefined && total !== "") b.total_amount = Number(total);
    if (paymentStatus) b.payment_status = paymentStatus;
    if (bookingStatus) b.status = bookingStatus;
    if (newProviderId) b.provider_id = Number(newProviderId);
    b.updated_at = new Date().toISOString();

    db.booking_status_history.unshift({
      history_id: Date.now(),
      booking_id: b.booking_id,
      previous_status: prevStatus,
      new_status: b.status,
      changed_by: state.activeUserId,
      reason: `[ADMIN ADJUSTMENT] TT Thanh toán: ${prevPay} -> ${b.payment_status} | Tổng tiền: ${formatMoney(b.total_amount)} | Lý do: ${reason}`,
      created_at: new Date().toISOString(),
    });

    apiRequest("/api/rpc/admin-adjust", {
      method: "POST",
      body: JSON.stringify({
        booking_id: b.booking_id,
        total_incidental: b.total_incidental,
        total_amount: b.total_amount,
        payment_status: b.payment_status,
        status: b.status,
        provider_id: b.provider_id,
        reason,
      }),
    });

    return { success: true, booking: b };
  },
};


export function refreshClientPublicProviders() {
  const db = window.GDX_DB;
  if (!db) return;
  const users = db.users || [];
  const companies = db.company_profiles || [];
  db.provider_public_profiles = (db.provider_profiles || [])
    .filter((p) => p.verification_status === "verified")
    .filter((p) => {
      const u = users.find((x) => String(x.user_id) === String(p.user_id));
      if (u && u.is_active === false) return false;
      if (p.company_id != null) {
        const comp = companies.find(
          (c) => Number(c.company_id) === Number(p.company_id),
        );
        if (!comp || comp.verification_status !== "verified") return false;
        const compUser = users.find(
          (x) => String(x.user_id) === String(comp.user_id),
        );
        if (compUser && compUser.is_active === false) return false;
      }
      return true;
    })
    .map((p) => {
      const u = users.find((x) => String(x.user_id) === String(p.user_id));
      const comp = companies.find(
        (c) => Number(c.company_id) === Number(p.company_id),
      );
      return {
        provider_id: p.provider_id,
        user_id: p.user_id,
        company_id: p.company_id || null,
        company_name: comp ? comp.company_name : null,
        full_name: u ? u.full_name : "Đối tác",
        avatar_url: p.avatar_url,
        info: p.info,
        average_rating: p.average_rating,
        total_reviews: p.total_reviews,
        is_available_online: p.is_available_online,
        verification_status: p.verification_status,
      };
    });
}

