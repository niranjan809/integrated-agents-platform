import "dotenv/config";
import { buildServer } from "./server.js";
import { config } from "./config.js";
import { closeBrowser } from "./scrapers/browser.js";

const app = await buildServer();

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`GTM Intelligence Agent backend listening on http://localhost:${config.port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

async function shutdown() {
  await closeBrowser().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
