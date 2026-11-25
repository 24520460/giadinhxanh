const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { ROOT_DIR, loadEnvConfig, isProductionMode, getSupabaseClient } = require("./config/env");
const { ensureLocalDb } = require("./db/localStore");
const { sendJson } = require("./utils/http");
const { autoExpirePendingBookings } = require("./services/bookingService");

const handleSystemRoutes = require("./routes/systemRoutes");
const handleAuthRoutes = require("./routes/authRoutes");
const handleCompanyRoutes = require("./routes/companyRoutes");
const handleProviderRoutes = require("./routes/providerRoutes");
const handleBookingRoutes = require("./routes/bookingRoutes");
const handleCustomerRoutes = require("./routes/customerRoutes");
const handleAdminRoutes = require("./routes/adminRoutes");
const handleAiRoutes = require("./routes/aiRoutes");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const PUBLIC_DIR = path.join(ROOT_DIR, "public");

function readStaticFile(relPath) {
  const candidates = [
    path.join(PUBLIC_DIR, relPath),
    path.join(process.cwd(), "public", relPath),
    path.join(ROOT_DIR, relPath)
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return fs.readFileSync(p, "utf8");
      }
    } catch (_) {}
  }
  return "";
}

const staticIndexHtml = readStaticFile("index.html");
const staticStylesCss = readStaticFile("styles.css");
const staticAppJs = readStaticFile("js/app.js");
const staticDbMock = readStaticFile("shared/db-mock.js");

const ROUTE_HANDLERS = [
  handleSystemRoutes,
  handleAuthRoutes,
  handleCompanyRoutes,
  handleProviderRoutes,
  handleBookingRoutes,
  handleCustomerRoutes,
  handleAdminRoutes,
  handleAiRoutes
];

async function handleApiRequest(req, res, pathname, searchParams = new URLSearchParams()) {
  const method = req.method.toUpperCase();
  const isProd = isProductionMode(req, searchParams);
  const db = isProd ? null : ensureLocalDb();
  const { client, config, error: clientErr } = getSupabaseClient();

  const ctx = {
    req,
    res,
    method,
    pathname,
    searchParams,
    isProd,
    db,
    client,
    config,
    clientErr
  };

  for (const handler of ROUTE_HANDLERS) {
    const handled = await handler(ctx);
    if (handled) return;
  }

  sendJson(res, 404, { ok: false, error: `Endpoint không tồn tại: ${method} ${pathname}` });
}

function resolveStaticCandidate(pathname) {
  let clean = pathname.replace(/^\/+/, "");
  // Cho phép fallback nếu đường dẫn lồng (vd: /auth/assets/...) tham chiếu nhầm tới assets/
  const assetsIdx = clean.indexOf("assets/");
  if (assetsIdx > 0) {
    clean = clean.slice(assetsIdx);
  }
  // Ngăn directory traversal
  const normalized = path.normalize(clean);
  if (normalized.startsWith("..")) return null;

  for (const base of [PUBLIC_DIR, path.join(process.cwd(), "public"), ROOT_DIR]) {
    const full = path.join(base, normalized);
    if (full.startsWith(base) && fs.existsSync(full) && fs.statSync(full).isFile()) {
      return full;
    }
  }
  return null;
}

async function appHandler(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname.startsWith("/api/")) {
      return await handleApiRequest(req, res, pathname, parsedUrl.searchParams);
    }

    if (pathname === "/styles.css" && staticStylesCss) {
      res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
      return res.end(staticStylesCss);
    }
    if (pathname === "/js/app.js" || pathname === "/app.js") {
      const appJs = readStaticFile("js/app.js") || staticAppJs;
      if (appJs) {
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        return res.end(appJs);
      }
    }
    if ((pathname === "/shared/db-mock.js" || pathname === "/db-mock.js") && staticDbMock) {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      return res.end(staticDbMock);
    }

    if (pathname !== "/" && pathname !== "/index.html") {
      const staticFile = resolveStaticCandidate(pathname);
      if (staticFile) {
        const ext = path.extname(staticFile).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        fs.createReadStream(staticFile).pipe(res);
        return;
      }
    }

    // SPA History Fallback: trả về index.html cho mọi route sạch (/home, /auth/login, /bookings/new, ...)
    const html = readStaticFile("index.html") || staticIndexHtml;
    if (html) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

function startBackgroundJobs() {
  const { env } = loadEnvConfig();
  if (env !== "production") {
    ensureLocalDb();
  }
  if (!process.env.VERCEL) {
    setInterval(() => {
      try {
        const isProd = env === "production";
        const db = isProd ? null : ensureLocalDb();
        const { client } = getSupabaseClient();
        autoExpirePendingBookings(db, isProd, client);
      } catch (err) {
        console.warn("[Background Auto-Expire Cron Warning]", err.message);
      }
    }, 60 * 1000);
  }
}

module.exports = {
  appHandler,
  handleApiRequest,
  startBackgroundJobs
};
