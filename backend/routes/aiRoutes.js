const { parseBody, sendJson } = require("../utils/http");
const { saveLocalDb } = require("../db/localStore");

async function handleAiRoutes(ctx) {
  const { req, res, method, pathname, searchParams, isProd, db, client } = ctx;

  if (method === "POST" && (pathname === "/api/ai/chat" || pathname === "/api/v1/ai/chat")) {
    const body = await parseBody(req);
    const userMessage = String(body.message || "").trim();
    const conversationId = body.conversation_id ? String(body.conversation_id) : `conv_${Date.now()}`;
    const userId = body.user_id || "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

    if (!userMessage) {
      sendJson(res, 400, { ok: false, error: "Nội dung câu hỏi không được để trống." });
      return true;
    }

    const availableServices = (db ? db.services : []).filter((s) => s.is_active);
    const availableProviders = (db ? db.provider_public_profiles : []).filter(
      (p) => p.verification_status === "verified"
    );

    const qLower = userMessage.toLowerCase();
    let reply = "";
    let recommendedServices = [];
    let recommendedProviders = [];
    let suggestions = [];

    if (
      qLower.includes("dọn dẹp") ||
      qLower.includes("lau nhà") ||
      qLower.includes("quét") ||
      qLower.includes("vệ sinh") ||
      qLower.includes("nhà bẩn") ||
      qLower.includes("bụi") ||
      qLower.includes("tết")
    ) {
      recommendedServices = availableServices.filter(
        (s) =>
          s.title.toLowerCase().includes("dọn dẹp") ||
          s.title.toLowerCase().includes("vệ sinh") ||
          s.title.toLowerCase().includes("tổng")
      );
      recommendedProviders = availableProviders
        .filter((p) => p.info.toLowerCase().includes("dọn dẹp") || p.info.toLowerCase().includes("vệ sinh"))
        .slice(0, 2);
      reply =
        "Chào bạn! Để không gian sống luôn tinh tươm và sạch bóng, Gia Đình Xanh gợi ý bạn dịch vụ **Dọn dẹp nhà theo giờ** (từ 75.000đ/giờ) hoặc **Tổng vệ sinh căn hộ chuyên sâu** (từ 180.000đ/lần). \n\n✨ **Cam kết chất lượng:** Thợ mang sẵn dụng cụ chuyên dụng, có lý lịch tư pháp rõ ràng, và được bảo hiểm tài sản lên đến 10 triệu đồng. Bạn có thể bấm chọn ngay gói dịch vụ bên dưới để đặt lịch thuận tiện!";
      suggestions = ["Dọn dẹp 2 giờ", "Tổng vệ sinh căn hộ", "Tìm thợ dọn nhà 5 sao", "Xem bảng giá chi tiết"];
    } else if (
      qLower.includes("nấu") ||
      qLower.includes("cơm") ||
      qLower.includes("tiệc") ||
      qLower.includes("ăn") ||
      qLower.includes("món")
    ) {
      recommendedServices = availableServices.filter(
        (s) => s.title.toLowerCase().includes("nấu") || s.title.toLowerCase().includes("bếp")
      );
      recommendedProviders = availableProviders.filter((p) => p.info.toLowerCase().includes("nấu")).slice(0, 2);
      reply =
        "Dạ chào bạn! Nếu bạn cần chuẩn bị bữa cơm gia đình nóng hổi chuẩn vị hoặc chuẩn bị mâm cỗ đãi khách cuối tuần, dịch vụ **Nấu ăn gia đình theo giờ** (chỉ 60.000đ/giờ) và **Đầu bếp gia đình** là lựa chọn tuyệt vời. \n\n🍲 Đầu bếp đối tác của Gia Đình Xanh có chứng nhận vệ sinh an toàn thực phẩm, có thể hỗ trợ đi chợ theo thực đơn yêu cầu của gia đình.";
      suggestions = ["Nấu ăn 3 món gia đình", "Chuẩn bị tiệc nhỏ cuối tuần", "Thợ Mai Lan nấu ăn", "Bảng giá nấu ăn"];
    } else if (qLower.includes("máy lạnh") || qLower.includes("điều hòa")) {
      recommendedServices = availableServices.filter(
        (s) => s.title.toLowerCase().includes("máy lạnh") || s.title.toLowerCase().includes("điều hòa")
      );
      recommendedProviders = availableProviders
        .filter((p) => p.info.toLowerCase().includes("máy lạnh") || p.info.toLowerCase().includes("điện"))
        .slice(0, 2);
      reply =
        "Dạ chào bạn! Để máy lạnh mát sâu, tiết kiệm điện và lọc sạch không khí, bạn nên vệ sinh định kỳ 3-4 tháng/lần. Gia Đình Xanh cung cấp gói **Vệ sinh máy lạnh treo tường** trọn gói chỉ 250.000đ/máy (bao gồm kiểm tra gas, vệ sinh dàn lạnh và dàn nóng).";
      suggestions = ["Vệ sinh 1 bộ máy lạnh", "Vệ sinh 2 máy lạnh", "Bảo hành gas máy lạnh", "Đặt lịch thợ ngay"];
    } else if (
      qLower.includes("sofa") ||
      qLower.includes("nệm") ||
      qLower.includes("thảm") ||
      qLower.includes("rèm")
    ) {
      recommendedServices = availableServices.filter(
        (s) => s.title.toLowerCase().includes("sofa") || s.title.toLowerCase().includes("nệm")
      );
      reply =
        "Chào bạn! Dịch vụ **Giặt ghế Sofa & Đệm ngủ bằng hơi nước nóng** của Gia Đình Xanh diệt khuẩn đến 99% mạt bụi và vi khuẩn gây dị ứng, sử dụng dung dịch sinh học an toàn cho trẻ nhỏ và thú cưng. Bạn có thể bấm đặt lịch ngay dưới đây!";
      suggestions = ["Giặt bộ Sofa phòng khách", "Giặt nệm cao su 1m8", "Quy trình giặt hơi nước", "Xem giá trọn gói"];
    } else if (
      qLower.includes("giá") ||
      qLower.includes("bảng giá") ||
      qLower.includes("chi phí") ||
      qLower.includes("bao nhiêu tiền")
    ) {
      reply =
        "Bảng giá niêm yết minh bạch của Gia Đình Xanh:\n- 🧹 **Dọn dẹp nhà theo giờ**: 75.000 đ/giờ\n- 🍲 **Nấu ăn gia đình**: 60.000 đ/giờ\n- 🏠 **Tổng vệ sinh căn hộ**: 180.000 đ/lần\n- ❄️ **Vệ sinh máy lạnh**: 250.000 đ/bộ\n- 🛋️ **Giặt Sofa - Nệm hơi nước nóng**: từ 350.000 đ/bộ\n\nToàn bộ giá đã bao gồm dụng cụ, cam kết không phát sinh vô lý. Mọi chi phí phát sinh (nếu có) đều phải được khách hàng xác nhận trước qua hệ thống.";
      recommendedServices = availableServices.slice(0, 3);
      suggestions = ["Đặt dọn dẹp nhà", "Đặt nấu ăn gia đình", "Chính sách thanh toán VietQR", "Chính sách bảo hành"];
    } else if (
      qLower.includes("bảo hành") ||
      qLower.includes("hủy") ||
      qLower.includes("đền bù") ||
      qLower.includes("khiếu nại")
    ) {
      reply =
        "Chính sách an tâm tuyệt đối tại Gia Đình Xanh:\n1. **Đổi thợ miễn phí**: Trong vòng 30 phút đầu nếu bạn thấy không hài lòng về phong cách làm việc của thợ.\n2. **Bảo hiểm tài sản**: Bồi thường lên đến 10.000.000 đ cho trường hợp xảy ra hư hại đổ vỡ có xác nhận.\n3. **Hủy đơn linh hoạt**: Miễn phí hủy đơn hoàn toàn trước giờ hẹn 2 tiếng.\n4. **Kênh hỗ trợ 24/7**: Mở phiếu khiếu nại trực tiếp tại mục Hỗ trợ để Admin giải quyết trong 15 phút.";
      suggestions = ["Mở phiếu hỗ trợ", "Đọc quy chế dịch vụ", "Cách liên hệ hotline", "Đặt lịch ngay"];
    } else {
      recommendedServices = availableServices.slice(0, 2);
      recommendedProviders = availableProviders.slice(0, 2);
      reply =
        "Xin chào! Tôi là Trợ lý AI của Gia Đình Xanh. Tôi có thể giúp bạn:\n• Tư vấn gói dịch vụ phù hợp (Dọn dẹp, Nấu ăn, Vệ sinh máy lạnh, Giặt sofa).\n• Dự toán chi phí và tra cứu bảng giá niêm yết.\n• Tìm đối tác thợ được đánh giá cao nhất gần khu vực của bạn.\n• Giải đáp chính sách bảo hành, hoàn tiền và bảo hiểm tài sản.\n\nBạn đang cần hỗ trợ dịch vụ nào hôm nay?";
      suggestions = ["Tư vấn dọn nhà theo giờ", "Tìm thợ nấu ăn gia đình", "Xem bảng giá dịch vụ", "Chính sách bảo hiểm"];
    }

    const nowIso = new Date().toISOString();
    const userMsgId = Date.now();
    const botMsgId = Date.now() + 1;

    if (isProd && client) {
      try {
        await client.from("ai_conversations").upsert([
          {
            conversation_id: conversationId,
            user_id: userId,
            title: userMessage.slice(0, 40),
            last_message_at: nowIso
          }
        ]);
        await client.from("ai_messages").insert([
          { conversation_id: conversationId, role: "user", content: userMessage, created_at: nowIso },
          {
            conversation_id: conversationId,
            role: "assistant",
            content: reply,
            created_at: new Date(Date.now() + 200).toISOString()
          }
        ]);
      } catch (e) {
        console.warn("[AI Prod Save Warning]", e.message);
      }
    } else if (db) {
      if (!Array.isArray(db.ai_conversations)) db.ai_conversations = [];
      if (!Array.isArray(db.ai_messages)) db.ai_messages = [];

      let conv = db.ai_conversations.find((c) => c.conversation_id === conversationId);
      if (!conv) {
        conv = {
          conversation_id: conversationId,
          user_id: userId,
          title: userMessage.slice(0, 40),
          created_at: nowIso,
          last_message_at: nowIso
        };
        db.ai_conversations.push(conv);
      } else {
        conv.last_message_at = nowIso;
      }

      db.ai_messages.push({
        message_id: userMsgId,
        conversation_id: conversationId,
        role: "user",
        content: userMessage,
        created_at: nowIso
      });
      db.ai_messages.push({
        message_id: botMsgId,
        conversation_id: conversationId,
        role: "assistant",
        content: reply,
        created_at: new Date(Date.now() + 200).toISOString()
      });
      saveLocalDb(db);
    }

    sendJson(res, 200, {
      ok: true,
      conversation_id: conversationId,
      reply,
      suggestions,
      recommended_services: recommendedServices,
      recommended_providers: recommendedProviders
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/ai/history") {
    const convId = searchParams.get("conversation_id");
    if (!convId) {
      sendJson(res, 400, { ok: false, error: "conversation_id là bắt buộc." });
      return true;
    }
    if (isProd && client) {
      const { data: msgs } = await client
        .from("ai_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      sendJson(res, 200, { ok: true, messages: msgs || [] });
      return true;
    }
    const msgs = (db.ai_messages || []).filter((m) => m.conversation_id === convId);
    sendJson(res, 200, { ok: true, messages: msgs });
    return true;
  }

  return false;
}

module.exports = handleAiRoutes;
