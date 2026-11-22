/**
 * Vercel Serverless Function entrypoint shim.
 * Delegates all incoming HTTP requests to the modular backend in ./server.js.
 */
module.exports = require("./server.js");
