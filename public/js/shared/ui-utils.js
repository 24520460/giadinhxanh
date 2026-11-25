import { apiRequest } from "../core/api.js";
import { cleanTechnicalLabelText } from "../core/formatters.js";
import { USER_SCREEN_COPY, isDevFromUrl, state } from "../core/state.js";
import { updateBookingAddressSummary } from "../portals/customer.js";

// --- SVG ICON LIBRARY (Impeccable Craft Floor: Zero Emoji, Uniform Stroke) ---
export const Icons = {
  star(filled = true) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  },
  starRow(rating = 5) {
    const r = Math.round(Number(rating) || 0);
    let out = '<span class="star-row" aria-hidden="true">';
    for (let i = 1; i <= 5; i++) {
      out += Icons.star(i <= r);
    }
    out += "</span>";
    return out;
  },
  heart(filled = false) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  },
  clock() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  },
  pin() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  },
  check() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  },
  shield() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  },
  user() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  },
  calendar() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  },
  lock() {
    return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  },
  eye() {
    return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  },
  eyeOff() {
    return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  },
};


// --- MODERN WEB GUIDANCE: TOP-LAYER EXIT & DEFERRED VALIDATION ---
let supportsDisplayTransition;
export function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined)
    return supportsDisplayTransition;
  if (
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText =
    "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransition = getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransition;
}

export function supportsTopLayerExit() {
  return (
    window.CSS?.supports?.("overlay", "auto") && canTransitionDisplay()
  );
}

export async function closeTopLayer(element) {
  if (!element) return;
  if (!supportsTopLayerExit()) {
    element.setAttribute("data-closing", "");
    const animations = element.getAnimations
      ? element.getAnimations({ subtree: true })
      : [];
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 400)),
      ]);
    }
    if (!element.hasAttribute("data-closing")) return;
    element.removeAttribute("data-closing");
  }
  if (typeof element.close === "function" && element.open) {
    element.close();
  } else {
    element.removeAttribute("open");
  }
}

export const UserInvalidFallback = (() => {
  const dirtyState = new WeakMap();
  const updateState = (input) => {
    if (!input.checkValidity) return;
    const isValid = input.checkValidity();
    input.classList.toggle("user-invalid-fallback", !isValid);
    input.classList.toggle("user-valid-fallback", isValid);
    if (!isValid) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  };
  const handleEvent = (event) => {
    const input = event.target;
    if (!input || !input.checkValidity) return;
    if (event.type === "input" || event.type === "change") {
      const st = dirtyState.get(input) || {
        hasInteracted: false,
        hasBlurred: false,
      };
      st.hasInteracted = true;
      dirtyState.set(input, st);
      if (st.hasBlurred) updateState(input);
    } else if (event.type === "blur") {
      const st = dirtyState.get(input) || {
        hasInteracted: false,
        hasBlurred: false,
      };
      st.hasBlurred = true;
      dirtyState.set(input, st);
      if (st.hasInteracted) updateState(input);
    }
  };
  const init = (root = document) => {
    const syncAria = (el) => {
      if (!el || typeof el.matches !== "function" || !el.checkValidity)
        return;
      try {
        if (CSS.supports("selector(:user-invalid)")) {
          el.setAttribute(
            "aria-invalid",
            el.matches(":user-invalid") ? "true" : "false",
          );
        }
      } catch (_) {}
    };
    root.addEventListener("blur", (e) => syncAria(e.target), true);
    root.addEventListener("input", (e) => {
      if (
        e.target &&
        e.target.hasAttribute &&
        e.target.hasAttribute("aria-invalid")
      )
        syncAria(e.target);
    });
    if (window.CSS?.supports?.("selector(:user-invalid)")) return;
    root.addEventListener("blur", handleEvent, true);
    root.addEventListener("input", handleEvent);
    root.addEventListener("change", handleEvent);
  };
  return { init };
})();


let toastTimer = null;
export function showToast(message) {
  const el = document.getElementById("toastBanner");
  if (!el) return;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  el.textContent = message;
  el.hidden = false;
  toastTimer = setTimeout(() => {
    el.hidden = true;
    toastTimer = null;
  }, 3600);
}


export function applyUserModeCleanups(rootEl, screenOrModalId) {
  if (!rootEl) return;

  // Always hide raw DB schema subtitles & clean technical column names in ALL modes (including Dev Mode)
  const findingEl =
    rootEl.querySelector(".screen-finding") ||
    (rootEl.id === "modalDialog"
      ? rootEl.querySelector("#modalSub")
      : null);
  if (findingEl) findingEl.style.display = "none";

  rootEl.querySelectorAll(".modal-header .field-hint").forEach((hint) => {
    if (/^\s*(Bảng:|Cập nhật support_tickets)/i.test(hint.textContent))
      hint.style.display = "none";
  });

  rootEl
    .querySelectorAll(
      ".field-label, .panel-title, .u-tab, .field-hint, .kpi-note, .badge, h3, h4, strong",
    )
    .forEach((el) => {
      if (el.children.length === 0) {
        el.textContent = cleanTechnicalLabelText(el.textContent);
      }
    });

  if (state.viewMode !== "user" && state.viewMode !== "production") return;

  const copy = USER_SCREEN_COPY[screenOrModalId];
  const titleEl =
    rootEl.querySelector(".screen-title") ||
    (rootEl.id === "modalDialog"
      ? rootEl.querySelector("#modalTitle")
      : null);
  if (titleEl) {
    if (copy && copy.title) {
      if (screenOrModalId === "1.3") {
        const bIdMatch = titleEl.textContent.match(
          /#(?:GDX-)?[A-Za-z0-9-]+/,
        );
        titleEl.textContent =
          `${copy.title} ${bIdMatch ? "· " + bIdMatch[0] : ""}`.trim();
      } else if (screenOrModalId === "1.6" || screenOrModalId === "2.1") {
        const countMatch = titleEl.textContent.match(/\(\d+\)/);
        titleEl.textContent =
          `${copy.title} ${countMatch ? countMatch[0] : ""}`.trim();
      } else {
        titleEl.textContent = copy.title;
      }
    } else {
      titleEl.textContent = titleEl.textContent.replace(
        /^\d+\.\d+\.\s*/,
        "",
      );
    }
  }

  if (
    state.isProduction ||
    state.viewMode === "production" ||
    !isDevFromUrl
  ) {
    rootEl.querySelectorAll(".modal-title").forEach((mt) => {
      mt.textContent = mt.textContent.replace(/^\d+\.\d+\.\s*/, "");
    });
  }
}


// ---------------------------------------------------------------------
// LEAFLET & OPENSTREETMAP LOCATION PICKER & GEOLOCATION
// ---------------------------------------------------------------------
export const PROVINCE_COORDINATES = {
  "Hồ Chí Minh": [10.7769, 106.7009],
  "Hà Nội": [21.0285, 105.8542],
  "Đà Nẵng": [16.0544, 108.2022],
  "Hải Phòng": [20.8449, 106.6881],
  "Cần Thơ": [10.0452, 105.7469],
  "Bình Dương": [10.9804, 106.6519],
  "Đồng Nai": [10.9574, 106.8427],
  "Bà Rịa": [10.4958, 107.1687],
  "Khánh Hòa": [12.2388, 109.1967],
  "Lâm Đồng": [11.9404, 108.4583],
  "Thừa Thiên Huế": [16.4637, 107.5909],
  Huế: [16.4637, 107.5909],
  "Quảng Nam": [15.5651, 108.4816],
  "Quảng Ngãi": [15.1205, 108.7923],
  "Bình Định": [13.783, 109.2197],
  "Phú Yên": [13.0882, 109.0924],
  "Ninh Thuận": [11.5647, 108.9882],
  "Bình Thuận": [10.9333, 108.1],
  "Long An": [10.536, 106.4134],
  "Tiền Giang": [10.3544, 106.3653],
  "Bến Tre": [10.2415, 106.3759],
  "Trà Vinh": [9.9347, 106.3458],
  "Vĩnh Long": [10.2537, 105.9722],
  "Đồng Tháp": [10.4578, 105.6324],
  "An Giang": [10.3831, 105.4358],
  "Kiên Giang": [10.0125, 105.0809],
  "Hậu Giang": [9.7844, 105.4701],
  "Sóc Trăng": [9.6033, 105.98],
  "Bạc Liêu": [9.2941, 105.7278],
  "Cà Mau": [9.1769, 105.1524],
  "Tây Ninh": [11.31, 106.0983],
  "Bình Phước": [11.5333, 106.8833],
  "Đắk Lắk": [12.6667, 108.0383],
  "Đắk Nông": [12.0044, 107.6908],
  "Gia Lai": [13.9833, 108.0],
  "Kon Tum": [14.35, 108.0],
  "Quảng Bình": [17.4687, 106.6225],
  "Quảng Trị": [16.8167, 107.1],
  "Nghệ An": [18.6734, 105.6813],
  "Hà Tĩnh": [18.356, 105.9058],
  "Thanh Hóa": [19.8067, 105.7852],
  "Ninh Bình": [20.2506, 105.9745],
  "Nam Định": [20.42, 106.1683],
  "Thái Bình": [20.45, 106.3333],
  "Hà Nam": [20.5456, 105.9122],
  "Hưng Yên": [20.65, 106.05],
  "Hải Dương": [20.9372, 106.3147],
  "Bắc Ninh": [21.1861, 106.0763],
  "Bắc Giang": [21.2731, 106.1946],
  "Vĩnh Phúc": [21.3089, 105.6049],
  "Phú Thọ": [21.3228, 105.3283],
  "Thái Nguyên": [21.5942, 105.8482],
  "Lạng Sơn": [21.8536, 106.7615],
  "Quảng Ninh": [20.95, 107.0833],
};

let activeCustomerMap = null;
let activeCustomerMarker = null;

let reverseGeocodeTimer = null;

export async function resolveAddressFromCoordinates(lat, lng, opts = {}) {
  const latFormatted = Number(lat).toFixed(6);
  const lngFormatted = Number(lng).toFixed(6);

  const addrInput =
    document.getElementById(opts.addrInputId || "obCustAddr") ||
    document.getElementById("profAddress") ||
    document.getElementById("wizAddress");

  const statusPill = document.querySelector(
    ".geo-map-status-pill span:last-child",
  );
  if (statusPill) {
    statusPill.innerHTML =
      '<span class="status-dot" style="background:#e07a5f;"></span> Đang nhận diện địa chỉ từ GPS vệ tinh...';
  }

  try {
    const res = await apiRequest(
      `/api/geo/reverse?lat=${latFormatted}&lng=${lngFormatted}`,
    );
    if (res && res.ok && res.detailed_address) {
      if (addrInput) {
        addrInput.value = res.detailed_address;
        addrInput.style.transition =
          "box-shadow 0.3s ease, border-color 0.3s ease";
        addrInput.style.borderColor = "var(--color-primary)";
        addrInput.style.boxShadow = "0 0 0 3px rgba(27, 67, 50, 0.2)";
        setTimeout(() => {
          addrInput.style.boxShadow = "";
        }, 1500);
      }

      if (activeCustomerMarker) {
        activeCustomerMarker
          .bindPopup(
            `<strong>${res.detailed_address}</strong><br><span style="font-size:11px; color:#555;">${res.full_address || ""}</span>`,
          )
          .openPopup();
      }

      if (statusPill) {
        statusPill.innerHTML = `<span class="status-dot is-online"></span> Đã nhận diện: <strong>${res.detailed_address}</strong>`;
      }

      // Tự động khớp Tỉnh/Thành phố & Phường/Xã trong dropdown nếu có
      matchProvinceAndWardFromGeo(res.province_name, res.ward_name, opts);
      if (opts.addrInputId === "wizAddress") updateBookingAddressSummary();

      showToast(`Đã nhận diện vị trí: ${res.detailed_address}`);
      return res;
    }
  } catch (e) {
    console.warn("Lỗi reverse geocode:", e);
  }

  if (statusPill) {
    statusPill.innerHTML =
      '<span class="status-dot is-online"></span> Chạm vào bản đồ hoặc kéo chốt định vị để ghim chính xác số nhà';
  }
  return null;
}

export function matchProvinceAndWardFromGeo(provinceName, wardName, opts = {}) {
  if (!provinceName && !wardName) return;

  const provSelect =
    document.getElementById(opts.provSelectId || "obCustProvince") ||
    document.getElementById("wizProvSelect") ||
    document.getElementById("profProv");

  const wardSelect =
    document.getElementById(opts.wardSelectId || "obCustWard") ||
    document.getElementById("wizWardSelect") ||
    document.getElementById("profWard");

  if (!provSelect) return;

  // 1. Khớp Tỉnh / Thành phố
  if (provinceName) {
    const pNorm = provinceName
      .toLowerCase()
      .replace(/^(tỉnh|thành phố|tp\.?)\s+/i, "")
      .trim();
    let matchedProvOption = null;
    for (let i = 0; i < provSelect.options.length; i++) {
      const optText = provSelect.options[i].text.toLowerCase();
      if (
        optText.includes(pNorm) ||
        pNorm.includes(
          optText.replace(/^(tỉnh|thành phố|tp\.?)\s+/i, "").trim(),
        )
      ) {
        matchedProvOption = provSelect.options[i];
        break;
      }
    }
    if (matchedProvOption && provSelect.value !== matchedProvOption.value) {
      provSelect.value = matchedProvOption.value;
      if (wardSelect) {
        const db = window.GDX_DB;
        const allWards = db.ward || db.wards || [];
        const filteredWards = allWards.filter(
          (w) =>
            !w.provinceId ||
            String(w.provinceId) === String(matchedProvOption.value),
        );
        const wardsToRender =
          filteredWards.length > 0 ? filteredWards : allWards.slice(0, 100);
        wardSelect.innerHTML = wardsToRender
          .map((w) => `<option value="${w.ward_id}">${w.name}</option>`)
          .join("");
      }
    }
  }

  // 2. Khớp Phường / Xã
  if (wardName && wardSelect) {
    const wNorm = wardName
      .toLowerCase()
      .replace(/^(phường|xã|thị trấn)\s+/i, "")
      .trim();
    for (let i = 0; i < wardSelect.options.length; i++) {
      const optText = wardSelect.options[i].text.toLowerCase();
      if (
        optText.includes(wNorm) ||
        wNorm.includes(
          optText.replace(/^(phường|xã|thị trấn)\s+/i, "").trim(),
        )
      ) {
        wardSelect.selectedIndex = i;
        break;
      }
    }
  }
}

export function panCustomerMapTo(lat, lng, zoom) {
  if (!activeCustomerMap || !activeCustomerMarker) return;
  const targetZoom = zoom || activeCustomerMap.getZoom() || 14;
  activeCustomerMarker.setLatLng([lat, lng]);
  activeCustomerMap.flyTo([lat, lng], targetZoom, {
    animate: true,
    duration: 1.0,
  });

  const latInput =
    document.getElementById("obCustLat") ||
    document.getElementById("profLat");
  const lngInput =
    document.getElementById("obCustLng") ||
    document.getElementById("profLng");
  const textSpan =
    document.getElementById("obCustCoordText") ||
    document.getElementById("profCoordText");

  const latFormatted = Number(lat).toFixed(6);
  const lngFormatted = Number(lng).toFixed(6);

  if (latInput) latInput.value = latFormatted;
  if (lngInput) lngInput.value = lngFormatted;
  if (textSpan) textSpan.textContent = `${latFormatted}, ${lngFormatted}`;
  activeCustomerMarker
    .bindPopup(
      `<strong>Vị trí đã chọn</strong><br><span style="font-size:11px; color:#555;">${latFormatted}, ${lngFormatted}</span>`,
    )
    .openPopup();
}

export function initCustomerLocationPicker(opts) {
  const containerId = opts.containerId || "customerLocationMap";
  const el = document.getElementById(containerId);
  if (!el) return null;

  if (typeof L === "undefined") {
    console.warn("Thư viện Leaflet chưa được tải.");
    return null;
  }

  if (activeCustomerMap) {
    try {
      activeCustomerMap.remove();
    } catch (err) {
      // ignore
    }
    activeCustomerMap = null;
    activeCustomerMarker = null;
  }

  const initialLat = Number(opts.lat) || 10.741205;
  const initialLng = Number(opts.lng) || 106.70211;
  const zoom = opts.zoom || 15;

  const map = L.map(containerId, {
    center: [initialLat, initialLng],
    zoom: zoom,
    zoomControl: true,
    scrollWheelZoom: true,
  });

  activeCustomerMap = map;

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);

  const brandPinIcon = L.divIcon({
    className: "custom-map-pin",
    html: `<div class="pin-marker-wrapper">
    <div class="pin-pulse"></div>
    <div class="pin-svg-icon">
      <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 0C7.61 0 0 7.61 0 17C0 29.75 17 42 17 42C17 42 34 29.75 34 17C34 7.61 26.39 0 17 0Z" fill="#1B4332"/>
        <circle cx="17" cy="17" r="7.5" fill="#FFFFFF"/>
        <circle cx="17" cy="17" r="4.5" fill="#E07A5F"/>
      </svg>
    </div>
  </div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -42],
  });

  const marker = L.marker([initialLat, initialLng], {
    draggable: true,
    icon: brandPinIcon,
  }).addTo(map);

  activeCustomerMarker = marker;

  function syncLocation(lat, lng, popupHtml, skipReverseGeocode = false) {
    const latFormatted = Number(lat).toFixed(6);
    const lngFormatted = Number(lng).toFixed(6);

    const latInput = document.getElementById(
      opts.latInputId || "obCustLat",
    );
    const lngInput = document.getElementById(
      opts.lngInputId || "obCustLng",
    );
    const textSpan = document.getElementById(
      opts.coordTextId || "obCustCoordText",
    );

    if (latInput) latInput.value = latFormatted;
    if (lngInput) lngInput.value = lngFormatted;
    if (textSpan) textSpan.textContent = `${latFormatted}, ${lngFormatted}`;

    const content =
      popupHtml ||
      `<strong>Vị trí đón thợ</strong><br><span style="color:#555; font-size:11px;">Tọa độ: ${latFormatted}, ${lngFormatted}</span>`;
    marker.bindPopup(content).openPopup();

    // Tự động nhận diện số nhà, tên đường chi tiết qua reverse geocoding
    if (!skipReverseGeocode) {
      clearTimeout(reverseGeocodeTimer);
      reverseGeocodeTimer = setTimeout(() => {
        resolveAddressFromCoordinates(lat, lng, opts);
      }, 400);
    }
  }

  syncLocation(
    initialLat,
    initialLng,
    '<strong>Vị trí đón thợ</strong><br><span style="font-size:11px; color:#555;">Kéo ghim hoặc bấm vào bản đồ để chọn</span>',
    true,
  );

  marker.on("dragend", function () {
    const pos = marker.getLatLng();
    syncLocation(pos.lat, pos.lng);
  });

  map.on("click", function (e) {
    marker.setLatLng(e.latlng);
    syncLocation(e.latlng.lat, e.latlng.lng);
  });

  setTimeout(() => {
    map.invalidateSize();
  }, 200);

  return { map, marker };
}

export function locateUserGPS(
  targetLatInputId,
  targetLngInputId,
  targetTextId,
  targetAddrInputId,
  provSelectId,
  wardSelectId,
) {
  if (!navigator.geolocation) {
    showToast("Trình duyệt của bạn không hỗ trợ định vị GPS.");
    return;
  }
  showToast("Đang kết nối GPS thiết bị...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const latFormatted = lat.toFixed(6);
      const lngFormatted = lng.toFixed(6);

      if (activeCustomerMap && activeCustomerMarker) {
        activeCustomerMarker.setLatLng([lat, lng]);
        activeCustomerMap.flyTo([lat, lng], 16, {
          animate: true,
          duration: 1.2,
        });
        activeCustomerMarker
          .bindPopup(
            `<strong>Vị trí GPS thực tế</strong><br><span style="font-size:11px; color:#2d6a4f;">Độ chính xác: &plusmn;${Math.round(pos.coords.accuracy || 10)}m</span>`,
          )
          .openPopup();
      }

      const latInput = document.getElementById(
        targetLatInputId || "obCustLat",
      );
      const lngInput = document.getElementById(
        targetLngInputId || "obCustLng",
      );
      const textSpan = document.getElementById(
        targetTextId || "obCustCoordText",
      );

      if (latInput) latInput.value = latFormatted;
      if (lngInput) lngInput.value = lngFormatted;
      if (textSpan)
        textSpan.textContent = `${latFormatted}, ${lngFormatted}`;

      // Lập tức gọi nhận diện địa chỉ chi tiết (Reverse Geocoding)
      resolveAddressFromCoordinates(lat, lng, {
        addrInputId: targetAddrInputId,
        provSelectId: provSelectId,
        wardSelectId: wardSelectId,
      });
    },
    (err) => {
      console.warn("Geolocation error:", err);
      showToast(
        "Không thể lấy GPS (" +
          (err.message || "Bị từ chối") +
          "). Vui lòng chạm vào bản đồ để ghim vị trí.",
      );
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
  );
}

export function handleProvinceChange(provinceSelectId, wardSelectId) {
  const provSelect = document.getElementById(provinceSelectId);
  const wardSelect = document.getElementById(wardSelectId);
  if (!provSelect || !wardSelect) return;
  const selectedProvId = String(provSelect.value);
  const db = window.GDX_DB;
  const allWards = db.ward || db.wards || [];
  const filteredWards = allWards.filter(
    (w) => !w.provinceId || String(w.provinceId) === selectedProvId,
  );
  const wardsToRender =
    filteredWards.length > 0 ? filteredWards : allWards.slice(0, 100);
  wardSelect.innerHTML = wardsToRender
    .map((w) => `<option value="${w.ward_id}">${w.name}</option>`)
    .join("");

  // Nếu đang có bản đồ Leaflet hiển thị, tự động bay tới tọa độ trung tâm tỉnh thành được chọn
  const selectedOption = provSelect.options[provSelect.selectedIndex];
  const provName = selectedOption ? selectedOption.text : "";
  for (const [key, coords] of Object.entries(PROVINCE_COORDINATES)) {
    if (provName.includes(key)) {
      panCustomerMapTo(coords[0], coords[1], 13);
      break;
    }
  }
}


export function copyText(text, btnEl) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(String(text));
    } else {
      const ta = document.createElement("textarea");
      ta.value = String(text);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  } catch (_) {}
  if (btnEl) {
    const orig = btnEl.textContent;
    btnEl.textContent = "✓ Đã chép";
    btnEl.style.color = "#16a34a";
    setTimeout(() => {
      btnEl.textContent = orig;
      btnEl.style.color = "";
    }, 1500);
  }
}

