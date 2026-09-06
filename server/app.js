import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Store } from './store.js';
import { HttpError } from './errors.js';
import { extractUpload } from './uploads.js';
import { loadSamples } from './core/samples.js';
import { validateCourse, publicCourse, gradeAttempt, gradePractice } from './core/schema.js';
import { createPlan, generateCourse, providerConfig, CoreError } from './core/providers.js';
import { buildOpenMAICBrief } from './integrations/openmaic.js';

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

export async function createApp(options = {}) {
  const env = options.env || process.env;
  const store = options.store || new Store(env.DATA_DIR || path.join(root, 'data'));
  const samples = await loadSamples();
  const providerOptions = { env, ...(options.providerOptions || {}) };
  const core = { createPlan, generateCourse, providerConfig, ...(options.core || {}) };
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', version }));
  app.use('/api', (req, res, next) => {
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
    path: '/api',
  };
  async function newSession(res, authenticated) {
    const token = randomBytes(32).toString('hex');
    const session = {
      id: hash(token),
      authenticated,
      authEpoch,
      expiresAt: Date.now() + 90 * 86400000,
    };
    await store.put('sessions', session.id, session);
    res.cookie('studyloop_session', token, cookieOptions);
    return session;
  }
  app.use('/api', async (req, res, next) => {
    const token = req.cookies.studyloop_session;
    let session = /^[a-f0-9]{64}$/.test(token || '')
      ? await store.get('sessions', hash(token))
      : null;
    if (!session || session.expiresAt < Date.now())
      session = await newSession(res, !accessRequired);
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
      openmaicAvailable: Boolean(env.OPENMAIC_URL),
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

  app.get('/api/courses', async (req, res) => {
    const saved = (await store.list('courses'))
      .filter((item) => item.owner === req.session.id)
      .map((item) => item.course);
    res.json({ courses: [...saved.reverse(), ...samples].map(summary) });
  });
  app.get('/api/courses/:id', async (req, res) =>
    res.json({ course: publicCourse(await getCourse(req.params.id, req)) }),
  );
  app.get('/api/courses/:id/export', async (req, res) => {
    const course = await getCourse(req.params.id, req);
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
    await store.put('courses', course.id, { owner: req.session.id, course });
    res.status(201).json({ course: publicCourse(course) });
  });

  let activeGenerations = 0;
  async function withGeneration(operation) {
    if (!core.providerConfig(providerOptions).generationAvailable)
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
      return await operation();
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
    let text = '';
    if (mode === 'upload') text = await extractUpload(req.file);
    if (mode === 'text') {
      text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
      if (text.length < 400 || text.length > 36000)
        throw new HttpError(400, 'Paste between 400 and 36,000 characters of course material.');
    }
    const plan = await withGeneration(() =>
      core.createPlan(
        { topic: topic.trim(), level: level.trim(), language, mode, text },
        providerOptions,
      ),
    );
    plan.id = randomUUID();
    await store.put('plans', plan.id, { owner: req.session.id, plan });
    res.status(201).json({ plan });
  });
  app.post('/api/courses', async (req, res) => {
    const { planId, objectives, questionCount } = req.body || {};
    const { plan } = await owned('plans', planId, req);
    if (
      !Array.isArray(objectives) ||
      !objectives.length ||
      objectives.some((item) => !plan.objectives.includes(item)) ||
      new Set(objectives).size !== objectives.length
    )
      throw new HttpError(400, 'Choose objectives from the proposed outline.');
    if (![4, 6, 8].includes(questionCount)) throw new HttpError(400, 'Choose 4, 6 or 8 questions.');
    const result = await withGeneration(() =>
      core.generateCourse(plan, { objectives, questionCount }, providerOptions),
    );
    const course = validateCourse({
      ...result,
      id: randomUUID(),
      origin: 'generated',
      createdAt: new Date().toISOString(),
    });
    await store.put('courses', course.id, { owner: req.session.id, course });
    res.status(201).json({ course: publicCourse(course) });
  });

  app.post('/api/courses/:id/attempts', async (req, res) => {
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
    const attempt = {
      id: randomUUID(),
      courseId: course.id,
      courseTitle: course.title,
      createdAt: new Date().toISOString(),
      answers,
      ...graded,
    };
    // Persist the full source course with the attempt: future imports/edits cannot change replay or practice keys.
    await store.put('attempts', attempt.id, { owner: req.session.id, attempt, course });
    res.status(201).json({ attempt });
  });
  app.get('/api/attempts', async (req, res) => {
    const attempts = (await store.list('attempts'))
      .filter((item) => item.owner === req.session.id)
      .map((item) => item.attempt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ attempts });
  });
  app.get('/api/attempts/:id', async (req, res) =>
    res.json({ attempt: (await owned('attempts', req.params.id, req)).attempt }),
  );
  app.post('/api/attempts/:id/practice/:questionId', async (req, res) => {
    const { course } = await owned('attempts', req.params.id, req);
    const question = course.questions.find((item) => item.id === req.params.questionId);
    if (!question) throw new HttpError(404, 'Question not found.');
    let result;
    try {
      result = gradePractice(question, req.body?.answer);
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
      ...result,
      createdAt: new Date().toISOString(),
    });
    res.json(result);
  });
  app.get('/api/attempts/:id/openmaic', async (req, res) => {
    const { course, attempt } = await owned('attempts', req.params.id, req);
    res.json(buildOpenMAICBrief(course, attempt, { baseUrl: env.OPENMAIC_URL }));
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API endpoint not found.')));
  app.use('/docs', express.static(path.join(root, 'docs'), { dotfiles: 'deny' }));
  app.use(express.static(path.join(root, 'dist'), { dotfiles: 'deny', index: 'index.html' }));
  app.get('/{*path}', (_req, res, next) =>
    res.sendFile(path.join(root, 'dist', 'index.html'), (error) => error && next(error)),
  );
  app.use((error, _req, res, _next) => {
    if (error instanceof CoreError)
      return res
        .status(
          error.code.startsWith('source') ||
            error.code.includes('invalid') ||
            error.code.startsWith('review')
            ? 422
            : 502,
        )
        .json({ error: error.publicMessage });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof multer.MulterError)
      return res.status(400).json({ error: 'Upload limit exceeded. Maximum file size: 8 MB.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request is too large.' });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON.' });
    // Never echo raw provider exceptions (which may contain request headers or secrets).
    if (typeof error.code === 'string' && error.code.startsWith('PROVIDER_'))
      return res
        .status(502)
        .json({
          error:
            'The model provider could not complete this request. Check configuration, availability, and quota.',
        });
    if (options.onError) options.onError(error);
    else console.error('Request failed:', error.name || 'Error');
    res
      .status(500)
      .json({
        error:
          'Unable to complete this request. Please check the material and model configuration, then try again. 无法完成，请检查资料与模型配置。',
      });
  });
  return app;
}
