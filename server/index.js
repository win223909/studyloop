import { createApp } from './app.js';
const port = Number(process.env.PORT || 3210);
const host = process.env.HOST || '127.0.0.1';
const app = await createApp();
const server = app.listen(port, host, () =>
  console.log(`StudyLoop listening on http://${host}:${port}`),
);
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
