/**
 * =====================================================================
 * GIA ĐÌNH XANH — SERVER ENTRYPOINT
 * =====================================================================
 * Khởi chạy HTTP server từ kiến trúc mô-đun hóa trong thư mục ./backend/
 * (config, db, middleware, routes, services, utils).
 */

const http = require("http");
const { loadEnvConfig } = require("./backend/config/env");
const { appHandler, startBackgroundJobs } = require("./backend/app");

const server = http.createServer(appHandler);

process.on("uncaughtException", (err) => {
  console.error("[Server UncaughtException]", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Server UnhandledRejection]", reason);
});

server.on("error", (err) => {
  console.error("[Server Error]", err);
});

startBackgroundJobs();

if (!process.env.VERCEL && require.main === module) {
  const { port, env } = loadEnvConfig();
  server.listen(port, "0.0.0.0", () => {
    console.log(`[Gia Đình Xanh Server] Đang chạy tại http://localhost:${port} (Môi trường: ${env})`);
  });
}

module.exports = appHandler;
