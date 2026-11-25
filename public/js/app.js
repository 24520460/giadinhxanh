/**
 * =====================================================================
 * GIA ĐÌNH XANH - FRONTEND ENTRYPOINT (MODULAR ES MODULES)
 * Điểm khởi động duy nhất và giữ tương thích API toàn cục window.GDXApp
 * =====================================================================
 */

import { RPC, refreshCustomerServices, syncWithBackend } from "./core/api.js";
import { go, goHomeByRole, handleUserRoleSwitch, pushScreenUrl, registerScreenRenderers, resolveRouteFromLocation, setViewMode, switchPortal } from "./core/router.js";
import { SCREENS, state } from "./core/state.js";
import { adminForceStatus, deleteReview, moderateReview, openModerateReviewDialog, renderModal_3_5, renderModal_3_6, renderModal_3_7, renderModal_3_8, renderModal_3_9, renderScreen_3_1, renderScreen_3_2, renderScreen_3_3, renderScreen_3_4, saveCategoryModal, saveServiceModal, setAdmin34Tab, setAdminDispatchFilter, toggleCompanyActive, toggleServiceActive, toggleUserActive, updateProviderKyc, updateSupportTicket, verifyCompanyKyc } from "./portals/admin.js";
import { handleCompanyOnboarding, handleCustomerOnboarding, handleForgot, handleLogin, handleLogout, handleProviderOnboarding, handleRegister, quickPersonaLogin, renderScreen_0_1, renderScreen_0_2, renderScreen_0_3, renderScreen_0_4, renderScreen_0_5, selectOnboardingAvatar, setAuthTab, setAuthView, togglePasswordVisibility } from "./portals/auth.js";
import { companyAddProvider, companySaveService, companyToggleProviderBan, companyToggleService, companyUpdateProviderServices, renderModal_4_4, renderModal_4_5, renderScreen_4_1, renderScreen_4_2, renderScreen_4_3, setCompanyStaffFilter } from "./portals/company.js";
import { cancelQrPayment, confirmBookingPayment, confirmCancelBooking, executeQrPaymentSuccess, handleSupportImageSelect, renderModal_1_10, renderModal_1_11, renderModal_1_7, renderModal_1_8, renderModal_1_9, renderScreen_1_8, selectScheduleSlotInModal, setCheckoutPayMethod, setReviewStars, submitBookingReview, submitInvoicePayment, submitSupportTicket } from "./portals/customer-modals.js";
import { addCustomerAddress, deleteCustomerAddress, handleOmniSearchSubmit, openAddAddressModal, pickSavedAddress, renderScreen_1_1, renderScreen_1_2, renderScreen_1_3, renderScreen_1_4, renderScreen_1_5, renderScreen_1_6, resetCatalogFilters, saveCustomerProfile, selectBookingProvider, setBookingHours, setBookingListFilter, setCatalogCategory, setCatalogPricingType, setCatalogSearch, setDefaultCustomerAddress, setDirectProviderCompanyFilter, setDirectProviderSearch, setWizardCategory, setWizardProviderMode, submitNewBooking, toggleFavorite, toggleProviderFavorite } from "./portals/customer.js";
import { acceptJob, addExceptionSchedule, addWeeklySchedule, completeJobShift, dismissJob, refreshProviderGPS, renderModal_2_5, renderModal_2_6, renderModal_2_7, renderModal_2_8, renderModal_2_9, renderScreen_2_1, renderScreen_2_2, renderScreen_2_3, renderScreen_2_4, saveIncidentalCost, saveProviderConfig, saveProviderOnlineGps, setInboxTab, setJobBoardWard, simulateJobExpired, startShiftWork, submitProviderIncident, toggleProviderOnline, toggleShiftTimer } from "./portals/provider.js";
import { bookRecommendedService, closeAiDrawer, sendAiChatMessage, sendAiPromptChip, toggleAiDrawer } from "./shared/ai-chat.js";
import { closeModal, openModal, registerModalRenderers, sendTicketReply } from "./shared/modal.js";
import { closeNotificationsDrawer, fetchNotifications, handleNotificationClick, markAllNotificationsRead, markNotificationRead, toggleNotificationsDrawer } from "./shared/notifications.js";
import { UserInvalidFallback, copyText, handleProvinceChange, initCustomerLocationPicker, locateUserGPS, showToast } from "./shared/ui-utils.js";

registerScreenRenderers({
  "0.1": renderScreen_0_1,
  "0.2": renderScreen_0_2,
  "0.3": renderScreen_0_3,
  "0.4": renderScreen_0_4,
  "0.5": renderScreen_0_5,
  "1.1": renderScreen_1_1,
  "1.2": renderScreen_1_2,
  "1.3": renderScreen_1_3,
  "1.4": renderScreen_1_4,
  "1.5": renderScreen_1_5,
  "1.6": renderScreen_1_6,
  "1.8": renderScreen_1_8,
  "2.1": renderScreen_2_1,
  "2.2": renderScreen_2_2,
  "2.3": renderScreen_2_3,
  "2.4": renderScreen_2_4,
  "3.1": renderScreen_3_1,
  "3.2": renderScreen_3_2,
  "3.3": renderScreen_3_3,
  "3.4": renderScreen_3_4,
  "4.1": renderScreen_4_1,
  "4.2": renderScreen_4_2,
  "4.3": renderScreen_4_3,
});

registerModalRenderers({
  "1.10": renderModal_1_10,
  "1.11": renderModal_1_11,
  "1.7": renderModal_1_7,
  "1.8": renderModal_1_8,
  "1.9": renderModal_1_9,
  "2.5": renderModal_2_5,
  "2.6": renderModal_2_6,
  "2.7": renderModal_2_7,
  "2.8": renderModal_2_8,
  "2.9": renderModal_2_9,
  "3.5": renderModal_3_5,
  "3.6": renderModal_3_6,
  "3.7": renderModal_3_7,
  "3.8": renderModal_3_8,
  "3.9": renderModal_3_9,
  "4.4": renderModal_4_4,
  "4.5": renderModal_4_5,
});

// INITIALIZATION
// =====================================================================
async function init() {
  UserInvalidFallback.init(document);

  const dialog = document.getElementById("appModal");
  if (dialog) {
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeModal();
    });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        closeModal();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const notifDrawer = document.getElementById("notificationsDrawer");
      if (
        notifDrawer &&
        (!notifDrawer.hidden || notifDrawer.style.display === "flex")
      ) {
        toggleNotificationsDrawer(false);
      }
      const aiDrawer = document.getElementById("aiChatDrawer");
      if (
        aiDrawer &&
        (!aiDrawer.hidden || aiDrawer.style.display === "flex")
      ) {
        toggleAiDrawer(false);
      }
    }
  });

  document.addEventListener("click", (e) => {
    const notifDrawer = document.getElementById("notificationsDrawer");
    const notifBell = document.getElementById("notifBellBtn");
    if (
      notifDrawer &&
      !notifDrawer.hidden &&
      notifDrawer.style.display === "flex"
    ) {
      if (
        !notifDrawer.contains(e.target) &&
        !notifBell?.contains(e.target)
      ) {
        toggleNotificationsDrawer(false);
      }
    }
  });

  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get("mode") || params.get("env");
  if (
    modeParam === "dev" ||
    modeParam === "user" ||
    modeParam === "production"
  ) {
    state.viewMode = modeParam;
    if (modeParam === "production") {
      state.isProduction = true;
    }
  }

  const initialRoute = resolveRouteFromLocation();
  state.currentScreen = initialRoute.screenId;
  state.currentRouteParams = initialRoute.params || {};
  if (initialRoute.screenId === "0.1" && initialRoute.params?.view) {
    state.authView = initialRoute.params.view;
  }
  const initialMeta = SCREENS[initialRoute.screenId];
  if (initialMeta) {
    state.currentPortal = initialMeta.portal;
  }
  pushScreenUrl(initialRoute.screenId, initialRoute.params, true);

  window.addEventListener("popstate", () => {
    const resolved = resolveRouteFromLocation();
    if (resolved.screenId === "0.1" && resolved.params?.view) {
      state.authView = resolved.params.view;
    }
    go(resolved.screenId, resolved.params, { skipHistory: true });
  });

  await syncWithBackend();
  setViewMode(state.viewMode, true, { skipHistory: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

window.GDXApp = {
  go,
  goHomeByRole,
  switchPortal,
  setViewMode,
  handleUserRoleSwitch,
  openModal,
  openSupabaseStatusModal: () => openModal("SUPABASE_STATUS"),
  openScreenCatalogModal: () => openModal("CATALOG"),
  closeModal,
  showToast,
  toggleProviderOnline,
  refreshProviderGPS,
  togglePasswordVisibility,
  quickPersonaLogin,
  setAuthTab,
  setAuthView,
  handleForgot,
  handleLogin,
  handleRegister,
  handleLogout,
  handleCustomerOnboarding,
  handleCompanyOnboarding,
  handleProvinceChange,
  selectOnboardingAvatar,
  handleProviderOnboarding,
  handleOmniSearchSubmit,
  selectScheduleSlotInModal,
  setCatalogCategory,
  setCatalogPricingType,
  setCatalogSearch,
  resetCatalogFilters,
  refreshCustomerServices,
  toggleFavorite,
  setWizardCategory,
  setWizardProviderMode,
  setDirectProviderSearch,
  setDirectProviderCompanyFilter,
  setBookingHours,
  selectBookingProvider,
  submitNewBooking,
  setBookingListFilter,
  saveCustomerProfile,
  setJobBoardWard,
  setInboxTab,
  dismissJob,
  simulateJobExpired,
  acceptJob,
  toggleShiftTimer,
  startShiftWork,
  saveProviderConfig,
  setAdminDispatchFilter,
  toggleServiceActive,
  updateProviderKyc,
  verifyCompanyKyc,
  toggleCompanyActive,
  setCompanyStaffFilter,
  companyAddProvider,
  companyToggleProviderBan,
  companyUpdateProviderServices,
  companySaveService,
  companyToggleService,
  toggleUserActive,
  deleteReview,
  confirmBookingPayment,
  setCheckoutPayMethod,
  submitInvoicePayment,
  executeQrPaymentSuccess,
  cancelQrPayment,
  copyText,
  setReviewStars,
  submitBookingReview,
  confirmCancelBooking,
  handleSupportImageSelect,
  submitSupportTicket,
  saveProviderOnlineGps,
  saveIncidentalCost,
  completeJobShift,
  addWeeklySchedule,
  addExceptionSchedule,
  submitProviderIncident,
  adminForceStatus,
  setAdmin34Tab,
  saveCategoryModal,
  saveServiceModal,
  updateSupportTicket,
  initCustomerLocationPicker,
  locateUserGPS,
  toggleNotificationsDrawer,
  closeNotificationsDrawer,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  handleNotificationClick,
  toggleAiDrawer,
  closeAiDrawer,
  sendAiChatMessage,
  sendAiPromptChip,
  bookRecommendedService,
  pickSavedAddress,
  addCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
  openAddAddressModal,
  toggleProviderFavorite,
  moderateReview,
  openModerateReviewDialog,
  sendTicketReply,
  rpc: RPC,
  RPC,
};
