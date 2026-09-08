import http from 'node:http';
import { Transform, pipeline } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const MAX_BODY_BYTES = 16 * 1024 * 1024;
const MAX_EVENT_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const FAILURE_MESSAGE = 'The built-in classroom request failed. Please try again.';
const GENERATION_APIS = new Set([
  '/api/generate/scene-content',
  '/api/generate/scene-outlines-stream',
  '/api/generate/scene-actions',
  '/api/generate/agent-profiles',
  '/api/chat',
  '/api/quiz-grade',
]);
const OPENMAIC_API_ROOTS = new Set([
  'access-code',
  'agent',
  'azure-voices',
  'chat',
  'classroom',
  'classroom-media',
  'comfyui-workflows',
  'export-video',
  'extract-document',
  'folders',
  'generate',
  'generate-classroom',
  'jobs',
  'materials',
  'parse-pdf',
  'pbl',
  'persistence',
  'provider',
  'proxy-media',
  'quiz-grade',
  'server-providers',
  'skills',
  'stage-meta',
  'stages',
  'transcription',
  'usage',
  'verify-image-provider',
  'verify-model',
  'verify-pdf-provider',
  'verify-video-provider',
  'web-search',
]);
const PAGE_ROOTS = new Set(['studyloop-launch', 'studio', 'generation-preview', 'classroom']);
const BLOCKED_PAGE_ROOTS = new Set(['workspace', 'workbench', 'eval']);
const PUBLIC_ROOTS = new Set(['avatars', 'logos', 'vendor']);
const PUBLIC_FILES = new Set(['/openmaic-mark.png', '/logo-horizontal.png', '/apple-icon.png']);
const REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'content-type',
  'range',
  'if-range',
  'if-none-match',
  'if-modified-since',
  'rsc',
  'next-router-state-tree',
  'next-router-prefetch',
  'next-router-segment-prefetch',
  'next-url',
  'x-nextjs-data',
  'x-deployment-id',
  'x-image-generation-enabled',
  'x-video-generation-enabled',
]);
const RESPONSE_HEADERS = new Set([
  'content-type',
  'content-disposition',
  'content-range',
  'accept-ranges',
  'vary',
  'x-content-type-options',
  'x-nextjs-cache',
  'x-nextjs-prerender',
  'x-nextjs-stale-time',
]);

// Inspect the raw path before URL normalization: encoded separators, dot segments
// and double encoding must never turn a permitted asset into a persistence API.
function requestPath(req) {
  const target = req.originalUrl ?? req.url ?? '';
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) return null;
  const rawPath = target.split('?')[0];
  try {
    const path = decodeURIComponent(rawPath);
    if (
      /[\\\u0000-\u0020\u007f#%]/.test(path) ||
      /%2f|%5c/i.test(rawPath) ||
      path.includes('//') ||
      path.split('/').some((part) => part === '.' || part === '..')
    )
      return null;
    return { path: path.length > 1 ? path.replace(/\/$/, '') : path, target };
  } catch {
    return null;
  }
}

function publicAsset(path, publicFiles) {
  // A supplied build manifest is authoritative, including an empty Set.
  if (publicFiles) return publicFiles.has(path);
  if (PUBLIC_FILES.has(path)) return true;
  if (!PUBLIC_ROOTS.has(path.split('/')[1])) return false;
  return /\.(?:png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|css|js|map)$/i.test(path);
}

function imageAsset(target, publicFiles) {
  const url = new URL(target, 'http://studyloop.invalid');
  const images = url.searchParams.getAll('url');
  if (images.length !== 1) return false;
  const source = requestPath({ url: images[0] });
  return Boolean(source && !source.target.includes('?') && publicAsset(source.path, publicFiles));
}

/** The caller authenticates pages/APIs and enforces generation limits. */
export function classifyOpenMAICRequest(req, { publicFiles } = {}) {
  const parsed = requestPath(req);
  if (!parsed) {
    // Reject malformed paths rather than letting a second router normalize them.
    return { kind: 'api', generation: false, allowed: false };
  }
  const { path, target } = parsed;
  const root = path.split('/')[1];
  const method = (req.method ?? 'GET').toUpperCase();
  const read = method === 'GET' || method === 'HEAD';
  if (path.startsWith('/api/')) {
    if (path === '/api/server-providers') return { kind: 'api', generation: false, allowed: read };
    if (GENERATION_APIS.has(path))
      return { kind: 'api', generation: true, allowed: method === 'POST' };
    // Voice registration also accepts caller-selected IDs in a shared provider
    // account. Keep it closed until that state has explicit owner isolation.
    if (OPENMAIC_API_ROOTS.has(path.split('/')[2]))
      return { kind: 'api', generation: false, allowed: false };
    return null;
  }
  if (PAGE_ROOTS.has(root)) {
    const exact = ['/studyloop-launch', '/studio', '/generation-preview'].includes(path);
    const classroom = /^\/classroom\/[a-zA-Z0-9_-]{1,160}$/.test(path);
    return { kind: 'page', generation: false, allowed: read && (exact || classroom) };
  }
  if (BLOCKED_PAGE_ROOTS.has(root)) return { kind: 'page', generation: false, allowed: false };
  if (root === '_next') {
    const staticFile = path.startsWith('/_next/static/') && path.length > '/_next/static/'.length;
    const image = path === '/_next/image' && imageAsset(target, publicFiles);
    return { kind: 'asset', generation: false, allowed: read && (staticFile || image) };
  }
  if (publicAsset(path, publicFiles)) return { kind: 'asset', generation: false, allowed: read };
  if (PUBLIC_ROOTS.has(root)) return { kind: 'asset', generation: false, allowed: false };
  return null;
}

function safeError(res, status, message = FAILURE_MESSAGE) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.statusCode = status;
  res.removeHeader('content-length');
  res.removeHeader('content-encoding');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: message }));
}

function runtimeAddress(value) {
  const url = new URL(value.url);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    typeof value.token !== 'string' ||
    !/^[\x21-\x7e]{1,1024}$/.test(value.token)
  )
    throw new Error('Invalid internal classroom runtime.');
  return url;
}

function filteredHeaders(req, token) {
  const headers = { 'x-studyloop-runtime': token, 'accept-encoding': 'identity' };
  for (const [name, value] of Object.entries(req.headers ?? {})) {
    const lower = name.toLowerCase();
    if (REQUEST_HEADERS.has(lower) && value !== undefined) headers[lower] = value;
  }
  return headers;
}

function tokenRedactor(token) {
  const needle = Buffer.from(token);
  let pending = Buffer.alloc(0);
  return new Transform({
    transform(chunk, encoding, callback) {
      const value = Buffer.concat([pending, chunk]);
      let start = 0;
      let match;
      while ((match = value.indexOf(needle, start)) !== -1) {
        this.push(value.subarray(start, match));
        this.push('[redacted]');
        start = match + needle.length;
      }
      let held = Math.min(needle.length - 1, value.length - start);
      while (held && !value.subarray(value.length - held).equals(needle.subarray(0, held))) held--;
      this.push(value.subarray(start, value.length - held));
      pending = value.subarray(value.length - held);
      callback();
    },
    flush(callback) {
      this.push(pending);
      callback();
    },
  });
}

function eventSanitizer() {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  function sanitize(frame) {
    const lines = frame.split(/\r?\n/);
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    const namedError = lines.some((line) => /^event:\s*error\s*$/.test(line));
    let error = namedError;
    try {
      const payload = JSON.parse(data);
      error ||= payload?.type === 'error' || Boolean(payload?.error) || payload?.success === false;
    } catch {
      /* Heartbeats and non-JSON data remain valid SSE. */
    }
    if (!error) return frame;
    const safe = { type: 'error', error: FAILURE_MESSAGE, data: { message: FAILURE_MESSAGE } };
    return `${namedError ? 'event: error\n' : ''}data: ${JSON.stringify(safe)}`;
  }
  return new Transform({
    transform(chunk, encoding, callback) {
      pending += decoder.write(chunk);
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        if (Buffer.byteLength(pending.slice(0, boundary.index)) > MAX_EVENT_BYTES)
          return callback(new Error('Classroom event too large.'));
        this.push(sanitize(pending.slice(0, boundary.index)) + '\n\n');
        pending = pending.slice(boundary.index + boundary[0].length);
      }
      callback(
        Buffer.byteLength(pending) > MAX_EVENT_BYTES
          ? new Error('Classroom event too large.')
          : undefined,
      );
    },
    flush(callback) {
      pending += decoder.end();
      if (pending) this.push(sanitize(pending));
      callback();
    },
  });
}

/**
 * Stream the real Next runtime at its native paths. This module deliberately
 * does not implement sessions or alter the caller's CSP. Next pages need their
 * own CSP permitting the inline bootstrap scripts used by the pinned build.
 * The returned promise settles only after the downstream response finishes or
 * closes, including cancellation, so callers can hold their generation quota.
 */
export function createOpenMAICProxy({ runtime, publicFiles } = {}) {
  if (typeof runtime?.ensureRunning !== 'function')
    throw new TypeError('A classroom runtime is required.');
  return async function proxy(req, res) {
    if (res.destroyed || res.writableFinished) return;
    let upstream;
    let incoming;
    let bodyLimit;
    let deadline;
    const finished = new Promise((resolve) => {
      const done = () => {
        clearTimeout(deadline);
        req.unpipe(bodyLimit);
        if (bodyLimit) bodyLimit.destroy();
        upstream?.destroy();
        incoming?.destroy();
        req.removeListener('aborted', aborted);
        res.removeListener('finish', done);
        res.removeListener('close', done);
        resolve();
      };
      const aborted = () => res.destroy();
      req.once('aborted', aborted);
      res.once('finish', done);
      res.once('close', done);
    });
    const classification = classifyOpenMAICRequest(req, { publicFiles });
    if (!classification?.allowed) {
      safeError(res, 404, 'Not found.');
      return finished;
    }
    try {
      // A cancelled browser must release its quota even while a shared runtime
      // is still starting. Startup may continue for other waiting requests.
      const active = await Promise.race([runtime.ensureRunning(), finished.then(() => null)]);
      if (!active || res.destroyed || res.writableEnded) return finished;
      const address = runtimeAddress(active);
      const headers = filteredHeaders(req, active.token);
      const hasBody = !['GET', 'HEAD'].includes((req.method ?? 'GET').toUpperCase());
      let json;
      if (hasBody && req.body !== undefined) {
        json = Buffer.from(JSON.stringify(req.body));
        if (json.length > MAX_BODY_BYTES) {
          safeError(res, 413, 'The classroom request is too large.');
          return finished;
        }
        headers['content-type'] = 'application/json';
        headers['content-length'] = json.length;
      } else if (
        hasBody &&
        req.headers['content-encoding'] &&
        req.headers['content-encoding'] !== 'identity'
      ) {
        safeError(res, 415, 'Compressed classroom requests are not supported.');
        return finished;
      } else if (hasBody && Number(req.headers['content-length']) > MAX_BODY_BYTES) {
        safeError(res, 413, 'The classroom request is too large.');
        return finished;
      }
      upstream = http.request(
        {
          protocol: 'http:',
          hostname: address.hostname.replace(/^\[|\]$/g, ''),
          port: address.port || 80,
          method: req.method ?? 'GET',
          path: req.originalUrl ?? req.url,
          headers,
        },
        (response) => {
          incoming = response;
          const status = response.statusCode ?? 502;
          // Never return an upstream error page/body or follow a redirect carrying
          // internal headers. Even same-origin redirects must stay on allowed paths.
          if (status >= 400) {
            response.destroy();
            safeError(res, status);
            return;
          }
          if (status >= 300 && status !== 304) {
            const location = response.headers.location;
            let redirect;
            try {
              redirect = new URL(location, address);
              const path = redirect.pathname + redirect.search;
              if (
                !location ||
                redirect.origin !== address.origin ||
                redirect.username ||
                redirect.password ||
                redirect.hash ||
                location.includes(active.token) ||
                !classifyOpenMAICRequest({ url: path, method: 'GET' }, { publicFiles })?.allowed
              )
                redirect = null;
            } catch {
              redirect = null;
            }
            response.destroy();
            if (!redirect) {
              safeError(res, 502);
              return;
            }
            res.statusCode = status;
            res.setHeader('cache-control', 'no-store');
            res.setHeader('location', redirect.pathname + redirect.search);
            res.end();
            return;
          }
          res.statusCode = status;
          for (const [name, value] of Object.entries(response.headers)) {
            if (RESPONSE_HEADERS.has(name) && value !== undefined) {
              const clean = (part) => String(part).split(active.token).join('[redacted]');
              res.setHeader(name, Array.isArray(value) ? value.map(clean) : clean(value));
            }
          }
          // Avoid storing session-specific HTML, provider metadata or generated
          // content in browser/shared caches, including RSC prefetch responses.
          res.setHeader('cache-control', 'no-store');
          res.setHeader('x-content-type-options', 'nosniff');
          const transforms = [];
          const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase();
          if (encoding === 'gzip') transforms.push(createGunzip());
          else if (encoding === 'br') transforms.push(createBrotliDecompress());
          else if (encoding === 'deflate') transforms.push(createInflate());
          else if (encoding !== 'identity') {
            response.destroy();
            safeError(res, 502);
            return;
          }
          transforms.push(tokenRedactor(active.token));
          if (String(response.headers['content-type']).includes('text/event-stream')) {
            transforms.push(eventSanitizer());
            res.setHeader('x-accel-buffering', 'no');
          }
          // Flush SSE/HTML headers promptly; do not buffer the whole generation.
          res.flushHeaders();
          pipeline(response, ...transforms, res, () => {});
        },
      );
      upstream.on('error', () => safeError(res, 502));
      deadline = setTimeout(() => {
        safeError(res, 504, 'The built-in classroom request timed out. Please try again.');
        upstream.destroy();
      }, REQUEST_TIMEOUT_MS);
      deadline.unref?.();
      if (json) upstream.end(json);
      else if (!hasBody || req.readableEnded) upstream.end();
      else {
        let received = 0;
        bodyLimit = new Transform({
          transform(chunk, encoding, callback) {
            received += chunk.length;
            if (received > MAX_BODY_BYTES) {
              safeError(res, 413, 'The classroom request is too large.');
              upstream.destroy();
              callback(new Error('Classroom request too large.'));
            } else callback(null, chunk);
          },
        });
        bodyLimit.on('error', () => {});
        req.pipe(bodyLimit).pipe(upstream);
      }
    } catch {
      safeError(res, 503, 'The built-in classroom is unavailable. Please try again.');
    }
    return finished;
  };
}
