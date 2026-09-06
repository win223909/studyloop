import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateCourse } from './schema.js';

const directory = fileURLToPath(new URL('../../examples/', import.meta.url));

export function loadSamples() {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => validateCourse(JSON.parse(readFileSync(`${directory}/${name}`, 'utf8'))));
}
