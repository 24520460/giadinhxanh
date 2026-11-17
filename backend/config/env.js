const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT_DIR = path.resolve(__dirname, "..", "..");

/**
 * Đọc biến môi trường từ .env, .env.local và process.env.
 */
function loadEnvConfig() {
  const envVars = {};
  const envFiles = [path.join(ROOT_DIR, ".env"), path.join(ROOT_DIR, ".env.local")];

  for (const filePath of envFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) return;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        envVars[key] = val;
      });
    }
  }

  const supabaseUrl =
    envVars.NEXT_PUBLIC_SUPABASE_URL ||
    envVars.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  const supabaseAnonKey =
    envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    envVars.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  const supabaseServiceKey =
    envVars.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  const authSecret =
    envVars.GDX_AUTH_SECRET ||
    process.env.GDX_AUTH_SECRET ||
    supabaseServiceKey ||
    "gdx-local-auth-secret-2026";
  const port = Number(envVars.PORT || process.env.PORT || 3000);
  const env = (
    envVars.ENV ||
    envVars.NODE_ENV ||
    process.env.ENV ||
    process.env.NODE_ENV ||
    "development"
  )
    .trim()
    .toLowerCase();

  return {
    rootDir: ROOT_DIR,
    supabaseUrl: supabaseUrl.trim(),
    supabaseAnonKey: supabaseAnonKey.trim(),
    supabaseServiceKey: supabaseServiceKey.trim(),
    authSecret: authSecret.trim(),
    port,
    env
  };
}

function isProductionMode(req, searchParams) {
  const cfg = loadEnvConfig();
  if (cfg.env === "production") return true;
  if (searchParams) {
    const mode = searchParams.get("mode") || searchParams.get("env");
    if (mode === "production") return true;
  }
  if (
    req &&
    (req.headers["x-gdx-mode"] === "production" || req.headers["x-mode"] === "production")
  ) {
    return true;
  }
  return false;
}

function getSupabaseClient() {
  const cfg = loadEnvConfig();
  const activeKey = cfg.supabaseServiceKey || cfg.supabaseAnonKey;
  if (!cfg.supabaseUrl || !activeKey) {
    return { client: null, config: cfg };
  }
  try {
    const client = createClient(cfg.supabaseUrl, activeKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return { client, config: cfg };
  } catch (err) {
    return { client: null, config: cfg, error: err.message };
  }
}

module.exports = {
  ROOT_DIR,
  loadEnvConfig,
  isProductionMode,
  getSupabaseClient
};
