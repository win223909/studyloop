import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Inspect precisely the files Git could publish, including not-yet-staged sources.
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const forbiddenPaths = /(^|\/)(\.env(?!\.example$)|data\/|node_modules\/|.*\.(pem|key)$)/;
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['API credential', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}\b/],
  ['personal filesystem path', /\/Users\/[a-zA-Z][^/\s]*\/(?:Documents|Desktop|\.codex)\//],
  [
    'private configuration assignment',
    /^(?:LLM_API_KEY|BRAVE_SEARCH_API_KEY|INSTANCE_PASSWORD)[ \t]*=[ \t]*[^\s#][^\n]+$/m,
  ],
];
const errors = [];
for (const filename of files) {
  if (forbiddenPaths.test(filename)) errors.push(`${filename}: private runtime path`);
  if (/\.(png|jpg|jpeg|webp|ico|pdf|woff2?)$/i.test(filename)) continue;
  const text = readFileSync(filename, 'utf8');
  for (const [label, pattern] of patterns)
    if (pattern.test(text)) errors.push(`${filename}: ${label}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Public-content scan passed (${files.length} files). No runtime data or credential patterns found.`,
  );
