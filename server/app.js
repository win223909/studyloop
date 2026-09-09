import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Store, StoreDeleteError } from './store.js';
import { createSettingsManager } from './settings.js';
import { HttpError } from './errors.js';
import { createGenerationDiagnostics, publicGenerationDetails } from './generation-diagnostics.js';
import { createRequestReplayGuard } from './request-replay.js';
import { extractUpload } from './uploads.js';
import { loadSamples } from './core/samples.js';
import { validateCourse, publicCourse, gradeAttempt, gradePractice } from './core/schema.js';
import {
  createPlan,
  generateCourse,
  providerConfig,
  testProvider,
  CoreError,
} from './core/providers.js';
import { buildOpenMAICBrief } from './integrations/openmaic.js';
import { classifyOpenMAICRequest, createOpenMAICProxy } from './integrations/openmaic-proxy.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const version = '0.1.0-alpha.1';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const summary = (course) => ({
  id: course.id,
  title: course.title,
  description: course.description,
  subject: course.subject,
  level: course.level,
  language: course.language,
  questionCount: course.questions.length,
  origin: course.origin,
});
function integerSetting(value, fallback, max = 1000) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

async function openmaicPublicFiles(directory) {
  const files = new Set();
  async function visit(relative = '') {
    let entries;
    try {
      entries = await readdir(path.join(directory, relative), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const child = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) files.add(`/${child}`);
    }
  }
  await visit();
  return files;
}

export async function createApp(options = {}) {
  const env = { ...(options.env || process.env) };
  const settingsPath =
    options.settingsPath !== undefined
      ? options.settingsPath
      : options.env
        ? false
        : path.resolve(env.SETTINGS_FILE || path.join(root, '.env'));
  const settings = await createSettingsManager({ env, filePath: settingsPath });
  const store = options.store || new Store(env.DATA_DIR || path.join(root, 'data'));
  const samples = await loadSamples();
  const providerOptions = { ...(options.providerOptions || {}), env };
  const core = { createPlan, generateCourse, providerConfig, ...(options.core || {}) };
  const replay = createRequestReplayGuard({
    findSaved: async ({ owner, operation, key }) =>
      store.transaction(async () => {
        const kind = operation.split(':')[0];
        const collection = {
          plan: 'plans',
          course: 'courses',
          attempt: 'attempts',
          practice: 'practice',
        }[kind];
        if (!collection) return undefined;
        const record = (await store.list(collection)).find(
          (item) =>
            item.owner === owner &&
            item.request?.operation === operation &&
            item.request.key === key,
        );
        if (!record) return undefined;
        const result =
          kind === 'plan'
            ? { plan: record.plan }
            : kind === 'course'
              ? { course: publicCourse(record.course) }
              : kind === 'attempt'
                ? { attempt: record.attempt }
                : record.result;
        return { fingerprint: record.request.fingerprint, result };
      }),
  });
  const replayRequest = (req, operation, payload, work) =>
    replay.run(
      {
        owner: req.session.id,
        operation,
        key: req.get('Idempotency-Key'),
        payload,
      },
      ({ key, fingerprint }) => work(key ? { request: { operation, key, fingerprint } } : {}),
    );
  const openmaicRuntime =
    options.openmaicRuntime ||
    (options.env
      ? {
          status: () => ({ installed: false, ready: false, state: 'unavailable', version: null }),
          ensureRunning: async () => {
            throw new HttpError(503, 'The built-in classroom is not installed. 内置课堂尚未安装。');
          },
          refresh: async () => {},
          stop: async () => {},
        }
      : (await import('./integrations/openmaic-runtime.js')).createOpenMAICRuntime({ root, env }));
  const publicFiles = await openmaicPublicFiles(path.join(root, '.runtime', 'openmaic', 'public'));
  const classifyClassroom = (req) => classifyOpenMAICRequest(req, { publicFiles });
  const proxyClassroom = createOpenMAICProxy({ runtime: openmaicRuntime, publicFiles });
  function classroomConfig() {
    const status = openmaicRuntime.status();
    const installed = status.installed === true;
    const ready = installed && status.ready === true;
    return {
      openmaicAvailable: installed,
      openmaicStatus: {
        installed,
        ready,
        state: [
          'unavailable',
          'not-installed',
          'stopped',
          'starting',
          'ready',
          'failed',
          'error',
        ].includes(status.state)
          ? status.state
          : ready
            ? 'ready'
            : 'unavailable',
        version:
          typeof status.version === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(status.version)
            ? status.version
            : null,
      },
    };
  }
  const app = express();
  app.locals.openmaicRuntime = openmaicRuntime;
  app.disable('x-powered-by');
  if (env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  const studyloopHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        'script-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'upgrade-insecure-requests': null,
      },
    },
  });
  // Next's server-rendered bootstrap scripts are inline. Keep this policy scoped
  // to the bundled classroom; StudyLoop retains its stricter script policy.
  const classroomHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        'script-src': [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/',
          'https://unpkg.com/three@0.160.0/',
        ],
        // OpenMAIC's sandboxed interactive templates use inline button handlers.
        'script-src-attr': ["'unsafe-inline'"],
        'style-src': [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/',
        ],
        'font-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/fonts/'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'media-src': ["'self'", 'data:', 'blob:'],
        'worker-src': ["'self'", 'blob:'],
        'frame-src': ["'self'"],
        'upgrade-insecure-requests': null,
      },
    },
  });
  app.use((req, res, next) =>
    (classifyClassroom(req) ? classroomHelmet : studyloopHelmet)(req, res, next),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', version }));
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') && !classifyClassroom(req)) return next();
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (req.headers['sec-fetch-site'] === 'cross-site')
        return next(new HttpError(403, 'Cross-site requests are blocked.'));
      if (origin) {
        try {
          if (new URL(origin).host !== req.get('host'))
            return next(new HttpError(403, 'Origin does not match this instance.'));
        } catch {
          return next(new HttpError(403, 'Invalid request origin.'));
        }
      }
    }
    next();
  });

  const accessRequired = Boolean(env.INSTANCE_PASSWORD);
  const authEpoch = hash(env.INSTANCE_PASSWORD || 'local');
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.COOKIE_SECURE === 'true',
    maxAge: 90 * 86400000,
    path: '/',
  };
  function writeSessionCookie(res, token) {
    // Send the retained token first, then remove the older, more-specific cookie.
    // Browsers otherwise send both names to /api and can select the stale owner.
    res.cookie('studyloop_session', token, cookieOptions);
    const { maxAge: _maxAge, ...legacyOptions } = cookieOptions;
    res.clearCookie('studyloop_session', { ...legacyOptions, path: '/api' });
  }
  async function newSession(res, authenticated) {
    const token = randomBytes(32).toString('hex');
    const session = {
      id: hash(token),
      authenticated,
      authEpoch,
      expiresAt: Date.now() + 90 * 86400000,
    };
    await store.put('sessions', session.id, session);
    writeSessionCookie(res, token);
    return session;
  }
  app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api/') && !classifyClassroom(req)) return next();
    const token = req.cookies.studyloop_session;
    let session = /^[a-f0-9]{64}$/.test(token || '')
      ? await store.get('sessions', hash(token))
      : null;
    if (!session || session.expiresAt < Date.now())
      session = await newSession(res, !accessRequired);
    else writeSessionCookie(res, token);
    req.session = session;
    req.authenticated =
      !accessRequired || (session.authenticated && session.authEpoch === authEpoch);
    next();
  });
  app.get('/api/session', (req, res) =>
    res.json({ authenticated: req.authenticated, accessRequired }),
  );
  app.get('/api/config', (_req, res) =>
    res.json({
      version,
      ...core.providerConfig(providerOptions),
      ...classroomConfig(),
      accessRequired,
    }),
  );
  const loginLimits = new Map();
  app.post('/api/login', async (req, res) => {
    const key = req.ip;
    const now = Date.now();
    // Trim expired entries so even a long-lived shared instance stays bounded.
    for (const [ip, item] of loginLimits) if (item.until < now) loginLimits.delete(ip);
    const limit = loginLimits.get(key) || { count: 0, until: now + 15 * 60000 };
    if (limit.count >= 10)
      throw new HttpError(429, 'Too many login attempts. Try again in 15 minutes.');
    limit.count++;
    loginLimits.set(key, limit);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (accessRequired && !timingSafeEqual(Buffer.from(hash(password)), Buffer.from(authEpoch)))
      throw new HttpError(401, 'Incorrect instance password. 访问口令不正确。');
    // Keep the existing random browser token so record ownership survives login.
    req.session.authenticated = true;
    req.session.authEpoch = authEpoch;
    await store.put('sessions', req.session.id, req.session);
    loginLimits.delete(key);
    res.json({ authenticated: true });
  });
  app.use('/api', (req, _res, next) =>
    next(
      req.authenticated
        ? undefined
        : new HttpError(401, 'Enter this instance’s access password. 请输入访问口令。'),
    ),
  );

  // Configuration belongs to the person running the instance, not every student
  // who knows its shared access password. Trust the socket, never proxy IP headers.
  const settingsTokenSecret = randomBytes(32);
  const settingsToken = (req) =>
    createHmac('sha256', settingsTokenSecret).update(req.session.id).digest('hex');
  function isLocalSettingsRequest(req) {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
    if (
      Object.keys(req.headers).some(
        (name) =>
          name === 'forwarded' ||
          name === 'via' ||
          name === 'x-real-ip' ||
          name === 'cf-connecting-ip' ||
          name.startsWith('x-forwarded-'),
      )
    )
      return false;
    try {
      return ['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(`http://${req.get('host')}`).hostname,
      );
    } catch {
      return false;
    }
  }
  async function settingsResponse(req) {
    return {
      editable: true,
      ...(await settings.read()),
      csrfToken: settingsToken(req),
      config: {
        version,
        ...core.providerConfig(providerOptions),
        ...classroomConfig(),
        accessRequired,
      },
    };
  }
  function requireSettingsAccess(req, _res, next) {
    if (!settingsPath || !isLocalSettingsRequest(req))
      return next(
        new HttpError(
          403,
          'Open settings directly on the host computer to edit configuration. 请在部署电脑本机直连后配置。',
        ),
      );
    const token = req.get('X-Settings-Token') || '';
    let sameOrigin = false;
    try {
      const origin = new URL(req.get('origin'));
      sameOrigin = ['http:', 'https:'].includes(origin.protocol) && origin.host === req.get('host');
    } catch {
      /* Missing or invalid Origin is not a browser settings request. */
    }
    if (
      !sameOrigin ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(settingsToken(req)))
    )
      return next(new HttpError(403, 'Reload settings and try again. 请刷新设置页后重试。'));
    next();
  }
  app.get('/api/settings', async (req, res) => {
    if (!settingsPath || !isLocalSettingsRequest(req))
      return res.json({ editable: false, reason: settingsPath ? 'local-only' : 'disabled' });
    res.json(await settingsResponse(req));
  });
  app.post('/api/settings', requireSettingsAccess, async (req, res) => {
    if (activeGenerations > 0 || updatingSettings)
      throw new HttpError(
        409,
        'Wait for the current course generation to finish before saving settings. 请等当前课程生成完成后保存。',
      );
    updatingSettings = true;
    try {
      await settings.save(req.body);
      try {
        await openmaicRuntime.refresh();
      } catch {
        throw new HttpError(
          503,
          'Settings were saved, but the built-in classroom could not restart. Try entering the classroom again. 设置已保存，但内置课堂未能重启，请重新进入课堂。',
        );
      }
      res.json(await settingsResponse(req));
    } finally {
      updatingSettings = false;
    }
  });
  let testingModel = false;
  app.post('/api/settings/test', requireSettingsAccess, async (req, res) => {
    if (testingModel)
      throw new HttpError(429, 'A model test is already running. 模型连接正在测试中。');
    testingModel = true;
    try {
      const candidateEnv = await settings.preview(req.body);
      const result = await testProvider({ ...providerOptions, env: candidateEnv });
      res.json({ ...result, checkedAt: new Date().toISOString() });
    } finally {
      testingModel = false;
    }
  });

  async function owned(collection, id, req) {
    if (!idPattern.test(id || '')) throw new HttpError(404, 'Not found.');
    const item = await store.get(collection, id);
    if (!item || item.owner !== req.session.id)
      throw new HttpError(404, 'Not found in this browser’s library.');
    return item;
  }
  async function getCourse(id, req) {
    return samples.find((course) => course.id === id) || (await owned('courses', id, req)).course;
  }

  // Older saved courses predate planId. Match the complete source snapshot and
  // unchanged outline metadata, never a topic/title alone; ambiguity preserves data.
  function matchesLegacyPlan(course, plan) {
    return (
      course?.origin === 'generated' &&
      ['title', 'description', 'subject', 'level', 'language'].every(
        (key) => course[key] === plan?.[key],
      ) &&
      Array.isArray(course.objectives) &&
      course.objectives.length > 0 &&
      Array.isArray(plan?.objectives) &&
      course.objectives.every((item) => plan.objectives.includes(item)) &&
      Array.isArray(course.sources) &&
      course.sources.length > 0 &&
      isDeepStrictEqual(course.sources, plan?.sources)
    );
  }
  async function deletionScope(req) {
    const record = await owned('attempts', req.params.id, req);
    const { attempt } = record;
    const owner = req.session.id;
    const [attempts, courses, plans, practice, handoffs] = await Promise.all(
      ['attempts', 'courses', 'plans', 'practice', 'classroom-handoffs'].map((collection) =>
        store.list(collection),
      ),
    );
    const entries = [];
    const counts = { attempts: 1, practice: 0, handoffs: 0, courses: 0, plans: 0 };
    const retained = [];
    const add = (collection, id) => entries.push({ collection, id });
    for (const item of practice.filter(
      (item) => item.owner === owner && item.attemptId === attempt.id,
    )) {
      add('practice', item.id);
      counts.practice++;
    }
    const linkedHandoffs = handoffs.filter(
      (item) => item.owner === owner && item.attemptId === attempt.id,
    );
    for (const item of linkedHandoffs) add('classroom-handoffs', item.id);
    counts.handoffs = linkedHandoffs.length;
    const indexId = hash(`${owner}:${attempt.id}`);
    if (await store.get('classroom-handoff-index', indexId))
      add('classroom-handoff-index', indexId);

    const references = attempts.filter(
      (item) => item.attempt?.id !== attempt.id && item.attempt?.courseId === attempt.courseId,
    );
    const savedCourse = courses.find((item) => item.course?.id === attempt.courseId);
    const course = savedCourse?.owner === owner ? savedCourse.course : record.course;
    if (samples.some((item) => item.id === attempt.courseId) || course?.origin === 'sample') {
      retained.push({ resource: 'course', reason: 'sample', count: 1 });
    } else if (references.length) {
      retained.push({
        resource: 'course',
        reason: 'shared',
        count: 1,
        references: references.length,
      });
    } else if (savedCourse && savedCourse.owner !== owner) {
      retained.push({ resource: 'course', reason: 'unmatched', count: 0 });
    } else if (['generated', 'imported'].includes(course?.origin)) {
      if (savedCourse) {
        add('courses', course.id);
        counts.courses++;
      }
      if (course.origin === 'generated') {
        const planId = savedCourse?.planId ?? record.planId;
        const candidates = plans.filter(
          (item) =>
            item.owner === owner &&
            (planId !== undefined
              ? item.plan?.id === planId
              : matchesLegacyPlan(course, item.plan)),
        );
        if (candidates.length === 1) {
          const plan = candidates[0].plan;
          const referencesPlan = (item) =>
            item.planId !== undefined
              ? item.planId === plan.id
              : matchesLegacyPlan(item.course, plan);
          const relatedCourses = courses.filter(
            (item) => item.owner === owner && item.course?.id !== course.id && referencesPlan(item),
          );
          const relatedAttempts = attempts.filter(
            (item) =>
              item.owner === owner && item.attempt?.courseId !== course.id && referencesPlan(item),
          );
          if (relatedCourses.length || relatedAttempts.length) {
            const ids = new Set([
              ...relatedCourses.map((item) => item.course.id),
              ...relatedAttempts.map((item) => item.attempt.courseId),
            ]);
            retained.push({ resource: 'plan', reason: 'shared', count: 1, references: ids.size });
          } else {
            add('plans', plan.id);
            counts.plans++;
          }
        } else {
          retained.push({
            resource: 'plan',
            reason: candidates.length ? 'ambiguous' : 'unmatched',
            count: candidates.length,
          });
        }
      }
    }
    // Keep the primary record until the dependent files have been removed.
    add('attempts', attempt.id);
    const scope = {
      attemptId: attempt.id,
      courseId: attempt.courseId,
      courseTitle: attempt.courseTitle,
      counts,
      handoffIds: linkedHandoffs.map((item) => item.id).sort(),
      retained,
    };
    scope.revision = hash(
      JSON.stringify({
        ...scope,
        entries: [...entries].sort((a, b) =>
          `${a.collection}:${a.id}`.localeCompare(`${b.collection}:${b.id}`),
        ),
      }),
    );
    return { scope, entries };
  }

  app.get('/api/courses', async (req, res) => {
    const saved = await store.transaction(async () =>
      (await store.list('courses'))
        .filter((item) => item.owner === req.session.id)
        .map((item) => item.course),
    );
    res.json({ courses: [...saved.reverse(), ...samples].map(summary) });
  });
  app.get('/api/courses/:id', async (req, res) =>
    res.json({
      course: publicCourse(await store.transaction(() => getCourse(req.params.id, req))),
    }),
  );
  app.get('/api/courses/:id/export', async (req, res) => {
    const course = await store.transaction(() => getCourse(req.params.id, req));
    res.attachment(`studyloop-${course.id}.json`).json(course);
  });
  app.post('/api/import', async (req, res) => {
    let course;
    try {
      course = validateCourse({
        ...req.body,
        id: randomUUID(),
        origin: 'imported',
        createdAt: new Date().toISOString(),
      });
    } catch {
      throw new HttpError(
        400,
        'Invalid course pack. Check the course format and source references. 课程包格式或答案不完整。',
      );
    }
    await store.transaction(() =>
      store.put('courses', course.id, { owner: req.session.id, course }),
    );
    res.status(201).json({ course: publicCourse(course) });
  });

  let activeGenerations = 0;
  let updatingSettings = false;
  async function withGeneration(operation, kind = 'course') {
    if (updatingSettings)
      throw new HttpError(
        409,
        'Settings are being updated. Try again shortly. 配置正在更新，请稍后重试。',
      );
    const diagnostics = createGenerationDiagnostics(kind, options.onDiagnostic);
    const requestOptions = {
      ...providerOptions,
      env: { ...env },
      onDiagnostic: diagnostics.record,
    };
    if (!core.providerConfig(requestOptions).generationAvailable)
      throw new HttpError(
        503,
        'Configure your own model API in .env to generate courses. 请按配置说明填写自己的模型 API，或体验示例课程。',
      );
    if (activeGenerations >= integerSetting(env.MAX_CONCURRENT_GENERATIONS, 2, 4))
      throw new HttpError(429, 'Generation is busy. Please try again shortly.');
    activeGenerations++;
    try {
      await store.transaction(async () => {
        const day = new Date().toISOString().slice(0, 10);
        const usage = (await store.get('usage', day)) || { count: 0 };
        if (usage.count >= integerSetting(env.DAILY_GENERATION_LIMIT, 20))
          throw new HttpError(
            429,
            'This instance has reached its daily generation limit (UTC). 今日生成次数已用完。',
          );
        await store.put('usage', day, { count: usage.count + 1 });
      });
      return await operation(requestOptions);
    } catch (failure) {
      if (failure instanceof CoreError) {
        const state = diagnostics.details();
        diagnostics.record({
          phase: failure.phase || state.phase,
          event: 'failed',
          attempt: failure.attempts || state.attempts,
          code: failure.code,
        });
        failure.generation = diagnostics.details();
      }
      throw failure;
    } finally {
      activeGenerations--;
    }
  }
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 8, fieldSize: 240000 },
  });
  app.post('/api/plans', upload.single('file'), async (req, res) => {
    const { topic, level, language, mode } = req.body || {};
    if (typeof topic !== 'string' || topic.trim().length < 2 || topic.length > 200)
      throw new HttpError(400, 'Enter a topic between 2 and 200 characters.');
    if (
      !['zh', 'en'].includes(language) ||
      typeof level !== 'string' ||
      level.length > 100 ||
      !level.trim()
    )
      throw new HttpError(400, 'Choose a level and language.');
    if (!['search', 'upload', 'text'].includes(mode))
      throw new HttpError(400, 'Choose a course input method.');
    const sourceDetails = {};
    if (mode !== 'search') {
      for (const [field, limit] of [
        ['sourceTitle', 200],
        ['sourceUrl', 2000],
      ]) {
        const value = req.body[field];
        if (value === undefined) continue;
        if (typeof value !== 'string' || value.length > limit)
          throw new HttpError(
            400,
            'Check the source title and original URL. 请检查资料名称与原文地址。',
          );
        if (value.trim()) sourceDetails[field] = value.trim();
      }
      if (sourceDetails.sourceUrl) {
        try {
          const url = new URL(sourceDetails.sourceUrl);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
            throw new Error('Invalid source URL.');
          sourceDetails.sourceUrl = url.href;
        } catch {
          throw new HttpError(
            400,
            'Use an HTTP(S) source page without login credentials. 请填写不含账号密码的原文网页地址。',
          );
        }
      }
    }
    let text = '';
    if (mode === 'upload') text = await extractUpload(req.file);
    if (mode === 'text') {
      text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
      if (text.length < 400 || text.length > 36000)
        throw new HttpError(400, 'Paste between 400 and 36,000 characters of course material.');
    }
    const input = {
      topic: topic.trim(),
      level: level.trim(),
      language,
      mode,
      text,
      ...sourceDetails,
    };
    const result = await replayRequest(req, 'plan', input, async (requestMetadata) => {
      const plan = await withGeneration(
        (requestOptions) => core.createPlan(input, requestOptions),
        'plan',
      );
      plan.id = randomUUID();
      await store.transaction(() =>
        store.put('plans', plan.id, { owner: req.session.id, plan, ...requestMetadata }),
      );
      return { plan };
    });
    res.status(201).json(result);
  });
  app.post('/api/courses', async (req, res) => {
    const { planId, objectives, questionCount } = req.body || {};
    const { plan } = await store.transaction(() => owned('plans', planId, req));
    if (
      !Array.isArray(objectives) ||
      !objectives.length ||
      objectives.some((item) => !plan.objectives.includes(item)) ||
      new Set(objectives).size !== objectives.length
    )
      throw new HttpError(400, 'Choose objectives from the proposed outline.');
    if (![4, 6, 8].includes(questionCount)) throw new HttpError(400, 'Choose 4, 6 or 8 questions.');
    const saved = await replayRequest(
      req,
      'course',
      { planId, objectives, questionCount },
      async (requestMetadata) => {
        const result = await withGeneration((requestOptions) =>
          core.generateCourse(plan, { objectives, questionCount }, requestOptions),
        );
        const course = validateCourse({
          ...result,
          id: randomUUID(),
          origin: 'generated',
          createdAt: new Date().toISOString(),
        });
        await store.transaction(async () => {
          const original = await store.get('plans', planId);
          if (!original || original.owner !== req.session.id)
            throw new HttpError(
              409,
              'The course plan was deleted during generation. Create a new plan. 生成期间课程计划已删除，请重新创建课程计划。',
            );
          await store.put('courses', course.id, {
            owner: req.session.id,
            planId,
            course,
            ...requestMetadata,
          });
        });
        return { course: publicCourse(course) };
      },
    );
    res.status(201).json(saved);
  });

  app.post('/api/courses/:id/attempts', async (req, res) => {
    const result = await replayRequest(
      req,
      `attempt:${req.params.id}`,
      { answers: req.body?.answers },
      async (requestMetadata) => {
        const attempt = await store.transaction(async () => {
          const course = await getCourse(req.params.id, req);
          const answers = req.body?.answers;
          let graded;
          try {
            graded = gradeAttempt(course, answers);
          } catch {
            throw new HttpError(
              400,
              'Answer every question or select “I don’t know”. 请完成每题或选择“我不会”。',
            );
          }
          const value = {
            id: randomUUID(),
            courseId: course.id,
            courseTitle: course.title,
            createdAt: new Date().toISOString(),
            answers,
            ...graded,
          };
          const saved = await store.get('courses', course.id);
          // Preserve replay keys and the trusted server-side plan association.
          await store.put('attempts', value.id, {
            owner: req.session.id,
            attempt: value,
            course,
            ...requestMetadata,
            ...(saved?.owner === req.session.id && saved.planId ? { planId: saved.planId } : {}),
          });
          return value;
        });
        return { attempt };
      },
    );
    res.status(201).json(result);
  });
  app.get('/api/attempts', async (req, res) => {
    const attempts = await store.transaction(async () =>
      (await store.list('attempts'))
        .filter((item) => item.owner === req.session.id)
        .map((item) => item.attempt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
    res.json({ attempts });
  });
  app.get('/api/attempts/:id', async (req, res) =>
    res.json({
      attempt: (await store.transaction(() => owned('attempts', req.params.id, req))).attempt,
    }),
  );
  app.get('/api/attempts/:id/deletion-preview', async (req, res) => {
    const { scope } = await store.transaction(() => deletionScope(req));
    res.json(scope);
  });
  app.get('/api/attempt-deletions/:id', async (req, res) => {
    const value = await store.transaction(() => owned('attempt-deletions', req.params.id, req));
    if (value.receipt?.completed !== true) throw new HttpError(404, 'Deletion not completed.');
    res.json(value.receipt);
  });
  app.delete('/api/attempts/:id', async (req, res) => {
    if (!idPattern.test(req.params.id || '')) throw new HttpError(404, 'Not found.');
    const result = await store.transaction(async () => {
      const previous = await store.get('attempt-deletions', req.params.id);
      if (previous?.owner === req.session.id && previous.receipt?.completed === true)
        return { ...previous.receipt, retained: [] };
      const { scope, entries } = await deletionScope(req);
      if (!/^[a-f0-9]{64}$/.test(req.body?.revision || ''))
        throw new HttpError(400, 'Preview the deletion before confirming. 请先预览删除范围。');
      if (req.body.revision !== scope.revision)
        throw new HttpError(
          409,
          'The deletion scope changed. Review the updated preview before confirming again. 删除范围已变化，请重新预览后确认。',
        );
      const receipt = {
        attemptId: scope.attemptId,
        handoffIds: scope.handoffIds,
        deleted: scope.counts,
        deletedAt: new Date().toISOString(),
        completed: true,
      };
      try {
        await store.deleteMany(entries, {
          records: [
            {
              collection: 'attempt-deletions',
              id: scope.attemptId,
              value: { owner: req.session.id, receipt },
            },
          ],
        });
      } catch (error) {
        if (error instanceof StoreDeleteError && error.restoreFailed) {
          console.error(
            'Record deletion recovery was incomplete. Check local storage access before retrying.',
          );
          throw new HttpError(
            500,
            'Deletion failed and recovery was incomplete. Check local storage access before retrying. 删除失败且未能完整恢复，请检查本地存储权限后再试。',
          );
        }
        throw new HttpError(
          500,
          'Deletion failed. No completion was recorded; reload the preview before retrying. 删除失败，未记录删除完成；请重新预览后重试。',
        );
      }
      return { ...receipt, retained: scope.retained };
    });
    res.json(result);
  });
  app.post('/api/attempts/:id/practice/:questionId', async (req, res) => {
    const result = await replayRequest(
      req,
      `practice:${req.params.id}:${req.params.questionId}`,
      { answer: req.body?.answer },
      (requestMetadata) =>
        store.transaction(async () => {
          const { course } = await owned('attempts', req.params.id, req);
          const question = course.questions.find((item) => item.id === req.params.questionId);
          if (!question) throw new HttpError(404, 'Question not found.');
          let graded;
          try {
            graded = gradePractice(question, req.body?.answer);
          } catch {
            throw new HttpError(400, 'Choose an answer or “I don’t know”.');
          }
          const id = randomUUID();
          await store.put('practice', id, {
            id,
            owner: req.session.id,
            attemptId: req.params.id,
            questionId: question.id,
            answer: req.body.answer,
            ...graded,
            ...requestMetadata,
            ...(requestMetadata.request ? { result: graded } : {}),
            createdAt: new Date().toISOString(),
          });
          return graded;
        }),
    );
    res.json(result);
  });
  app.get('/api/attempts/:id/openmaic', async (req, res) => {
    const { course, attempt } = await store.transaction(() =>
      owned('attempts', req.params.id, req),
    );
    res.json(buildOpenMAICBrief(course, attempt));
  });

  app.post('/api/attempts/:id/classroom-handoff', async (req, res) => {
    const handoff = await store.transaction(async () => {
      const { course, attempt } = await owned('attempts', req.params.id, req);
      if (!classroomConfig().openmaicAvailable)
        throw new HttpError(
          503,
          'The built-in classroom is not installed. 内置课堂尚未安装，请完成项目安装。',
        );
      const indexId = hash(`${req.session.id}:${attempt.id}`);
      const index = await store.get('classroom-handoff-index', indexId);
      const existing = index ? await store.get('classroom-handoffs', index.id) : null;
      if (existing && existing.owner === req.session.id && existing.expiresAt > Date.now())
        return existing;
      const value = {
        id: randomUUID(),
        owner: req.session.id,
        attemptId: attempt.id,
        brief: buildOpenMAICBrief(course, attempt).markdown,
        courseTitle: attempt.courseTitle || course.title,
        language: course.language,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      await store.put('classroom-handoffs', value.id, value);
      await store.put('classroom-handoff-index', indexId, { id: value.id });
      return value;
    });
    res.json({
      id: handoff.id,
      url: `/studyloop-launch?handoff=${encodeURIComponent(handoff.id)}`,
      expiresAt: handoff.expiresAt,
    });
  });
  app.get('/api/classroom-handoffs/:id', async (req, res) => {
    const handoff = await store.transaction(async () => {
      const value = await owned('classroom-handoffs', req.params.id, req);
      await owned('attempts', value.attemptId, req);
      return value;
    });
    if (handoff.expiresAt <= Date.now())
      throw new HttpError(
        410,
        'This classroom link expired. Return to your answer sheet and enter again. 课堂链接已过期，请返回答卷重新进入。',
      );
    res.json({
      brief: handoff.brief,
      courseTitle: handoff.courseTitle,
      language: handoff.language,
      returnUrl: `/?attempt=${encodeURIComponent(handoff.attemptId)}`,
    });
  });

  // StudyLoop endpoints above always win. The proxy accepts only the audited
  // browser-local classroom workflow, never OpenMAIC's shared server storage.
  app.use(async (req, res, next) => {
    const route = classifyClassroom(req);
    if (!route) return next();
    if (!req.authenticated)
      throw new HttpError(401, 'Enter this instance’s access password. 请输入访问口令。');
    if (!route.allowed) throw new HttpError(404, 'Classroom endpoint is not available.');
    if (route.generation) await withGeneration(() => proxyClassroom(req, res), 'classroom');
    else await proxyClassroom(req, res);
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API endpoint not found.')));
  app.use('/docs', express.static(path.join(root, 'docs'), { dotfiles: 'deny' }));
  app.use(express.static(path.join(root, 'dist'), { dotfiles: 'deny', index: 'index.html' }));
  app.get('/{*path}', (_req, res, next) =>
    res.sendFile(path.join(root, 'dist', 'index.html'), (error) => error && next(error)),
  );
  app.use((error, _req, res, _next) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof CoreError)
      return res
        .status(
          error.code.startsWith('source') ||
            error.code.includes('invalid') ||
            error.code.startsWith('review')
            ? 422
            : 502,
        )
        .json({
          error: error.publicMessage,
          code: error.code,
          ...(publicGenerationDetails(error.generation)
            ? { generation: publicGenerationDetails(error.generation) }
            : {}),
          ...(['sources_missing', 'sources_insufficient'].includes(error.code) &&
          error.sourceSearch &&
          typeof error.sourceSearch.topic === 'string' &&
          error.sourceSearch.topic.length <= 300 &&
          [1, 2].includes(error.sourceSearch.rounds)
            ? {
                sourceSearch: {
                  topic: error.sourceSearch.topic,
                  rounds: error.sourceSearch.rounds,
                  queries: Array.isArray(error.sourceSearch.queries)
                    ? error.sourceSearch.queries
                        .filter((value) => typeof value === 'string' && value.length <= 300)
                        .slice(0, 6)
                    : [],
                  suggestedTopics: Array.isArray(error.sourceSearch.suggestedTopics)
                    ? error.sourceSearch.suggestedTopics
                        .filter(
                          (value) =>
                            typeof value === 'string' &&
                            value.length >= 2 &&
                            value.length <= 120 &&
                            !/[\r\n\u0000-\u001f]/u.test(value),
                        )
                        .slice(0, 3)
                    : [],
                },
              }
            : {}),
        });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof multer.MulterError)
      return res.status(400).json({ error: 'Upload limit exceeded. Maximum file size: 8 MB.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request is too large.' });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON.' });
    // Never echo raw provider exceptions (which may contain request headers or secrets).
    if (typeof error.code === 'string' && error.code.startsWith('PROVIDER_'))
      return res.status(502).json({
        error:
          'The model provider could not complete this request. Check configuration, availability, and quota.',
      });
    if (options.onError) options.onError(error);
    else console.error('Request failed:', error.name || 'Error');
    res.status(500).json({
      error:
        'Unable to complete this request. Please check the material and model configuration, then try again. 无法完成，请检查资料与模型配置。',
    });
  });
  return app;
}
