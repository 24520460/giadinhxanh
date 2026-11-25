import { apiRequest } from "../core/api.js";
import { escapeQuotes, formatMoney, formatTimeOnly } from "../core/formatters.js";
import { go } from "../core/router.js";
import { state } from "../core/state.js";

// =====================================================================
// AI ASSISTANT CHATBOT MODULE (FR-AI-001 -> FR-AI-005)
// =====================================================================
export function toggleAiDrawer(forceState) {
  const drawer = document.getElementById("aiChatDrawer");
  if (!drawer) return;
  const isCurrentlyOpen =
    !drawer.hidden &&
    drawer.style.display !== "none" &&
    !drawer.classList.contains("is-hidden");
  const shouldOpen =
    typeof forceState === "boolean" ? forceState : !isCurrentlyOpen;

  if (shouldOpen) {
    drawer.hidden = false;
    drawer.style.display = "flex";
    drawer.classList.remove("is-hidden");
    if (!state.aiMessages || state.aiMessages.length === 0) {
      initAiChat();
    }
    setTimeout(() => {
      const input = document.getElementById("aiChatInput");
      if (input) input.focus();
    }, 100);
  } else {
    drawer.hidden = true;
    drawer.style.display = "none";
    drawer.classList.add("is-hidden");
  }
}

export function closeAiDrawer() {
  toggleAiDrawer(false);
}

export function initAiChat() {
  state.aiMessages = [
    {
      role: "assistant",
      content: `Xin chào! 👋 Tôi là **Trợ lý AI Gia Đình Xanh**.\nTôi có thể giúp bạn:\n• Tư vấn lựa chọn dịch vụ dọn dẹp, nấu ăn, điện lạnh phù hợp.\n• Báo giá chi tiết theo giờ hoặc trọn gói.\n• Tìm đối tác thợ được đánh giá cao nhất.\n• Hướng dẫn đặt lịch và giải đáp chính sách bảo hành 10 triệu đồng.`,
      created_at: new Date().toISOString(),
    },
  ];
  renderAiMessages();
  renderAiPromptChips([
    "Dọn dẹp nhà 2 giờ giá bao nhiêu?",
    "Tìm thợ nấu ăn gia đình 5 sao",
    "Vệ sinh máy lạnh trọn gói",
    "Chính sách bảo hiểm & hủy đơn",
  ]);
}

export function renderAiMessages() {
  const body = document.getElementById("aiChatBody");
  if (!body) return;
  body.innerHTML = (state.aiMessages || [])
    .map((m) => {
      const isBot = m.role === "assistant";
      const formattedContent = m.content
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");

      let extraCardsHtml = "";
      if (m.recommended_services && m.recommended_services.length > 0) {
        extraCardsHtml = `
      <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
        <div style="font-size:11px; font-weight:700; color:var(--color-primary); text-transform:uppercase;">Gợi ý dịch vụ phù hợp:</div>
        ${m.recommended_services
          .map(
            (s) => `
          <div class="ai-service-card">
            <div>
              <div class="ai-service-title">${s.title}</div>
              <div class="ai-service-price">${formatMoney(s.price)}${s.pricing_type === "hourly" ? "/giờ" : "/lần"}</div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" style="padding:4px 10px; font-size:11px;" onclick="GDXApp.bookRecommendedService(${s.service_id})">
              Đặt ngay &rarr;
            </button>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
      }

      return `
    <div class="ai-msg ${isBot ? "bot" : "user"}">
      <div>${formattedContent}</div>
      ${extraCardsHtml}
      <span class="ai-msg-time">${formatTimeOnly(m.created_at)}</span>
    </div>
  `;
    })
    .join("");
  body.scrollTop = body.scrollHeight;
}

export function renderAiPromptChips(chips) {
  const container = document.getElementById("aiQuickPrompts");
  if (!container) return;
  if (!chips || chips.length === 0) {
    container.style.display = "none";
    return;
  }
  container.style.display = "flex";
  container.innerHTML = chips
    .map(
      (c) => `
  <button type="button" class="ai-prompt-chip" onclick="GDXApp.sendAiPromptChip('${escapeQuotes(c)}')">
    ${c}
  </button>
`,
    )
    .join("");
}

export function sendAiPromptChip(text) {
  const input = document.getElementById("aiChatInput");
  if (input) input.value = text;
  sendAiChatMessage();
}

export async function sendAiChatMessage() {
  const input = document.getElementById("aiChatInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  const nowIso = new Date().toISOString();
  state.aiMessages.push({
    role: "user",
    content: text,
    created_at: nowIso,
  });
  renderAiMessages();

  const typingId = "typing_" + Date.now();
  const body = document.getElementById("aiChatBody");
  if (body) {
    const typingEl = document.createElement("div");
    typingEl.id = typingId;
    typingEl.className = "ai-msg bot";
    typingEl.innerHTML = `<em>Trợ lý AI đang suy nghĩ...</em>`;
    body.appendChild(typingEl);
    body.scrollTop = body.scrollHeight;
  }

  const res = await apiRequest("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: state.aiConversationId,
      user_id: state.activeUserId,
      message: text,
    }),
  });

  const typingEl = document.getElementById(typingId);
  if (typingEl) typingEl.remove();

  if (res && res.ok) {
    state.aiConversationId = res.conversation_id;
    state.aiMessages.push({
      role: "assistant",
      content: res.reply,
      recommended_services: res.recommended_services || [],
      recommended_providers: res.recommended_providers || [],
      created_at: new Date().toISOString(),
    });
    renderAiMessages();
    if (res.suggestions && res.suggestions.length > 0) {
      renderAiPromptChips(res.suggestions);
    }
  } else {
    state.aiMessages.push({
      role: "assistant",
      content: `Xin lỗi, có lỗi kết nối tới trợ lý AI: ${res ? res.error : "Vui lòng thử lại sau."}`,
      created_at: new Date().toISOString(),
    });
    renderAiMessages();
  }
}

export function bookRecommendedService(serviceId) {
  toggleAiDrawer();
  go("1.2", { serviceId });
}

