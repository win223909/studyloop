import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-browser-'));
const app = await createApp({ env: { DATA_DIR: directory } });
const server = app.listen(3211, '127.0.0.1');
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await rm(directory, { recursive: true, force: true });
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
