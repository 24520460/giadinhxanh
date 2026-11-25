import { refreshDemoToken } from "./api.js";
import { formatSeconds } from "./formatters.js";
import { SCREENS, SCREEN_ROUTES, isDevFromUrl, state } from "./state.js";
import { applyUserModeCleanups, showToast } from "../shared/ui-utils.js";

export const SCREEN_RENDERERS = {};
export function registerScreenRenderers(map) {
  Object.assign(SCREEN_RENDERERS, map);
}

export function getPathForScreen(screenId, params = {}) {
  if (screenId === "0.1") {
    if (params && params.view === "register") return "/auth/register";
    if (params && params.view === "forgot") return "/auth/forgot-password";
    if (!params?.view && state.authView === "register")
      return "/auth/register";
    if (!params?.view && state.authView === "forgot")
      return "/auth/forgot-password";
    return "/auth/login";
  }
  if (screenId === "1.3" && params && params.bookingId != null) {
    return `/bookings/${encodeURIComponent(params.bookingId)}/tracking`;
  }
  if (screenId === "1.8" && params && params.bookingId != null) {
    return `/bookings/${encodeURIComponent(params.bookingId)}/payment`;
  }
  if (screenId === "2.2" && params && params.bookingId != null) {
    return `/provider/shift/${encodeURIComponent(params.bookingId)}`;
  }
  return SCREEN_ROUTES[screenId] || "/home";
}

export function resolveRouteFromLocation() {
  const pathname =
    (window.location.pathname || "/").replace(/\/+$/, "") || "/";
  const hash = (window.location.hash || "").replace(/^#/, "");

  // Hỗ trợ legacy hash (#1.2)
  if (hash && SCREENS[hash]) {
    return {
      screenId: hash,
      params: {},
      normalizedPath: getPathForScreen(hash),
    };
  }

  if (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/home" ||
    pathname === "/services"
  ) {
    return { screenId: "1.1", params: {}, normalizedPath: "/home" };
  }
  if (pathname === "/auth" || pathname === "/auth/login") {
    return {
      screenId: "0.1",
      params: { view: "login" },
      normalizedPath: "/auth/login",
    };
  }
  if (pathname === "/auth/register") {
    return {
      screenId: "0.1",
      params: { view: "register" },
      normalizedPath: "/auth/register",
    };
  }
  if (pathname === "/auth/forgot-password") {
    return {
      screenId: "0.1",
      params: { view: "forgot" },
      normalizedPath: "/auth/forgot-password",
    };
  }
  if (pathname === "/booking/new" || pathname === "/bookings/new") {
    return { screenId: "1.2", params: {}, normalizedPath: "/bookings/new" };
  }

  let m = pathname.match(/^\/bookings\/([^/]+)\/tracking$/);
  if (m) {
    const bid = isNaN(Number(m[1])) ? m[1] : Number(m[1]);
    return {
      screenId: "1.3",
      params: { bookingId: bid },
      normalizedPath: pathname,
    };
  }
  m = pathname.match(/^\/bookings\/([^/]+)\/payment$/);
  if (m) {
    const bid = isNaN(Number(m[1])) ? m[1] : Number(m[1]);
    return {
      screenId: "1.8",
      params: { bookingId: bid },
      normalizedPath: pathname,
    };
  }
  m = pathname.match(/^\/provider\/shift\/([^/]+)$/);
  if (m) {
    const bid = isNaN(Number(m[1])) ? m[1] : Number(m[1]);
    return {
      screenId: "2.2",
      params: { bookingId: bid },
      normalizedPath: pathname,
    };
  }

  for (const [sid, routePath] of Object.entries(SCREEN_ROUTES)) {
    if (pathname === routePath) {
      return { screenId: sid, params: {}, normalizedPath: routePath };
    }
  }
  if (pathname === "/admin") {
    return {
      screenId: "3.1",
      params: {},
      normalizedPath: "/admin/dashboard",
    };
  }
  if (pathname === "/company") {
    return {
      screenId: "4.1",
      params: {},
      normalizedPath: "/company/dashboard",
    };
  }
  if (pathname === "/provider") {
    return {
      screenId: "2.1",
      params: {},
      normalizedPath: "/provider/jobs",
    };
  }

  return { screenId: "1.1", params: {}, normalizedPath: "/home" };
}

export function pushScreenUrl(screenId, params = {}, replace = false) {
  if (!window.history || typeof window.history.pushState !== "function")
    return;
  const basePath = getPathForScreen(screenId, params);
  const curQuery = new URLSearchParams(window.location.search);
  const preserved = new URLSearchParams();
  const mode = curQuery.get("mode") || curQuery.get("env");
  if (mode === "dev" || mode === "production") {
    preserved.set("mode", mode);
  }
  const qs = preserved.toString();
  const targetUrl = qs ? `${basePath}?${qs}` : basePath;
  if (window.location.pathname + window.location.search === targetUrl)
    return;
  try {
    if (replace) {
      window.history.replaceState({ screenId, params }, "", targetUrl);
    } else {
      window.history.pushState({ screenId, params }, "", targetUrl);
    }
  } catch (_) {}
}


export function startLiveTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    if (state.isTimerRunning) {
      state.timerSeconds++;
      const timerEl = document.getElementById("liveTimerDigits");
      if (timerEl) timerEl.textContent = formatSeconds(state.timerSeconds);
    }
  }, 1000);
}


export function renderUserTopbar() {
  const userNav = document.getElementById("userMainNav");
  const captionEl = document.getElementById("activeRoleCaption");
  const roleSelect = document.getElementById("userRoleSelect");
  const btnUser = document.getElementById("modeBtnUser");
  const btnDev = document.getElementById("modeBtnDev");
  const userAccountBar = document.getElementById("userAccountBar");
  const modeSwitchPill = document.querySelector(".mode-switch-pill");
  const catalogBtn = document.querySelector(".dev-catalog-btn");
  const statusBtn = document.getElementById("supabaseStatusBtn");

  if (
    state.isProduction ||
    state.viewMode === "production" ||
    !isDevFromUrl
  ) {
    if (modeSwitchPill) modeSwitchPill.style.display = "none";
    if (catalogBtn) catalogBtn.style.display = "none";
    if (statusBtn) statusBtn.style.display = "none";
    if (roleSelect) roleSelect.style.display = "none";
  }

  if (btnUser && btnDev) {
    btnUser.setAttribute(
      "aria-pressed",
      state.viewMode === "user" || state.viewMode === "production"
        ? "true"
        : "false",
    );
    btnDev.setAttribute(
      "aria-pressed",
      state.viewMode === "dev" ? "true" : "false",
    );
  }

  if (roleSelect && !state.isProduction && isDevFromUrl) {
    roleSelect.value = String(state.currentPortal);
  }

  if (userAccountBar && (state.isProduction || !isDevFromUrl)) {
    if (!state.currentUser) {
      userAccountBar.innerHTML = `
      <div class="user-guest-actions">
        <button type="button" class="btn btn-secondary btn-sm" onclick="GDXApp.switchPortal(0, '0.1')">
          Đăng nhập
        </button>
        <button type="button" class="primary-btn btn-sm" onclick="GDXApp.switchPortal(0, '0.1')">
          Đăng ký
        </button>
      </div>
    `;
    } else {
      const roleLabel =
        state.currentUser.role === "provider"
          ? "Đối tác Thợ"
          : state.currentUser.role === "admin"
            ? "Quản trị"
            : "Khách hàng";
      userAccountBar.innerHTML = `
      <div class="user-logged-pill">
        <span class="user-logged-name">${state.currentUser.full_name}</span>
        <span class="badge badge-sm badge-positive">${roleLabel}</span>
        <button type="button" class="btn-logout-link" onclick="GDXApp.handleLogout()" title="Đăng xuất">
          Đăng xuất
        </button>
      </div>
    `;
    }
  }

  if (state.viewMode === "dev") return;

  const db = window.GDX_DB;
  const favCount = (db.favorites || []).filter(
    (f) => f.customer_id === state.activeCustomerId,
  ).length;
  const pendingJobsCount = (db.bookings || []).filter(
    (b) => b.status === "pending",
  ).length;
  const pendingKycCount = (db.company_profiles || []).filter(
    (c) => c.verification_status === "pending",
  ).length;

  if (state.currentPortal === 1) {
    if (captionEl) captionEl.textContent = "Chăm sóc nhà cửa tại gia";
    if (userNav) {
      let items;
      if ((state.isProduction || !isDevFromUrl) && !state.currentUser) {
        // Cold Start / Guest navigation
        items = [
          { id: "1.1", label: "Khám phá dịch vụ" },
          { id: "1.2", label: "Đặt lịch" },
          { id: "1.11", label: "Hỗ trợ", isModal: true },
        ];
      } else {
        items = [
          { id: "1.1", label: "Khám phá" },
          { id: "1.2", label: "Đặt lịch" },
          { id: "1.3", label: "Theo dõi ca" },
          { id: "1.4", label: "Lịch hẹn" },
          { id: "1.6", label: `Đã lưu (${favCount})` },
          { id: "1.5", label: "Hồ sơ" },
          { id: "1.11", label: "Hỗ trợ", isModal: true },
        ];
      }
      userNav.innerHTML = items
        .map(
          (it) => `
      <button type="button" class="portal-tab" aria-selected="${!it.isModal && state.currentScreen === it.id ? "true" : "false"}" onclick="${it.switchPortalTo !== undefined ? `GDXApp.switchPortal(${it.switchPortalTo}, '${it.id}')` : it.isModal ? `GDXApp.openModal('${it.id}')` : `GDXApp.go('${it.id}')`}">
        ${it.label}
      </button>`,
        )
        .join("");
    }
  } else if (state.currentPortal === 2) {
    if (captionEl) captionEl.textContent = "Không gian Đối tác Thợ";
    if (userNav) {
      const items = [
        { id: "2.1", label: `Việc mới (${pendingJobsCount})` },
        { id: "2.2", label: "Ca đang làm" },
        { id: "2.3", label: "Thu nhập & Lịch" },
        { id: "2.4", label: "Kỹ năng & Khu vực" },
        { id: "2.9", label: "Báo sự cố", isModal: true },
      ];
      userNav.innerHTML = items
        .map(
          (it) => `
      <button type="button" class="portal-tab" aria-selected="${!it.isModal && state.currentScreen === it.id ? "true" : "false"}" onclick="${it.isModal ? `GDXApp.openModal('${it.id}')` : `GDXApp.go('${it.id}')`}">
        ${it.label}
      </button>`,
        )
        .join("");
    }
  } else if (state.currentPortal === 3) {
    if (captionEl) captionEl.textContent = "Trung tâm Điều phối & Quản trị";
    if (userNav) {
      const items = [
        { id: "3.1", label: "Tổng quan & Điều phối" },
        { id: "3.2", label: "Danh mục & Giám sát DV" },
        { id: "3.3", label: `Duyệt Công ty (${pendingKycCount})` },
        { id: "3.4", label: "Tài khoản & Hỗ trợ" },
      ];
      userNav.innerHTML = items
        .map(
          (it) => `
      <button type="button" class="portal-tab" aria-selected="${state.currentScreen === it.id ? "true" : "false"}" onclick="GDXApp.go('${it.id}')">
        ${it.label}
      </button>`,
        )
        .join("");
    }
  } else if (state.currentPortal === 4) {
    if (captionEl) captionEl.textContent = "Cổng Quản lý Công ty Đối tác";
    if (userNav) {
      const compStaffCount = (db.provider_profiles || []).filter(
        (p) =>
          String(p.company_id) === String(state.activeCompanyId || 501),
      ).length;
      const items = [
        { id: "4.1", label: "Tổng quan Công ty" },
        { id: "4.2", label: `Nhân viên Thợ (${compStaffCount})` },
        { id: "4.3", label: "Dịch vụ Công ty" },
      ];
      userNav.innerHTML = items
        .map(
          (it) => `
      <button type="button" class="portal-tab" aria-selected="${state.currentScreen === it.id ? "true" : "false"}" onclick="GDXApp.go('${it.id}')">
        ${it.label}
      </button>`,
        )
        .join("");
    }
  } else {
    if (captionEl)
      captionEl.textContent = "Tài khoản & Đăng ký Đối tác Công ty";
    if (userNav) {
      const items = [
        { id: "0.1", label: "Đăng nhập / Đăng ký" },
        { id: "0.2", label: "Hồ sơ Khách mới" },
        { id: "0.3", label: "Đăng ký Công ty" },
        { id: "0.4", label: "Trạng thái Công ty" },
        { id: "1.1", label: "Về Trang chủ", switchPortalTo: 1 },
      ];
      userNav.innerHTML = items
        .map(
          (it) => `
      <button type="button" class="portal-tab" aria-selected="${state.currentScreen === it.id ? "true" : "false"}" onclick="${it.switchPortalTo ? `GDXApp.switchPortal(1, '1.1')` : `GDXApp.go('${it.id}')`}">
        ${it.label}
      </button>`,
        )
        .join("");
    }
  }
}

export function setViewMode(mode, silent = false, options = {}) {
  if (mode === "production") {
    state.viewMode = "production";
    state.isProduction = true;
  } else {
    state.viewMode = mode === "dev" ? "dev" : "user";
  }
  document.body.setAttribute("data-view-mode", state.viewMode);
  renderUserTopbar();
  switchPortal(
    state.currentPortal,
    state.currentScreen,
    state.currentRouteParams || {},
    options,
  );
  if (!silent) {
    showToast(
      state.viewMode === "production"
        ? "Đang ở Chế độ Production Mode (Zero Mock Data — Kết nối Supabase trực tiếp)"
        : state.viewMode === "user"
          ? "Đang ở Luồng Người dùng thực tế (giao diện thân thiện)"
          : "Đang ở Chế độ Dev (hiển thị 4 Phân hệ, 34 UI & ánh xạ bảng SQL)",
    );
  }
}

export function goHomeByRole() {
  if (state.currentPortal === 2) {
    go("2.1");
  } else if (state.currentPortal === 3) {
    go("3.1");
  } else if (state.currentPortal === 4) {
    go("4.1");
  } else {
    switchPortal(1, "1.1");
  }
}

export function handleUserRoleSwitch(portalVal) {
  const p = Number(portalVal);
  switchPortal(p);
  const names = {
    0: "Cổng Tài khoản & Đăng ký Công ty",
    1: "Khách hàng: Nguyễn Minh Thảo",
    2: "Đối tác Thợ: Đặng Thị Mai Lan",
    3: "Quản trị viên: Nguyễn Quang Hào",
    4: "Công ty Đối tác: An Bình Home Care",
  };
  showToast(`Đã chuyển sang góc nhìn: ${names[p] || ""}`);
}

export function handleUserAccountClick() {
  if (state.currentPortal === 0) {
    switchPortal(1, "1.1");
  } else {
    switchPortal(0, "0.1");
  }
}

// --- PORTAL & SIDEBAR SWITCHER ---
export function switchPortal(
  portalId,
  targetScreenId = null,
  params = {},
  options = {},
) {
  state.currentPortal = Number(portalId);
  document
    .querySelectorAll("#devPortalSwitcher .portal-tab")
    .forEach((tab) => {
      tab.setAttribute(
        "aria-selected",
        tab.getAttribute("data-portal") === String(portalId),
      );
    });

  const captionEl = document.getElementById("activeRoleCaption");
  const identityEl = document.getElementById("sidebarCurrentIdentity");
  const provWidget = document.getElementById("providerHeaderWidget");

  // Nếu ở chế độ Production Mode, tôn trọng danh tính thực tế hoặc khách vãng lai
  if (state.isProduction) {
    if (portalId === 0) {
      state.userRole = "anon";
      if (identityEl)
        identityEl.textContent = "Trạng thái: Khách vãng lai / Đăng ký";
      if (provWidget) provWidget.style.display = "none";
      const dest = targetScreenId || "0.1";
      renderSidebar(dest);
      go(dest, params, options);
      return;
    } else if (portalId === 1) {
      state.userRole = state.currentUser
        ? state.currentUser.role
        : "customer";
      if (identityEl) {
        identityEl.textContent = state.currentUser
          ? `auth.uid(): ${state.currentUser.full_name} (${state.currentUser.user_id.slice(0, 8)}...)`
          : "Khách hàng chưa đăng nhập (Cold Start)";
      }
      if (provWidget) provWidget.style.display = "none";
      const dest = targetScreenId || "1.1";
      renderSidebar(dest);
      go(dest, params, options);
      return;
    }
  }

  const db = window.GDX_DB || {};
  if (portalId === 0) {
    if (captionEl && state.viewMode === "dev")
      captionEl.textContent = "Phân hệ 0 · Dùng chung & Xác thực";
    if (identityEl)
      identityEl.textContent = "Trạng thái: Khách vãng lai / Đăng nhập";
    state.userRole = "anon";
    state.activeUserId =
      (db.users && db.users[0] && db.users[0].user_id) ||
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    if (provWidget) provWidget.style.display = "none";
    const dest = targetScreenId || "0.1";
    renderSidebar(dest);
    go(dest, params, options);
  } else if (portalId === 1) {
    const firstCp =
      (db.customer_profiles && db.customer_profiles[0]) || null;
    const custUser =
      (firstCp &&
        (db.users || []).find(
          (u) => String(u.user_id) === String(firstCp.user_id),
        )) ||
      null;
    if (captionEl && state.viewMode === "dev")
      captionEl.textContent = "Phân hệ 1 · Khách hàng (Customer)";
    if (identityEl) {
      identityEl.textContent = `auth.uid(): ${(custUser && custUser.full_name) || "Nguyễn Minh Thảo"} (customer_id #${(firstCp && firstCp.customer_id) || 101})`;
    }
    state.userRole = "customer";
    if (!state.currentUser || state.currentUser.role !== "customer") {
      state.activeUserId =
        (firstCp && firstCp.user_id) ||
        "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      state.activeCustomerId = (firstCp && firstCp.customer_id) || 101;
      refreshDemoToken("customer");
    }
    if (provWidget) provWidget.style.display = "none";
    const dest = targetScreenId || "1.1";
    renderSidebar(dest);
    go(dest, params, options);
  } else if (portalId === 2) {
    const firstPp =
      (db.provider_profiles && db.provider_profiles[0]) || null;
    const provUser =
      (firstPp &&
        (db.users || []).find(
          (u) => String(u.user_id) === String(firstPp.user_id),
        )) ||
      null;
    if (captionEl && state.viewMode === "dev")
      captionEl.textContent = "Phân hệ 2 · Thợ / Đối tác (Provider)";
    if (identityEl) {
      identityEl.textContent = `auth.uid(): ${(provUser && provUser.full_name) || "Đặng Thị Mai Lan"} (provider_id #${(firstPp && firstPp.provider_id) || 201})`;
    }
    state.userRole = "provider";
    if (!state.currentUser || state.currentUser.role !== "provider") {
      state.activeUserId =
        (firstPp && firstPp.user_id) ||
        "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b21";
      state.activeProviderId = (firstPp && firstPp.provider_id) || 201;
      refreshDemoToken("provider");
    }
    if (provWidget) provWidget.style.display = "flex";
    const dest = targetScreenId || "2.1";
    renderSidebar(dest);
    go(dest, params, options);
  } else if (portalId === 3) {
    const adminUser =
      (db.users || []).find((u) => u.role === "admin") || null;
    if (captionEl && state.viewMode === "dev")
      captionEl.textContent = "Phân hệ 3 · Quản trị viên (Admin)";
    if (identityEl)
      identityEl.textContent = `auth.uid(): ${(adminUser && adminUser.full_name) || "Nguyễn Quang Hào"} (role: admin)`;
    state.userRole = "admin";
    if (!state.currentUser || state.currentUser.role !== "admin") {
      state.activeUserId =
        (adminUser && adminUser.user_id) ||
        "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c99";
      refreshDemoToken("admin");
    }
    if (provWidget) provWidget.style.display = "none";
    const dest = targetScreenId || "3.1";
    renderSidebar(dest);
    go(dest, params, options);
  } else if (portalId === 4) {
    const activeComp =
      (db.company_profiles || []).find(
        (c) => String(c.company_id) === String(state.activeCompanyId),
      ) ||
      (db.company_profiles && db.company_profiles[0]) ||
      null;
    const compUser =
      (activeComp &&
        (db.users || []).find(
          (u) => String(u.user_id) === String(activeComp.user_id),
        )) ||
      null;
    if (captionEl && state.viewMode === "dev")
      captionEl.textContent = "Phân hệ 4 · Công ty Đối tác (Company)";
    if (identityEl) {
      identityEl.textContent = `auth.uid(): ${(activeComp && activeComp.company_name) || (compUser && compUser.full_name) || "Công ty An Bình"} (company_id #${(activeComp && activeComp.company_id) || 501})`;
    }
    state.userRole = "company";
    if (!state.currentUser || state.currentUser.role !== "company") {
      state.activeUserId =
        (activeComp && activeComp.user_id) ||
        "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380d31";
      state.activeCompanyId = (activeComp && activeComp.company_id) || 501;
      refreshDemoToken("company");
    }
    if (provWidget) provWidget.style.display = "none";
    const dest = targetScreenId || "4.1";
    renderSidebar(dest);
    go(dest, params, options);
  }
}

export function renderSidebar(activeScreenId) {
  const pageListEl = document.getElementById("sidebarPageList");
  const modalListEl = document.getElementById("sidebarModalList");
  if (!pageListEl || !modalListEl) return;

  const portalScreens = Object.values(SCREENS).filter(
    (s) => s.portal === state.currentPortal,
  );
  const pages = portalScreens.filter((s) => s.type === "page");
  const modals = portalScreens.filter((s) => s.type !== "page");

  pageListEl.innerHTML = pages
    .map(
      (p) => `
  <button type="button" class="sidebar-nav-btn" data-screen="${p.id}" aria-current="${p.id === activeScreenId ? "page" : "false"}" onclick="GDXApp.go('${p.id}')">
    <span>${p.title.split(". ")[1] || p.title}</span>
    <span class="sidebar-code">${p.id}</span>
  </button>`,
    )
    .join("");

  modalListEl.innerHTML = modals
    .map(
      (m) => `
  <button type="button" class="sidebar-nav-btn" data-screen="${m.id}" onclick="GDXApp.openModal('${m.id}')">
    <span>${m.title.split(". ")[1] || m.title}</span>
    <span class="badge badge-neutral" style="font-size:11px;">${m.type}</span>
  </button>`,
    )
    .join("");
}

export function go(screenId, params = {}, options = {}) {
  state.currentScreen = screenId;
  state.currentRouteParams = params;
  const meta = SCREENS[screenId];
  if (meta && meta.portal !== state.currentPortal) {
    switchPortal(meta.portal, screenId, params, options);
    return;
  }

  if (!options.skipHistory) {
    pushScreenUrl(screenId, params, Boolean(options.replace));
  }

  renderSidebar(screenId);
  renderUserTopbar();

  const viewport = document.getElementById("mainViewport");
  if (!viewport) return;

  viewport.setAttribute("data-screen", screenId);
  if (screenId === "1.1") {
    viewport.setAttribute("data-surface-mode", "stationery");
  } else if (screenId === "1.3") {
    viewport.setAttribute("data-surface-mode", "map");
  } else {
    viewport.removeAttribute("data-surface-mode");
  }

  viewport.scrollTop = 0;

  const renderer = SCREEN_RENDERERS[screenId];
  if (typeof renderer === "function") {
    renderer(viewport, params);
  } else {
    viewport.innerHTML = `<div class="panel"><h2>Màn hình ${screenId}</h2></div>`;
  }

  applyUserModeCleanups(viewport, screenId);
}
