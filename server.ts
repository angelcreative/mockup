import { createServer } from "node:http";
import { parse } from "node:url";

import next from "next";
import { WebSocketServer } from "ws";

import { attachLiveSocket, shutdownBrowser } from "./lib/live-browser";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT) || 43123;

const app = next({ dev, hostname, port, turbopack: dev });

const server = createServer((req, res) => {
  const parsed = parse(req.url || "/", true);
  void app.getRequestHandler()(req, res, parsed);
});

const sockets = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const pathname = parse(req.url || "/").pathname;
  if (pathname === "/api/live") {
    sockets.handleUpgrade(req, socket, head, (ws) => {
      attachLiveSocket(ws);
    });
    return;
  }
  void app.getUpgradeHandler()(req, socket, head);
});

async function stop() {
  await shutdownBrowser();
  server.close();
  await app.close();
}

void app.prepare().then(() => {
  server.listen(port, hostname, () => {
    console.log(`Mockup listening on ${port}`);
  });
});

process.on("SIGTERM", () => {
  void stop();
});
process.on("SIGINT", () => {
  void stop();
});
