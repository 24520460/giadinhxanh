const { describe, test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const puppeteer = require("../tools/figma-exporter/node_modules/puppeteer-core");

const ROOT = path.resolve(__dirname, "..");

function findBrowser() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];
  return candidates.find((p) => fs.existsSync(p));
}

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

function resetLocalStore() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: 3000, path: "/api/supabase/reset-local", method: "POST" },
      (res) => {
        res.resume();
        res.on("end", resolve);
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describe("E2E TESTS — Real Browser UI Flows (Customer, Partner, AI, Modals)", () => {
  let serverProcess = null;
  let browser = null;

  before(async () => {
    const exe = findBrowser();
    assert.ok(exe, "Edge/Chrome binary must exist to run E2E browser tests");
    if (!(await pingServer(3000))) {
      serverProcess = spawn(process.execPath, ["server.js"], { cwd: ROOT, stdio: "pipe" });
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (await pingServer(3000)) break;
      }
    }
    await resetLocalStore();
    browser = await puppeteer.launch({ executablePath: exe, headless: "new" });
  });

  after(async () => {
    await resetLocalStore();
    if (browser) await browser.close();
    if (serverProcess) serverProcess.kill();
  });

  test("E2E-1: Homepage and all 5 portals render with zero pageerror and zero HTTP >= 400", async () => {
    const page = await browser.newPage();
    const pageErrors = [];
    const failedResponses = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    page.on("response", (res) => {
      if (res.status() >= 400 && !res.url().includes("favicon")) {
        failedResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto("http://127.0.0.1:3000/home?mode=dev", { waitUntil: "networkidle0", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 400));

    const screens = [
      "0.1", "0.2", "0.3", "0.4", "0.5",
      "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.8",
      "2.1", "2.2", "2.3", "2.4",
      "3.1", "3.2", "3.3", "3.4",
      "4.1", "4.2", "4.3"
    ];
    for (const id of screens) {
      await page.evaluate((s) => window.GDXApp.go(s), id);
      await new Promise((r) => setTimeout(r, 60));
    }

    await page.close();
    assert.deepStrictEqual(pageErrors, [], `Uncaught pageerrors: ${pageErrors.join("; ")}`);
    assert.deepStrictEqual(failedResponses, [], `Failed HTTP responses: ${failedResponses.join("; ")}`);
  });

  test("E2E-2: Customer creates broadcast booking via Booking Wizard UI (1.2) -> Partner accepts & completes (2.1 -> 2.2)", async () => {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto("http://127.0.0.1:3000/home?mode=dev", { waitUntil: "networkidle0", timeout: 20000 });
    await page.evaluate(() => window.GDXApp.switchPortal(1, "1.2"));
    await page.waitForSelector("#wizAddress", { timeout: 5000 });

    const futureLocal = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16);
    await page.evaluate((dt) => {
      window.GDXApp.setWizardProviderMode("broadcast");
      const timeEl = document.getElementById("wizScheduledTime");
      if (timeEl) timeEl.value = dt;
      const addrEl = document.getElementById("wizAddress");
      if (addrEl) addrEl.value = "Số 14 Đường Phú Mỹ Hưng, Quận 7";
    }, futureLocal);

    const [createResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/bookings") && r.request().method() === "POST", { timeout: 8000 }),
      page.click(".v3-wiz-submit-btn")
    ]);
    assert.strictEqual(createResp.status(), 201, "Booking Wizard submit must return HTTP 201");
    const createJson = await createResp.json();
    const createdId = createJson.booking.booking_id;
    assert.ok(createdId, "Created booking must have booking_id");

    // Switch to Partner portal (2.1 Job Board) and accept the newly created job
    await page.evaluate(() => window.GDXApp.switchPortal(2, "2.1"));
    await page.waitForSelector(`.v3-jobs-list [data-job-action="accept"][data-booking-id="${createdId}"]`, { timeout: 8000 });

    const [acceptResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/bookings/${createdId}/accept`) && r.request().method() === "POST", {
        timeout: 8000
      }),
      page.click(`.v3-jobs-list [data-job-action="accept"][data-booking-id="${createdId}"]`)
    ]);
    assert.strictEqual(acceptResp.status(), 200, "Partner acceptJob must return HTTP 200");

    // On screen 2.2 Shift Timer, verify start and complete
    await page.waitForSelector('[data-shift-action="start"]', { timeout: 8000 });
    const [startResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/bookings/${createdId}/start`) && r.request().method() === "POST", {
        timeout: 8000
      }),
      page.click('[data-shift-action="start"]')
    ]);
    assert.strictEqual(startResp.status(), 200, "Partner startShiftWork must return HTTP 200");

    await page.waitForSelector('[data-shift-action="2.8"]', { timeout: 8000 });
    await page.click('[data-shift-action="2.8"]');
    await page.waitForSelector(`[data-shift-complete-id="${createdId}"]`, { timeout: 5000 });

    const [completeResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/bookings/${createdId}/complete`) && r.request().method() === "POST", {
        timeout: 8000
      }),
      page.click(`[data-shift-complete-id="${createdId}"]`)
    ]);
    assert.strictEqual(completeResp.status(), 200, "Partner completeJobShift must return HTTP 200");

    await page.close();
    assert.deepStrictEqual(pageErrors, [], `Uncaught pageerrors: ${pageErrors.join("; ")}`);
  });

  test("E2E-3 [CONTRACT CHECK]: Partner Incidental Cost Modal (2.7) network request must succeed (HTTP 200)", async () => {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:3000/home?mode=dev", { waitUntil: "networkidle0", timeout: 20000 });
    await page.evaluate(() => window.GDXApp.switchPortal(2, "2.2"));
    await new Promise((r) => setTimeout(r, 400));

    const targetBookingId = await page.evaluate(() => {
      const db = window.GDX_DB;
      const prov =
        (db.provider_profiles || []).find(
          (p) => String(p.user_id) === "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b21"
        ) || (db.provider_profiles || [])[0];
      const owned = (db.bookings || []).find(
        (b) => prov && String(b.provider_id) === String(prov.provider_id)
      );
      const chosen = owned || (db.bookings || [])[0];
      window.GDXApp.openModal("2.7", { bookingId: chosen.booking_id });
      return String(chosen.booking_id);
    });
    await page.waitForSelector("#appModal form", { timeout: 5000 });

    const [incResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/bookings/${encodeURIComponent(targetBookingId)}/incidental`), { timeout: 8000 }),
      page.evaluate(() => {
        const form = document.querySelector("#appModal form");
        const amt = form.querySelector('[name="total_incidental"]');
        if (amt) amt.value = "30000";
        const spec = form.querySelector('[name="incidental_Specify"]');
        if (spec) spec.value = "Túi rác & nước tẩy";
        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      })
    ]);

    assert.strictEqual(
      incResp.status(),
      200,
      `Modal 2.7 calls ${incResp.request().method()} /api/bookings/${targetBookingId}/incidental, got HTTP ${incResp.status()}`
    );
    await page.close();
  });

  test("E2E-4: Notifications Drawer & AI Assistant Chat Drawer work end-to-end", async () => {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:3000/home", { waitUntil: "networkidle0", timeout: 20000 });

    await page.click("#notifBellBtn");
    await page.waitForFunction(() => {
      const el = document.getElementById("notificationsDrawer");
      return el && !el.hidden;
    });

    await page.click("#aiFabBtn");
    await page.waitForSelector("#aiChatInput", { visible: true });
    await page.type("#aiChatInput", "Giá dọn dẹp theo giờ bao nhiêu?");

    const [aiResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/ai/chat") && r.request().method() === "POST", { timeout: 8000 }),
      page.click("#aiSendBtn")
    ]);
    assert.strictEqual(aiResp.status(), 200);
    await page.waitForFunction(() => {
      const body = document.getElementById("aiChatBody");
      return body && body.children.length >= 2;
    });

    await page.close();
  });
});
