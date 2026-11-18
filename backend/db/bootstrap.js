const { getSupabaseClient } = require("../config/env");
const { ensureLocalDb, computeProviderPublicProfiles } = require("./localStore");

const BOOTSTRAP_TABLES = [
  "province",
  "ward",
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
  "ai_messages"
];

function normalizeAssetPath(url) {
  if (!url || typeof url !== "string") return url;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
    return url;
  }
  return "/" + url.replace(/^\.\//, "");
}

async function fetchSupabaseTable(client, tableName) {
  let target = tableName;
  let res = await client.from(target).select("*");
  if (res.error && (tableName === "province" || tableName === "provinces")) {
    target = tableName === "province" ? "provinces" : "province";
    res = await client.from(target).select("*");
  } else if (res.error && (tableName === "ward" || tableName === "wards")) {
    target = tableName === "ward" ? "wards" : "ward";
    res = await client.from(target).select("*");
  }

  if (res.error) {
    return { name: tableName, data: [], error: res.error };
  }

  let allData = res.data || [];
  if ((target === "ward" || target === "wards") && allData.length === 1000) {
    for (let page = 1; page < 6; page++) {
      const from = page * 1000;
      const to = from + 999;
      const { data: pageData, error: pageErr } = await client.from(target).select("*").range(from, to);
      if (pageErr || !pageData || pageData.length === 0) break;
      allData = allData.concat(pageData);
      if (pageData.length < 1000) break;
    }
  }

  return { name: tableName, data: allData, error: null };
}

function sanitizeServicesAndCategories(remoteDb) {
  if (!remoteDb) return;
  if (Array.isArray(remoteDb.service_categories)) {
    remoteDb.service_categories = remoteDb.service_categories.filter((c) => {
      const name = (c.category_name || c.name || "").toLowerCase();
      const slug = (c.slug || "").toLowerCase();
      if (name.includes("repair") || name.includes("sửa") || slug.includes("repair") || name.includes("archived")) {
        return false;
      }
      if (c.status === false) return false;
      return true;
    });
  }
  if (Array.isArray(remoteDb.services)) {
    remoteDb.services = remoteDb.services
      .filter((s) => {
        const t = (s.title || "").toLowerCase();
        return !(t.includes("repair") || t.includes("sửa") || t.includes("appliance"));
      })
      .map((s) => {
        const t = (s.title || "").toLowerCase();
        let img = s.image_url;
        if (!img) {
          if (t.includes("nấu") || t.includes("cơm")) img = "/assets/cooking-family-meal.jpg";
          else if (t.includes("đầu bếp") || t.includes("tiệc")) img = "/assets/cooking-chef-prep.jpg";
          else if (t.includes("deep") || t.includes("sâu") || t.includes("tổng vệ sinh")) img = "/assets/cleaning-deep.jpg";
          else img = "/assets/cleaning-livingroom.jpg";
        }
        return { ...s, image_url: normalizeAssetPath(img) };
      });
  }
  if (Array.isArray(remoteDb.provider_profiles)) {
    remoteDb.provider_profiles.forEach((p) => {
      if (p.avatar_url) p.avatar_url = normalizeAssetPath(p.avatar_url);
    });
  }
  if (Array.isArray(remoteDb.bookings)) {
    remoteDb.bookings.forEach((b) => {
      if (b.notes && b.notes.includes("[BROADCAST_POOL]") && b.status === "pending") {
        b.provider_id = null;
        b.dispatch_type = "broadcast";
      }
    });
  }
}

async function fetchBootstrapData(isProd = false) {
  const { client, config } = getSupabaseClient();

  if (isProd) {
    if (!client) {
      return {
        ok: false,
        mode: "production",
        isProduction: true,
        connected: false,
        error:
          "Production Mode (Zero Mock Data) yêu cầu kết nối Supabase trực tiếp. Vui lòng cấu hình NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY."
      };
    }

    try {
      const results = await Promise.all(BOOTSTRAP_TABLES.map((t) => fetchSupabaseTable(client, t)));
      const hasError = results.find((r) => r.error);
      if (hasError) {
        return {
          ok: false,
          mode: "production",
          isProduction: true,
          connected: false,
          error: `Lỗi truy vấn Supabase trong Production Mode: ${hasError.error.message}`
        };
      }

      const remoteDb = {};
      results.forEach((r) => {
        remoteDb[r.name] = r.data || [];
      });
      remoteDb.provinces = remoteDb.province;
      remoteDb.wards = remoteDb.ward;
      sanitizeServicesAndCategories(remoteDb);
      remoteDb.session = null;
      remoteDb.provider_public_profiles = computeProviderPublicProfiles(remoteDb);

      return {
        ok: true,
        mode: "production",
        isProduction: true,
        connected: true,
        supabaseUrl: config.supabaseUrl,
        data: remoteDb
      };
    } catch (err) {
      return {
        ok: false,
        mode: "production",
        isProduction: true,
        connected: false,
        error: `Lỗi kết nối Supabase trong Production Mode: ${err.message}`
      };
    }
  }

  const localDb = ensureLocalDb();
  if (client) {
    try {
      const results = await Promise.all(BOOTSTRAP_TABLES.map((t) => fetchSupabaseTable(client, t)));
      const hasError = results.some((r) => r.error && r.name !== "company_profiles");
      if (!hasError) {
        const remoteDb = { session: localDb.session };
        results.forEach((r) => {
          if (r.name === "company_profiles" && (r.error || !Array.isArray(r.data) || r.data.length === 0)) {
            remoteDb.company_profiles = localDb.company_profiles || [];
          } else {
            remoteDb[r.name] = r.data || [];
          }
        });
        // Hybrid backfill for B2B2C company_id if Supabase has not migrated company_schema_migration.sql yet
        const seedCompanyMapProv = new Map((localDb.provider_profiles || []).map((p) => [Number(p.provider_id), p.company_id]));
        const seedCompanyMapSvc = new Map((localDb.services || []).map((s) => [Number(s.service_id), s.company_id]));
        const seedCompanyMapBk = new Map((localDb.bookings || []).map((b) => [Number(b.booking_id), b.company_id]));
        (remoteDb.provider_profiles || []).forEach((p, idx) => {
          if (p.company_id == null) {
            p.company_id = seedCompanyMapProv.get(Number(p.provider_id)) ?? (idx % 2 === 0 ? 501 : 502);
          }
        });
        (remoteDb.services || []).forEach((s, idx) => {
          if (s.company_id == null) {
            s.company_id = seedCompanyMapSvc.get(Number(s.service_id)) ?? (idx % 2 === 0 ? 501 : 502);
          }
        });
        (remoteDb.bookings || []).forEach((b) => {
          if (b.company_id == null && seedCompanyMapBk.has(Number(b.booking_id))) {
            b.company_id = seedCompanyMapBk.get(Number(b.booking_id));
          }
        });
        const existingUserIds = new Set((remoteDb.users || []).map((u) => String(u.user_id)));
        (localDb.users || []).forEach((u) => {
          if (u.role === "company" && !existingUserIds.has(String(u.user_id))) {
            remoteDb.users.push(u);
          }
        });
        remoteDb.provinces = remoteDb.province;
        remoteDb.wards = remoteDb.ward;
        sanitizeServicesAndCategories(remoteDb);

        if ((remoteDb.province || []).length > 0 && (remoteDb.services || []).length > 0) {
          remoteDb.provider_public_profiles = computeProviderPublicProfiles(remoteDb);
          return {
            ok: true,
            mode: "supabase",
            connected: true,
            isProduction: false,
            supabaseUrl: config.supabaseUrl,
            data: remoteDb
          };
        }
      }
    } catch (_) {}
  }

  sanitizeServicesAndCategories(localDb);
  localDb.provider_public_profiles = computeProviderPublicProfiles(localDb);
  return {
    ok: true,
    mode: client ? "supabase_unseeded_fallback" : "local_sql_store",
    connected: Boolean(client),
    isProduction: false,
    supabaseUrl: config.supabaseUrl || null,
    data: localDb
  };
}

module.exports = {
  fetchSupabaseTable,
  sanitizeServicesAndCategories,
  fetchBootstrapData
};
