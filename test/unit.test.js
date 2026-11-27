const { describe, test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const validators = require("../backend/utils/validators");
const auth = require("../backend/middleware/auth");
const { autoExpirePendingBookings } = require("../backend/services/bookingService");
const dbMock = require("../shared/db-mock");

function createMockRes() {
  return {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : null;
    }
  };
}

describe("UNIT TESTS — Backend Validators", () => {
  test("isValidPhoneVN validates Vietnamese phone numbers accurately", () => {
    assert.strictEqual(validators.isValidPhoneVN("0901234567"), true);
    assert.strictEqual(validators.isValidPhoneVN("02838889999"), true);
    assert.strictEqual(validators.isValidPhoneVN(" 0912345678 "), true);

    assert.strictEqual(validators.isValidPhoneVN("84901234567"), false);
    assert.strictEqual(validators.isValidPhoneVN("09012345"), false);
    assert.strictEqual(validators.isValidPhoneVN("090123456789"), false);
    assert.strictEqual(validators.isValidPhoneVN("09012abcde"), false);
    assert.strictEqual(validators.isValidPhoneVN(""), false);
    assert.strictEqual(validators.isValidPhoneVN(null), false);
  });

  test("isValidEmail validates email format accurately", () => {
    assert.strictEqual(validators.isValidEmail("user@giadinhxanh.vn"), true);
    assert.strictEqual(validators.isValidEmail("a.b+1@sub.domain.com"), true);

    assert.strictEqual(validators.isValidEmail("invalid-email"), false);
    assert.strictEqual(validators.isValidEmail("user@"), false);
    assert.strictEqual(validators.isValidEmail("@domain.com"), false);
    assert.strictEqual(validators.isValidEmail("user @domain.com"), false);
    assert.strictEqual(validators.isValidEmail(""), false);
  });

  test("isUuid validates UUID strings accurately", () => {
    assert.strictEqual(validators.isUuid("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"), true);
    assert.strictEqual(validators.isUuid("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11"), true);

    assert.strictEqual(validators.isUuid("1042"), false);
    assert.strictEqual(validators.isUuid("not-a-uuid"), false);
    assert.strictEqual(validators.isUuid(12345), false);
    assert.strictEqual(validators.isUuid(null), false);
  });

  test("normalizeId handles numeric IDs, UUIDs, empty inputs, and leading-zero codes", () => {
    assert.strictEqual(validators.normalizeId("101"), 101);
    assert.strictEqual(validators.normalizeId(202), 202);
    assert.strictEqual(
      validators.normalizeId("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"),
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
    );
    assert.strictEqual(validators.normalizeId(""), null);
    assert.strictEqual(validators.normalizeId(null), null);
    assert.strictEqual(validators.normalizeId(undefined), null);
  });

  test("validateScheduledTime rejects past and malformed dates, accepts future and empty", () => {
    const emptyRes = validators.validateScheduledTime("");
    assert.strictEqual(emptyRes.ok, true);
    assert.ok(Date.parse(emptyRes.iso) > 0);

    const futureIso = new Date(Date.now() + 3600 * 1000).toISOString();
    const futureRes = validators.validateScheduledTime(futureIso);
    assert.strictEqual(futureRes.ok, true);

    const pastRes = validators.validateScheduledTime("2020-01-01T09:00:00.000Z");
    assert.strictEqual(pastRes.ok, false);

    const badRes = validators.validateScheduledTime("not-a-date");
    assert.strictEqual(badRes.ok, false);
  });

  test("validateNonNegativeAmount accepts 0 and positive numbers, rejects negative and non-finite", () => {
    assert.deepStrictEqual(validators.validateNonNegativeAmount(0), { ok: true, value: 0 });
    assert.deepStrictEqual(validators.validateNonNegativeAmount("150000"), { ok: true, value: 150000 });
    assert.strictEqual(validators.validateNonNegativeAmount(-1).ok, false);
    assert.strictEqual(validators.validateNonNegativeAmount("abc").ok, false);
    assert.strictEqual(validators.validateNonNegativeAmount(Infinity).ok, false);
  });
});

describe("UNIT TESTS — Auth Middleware (JWT-lite & RBAC)", () => {
  test("signAuthToken & verifyAuthToken round-trip and reject tampered/expired tokens", () => {
    const token = auth.signAuthToken({
      user_id: "u-101",
      role: "customer",
      full_name: "Nguyễn Minh Thảo"
    });
    const decoded = auth.verifyAuthToken(token);
    assert.deepStrictEqual(decoded, {
      user_id: "u-101",
      role: "customer",
      full_name: "Nguyễn Minh Thảo"
    });

    const parts = token.split(".");
    const tamperedSig = `${parts[0]}.${parts[1]}.invalidSigXYZ`;
    assert.strictEqual(auth.verifyAuthToken(tamperedSig), null);

    const tamperedPayload = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: "admin", role: "admin", exp: 9999999999 })).toString("base64url")}.${parts[2]}`;
    assert.strictEqual(auth.verifyAuthToken(tamperedPayload), null);

    const expiredToken = auth.signAuthToken({ user_id: "u-1", role: "customer" }, -10);
    assert.strictEqual(auth.verifyAuthToken(expiredToken), null);

    assert.strictEqual(auth.verifyAuthToken("malformed"), null);
    assert.strictEqual(auth.verifyAuthToken(null), null);
  });

  test("resolveAuthUser reads Bearer and x-gdx-token headers", () => {
    const token = auth.signAuthToken({ user_id: "u-2", role: "provider", full_name: "Lan" });
    const u1 = auth.resolveAuthUser({ headers: { authorization: `Bearer ${token}` } });
    assert.strictEqual(u1.user_id, "u-2");
    assert.strictEqual(u1.role, "provider");

    const u2 = auth.resolveAuthUser({ headers: { "x-gdx-token": token } });
    assert.strictEqual(u2.user_id, "u-2");

    assert.strictEqual(auth.resolveAuthUser({ headers: {} }), null);
  });

  test("requireAuth returns 401 when unauthenticated, 403 on wrong role, user on match", () => {
    const res401 = createMockRes();
    const out401 = auth.requireAuth({ headers: {} }, res401, ["admin"]);
    assert.strictEqual(out401, null);
    assert.strictEqual(res401.statusCode, 401);

    const custToken = auth.signAuthToken({ user_id: "u-1", role: "customer" });
    const res403 = createMockRes();
    const out403 = auth.requireAuth({ headers: { authorization: `Bearer ${custToken}` } }, res403, ["admin"]);
    assert.strictEqual(out403, null);
    assert.strictEqual(res403.statusCode, 403);

    const adminToken = auth.signAuthToken({ user_id: "u-9", role: "admin" });
    const res200 = createMockRes();
    const out200 = auth.requireAuth({ headers: { authorization: `Bearer ${adminToken}` } }, res200, ["admin"]);
    assert.strictEqual(out200.role, "admin");
    assert.strictEqual(res200.statusCode, null);
  });
});

describe("UNIT TESTS — Booking Service & Shared Mock Store", () => {
  test("autoExpirePendingBookings expires only pending bookings older than 24h", async () => {
    const oldTime = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const freshTime = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const fakeDb = {
      bookings: [
        { booking_id: 1, customer_id: 101, status: "pending", created_at: oldTime },
        { booking_id: 2, customer_id: 101, status: "pending", created_at: freshTime },
        { booking_id: 3, customer_id: 101, status: "confirmed", created_at: oldTime }
      ],
      customer_profiles: [{ customer_id: 101, user_id: "u-101" }],
      booking_status_history: [],
      notifications: []
    };

    const expiredCount = await autoExpirePendingBookings(fakeDb, false, null);
    assert.strictEqual(expiredCount, 1);
    assert.strictEqual(fakeDb.bookings[0].status, "auto_cancelled");
    assert.strictEqual(fakeDb.bookings[1].status, "pending");
    assert.strictEqual(fakeDb.bookings[2].status, "confirmed");
    assert.strictEqual(fakeDb.booking_status_history.length, 1);
    assert.strictEqual(fakeDb.booking_status_history[0].new_status, "auto_cancelled");
    assert.strictEqual(fakeDb.notifications.length, 1);
  });

  test("db-mock maintains referential integrity and hides sensitive fields in public view", () => {
    const db = dbMock.createInitialStore();
    const userIds = new Set(db.users.map((u) => u.user_id));
    const catIds = new Set(db.service_categories.map((c) => c.category_id));
    const custIds = new Set(db.customer_profiles.map((c) => c.customer_id));

    for (const cp of db.customer_profiles) {
      assert.ok(userIds.has(cp.user_id), `customer ${cp.customer_id} references valid user`);
    }
    for (const pp of db.provider_profiles) {
      assert.ok(userIds.has(pp.user_id), `provider ${pp.provider_id} references valid user`);
    }
    for (const svc of db.services) {
      assert.ok(catIds.has(svc.category_id), `service ${svc.service_id} references valid category`);
    }
    for (const bk of db.bookings) {
      assert.ok(custIds.has(bk.customer_id), `booking ${bk.booking_id} references valid customer`);
    }

    const publicProvs = dbMock.getProviderPublicProfiles(db);
    assert.ok(publicProvs.length > 0);
    for (const p of publicProvs) {
      assert.strictEqual(p.id_card_number, undefined, "Public view must not leak id_card_number");
    }
  });
});

describe("UNIT TESTS — Frontend Formatters ES Module", () => {
  test("formatters compute distance, money, XSS escaping, CCCD masking, and timers", async () => {
    const fmtUrl = pathToFileURL(path.resolve(__dirname, "../public/js/core/formatters.js")).href;
    const fmt = await import(fmtUrl);

    assert.strictEqual(fmt.calcDistanceKm(10.77, 106.7, 10.77, 106.7), "0.4");
    const dist = Number(fmt.calcDistanceKm(10.7289, 106.7124, 10.7769, 106.7009));
    assert.ok(dist > 4 && dist < 7, `Expected ~5.5 km, got ${dist}`);

    assert.ok(fmt.formatMoney(255000).includes("255.000"));
    assert.ok(fmt.formatMoney(0).includes("0"));

    const xss = fmt.escapeHtml(`<script>alert("x")</script> & 'ok'`);
    assert.ok(!xss.includes("<script>"));
    assert.ok(xss.includes("&lt;script&gt;"));
    assert.ok(xss.includes("&amp;"));

    assert.strictEqual(fmt.formatTimer(3665), "01:01:05");
    assert.strictEqual(fmt.formatSeconds(65), "00:01:05");
    assert.strictEqual(fmt.formatCccd("079098001234"), "079••••1234");

    assert.ok(fmt.statusBadge("pending").includes("Chờ"));
    assert.ok(fmt.paymentBadge("paid").includes("badge"));
    assert.ok(fmt.priorityBadge("high").includes("badge"));
  });
});
