const { describe, test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { signAuthToken } = require("../backend/middleware/auth");
const { createInitialStore } = require("../shared/db-mock");

let targetPort = 3000;
let serverProcess = null;

function pingServer(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/status`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function makeRequest(method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: targetPort,
        path: reqPath,
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ statusCode: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("INTEGRATION TESTS — Auth, Security, Order Lifecycle, Contract Parity", () => {
  const seed = createInitialStore();
  const custProfile = seed.customer_profiles[0];
  const prov1Profile = seed.provider_profiles[0];
  const prov2Profile = seed.provider_profiles[1];

  const custToken = signAuthToken({
    user_id: custProfile.user_id,
    role: "customer",
    full_name: "Minh Thảo"
  });
  const otherCustToken = signAuthToken({
    user_id: "99999999-9c0b-4ef8-bb6d-6bb9bd380999",
    role: "customer",
    full_name: "Khách Khác"
  });
  const prov1Token = signAuthToken({
    user_id: prov1Profile.user_id,
    role: "provider",
    full_name: "Thợ 1"
  });
  const prov2Token = signAuthToken({
    user_id: prov2Profile.user_id,
    role: "provider",
    full_name: "Thợ 2"
  });
  const adminToken = signAuthToken({
    user_id: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c99",
    role: "admin",
    full_name: "Admin"
  });

  before(async () => {
    const isRunning = await pingServer(3000);
    if (!isRunning) {
      serverProcess = spawn(process.execPath, ["server.js"], {
        cwd: path.resolve(__dirname, ".."),
        stdio: "pipe"
      });
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (await pingServer(3000)) break;
      }
    }
    await makeRequest("POST", "/api/supabase/reset-local");
  });

  after(async () => {
    await makeRequest("POST", "/api/supabase/reset-local");
    if (serverProcess) serverProcess.kill();
  });

  test("INT-01: Auth registration enforces phone, password, and blocks public provider registration", async () => {
    const badPhone = await makeRequest("POST", "/api/auth/register", {
      full_name: "Bad Phone",
      phone_number: "12345",
      password: "Password123",
      role: "customer"
    });
    assert.strictEqual(badPhone.statusCode, 400);

    const provReg = await makeRequest("POST", "/api/auth/register", {
      full_name: "Freelance Prov",
      phone_number: "0988112233",
      password: "Password123",
      role: "provider"
    });
    assert.strictEqual(provReg.statusCode, 403);

    const uniquePhone = "09" + String(Date.now()).slice(-8);
    const okReg = await makeRequest("POST", "/api/auth/register", {
      full_name: "Khách Mới",
      phone_number: uniquePhone,
      email: `${uniquePhone}@test.vn`,
      password: "Password123",
      role: "customer"
    });
    assert.strictEqual(okReg.statusCode, 201);
    assert.ok(okReg.data.token);

    const dupReg = await makeRequest("POST", "/api/auth/register", {
      full_name: "Trùng SĐT",
      phone_number: uniquePhone,
      password: "Password123",
      role: "customer"
    });
    assert.strictEqual(dupReg.statusCode, 409);

    const badLogin = await makeRequest("POST", "/api/auth/login", {
      identifier: uniquePhone,
      password: "WrongPassword"
    });
    assert.strictEqual(badLogin.statusCode, 401);
  });

  test("INT-02 [SECURITY]: Unauthenticated write operations on bookings MUST be rejected with 401", async () => {
    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    const unauthCreate = await makeRequest("POST", "/api/bookings", {
      customer_id: custProfile.customer_id,
      service_id: 301,
      ward_id: "27403",
      address: "Unauth Test",
      scheduled_time: future
    });
    assert.strictEqual(unauthCreate.statusCode, 401, "POST /api/bookings without token must return 401");

    const unauthAccept = await makeRequest("POST", "/api/bookings/1042/accept", {
      provider_id: prov1Profile.provider_id
    });
    assert.strictEqual(unauthAccept.statusCode, 401, "POST /api/bookings/:id/accept without token must return 401");

    const unauthStart = await makeRequest("POST", "/api/bookings/1042/start", {});
    assert.strictEqual(unauthStart.statusCode, 401, "POST /api/bookings/:id/start without token must return 401");

    const unauthComplete = await makeRequest("POST", "/api/bookings/1042/complete", {});
    assert.strictEqual(unauthComplete.statusCode, 401, "POST /api/bookings/:id/complete without token must return 401");
  });

  test("INT-03 [SECURITY]: Backend must derive customer_id & provider_id from token, ignoring spoofed body IDs", async () => {
    const future = new Date(Date.now() + 4 * 86400000).toISOString();
    const createRes = await makeRequest(
      "POST",
      "/api/bookings",
      {
        customer_id: 99999,
        provider_id: null,
        service_id: 301,
        ward_id: "27403",
        address: "14 Phú Mỹ Hưng, Q7",
        scheduled_time: future,
        total_amount: 255000
      },
      { Authorization: `Bearer ${custToken}` }
    );
    assert.strictEqual(createRes.statusCode, 201);
    assert.strictEqual(
      createRes.data.booking.customer_id,
      custProfile.customer_id,
      "Saved customer_id must come from token (101), not spoofed body (99999)"
    );

    const bkId = createRes.data.booking.booking_id;
    const acceptRes = await makeRequest(
      "POST",
      `/api/bookings/${bkId}/accept`,
      { provider_id: 99999 },
      { Authorization: `Bearer ${prov1Token}` }
    );
    assert.strictEqual(acceptRes.statusCode, 200);
    assert.strictEqual(
      acceptRes.data.booking.provider_id,
      prov1Profile.provider_id,
      "Saved provider_id must come from token (201), not spoofed body (99999)"
    );
  });

  test("INT-04 [RBAC]: Role-scoped GET /api/bookings and GET /api/bookings/:id must enforce ownership", async () => {
    const unauthList = await makeRequest("GET", "/api/bookings");
    assert.strictEqual(unauthList.statusCode, 401, "GET /api/bookings must require authentication");

    const custList = await makeRequest("GET", "/api/bookings", null, {
      Authorization: `Bearer ${custToken}`
    });
    assert.strictEqual(custList.statusCode, 200);
    assert.ok(Array.isArray(custList.data.bookings));
    assert.ok(custList.data.bookings.length > 0);
    const sampleId = custList.data.bookings[0].booking_id;

    const crossDetail = await makeRequest("GET", `/api/bookings/${sampleId}`, null, {
      Authorization: `Bearer ${otherCustToken}`
    });
    assert.strictEqual(crossDetail.statusCode, 403, "Another customer must get 403 on GET /api/bookings/:id");
  });

  test("INT-05 [CONCURRENCY]: Two providers accepting the same broadcast booking concurrently yields [200, 409]", async () => {
    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    const createRes = await makeRequest(
      "POST",
      "/api/bookings",
      {
        customer_id: custProfile.customer_id,
        provider_id: null,
        service_id: 301,
        ward_id: "27403",
        address: "Concurrent Test Address",
        scheduled_time: future,
        total_amount: 170000
      },
      { Authorization: `Bearer ${custToken}` }
    );
    assert.strictEqual(createRes.statusCode, 201);
    const bkId = createRes.data.booking.booking_id;

    const [r1, r2] = await Promise.all([
      makeRequest(
        "POST",
        `/api/bookings/${bkId}/accept`,
        { provider_id: prov1Profile.provider_id },
        { Authorization: `Bearer ${prov1Token}` }
      ),
      makeRequest(
        "POST",
        `/api/bookings/${bkId}/accept`,
        { provider_id: prov2Profile.provider_id },
        { Authorization: `Bearer ${prov2Token}` }
      )
    ]);

    const sorted = [r1.statusCode, r2.statusCode].sort();
    assert.deepStrictEqual(sorted, [200, 409], `Expected [200, 409], got [${sorted}]`);
  });

  test("INT-06 [STATE MACHINE & OWNERSHIP]: Reject illegal status jumps and cross-provider mutations", async () => {
    const future = new Date(Date.now() + 6 * 86400000).toISOString();
    const createRes = await makeRequest(
      "POST",
      "/api/bookings",
      {
        customer_id: custProfile.customer_id,
        provider_id: null,
        service_id: 301,
        ward_id: "27403",
        address: "State Machine Test",
        scheduled_time: future,
        total_amount: 200000
      },
      { Authorization: `Bearer ${custToken}` }
    );
    const bkId = createRes.data.booking.booking_id;

    // Cannot start or complete while pending
    const startPending = await makeRequest(
      "POST",
      `/api/bookings/${bkId}/start`,
      {},
      { Authorization: `Bearer ${prov1Token}` }
    );
    assert.ok([400, 403, 409].includes(startPending.statusCode), "Cannot /start a pending booking");

    // Accept by prov1
    const acc = await makeRequest(
      "POST",
      `/api/bookings/${bkId}/accept`,
      { provider_id: prov1Profile.provider_id },
      { Authorization: `Bearer ${prov1Token}` }
    );
    assert.strictEqual(acc.statusCode, 200);

    // Cross-provider start must be 403
    const prov2Start = await makeRequest(
      "POST",
      `/api/bookings/${bkId}/start`,
      {},
      { Authorization: `Bearer ${prov2Token}` }
    );
    assert.strictEqual(prov2Start.statusCode, 403, "Another provider must not /start prov1's booking");

    // Cannot complete while confirmed (skipping in_progress)
    const jumpComplete = await makeRequest(
      "POST",
      `/api/bookings/${bkId}/complete`,
      {},
      { Authorization: `Bearer ${prov1Token}` }
    );
    assert.ok([400, 409].includes(jumpComplete.statusCode), "Cannot jump confirmed -> completed");

    // Valid start -> complete
    const startOk = await makeRequest(
      "POST",
      `/api/bookings/${bkId}/start`,
      {},
      { Authorization: `Bearer ${prov1Token}` }
    );
    assert.strictEqual(startOk.statusCode, 200);
    assert.strictEqual(startOk.data.booking.status, "in_progress");

    const completeOk = await makeRequest(
      "POST",
      `/api/bookings/${bkId}/complete`,
      {},
      { Authorization: `Bearer ${prov1Token}` }
    );
    assert.strictEqual(completeOk.statusCode, 200);
    assert.strictEqual(completeOk.data.booking.status, "completed");

    // Cannot cancel completed booking
    const cancelCompleted = await makeRequest(
      "POST",
      `/api/bookings/${bkId}/cancel`,
      { reason: "Too late" },
      { Authorization: `Bearer ${custToken}` }
    );
    assert.ok([400, 409].includes(cancelCompleted.statusCode), "Cannot cancel already completed booking");
  });

  test("INT-07 [CONTRACT PARITY]: PATCH /api/bookings/:id/incidental (called by provider.js) must succeed", async () => {
    const patchRes = await makeRequest(
      "PATCH",
      "/api/bookings/1042/incidental",
      {
        total_incidental: 25000,
        incidental_Specify: "Nước lau sàn chuyên dụng"
      },
      { Authorization: `Bearer ${prov1Token}` }
    );
    assert.strictEqual(
      patchRes.statusCode,
      200,
      `Frontend calls PATCH /api/bookings/:id/incidental, got HTTP ${patchRes.statusCode}`
    );
    assert.strictEqual(patchRes.data.ok, true);
  });

  test("INT-08: Provider online-gps, Customer addresses/favorites/tickets, and Admin RBAC", async () => {
    const gpsRes = await makeRequest(
      "PATCH",
      "/api/provider/online-gps",
      {
        provider_id: prov1Profile.provider_id,
        is_available_online: true,
        latitude: 10.731,
        longitude: 106.715
      },
      { Authorization: `Bearer ${prov1Token}` }
    );
    assert.strictEqual(gpsRes.statusCode, 200);

    const addrRes = await makeRequest(
      "POST",
      "/api/customer/addresses",
      {
        customer_id: custProfile.customer_id,
        label: "Nhà Test",
        street_address: "123 Lê Lợi, Q1",
        ward_id: "27403"
      },
      { Authorization: `Bearer ${custToken}` }
    );
    assert.strictEqual(addrRes.statusCode, 201);

    const unauthAdmin = await makeRequest("GET", "/api/admin/audit-logs");
    assert.strictEqual(unauthAdmin.statusCode, 401);

    const custAdmin = await makeRequest("GET", "/api/admin/audit-logs", null, {
      Authorization: `Bearer ${custToken}`
    });
    assert.strictEqual(custAdmin.statusCode, 403);

    const okAdmin = await makeRequest("GET", "/api/admin/audit-logs", null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.strictEqual(okAdmin.statusCode, 200);
  });
});
