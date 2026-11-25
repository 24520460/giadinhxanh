import { apiRequest } from "../core/api.js";
import { go, pushScreenUrl, renderUserTopbar, switchPortal } from "../core/router.js";
import { state } from "../core/state.js";
import { Icons, applyUserModeCleanups, initCustomerLocationPicker, showToast } from "../shared/ui-utils.js";

// =====================================================================
// SCREEN RENDERERS: PHÂN HỆ 0 (AUTH & ONBOARDING: 0.1 – 0.5)
// =====================================================================

// 0.1: Đăng nhập (Chính) / Đăng ký riêng biệt / Khôi phục mật khẩu riêng biệt
export function renderScreen_0_1(container, params = {}) {
  const currentView = (params && params.view) || state.authView || "login";
  state.authView = currentView;

  const isDev = !state.isProduction && state.viewMode === "dev";

  let rightFormHtml = "";

  if (currentView === "login") {
    rightFormHtml = `
    <div class="v3-seg-tabs" style="margin:0 0 20px;">
      <button type="button" class="v3-seg-tab is-active" onclick="GDXApp.setAuthView('login')">Đăng nhập</button>
      <button type="button" class="v3-seg-tab" onclick="GDXApp.setAuthView('register')">Tạo tài khoản mới</button>
    </div>
    <div class="auth-form-header">
      <span class="auth-badge-pill">Đăng nhập tài khoản</span>
      <h2 class="auth-form-title">Chào mừng bạn trở lại</h2>
      <p class="auth-form-subtitle">Nhập số điện thoại hoặc email đã đăng ký để tiếp tục vào hệ thống.</p>
    </div>

    <form class="form-stack" onsubmit="event.preventDefault(); GDXApp.handleLogin(this);">
      <div class="field-group">
        <label class="field-label" for="loginIdentifier">Số điện thoại hoặc Email</label>
        <input type="text" id="loginIdentifier" name="identifier" class="input" placeholder="09xxxxxxxx hoặc email@domain.com" required autocomplete="username">
        <div class="error-msg">Vui lòng nhập số điện thoại hoặc email hợp lệ.</div>
      </div>

      <div class="field-group">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <label class="field-label" for="loginPassword" style="margin-bottom:0;">Mật khẩu</label>
          <a href="javascript:void(0)" onclick="GDXApp.setAuthView('forgot')" class="auth-text-link" style="font-size:13px;">Quên mật khẩu?</a>
        </div>
        <div class="pw-input-wrap">
          <input type="password" id="loginPassword" name="password" class="input" placeholder="Nhập mật khẩu của bạn" required minlength="6" autocomplete="current-password">
          <button type="button" class="btn-toggle-pw" onclick="GDXApp.togglePasswordVisibility('loginPassword', this)" aria-label="Hiển thị mật khẩu">
            ${Icons.eye()}
          </button>
        </div>
        <div class="error-msg">Mật khẩu cần tối thiểu 6 ký tự.</div>
      </div>

      <button type="submit" class="btn btn-primary btn-auth-submit">
        Đăng nhập vào hệ thống &rarr;
      </button>
    </form>

    <div class="auth-switch-footer">
      <span>Bạn chưa có tài khoản?</span>
      <a href="javascript:void(0)" onclick="GDXApp.setAuthView('register')" class="auth-switch-cta">Đăng ký ngay &rarr;</a>
    </div>
  `;
  } else if (currentView === "register") {
    rightFormHtml = `
    <div class="auth-form-header">
      <span class="auth-badge-pill">Đăng ký thành viên</span>
      <h2 class="auth-form-title">Tạo tài khoản mới</h2>
      <p class="auth-form-subtitle">Chỉ mất chưa đầy 1 phút để bắt đầu sử dụng dịch vụ tiện ích gia đình.</p>
    </div>

    <form class="form-stack" onsubmit="event.preventDefault(); GDXApp.handleRegister(this);">
      <div class="field-group">
        <label class="field-label" for="regFullName">Họ và tên đầy đủ</label>
        <input type="text" id="regFullName" name="full_name" class="input" required placeholder="Ví dụ: Nguyễn Văn An" autocomplete="name">
        <div class="error-msg">Vui lòng nhập họ và tên của bạn.</div>
      </div>

      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="regPhone">Số điện thoại</label>
          <input type="tel" id="regPhone" name="phone_number" class="input" required pattern="0[0-9]{9,10}" placeholder="0918776655" autocomplete="tel">
          <div class="error-msg">Số điện thoại gồm 10 số bắt đầu bằng số 0.</div>
        </div>
        <div class="field-group">
          <label class="field-label" for="regEmail">Địa chỉ Email</label>
          <input type="email" id="regEmail" name="email" class="input" required placeholder="ban@email.com" autocomplete="email">
          <div class="error-msg">Vui lòng nhập đúng định dạng email.</div>
        </div>
      </div>

      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="regPassword">Mật khẩu</label>
          <div class="pw-input-wrap">
            <input type="password" id="regPassword" name="password" class="input" required minlength="6" placeholder="Tối thiểu 6 ký tự" autocomplete="new-password">
            <button type="button" class="btn-toggle-pw" onclick="GDXApp.togglePasswordVisibility('regPassword', this)" aria-label="Hiển thị mật khẩu">
              ${Icons.eye()}
            </button>
          </div>
          <span class="field-hint">Tối thiểu 6 ký tự bảo mật</span>
        </div>
        <div class="field-group">
          <label class="field-label" for="regConfirmPassword">Xác nhận mật khẩu</label>
          <div class="pw-input-wrap">
            <input type="password" id="regConfirmPassword" name="confirm_password" class="input" required minlength="6" placeholder="Nhập lại mật khẩu" autocomplete="new-password">
            <button type="button" class="btn-toggle-pw" onclick="GDXApp.togglePasswordVisibility('regConfirmPassword', this)" aria-label="Hiển thị mật khẩu">
              ${Icons.eye()}
            </button>
          </div>
          <span class="field-hint">Nhập lại chính xác mật khẩu</span>
        </div>
      </div>

      <div class="field-group">
        <label class="field-label">Bạn đăng ký tài khoản với vai trò nào?</label>
        <div class="choice-grid-2">
          <label class="choice-card">
            <input type="radio" name="role" value="customer" checked>
            <div>
              <div style="font-weight:600;">Khách hàng gia đình</div>
              <div class="field-hint">Đặt lịch dọn nhà, điện lạnh, nấu ăn</div>
            </div>
          </label>
          <label class="choice-card">
            <input type="radio" name="role" value="company">
            <div>
              <div style="font-weight:600;">Công ty Đối tác (B2B2C)</div>
              <div class="field-hint">Quản lý đội ngũ Thợ và cung ứng dịch vụ</div>
            </div>
          </label>
        </div>
        <div class="field-hint" style="margin-top:6px;">Nhân viên Thợ được tạo và cấp tài khoản trực tiếp từ Công ty quản lý.</div>
      </div>

      <button type="submit" class="btn btn-primary btn-auth-submit">
        Tạo tài khoản &amp; Tiếp tục thiết lập hồ sơ &rarr;
      </button>
    </form>

    <div class="auth-switch-footer">
      <span>Bạn đã có tài khoản?</span>
      <a href="javascript:void(0)" onclick="GDXApp.setAuthView('login')" class="auth-switch-cta">Đăng nhập ngay &rarr;</a>
    </div>
  `;
  } else {
    rightFormHtml = `
    <div class="auth-form-header">
      <span class="auth-badge-pill">Khôi phục quyền truy cập</span>
      <h2 class="auth-form-title">Quên mật khẩu?</h2>
      <p class="auth-form-subtitle">Đừng lo lắng! Vui lòng cung cấp email hoặc số điện thoại đã đăng ký, chúng tôi sẽ hỗ trợ bạn ngay.</p>
    </div>

    <div class="auth-info-banner">
      <span style="font-size:18px; line-height:1;">${Icons.shield()}</span>
      <div>Liên kết đặt lại mật khẩu an toàn sẽ được gửi trực tiếp đến hòm thư hoặc số điện thoại của bạn trong 60 giây.</div>
    </div>

    <form class="form-stack" onsubmit="event.preventDefault(); GDXApp.handleForgot(this);">
      <div class="field-group">
        <label class="field-label" for="forgotIdentifier">Email hoặc Số điện thoại đã đăng ký</label>
        <input type="text" id="forgotIdentifier" name="identifier" class="input" required placeholder="minhthao.q7@gmail.com hoặc 09xxxxxxxx" autocomplete="username">
        <div class="error-msg">Vui lòng nhập email hoặc số điện thoại hợp lệ.</div>
      </div>

      <button type="submit" class="btn btn-primary btn-auth-submit">
        Gửi hướng dẫn khôi phục mật khẩu &rarr;
      </button>
    </form>

    <div class="auth-switch-footer">
      <a href="javascript:void(0)" onclick="GDXApp.setAuthView('login')" class="auth-back-cta">&larr; Quay lại trang Đăng nhập</a>
    </div>
  `;
  }

  container.innerHTML = `
  <div class="auth-stage-wrapper">
    ${
      isDev
        ? `
      <div class="auth-dev-banner">
        <div class="auth-dev-banner-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge badge-info">Chế độ Phát triển</span>
            <strong style="font-size:13.5px; color:var(--ink);">Chọn nhanh tài khoản để trải nghiệm 5 vai trò hệ thống (1-Click Login):</strong>
          </div>
          <span class="field-hint">Chỉ hiển thị ở góc nhìn Dev</span>
        </div>
        <div class="auth-dev-persona-grid">
          <button type="button" class="auth-dev-chip" onclick="GDXApp.quickPersonaLogin('customer')">
            <div style="width:28px; height:28px; border-radius:50%; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; font-weight:600; font-size:12px;">MT</div>
            <div>
              <div style="font-weight:600; font-size:13px;">Nguyễn Minh Thảo</div>
              <div class="field-hint" style="font-size:11px;">Khách hàng · Q.7</div>
            </div>
          </button>
          <button type="button" class="auth-dev-chip" onclick="GDXApp.quickPersonaLogin('provider')">
            <img src="/assets/provider-lan.jpg" alt="Mai Lan" style="width:28px; height:28px; border-radius:50%; object-fit:cover;">
            <div>
              <div style="font-weight:600; font-size:13px;">Đặng Thị Mai Lan</div>
              <div class="field-hint" style="font-size:11px;">Thợ đã duyệt (4.95★)</div>
            </div>
          </button>
          <button type="button" class="auth-dev-chip" onclick="GDXApp.quickPersonaLogin('company')">
            <div style="width:28px; height:28px; border-radius:50%; background:var(--pill-positive-bg); color:var(--pill-positive-ink); display:grid; place-items:center; font-weight:600; font-size:12px;">AB</div>
            <div>
              <div style="font-weight:600; font-size:13px;">Công ty An Bình</div>
              <div class="field-hint" style="font-size:11px;">Công ty Đối tác (4.1)</div>
            </div>
          </button>
          <button type="button" class="auth-dev-chip" onclick="GDXApp.quickPersonaLogin('company_pending')">
            <div style="width:28px; height:28px; border-radius:50%; background:var(--pill-warning-bg); color:var(--pill-warning-ink); display:grid; place-items:center; font-weight:600; font-size:12px;">MS</div>
            <div>
              <div style="font-weight:600; font-size:13px;">Công ty Mai Sáng</div>
              <div class="field-hint" style="font-size:11px;">Công ty chờ duyệt (0.4)</div>
            </div>
          </button>
          <button type="button" class="auth-dev-chip" onclick="GDXApp.quickPersonaLogin('provider_rejected')">
            <div style="width:28px; height:28px; border-radius:50%; background:var(--pill-negative-bg); color:var(--pill-negative-ink); display:grid; place-items:center; font-weight:600; font-size:12px;">MĐ</div>
            <div>
              <div style="font-weight:600; font-size:13px;">Ngô Minh Đức</div>
              <div class="field-hint" style="font-size:11px;">Tài khoản tạm khóa</div>
            </div>
          </button>
          <button type="button" class="auth-dev-chip" onclick="GDXApp.quickPersonaLogin('admin')">
            <div style="width:28px; height:28px; border-radius:50%; background:var(--pill-info-bg); color:var(--pill-info-ink); display:grid; place-items:center; font-weight:600; font-size:12px;">QH</div>
            <div>
              <div style="font-weight:600; font-size:13px;">Nguyễn Quang Hào</div>
              <div class="field-hint" style="font-size:11px;">Quản trị viên (3.1)</div>
            </div>
          </button>
        </div>
      </div>
    `
        : ""
    }

    <div class="auth-split-card">
      <!-- Left: Editorial Lifestyle Photo -->
      <div class="auth-brand-side v3-auth-editorial">
        <div class="auth-brand-badge">
          ${Icons.shield()} 10.000+ Tổ ấm tin dùng
        </div>
      </div>

      <!-- Right: Dedicated Form Surface (Login / Register / Forgot) -->
      <div class="auth-form-side">
        ${rightFormHtml}
      </div>
    </div>
  </div>
`;

  applyUserModeCleanups(container, "0.1");
}

export function setAuthView(view = "login") {
  state.authView = view;
  pushScreenUrl("0.1", { view });
  const vp = document.getElementById("mainViewport");
  if (vp) {
    renderScreen_0_1(vp, { view });
  }
}

export function setAuthTab(tab) {
  const view =
    tab === "forgot" ? "forgot" : tab === "register" ? "register" : "login";
  setAuthView(view);
}

export function handleForgot(form) {
  const identifier =
    form && form.identifier ? form.identifier.value.trim() : "";
  if (!identifier) {
    showToast("Vui lòng nhập email hoặc số điện thoại đã đăng ký.");
    return;
  }
  showToast(
    `Đã gửi hướng dẫn khôi phục mật khẩu tới: ${identifier}. Vui lòng kiểm tra hộp thư/tin nhắn.`,
  );
  setTimeout(() => {
    setAuthView("login");
  }, 1200);
}

export function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPw = input.type === "password";
  input.type = isPw ? "text" : "password";
  if (btnEl) {
    btnEl.setAttribute(
      "aria-label",
      isPw ? "Ẩn mật khẩu" : "Hiển thị mật khẩu",
    );
    btnEl.innerHTML = isPw ? Icons.eyeOff() : Icons.eye();
  }
}

export function quickPersonaLogin(role) {
  handleLogin({ mockRole: { value: role } });
}

export async function handleLogin(form) {
  const hasIdentifier = Boolean(
    form &&
    form.identifier &&
    form.identifier.value &&
    form.identifier.value.trim(),
  );
  const hasPassword = Boolean(form && form.password && form.password.value);

  // Cho phép trải nghiệm nhanh persona ở chế độ phát triển nếu không nhập thủ công
  if (
    !hasIdentifier &&
    form &&
    form.mockRole &&
    !state.isProduction &&
    state.viewMode !== "production"
  ) {
    const role = form.mockRole.value || "customer";
    if (role === "customer") {
      showToast("Đã đăng nhập: Nguyễn Minh Thảo (Khách hàng)");
      switchPortal(1, "1.1");
    } else if (role === "provider") {
      showToast("Đã đăng nhập: Đặng Thị Mai Lan (Đối tác Thợ)");
      switchPortal(2, "2.1");
    } else if (role === "company") {
      state.activeCompanyId = 501;
      showToast("Đã đăng nhập: Công ty TNHH An Bình Home Care");
      switchPortal(4, "4.1");
    } else if (role === "company_pending") {
      state.activeCompanyId = 503;
      showToast("Hồ sơ Công ty Mai Sáng đang chờ Admin xét duyệt");
      switchPortal(0, "0.4", { status: "pending" });
    } else if (role === "provider_rejected") {
      showToast("Tài khoản Ngô Minh Đức đang tạm khóa");
      switchPortal(0, "0.5");
    } else if (role === "admin") {
      showToast("Đã đăng nhập: Nguyễn Quang Hào (Quản trị viên)");
      switchPortal(3, "3.1");
    }
    return;
  }

  const identifier =
    form && form.identifier ? form.identifier.value.trim() : "";
  const password = form && form.password ? form.password.value : "";

  if (!identifier) {
    showToast("Vui lòng nhập số điện thoại hoặc email.");
    return;
  }
  if (!password) {
    showToast("Vui lòng nhập mật khẩu của bạn.");
    return;
  }

  // Gửi yêu cầu đăng nhập lên API xác thực
  const res = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });

  if (res && res.ok && res.user) {
    state.currentUser = res.user;
    state.activeUserId = res.user.user_id;
    state.userRole = res.user.role;
    if (res.token) state.authToken = res.token;

    if (window.GDX_DB && Array.isArray(window.GDX_DB.users)) {
      const uIdx = window.GDX_DB.users.findIndex(
        (u) => u.user_id === res.user.user_id,
      );
      if (uIdx >= 0) window.GDX_DB.users[uIdx] = res.user;
      else window.GDX_DB.users.push(res.user);
    }

    if (res.customer_profile) {
      state.activeCustomerId = res.customer_profile.customer_id;
      state.wizardDraft.ward_id = res.customer_profile.ward_id;
      state.wizardDraft.address = res.customer_profile.default_address;
      state.wizardDraft.latitude = res.customer_profile.latitude;
      state.wizardDraft.longitude = res.customer_profile.longitude;
      if (window.GDX_DB && Array.isArray(window.GDX_DB.customer_profiles)) {
        const cIdx = window.GDX_DB.customer_profiles.findIndex(
          (c) => String(c.user_id) === String(res.user.user_id),
        );
        if (cIdx >= 0)
          window.GDX_DB.customer_profiles[cIdx] = res.customer_profile;
        else window.GDX_DB.customer_profiles.push(res.customer_profile);
      }
    }

    if (res.provider_profile) {
      state.activeProviderId = res.provider_profile.provider_id;
      if (window.GDX_DB && Array.isArray(window.GDX_DB.provider_profiles)) {
        const pIdx = window.GDX_DB.provider_profiles.findIndex(
          (p) => String(p.user_id) === String(res.user.user_id),
        );
        if (pIdx >= 0)
          window.GDX_DB.provider_profiles[pIdx] = res.provider_profile;
        else window.GDX_DB.provider_profiles.push(res.provider_profile);
      }
    }

    if (res.company_profile) {
      state.activeCompanyId = res.company_profile.company_id;
      if (window.GDX_DB && Array.isArray(window.GDX_DB.company_profiles)) {
        const compIdx = window.GDX_DB.company_profiles.findIndex(
          (c) => String(c.user_id) === String(res.user.user_id),
        );
        if (compIdx >= 0)
          window.GDX_DB.company_profiles[compIdx] = res.company_profile;
        else window.GDX_DB.company_profiles.push(res.company_profile);
      }
    }

    try {
      localStorage.setItem("gdx_auth_user", JSON.stringify(res.user));
      if (res.token) localStorage.setItem("gdx_auth_token", res.token);
    } catch (_) {}

    showToast(`Đăng nhập thành công! Chào mừng ${res.user.full_name}.`);
    renderUserTopbar();

    if (res.user.role === "provider") {
      switchPortal(2, "2.1");
    } else if (res.user.role === "company") {
      if (!res.company_profile) {
        switchPortal(0, "0.3");
      } else if (res.company_profile.verification_status !== "verified") {
        switchPortal(0, "0.4", {
          status: res.company_profile.verification_status,
        });
      } else {
        switchPortal(4, "4.1");
      }
    } else if (res.user.role === "admin") {
      switchPortal(3, "3.1");
    } else {
      switchPortal(1, "1.1");
    }
  } else {
    showToast(
      (res && res.error) ||
        "Đăng nhập không thành công. Vui lòng kiểm tra lại tài khoản hoặc mật khẩu.",
    );
  }
}

export async function handleRegister(form) {
  const role = form.role ? form.role.value : "customer";
  const fullName = form.full_name ? form.full_name.value.trim() : "";
  const phone = form.phone_number ? form.phone_number.value.trim() : "";
  const email = form.email ? form.email.value.trim() : "";
  const password = form.password ? form.password.value : "";
  const confirmPassword = form.confirm_password
    ? form.confirm_password.value
    : "";

  if (!fullName || !phone) {
    showToast("Vui lòng nhập họ và tên cùng số điện thoại.");
    return;
  }

  if (!password || password.length < 6) {
    showToast("Mật khẩu là bắt buộc và phải có tối thiểu 6 ký tự.");
    if (form.password) form.password.focus();
    return;
  }

  if (password !== confirmPassword) {
    showToast("Mật khẩu xác nhận không trùng khớp. Vui lòng kiểm tra lại.");
    if (form.confirm_password) form.confirm_password.focus();
    return;
  }

  const res = await apiRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      full_name: fullName,
      phone_number: phone,
      email,
      password,
      role,
    }),
  });

  if (res && res.ok && res.user) {
    state.currentUser = res.user;
    state.activeUserId = res.user.user_id;
    state.userRole = res.user.role;
    if (res.token) state.authToken = res.token;

    if (window.GDX_DB && Array.isArray(window.GDX_DB.users)) {
      const uIdx = window.GDX_DB.users.findIndex(
        (u) => u.user_id === res.user.user_id,
      );
      if (uIdx >= 0) window.GDX_DB.users[uIdx] = res.user;
      else window.GDX_DB.users.push(res.user);
    }

    try {
      localStorage.setItem("gdx_auth_user", JSON.stringify(res.user));
      if (res.token) localStorage.setItem("gdx_auth_token", res.token);
    } catch (_) {}

    showToast(
      `Đăng ký tài khoản thành công! Chào mừng ${res.user.full_name}.`,
    );
    renderUserTopbar();
    if (role === "customer") {
      go("0.2");
    } else {
      go("0.3");
    }
  } else {
    showToast(
      (res && res.error) || "Đăng ký không thành công. Vui lòng thử lại.",
    );
  }
}

export function handleLogout() {
  state.currentUser = null;
  state.authToken = null;
  state.activeUserId = null;
  state.activeCustomerId = null;
  state.activeProviderId = null;
  state.activeCompanyId = null;
  state.userRole = "anon";
  try {
    localStorage.removeItem("gdx_auth_user");
    localStorage.removeItem("gdx_auth_token");
  } catch (_) {}
  showToast("Đã đăng xuất tài khoản.");
  renderUserTopbar();
  switchPortal(1, "1.1");
}


// 0.2: Customer Onboarding (Địa điểm, Đơn vị hành chính & Định vị GPS)
export function renderScreen_0_2(container) {
  const provinces = window.GDX_DB.province || window.GDX_DB.provinces || [];
  const allWards = window.GDX_DB.ward || window.GDX_DB.wards || [];
  const defaultName =
    (state.currentUser && state.currentUser.full_name) || "";
  const defaultPhone =
    (state.currentUser && state.currentUser.phone_number) || "";

  const existingCp = (window.GDX_DB.customer_profiles || []).find(
    (c) => c.user_id === state.activeUserId,
  );
  const defaultLat =
    existingCp && existingCp.latitude
      ? Number(existingCp.latitude).toFixed(6)
      : "10.741205";
  const defaultLng =
    existingCp && existingCp.longitude
      ? Number(existingCp.longitude).toFixed(6)
      : "106.702110";
  const defaultAddr =
    existingCp && existingCp.default_address
      ? existingCp.default_address
      : "Số 123 Đường Nguyễn Hữu Thọ, Phường Tân Phong";

  // Mặc định chọn TP. Hồ Chí Minh (provinceId: '29' ở Supabase hoặc '79' ở local mock) hoặc tỉnh đầu tiên
  const defaultProv = provinces.find(
    (p) => p.provinceId === "29" || p.provinceId === "79",
  ) ||
    provinces[0] || { provinceId: "29", name: "Thành phố Hồ Chí Minh" };
  const defaultProvId = String(defaultProv.provinceId);
  const initialWards = allWards.filter(
    (w) => !w.provinceId || String(w.provinceId) === defaultProvId,
  );
  const wardsToRender =
    initialWards.length > 0 ? initialWards : allWards.slice(0, 100);

  container.innerHTML = `
  <div class="screen-header">
    <div>
      <h1 class="screen-title">0.2. Thiết lập hồ sơ Khách hàng mới</h1>
      <p class="screen-finding">Bắt buộc theo ràng buộc NOT NULL customer_profiles.ward_id và users.phone_number.</p>
    </div>
    <button type="button" class="btn btn-secondary btn-sm" onclick="GDXApp.switchPortal(1, '1.1')">Bỏ qua &amp; Về trang chủ</button>
  </div>

  <div class="grid-12">
    <div class="col-8">
      <div class="panel">
        <form class="form-stack" onsubmit="event.preventDefault(); GDXApp.handleCustomerOnboarding(this);">
          <input type="hidden" id="obCustLat" name="latitude" value="${defaultLat}">
          <input type="hidden" id="obCustLng" name="longitude" value="${defaultLng}">

          <div class="field-group">
            <span class="field-label">Loại địa điểm</span>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="filter-chip" aria-pressed="true" onclick="this.parentElement.querySelectorAll('.filter-chip').forEach(c=>c.setAttribute('aria-pressed','false')); this.setAttribute('aria-pressed','true');">🏠 Nhà riêng</button>
              <button type="button" class="filter-chip" aria-pressed="false" onclick="this.parentElement.querySelectorAll('.filter-chip').forEach(c=>c.setAttribute('aria-pressed','false')); this.setAttribute('aria-pressed','true');">🏢 Căn hộ</button>
              <button type="button" class="filter-chip" aria-pressed="false" onclick="this.parentElement.querySelectorAll('.filter-chip').forEach(c=>c.setAttribute('aria-pressed','false')); this.setAttribute('aria-pressed','true');">🏡 Nhà bố mẹ</button>
            </div>
          </div>

          <div class="form-row-2">
            <div class="field-group">
              <label class="field-label" for="obCustName">Họ và tên người liên hệ (users.full_name)</label>
              <input type="text" id="obCustName" name="full_name" class="input" value="${defaultName || "Khách hàng mới"}" required>
              <div class="error-msg">Vui lòng nhập họ và tên.</div>
            </div>
            <div class="field-group">
              <label class="field-label" for="obCustPhone">Số điện thoại đón thợ (users.phone_number)</label>
              <input type="tel" id="obCustPhone" name="phone_number" class="input" value="${defaultPhone || "0901234567"}" required pattern="0[0-9]{9,10}">
              <div class="error-msg">Vui lòng nhập số điện thoại 10 chữ số.</div>
            </div>
          </div>

          <div class="form-row-2">
            <div class="field-group">
              <label class="field-label" for="obCustProvince">Tỉnh / Thành phố (${provinces.length} tỉnh thành)</label>
              <select id="obCustProvince" class="select" onchange="GDXApp.handleProvinceChange('obCustProvince', 'obCustWard')">
                ${provinces.map((p) => `<option value="${p.provinceId}" ${String(p.provinceId) === defaultProvId ? "selected" : ""}>${p.name}</option>`).join("")}
              </select>
            </div>
            <div class="field-group">
              <label class="field-label" for="obCustWard">Phường / Xã (customer_profiles.ward_id - Bắt buộc)</label>
              <select id="obCustWard" name="ward_id" class="select" required>
                ${wardsToRender.map((w) => `<option value="${w.ward_id}">${w.name}</option>`).join("")}
              </select>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label" for="obCustAddr">Số nhà, tên đường hoặc tòa căn hộ (default_address)</label>
            <span class="field-hint">Địa chỉ này sẽ được tự động điền sẵn mỗi khi bạn đặt lịch dịch vụ mới</span>
            <input type="text" id="obCustAddr" name="default_address" class="input" value="${defaultAddr}" required>
          </div>

          <div class="field-group">
            <label class="field-label" style="display:flex; justify-content:space-between; align-items:center;">
              <span>Địa điểm, Đơn vị hành chính &amp; Định vị GPS (Tọa độ không gian)</span>
              <span class="badge badge-success" style="font-weight:normal; font-size:11px;">Leaflet &bull; OpenStreetMap</span>
            </label>
            <div class="geo-map-card">
              <div class="geo-map-toolbar">
                <div class="geo-map-status-pill">
                  <span class="status-dot is-online"></span>
                  <span>Chạm vào bản đồ hoặc kéo chốt định vị để ghim chính xác số nhà</span>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="GDXApp.locateUserGPS('obCustLat', 'obCustLng', 'obCustCoordText', 'obCustAddr', 'obCustProvince', 'obCustWard')">
                  ${Icons.pin()} Lấy tọa độ GPS &amp; Nhận diện địa chỉ
                </button>
              </div>

              <div id="customerLocationMap" class="geo-map-container" tabindex="0" aria-label="Bản đồ định vị Leaflet OpenStreetMap"></div>

              <div class="geo-map-footer">
                <div>
                  <span>Tọa độ đã chọn:</span>
                  <span id="obCustCoordText" class="geo-coords-tag">${defaultLat}, ${defaultLng}</span>
                </div>
                <span class="field-hint" style="margin:0;">Lưu trữ trực tiếp vào customer_profiles.latitude &amp; longitude</span>
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:12px; padding-top:8px;">
            <button type="submit" class="btn btn-primary" style="height:42px;">
              Lưu hồ sơ &amp; Khám phá dịch vụ &rarr;
            </button>
          </div>
        </form>
      </div>
    </div>

    <div class="col-4">
      <div class="panel-subtle form-stack">
        <h2 class="panel-title">Vì sao cần sổ địa chỉ mặc định?</h2>
        <p class="field-hint">
          Hệ thống Gia Đình Xanh kết nối khách hàng với các đối tác thợ đăng ký hoạt động theo từng Phường/Xã cụ thể.
        </p>
        <div class="audit-timeline">
          <div class="audit-item">
            <strong>Lọc đúng thợ gần nhà</strong>
            <div class="field-hint">Chỉ hiển thị những thợ có nhận làm tại Phường/Xã của bạn.</div>
          </div>
          <div class="audit-item">
            <strong>Bản đồ số không gian Leaflet + OSM</strong>
            <div class="field-hint">Đo lường khoảng cách chính xác từ vị trí thợ đến cửa nhà bạn theo km thực tế.</div>
          </div>
          <div class="audit-item">
            <strong>Đặt lịch nhanh trong 30 giây</strong>
            <div class="field-hint">Không cần nhập lại địa chỉ và số điện thoại ở những lần đặt sau.</div>
          </div>
          <div class="audit-item">
            <strong>Minh bạch đơn giá</strong>
            <div class="field-hint">Hiển thị rõ đơn giá theo giờ hoặc trọn gói trước khi xác nhận.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

  // Khởi tạo bản đồ tương tác Leaflet + OpenStreetMap
  initCustomerLocationPicker({
    containerId: "customerLocationMap",
    lat: Number(defaultLat),
    lng: Number(defaultLng),
    zoom: 15,
    latInputId: "obCustLat",
    lngInputId: "obCustLng",
    coordTextId: "obCustCoordText",
    addrInputId: "obCustAddr",
    provSelectId: "obCustProvince",
    wardSelectId: "obCustWard",
  });
}

export async function handleCustomerOnboarding(form) {
  const userId = state.activeUserId;
  if (!userId) {
    showToast("Vui lòng đăng ký tài khoản trước.");
    go("0.1");
    return;
  }

  const latVal = form.latitude
    ? parseFloat(form.latitude.value)
    : 10.741205;
  const lngVal = form.longitude
    ? parseFloat(form.longitude.value)
    : 106.70211;

  const res = await apiRequest("/api/onboarding/customer", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      full_name: form.full_name ? form.full_name.value : "",
      phone_number: form.phone_number ? form.phone_number.value : "",
      ward_id: form.ward_id ? form.ward_id.value : "27403",
      default_address: form.default_address
        ? form.default_address.value
        : "",
      latitude: isNaN(latVal) ? 10.741205 : latVal,
      longitude: isNaN(lngVal) ? 106.70211 : lngVal,
    }),
  });

  if (res && res.ok && res.customer_profile) {
    state.activeCustomerId = res.customer_profile.customer_id;
    if (res.user) state.currentUser = res.user;

    // Đồng bộ vào DB client-side nếu có
    if (window.GDX_DB && window.GDX_DB.customer_profiles) {
      let cp = window.GDX_DB.customer_profiles.find(
        (c) =>
          String(c.user_id) === String(userId) ||
          String(c.customer_id) ===
            String(res.customer_profile.customer_id),
      );
      if (!cp) {
        window.GDX_DB.customer_profiles.push(res.customer_profile);
      } else {
        Object.assign(cp, res.customer_profile);
      }
    }

    // Cập nhật wizardDraft để trang đặt lịch nhận ngay lập tức địa chỉ vừa lưu
    state.wizardDraft.ward_id = res.customer_profile.ward_id;
    state.wizardDraft.address = res.customer_profile.default_address;
    state.wizardDraft.latitude = res.customer_profile.latitude;
    state.wizardDraft.longitude = res.customer_profile.longitude;

    showToast(
      "Đã lưu hồ sơ và vị trí GPS thành công! Bạn có thể đặt dịch vụ đầu tiên.",
    );
    renderUserTopbar();
    switchPortal(1, "1.1");
  } else {
    showToast((res && res.error) || "Có lỗi khi lưu hồ sơ khách hàng.");
  }
}

// 0.3: Company Onboarding
export function renderScreen_0_3(container) {
  const db = window.GDX_DB;
  const wards = (db.ward || db.wards || []).filter(
    (w) => !w.provinceId || String(w.provinceId) === "79",
  );
  const existingComp =
    (db.company_profiles || []).find(
      (c) => String(c.user_id) === String(state.activeUserId),
    ) || null;
  const u =
    state.currentUser ||
    (db.users || []).find(
      (x) => String(x.user_id) === String(state.activeUserId),
    ) ||
    {};

  container.innerHTML = `
  <div class="screen-header">
    <div>
      <h1 class="screen-title">0.3. Đăng ký Hồ sơ Công ty Đối tác (Company Onboarding)</h1>
      <p class="screen-finding">Bổ sung bảng company_profiles: Tên doanh nghiệp, Mã số thuế (tax_code), địa chỉ trụ sở &amp; SĐT liên hệ.</p>
    </div>
    <button type="button" class="btn btn-secondary btn-sm" onclick="GDXApp.go('0.4', {status:'pending'})">Xem trạng thái xác minh</button>
  </div>

  <form class="form-stack" onsubmit="event.preventDefault(); GDXApp.handleCompanyOnboarding(this);">
    <div class="panel form-stack">
      <div class="panel-header" style="margin-bottom:0;">
        <div>
          <h2 class="panel-title">Thông tin pháp lý &amp; Liên hệ Doanh nghiệp</h2>
          <p class="field-hint">Ánh xạ bảng company_profiles (company_name, tax_code, ward_id, address, phone_number, description)</p>
        </div>
        <span class="badge badge-info">Xác minh Công ty B2B2C</span>
      </div>

      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="obCompName">Tên Công ty Đối tác (company_name)</label>
          <input type="text" id="obCompName" name="company_name" class="input" value="${(existingComp && existingComp.company_name) || (u.full_name ? `Công ty Dịch vụ ${u.full_name}` : "Công ty Dịch vụ Gia đình Thanh Tâm")}" required minlength="3">
        </div>
        <div class="field-group">
          <label class="field-label" for="obCompTax">Mã số thuế (tax_code UNIQUE)</label>
          <input type="text" id="obCompTax" name="tax_code" class="input" value="${(existingComp && existingComp.tax_code) || "0319888777"}" required minlength="6" maxlength="32">
        </div>
      </div>

      <div class="form-row-2">
        <div class="field-group">
          <label class="field-label" for="obCompPhone">Số điện thoại doanh nghiệp (phone_number)</label>
          <input type="tel" id="obCompPhone" name="phone_number" class="input" value="${(existingComp && existingComp.phone_number) || u.phone_number || "0909888111"}" required>
        </div>
        <div class="field-group">
          <label class="field-label" for="obCompWard">Phường / Xã đặt trụ sở (ward_id)</label>
          <select id="obCompWard" name="ward_id" class="select">
            ${wards
              .slice(0, 40)
              .map(
                (w) =>
                  `<option value="${w.ward_id}" ${existingComp && String(existingComp.ward_id) === String(w.ward_id) ? "selected" : ""}>${w.name} (${w.ward_id})</option>`,
              )
              .join("")}
          </select>
        </div>
      </div>

      <div class="field-group">
        <label class="field-label" for="obCompAddr">Địa chỉ trụ sở chi tiết (company_profiles.address)</label>
        <input type="text" id="obCompAddr" name="address" class="input" value="${(existingComp && existingComp.address) || "180 Nguyễn Thị Thập, Quận 7, TP.HCM"}" required>
      </div>

      <div class="field-group">
        <label class="field-label" for="obCompDesc">Mô tả năng lực vận hành &amp; đội ngũ (company_profiles.description)</label>
        <textarea id="obCompDesc" name="description" class="textarea" rows="3" required>${(existingComp && existingComp.description) || "Cung cấp đội ngũ thợ vệ sinh nhà cửa, nấu ăn gia đình chuyên nghiệp được đào tạo bài bản và quản lý chất lượng trực tiếp."}</textarea>
      </div>

      <div class="panel-subtle" style="font-size:13px; color:var(--app-muted);">
        Lưu ý: Sau khi nộp hồ sơ Công ty và được Quản trị viên phê duyệt (verified), bạn sẽ được mở Cổng Công ty (Phân hệ 4) để tạo tài khoản Thợ, khóa/mở khóa Thợ và thiết lập dịch vụ của Công ty.
      </div>

      <div style="display:flex; justify-content:flex-end; gap:12px; padding-top:8px;">
        <button type="submit" class="btn btn-primary" style="height:44px;">
          Nộp hồ sơ xác minh Công ty &rarr;
        </button>
      </div>
    </div>
  </form>
`;
}

export function selectOnboardingAvatar(url) {
  state.onboardingAvatar = url;
}

export async function handleCompanyOnboarding(form) {
  const userId = state.activeUserId;
  if (!userId) {
    showToast("Vui lòng đăng ký tài khoản Công ty trước.");
    go("0.1", { view: "register" });
    return;
  }

  const res = await apiRequest("/api/onboarding/company", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      company_name: form.company_name ? form.company_name.value.trim() : "",
      tax_code: form.tax_code ? form.tax_code.value.trim() : "",
      phone_number: form.phone_number ? form.phone_number.value.trim() : "",
      ward_id: form.ward_id ? form.ward_id.value : "27403",
      address: form.address ? form.address.value.trim() : "",
      description: form.description ? form.description.value.trim() : "",
    }),
  });

  if (res && res.ok && res.company_profile) {
    state.activeCompanyId = res.company_profile.company_id;
    if (window.GDX_DB && Array.isArray(window.GDX_DB.company_profiles)) {
      const idx = window.GDX_DB.company_profiles.findIndex(
        (c) =>
          Number(c.company_id) === Number(res.company_profile.company_id),
      );
      if (idx >= 0)
        window.GDX_DB.company_profiles[idx] = res.company_profile;
      else window.GDX_DB.company_profiles.push(res.company_profile);
    }
    showToast(
      "Đã nộp hồ sơ Công ty! Chuyển sang trang theo dõi trạng thái xác minh.",
    );
    go("0.4", {
      status: res.company_profile.verification_status || "pending",
    });
  } else {
    showToast(
      (res && res.error) ||
        "Không thể lưu hồ sơ Công ty. Vui lòng kiểm tra lại thông tin.",
    );
  }
}

export function handleProviderOnboarding(form) {
  return handleCompanyOnboarding(form);
}

// 0.4: Company Verification Status
export function renderScreen_0_4(container, params = {}) {
  const db = window.GDX_DB;
  const requestedStatus = params.status;
  let comp = (db.company_profiles || []).find(
    (c) => String(c.company_id) === String(state.activeCompanyId),
  ) ||
    (db.company_profiles || []).find(
      (c) => c.verification_status === (requestedStatus || "pending"),
    ) ||
    (db.company_profiles || [])[2] ||
    (db.company_profiles || [])[0] || {
      company_id: 503,
      company_name: "Công ty Vệ Sinh Mai Sáng",
      tax_code: "0318554321",
      phone_number: "0911223344",
      address: "Quận 7, TP.HCM",
      verification_status: "pending",
      description: "Hồ sơ đang chờ xét duyệt",
    };

  const effStatus =
    requestedStatus || comp.verification_status || "pending";
  const isPending = effStatus === "pending";
  const isVerified = effStatus === "verified";

  container.innerHTML = `
  <div class="screen-header">
    <div>
      <h1 class="screen-title">0.4. Trạng thái Xác minh Công ty Đối tác</h1>
      <p class="screen-finding">Bảng company_profiles: Chỉ công ty verified mới xuất hiện nhân viên &amp; dịch vụ trên sàn đặt lịch.</p>
    </div>
    <div class="screen-actions">
      <button type="button" class="btn btn-secondary btn-sm" onclick="GDXApp.go('0.4', {status: '${isPending ? "rejected" : "pending"}'})">
        Chuyển xem trạng thái: ${isPending ? "Cần bổ sung hồ sơ" : "Đang chờ duyệt"}
      </button>
    </div>
  </div>

  <div class="stepper-track" style="margin-bottom:20px;">
    <div class="stepper-node is-done">
      <div class="stepper-icon">${Icons.check()}</div>
      <div>
        <div style="font-weight:600; font-size:13.5px;">Nộp hồ sơ Công ty</div>
        <div class="field-hint">Đã ghi nhận thông tin pháp lý</div>
      </div>
    </div>
    <div class="stepper-node ${isPending ? "is-current" : "is-done"}">
      <div class="stepper-icon">${Icons.shield()}</div>
      <div>
        <div style="font-weight:600; font-size:13.5px;">Thẩm định Mã số thuế &amp; Giấy phép</div>
        <div class="field-hint">${isPending ? "Quản trị viên đang đối chiếu" : isVerified ? "Đã duyệt hợp lệ" : "Cần bổ sung hồ sơ"}</div>
      </div>
    </div>
    <div class="stepper-node ${isVerified ? "is-done" : ""}">
      <div class="stepper-icon">${Icons.user()}</div>
      <div>
        <div style="font-weight:600; font-size:13.5px;">Mở khóa Cổng Công ty</div>
        <div class="field-hint">Quản lý nhân viên &amp; dịch vụ</div>
      </div>
    </div>
  </div>

  <div class="grid-12">
    <div class="col-7">
      <div class="panel form-stack">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <h2 class="panel-title">${comp.company_name}</h2>
            <div class="field-hint">MST: <strong class="num">${comp.tax_code}</strong> · SĐT: ${comp.phone_number || "—"}</div>
          </div>
          <span class="badge ${isVerified ? "badge-positive" : isPending ? "badge-warning" : "badge-negative"}">
            ${isVerified ? "Đã xác minh" : isPending ? "Đang chờ xét duyệt" : "Cần bổ sung hồ sơ"}
          </span>
        </div>

        <div class="panel-subtle">
          <div style="font-weight:600; margin-bottom:6px;">
            ${isVerified ? "Công ty đã được phê duyệt hoạt động!" : isPending ? "Hồ sơ Công ty đang được Admin kiểm tra" : "Hồ sơ chưa đạt yêu cầu xác minh"}
          </div>
          <p class="field-hint" style="font-size:13.5px;">
            ${
              isVerified
                ? "Bạn có thể truy cập Phân hệ 4 (Công ty Đối tác) để thêm nhân viên Thợ, phân công kỹ năng và phát hành gói dịch vụ."
                : isPending
                  ? "Quản trị viên đang kiểm tra mã số thuế và thông tin liên hệ của doanh nghiệp. Sau khi duyệt, bạn có thể quản lý nhân viên và dịch vụ."
                  : "Mã số thuế hoặc thông tin trụ sở chưa đầy đủ. Vui lòng cập nhật lại thông tin ở màn hình Đăng ký Công ty."
            }
          </p>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; padding-top:6px;">
          ${isVerified ? `<button type="button" class="btn btn-primary" onclick="GDXApp.switchPortal(4, '4.1')">Mở Cổng Công ty &rarr;</button>` : ""}
          <button type="button" class="btn btn-primary" onclick="GDXApp.switchPortal(1, '1.1')">Về trang chủ dịch vụ</button>
          <button type="button" class="btn btn-secondary" onclick="GDXApp.go('0.3')">Chỉnh sửa hồ sơ Công ty</button>
        </div>
      </div>
    </div>

    <div class="col-5">
      <div class="panel form-stack">
        <h2 class="panel-title">Tóm tắt hồ sơ doanh nghiệp</h2>
        <div class="slip-row">
          <span class="field-hint">Trạng thái hiện tại</span>
          <span class="slip-dots"></span>
          <strong>${isVerified ? "Đã xác minh" : isPending ? "Chờ duyệt" : "Từ chối"}</strong>
        </div>
        <div class="slip-row">
          <span class="field-hint">Mã số thuế</span>
          <span class="slip-dots"></span>
          <strong class="num">${comp.tax_code}</strong>
        </div>
        <div class="slip-row">
          <span class="field-hint">Trụ sở chính</span>
          <span class="slip-dots"></span>
          <strong>${comp.address || "TP.HCM"}</strong>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="GDXApp.openModal('1.11')">
          Liên hệ Trung tâm Hỗ trợ
        </button>
      </div>
    </div>
  </div>
`;
}

// 0.5: Account Suspended
export function renderScreen_0_5(container) {
  container.innerHTML = `
  <div class="v3-glass-center-card" style="max-width:740px; margin:36px auto; padding:44px 40px; border-radius:28px; background:rgba(255,255,255,0.88); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.75); box-shadow:0 18px 42px rgba(27,67,50,0.08); text-align:center;">
    <span class="badge badge-negative" style="padding:6px 16px; font-size:13px;">⛔ Tài khoản đang tạm khóa</span>
    <h1 style="font-family:var(--font-heading); font-size:28px; font-weight:700; color:#16201C; margin:18px 0 18px;">
      Tài khoản của bạn tạm thời bị hạn chế
    </h1>

    <div style="text-align:left; padding:22px 24px; border-radius:18px; background:#F5F7F6; border:1px solid rgba(27,67,50,0.10); margin-bottom:28px;">
      <div style="font-size:14px; font-weight:600; color:#16201C; margin-bottom:8px;">Tài khoản: Ngô Minh Đức · SĐT: <span class="num">0966509311</span></div>
      <p style="font-size:14px; color:#4A5568; line-height:1.55; margin:0;">
        Lý do: Hệ thống ghi nhận hủy ca đột xuất quá quy định hoặc đang có phiếu khiếu nại cần xác minh. Trong thời gian này, thao tác đặt lịch và nhận việc tạm thời bị vô hiệu hóa.
      </p>
    </div>

    <div style="display:flex; justify-content:center; gap:14px; flex-wrap:wrap;">
      <button type="button" class="btn btn-primary" style="min-width:210px; padding:12px 22px;" onclick="GDXApp.openModal('1.11')">
        Gửi yêu cầu giải trình
      </button>
      <button type="button" class="btn btn-secondary" style="min-width:180px; padding:12px 22px;" onclick="GDXApp.switchPortal(0, '0.1')">
        Đăng xuất
      </button>
    </div>
  </div>
`;
}

