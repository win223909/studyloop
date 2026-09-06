import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const valid = /^[a-zA-Z0-9_-]{1,100}$/;
export class Store {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.queue = Promise.resolve();
  }
  file(collection, id) {
    if (!valid.test(collection) || !valid.test(id)) throw new Error('Invalid storage identifier.');
    return path.join(this.directory, collection, `${id}.json`);
  }
  async get(collection, id) {
    const filename = this.file(collection, id);
    try {
      return JSON.parse(await readFile(filename, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
  async put(collection, id, value) {
    const filename = this.file(collection, id);
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, filename);
    return value;
  }
  async list(collection) {
    if (!valid.test(collection)) throw new Error('Invalid storage collection.');
    let files;
    try {
      files = await readdir(path.join(this.directory, collection));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return Promise.all(
      files
        .filter((name) => name.endsWith('.json'))
        .map((name) => this.get(collection, name.slice(0, -5))),
    );
  }
  // Serialize local updates (one app process per data volume).
  transaction(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
}
