import app from "./app";
import { logger } from "./lib/logger";

const DEFAULT_PORT = 3000;

const rawPort = process.env["PORT"] ?? process.env["REPLIT_PORT"] ?? String(DEFAULT_PORT);

let port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  logger.warn({ rawPort, fallback: DEFAULT_PORT }, "Invalid PORT value, falling back to default");
  port = DEFAULT_PORT;
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
