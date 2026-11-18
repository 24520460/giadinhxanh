const fs = require("fs");
const path = require("path");
const { ROOT_DIR } = require("../config/env");
const dbSeedModule = require(path.join(ROOT_DIR, "public", "db-mock.js"));

const DATA_DIR = path.join(ROOT_DIR, "backend", "data");
const LOCAL_DB_PATH = path.join(DATA_DIR, "local-db.json");

let inMemoryDb = null;

function createInitialDatabase() {
  if (typeof dbSeedModule.createInitialStore === "function") {
    return dbSeedModule.createInitialStore();
  }
  return dbSeedModule;
}

function ensureLocalDb() {
  if (inMemoryDb) {
    return inMemoryDb;
  }

  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, "utf8");
      const parsed = JSON.parse(raw);
      const initial = createInitialDatabase();
      let updated = false;
      for (const key of Object.keys(initial)) {
        if (!parsed[key] && Array.isArray(initial[key])) {
          parsed[key] = initial[key];
          updated = true;
        }
      }
      if (updated) {
        try {
          fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(parsed, null, 2), "utf8");
        } catch (_) {}
      }
      inMemoryDb = parsed;
      return inMemoryDb;
    }
  } catch (e) {
    console.warn("[LocalDB] Không đọc được file, dùng in-memory fallback:", e.message);
  }

  inMemoryDb = createInitialDatabase();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(inMemoryDb, null, 2), "utf8");
  } catch (_) {}

  return inMemoryDb;
}

function saveLocalDb(db) {
  inMemoryDb = db;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (_) {}
}

function resetLocalDb() {
  const fresh = createInitialDatabase();
  saveLocalDb(fresh);
  return fresh;
}

/**
 * View: provider_public_profiles (ẩn id_card_number, chỉ trả về verified + is_active).
 */
function computeProviderPublicProfiles(db) {
  return (db.provider_profiles || [])
    .filter((pp) => {
      const u = (db.users || []).find((x) => x.user_id === pp.user_id);
      const comp = (db.company_profiles || []).find((c) => String(c.company_id) === String(pp.company_id));
      const compOk = !comp || comp.verification_status === "verified";
      return pp.verification_status === "verified" && u && u.is_active === true && compOk;
    })
    .map((pp) => {
      const u = (db.users || []).find((x) => x.user_id === pp.user_id);
      const comp = (db.company_profiles || []).find((c) => String(c.company_id) === String(pp.company_id));
      return {
        provider_id: pp.provider_id,
        user_id: pp.user_id,
        company_id: pp.company_id || null,
        company_name: comp ? comp.company_name : "Công ty Đối tác Gia Đình Xanh",
        full_name: u ? u.full_name : "Thợ Gia Đình Xanh",
        avatar_url: pp.avatar_url,
        info: pp.info,
        verification_status: pp.verification_status,
        average_rating: pp.average_rating,
        total_reviews: pp.total_reviews,
        lattitude: pp.lattitude,
        longtitude: pp.longtitude,
        is_available_online: pp.is_available_online
      };
    });
}

function recomputeProviderRating(db, providerId) {
  const provReviews = (db.reviews || []).filter((r) => {
    if (r.status === "hidden") return false;
    if (r.provider_id !== undefined) return String(r.provider_id) === String(providerId);
    const bk = (db.bookings || []).find((b) => String(b.booking_id) === String(r.booking_id));
    return bk && String(bk.provider_id) === String(providerId);
  });
  const pp = (db.provider_profiles || []).find((p) => String(p.provider_id) === String(providerId));
  if (pp) {
    pp.total_reviews = provReviews.length;
    if (provReviews.length === 0) {
      pp.average_rating = 0.0;
    } else {
      const sum = provReviews.reduce((acc, r) => acc + Number(r.rating), 0);
      pp.average_rating = Number((sum / provReviews.length).toFixed(2));
    }
  }
}

module.exports = {
  createInitialDatabase,
  ensureLocalDb,
  saveLocalDb,
  resetLocalDb,
  computeProviderPublicProfiles,
  recomputeProviderRating
};
