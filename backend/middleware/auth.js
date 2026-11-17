const crypto = require("crypto");
const { loadEnvConfig } = require("../config/env");
const { sendJson } = require("../utils/http");

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64").toString("utf8");
}

/**
 * Ký token phiên dạng JWT-lite (HMAC-SHA256).
 */
function signAuthToken(user, ttlSeconds = 7 * 24 * 3600) {
  const { authSecret } = loadEnvConfig();
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "GDX" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: String(user.user_id),
      role: String(user.role || "customer"),
      full_name: String(user.full_name || ""),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ttlSeconds
    })
  );
  const sig = crypto
    .createHmac("sha256", authSecret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${payload}.${sig}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const { authSecret } = loadEnvConfig();
  const expectedSig = crypto
    .createHmac("sha256", authSecret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload));
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      user_id: decoded.sub,
      role: decoded.role,
      full_name: decoded.full_name
    };
  } catch {
    return null;
  }
}

function extractTokenFromRequest(req) {
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const alt = req.headers["x-gdx-token"];
  if (typeof alt === "string" && alt.trim()) {
    return alt.trim();
  }
  return null;
}

function resolveAuthUser(req) {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  return verifyAuthToken(token);
}

/**
 * Bắt buộc xác thực và (tùy chọn) kiểm tra vai trò (RBAC).
 */
function requireAuth(req, res, allowedRoles = null) {
  const user = resolveAuthUser(req);
  if (!user) {
    sendJson(res, 401, {
      ok: false,
      error: "Yêu cầu xác thực (Bearer Token) để thực hiện thao tác này."
    });
    return null;
  }
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    sendJson(res, 403, {
      ok: false,
      error: `Không đủ quyền truy cập. Yêu cầu vai trò: ${allowedRoles.join(", ")}.`
    });
    return null;
  }
  return user;
}

module.exports = {
  signAuthToken,
  verifyAuthToken,
  resolveAuthUser,
  requireAuth
};
