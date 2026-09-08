import { createApp } from './app.js';
const port = Number(process.env.PORT || 3210);
const host = process.env.HOST || '127.0.0.1';
const app = await createApp();
const server = app.listen(port, host, () =>
  console.log(`StudyLoop listening on http://${host}:${port}`),
);
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const closed = new Promise((resolve) => server.close(resolve));
  setTimeout(() => process.exit(1), 10000).unref();
  await app.locals.openmaicRuntime?.stop();
  await closed;
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
