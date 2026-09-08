import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  Globe2,
  GraduationCap,
  History,
  Info,
  Layers3,
  Leaf,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import Logo from './Brand.jsx';
import ModelSettings from './ModelSettings.jsx';

const REPO = 'https://github.com/win223909/studyloop';
const COPY = {
  zh: {
    library: '学习工作台',
    history: '学习记录',
    about: '关于项目',
    settings: '模型与设置',
    tagline: '学 · 练 · 理解 · 再练',
    newCourse: '新建课程',
    workspace: '我的学习空间',
    homeTitle: '今天，学点什么？',
    homeSub: '输入想学的内容，或把课程资料带进来。',
    search: '搜索主题',
    text: '粘贴资料',
    upload: '上传文件',
    topic: '课程或知识点',
    topicPlaceholder: '例如：六年级分数运算、光合作用、英语过去时…',
    materialTitle: '为这份资料起个名字',
    materialPlaceholder: '在这里粘贴课程笔记、文章或课堂资料（400 至 36,000 字符）…',
    material: '课程内容',
    file: '选择课程文件',
    fileHint: '支持 PDF、Markdown 和 TXT，最大 8 MB',
    chosen: '已选择',
    level: '学习水平',
    levelPlaceholder: '例如：六年级 / 入门',
    language: '课程语言',
    zh: '中文',
    en: 'English',
    createPlan: '整理课程大纲',
    planning: '正在整理资料与大纲…',
    configNotice: '示例课程可以直接练习。配置模型 API 后，就能根据自己的主题或资料生成课程。',
    configure: '配置指南',
    courses: '我的课程',
    coursesSub: '从一门课程开始，把知识学扎实。',
    all: '全部课程',
    sample: '示例课程',
    generated: '我的资料',
    imported: '导入 · 未复核',
    import: '导入课程',
    questions: '题',
    objectives: '个学习目标',
    start: '开始练习',
    emptyCourses: '还没有课程。试着输入一个想学的主题。',
    flow1: '找到内容',
    flow2: '动手练习',
    flow3: '理解知识',
    flow4: '巩固所学',
    original: '自编示例 · 无需 API',
    back: '返回',
    outline: '确认学习范围',
    outlineSub: '选好知识点，再生成适合你的练习。',
    scope: '学习目标',
    chooseObjectives: '选择这次想学的知识点',
    source: '资料来源',
    sourceCount: '份资料',
    viewSource: '查看资料',
    questionCount: '练习题数',
    generate: '生成课程与题库',
    generating: '正在生成并检查题目…',
    reviewed: '你可以查看资料，再决定学习范围。',
    sourceOriginal: '自编资料',
    sourceUpload: '上传资料',
    sourceWeb: '网页资料',
    practice: '课程练习',
    question: '题目',
    of: '/',
    unknown: '我不会 / I don’t know',
    unknownHint: '没关系，提交后可以从讲解开始。',
    previous: '上一题',
    next: '下一题',
    submit: '提交并查看讲解',
    submitting: '正在批改…',
    progress: '答题进度',
    answered: '已作答',
    unanswered: '未作答',
    finishAll: '请完成所有题目；不确定时可以选“我还不会”。',
    export: '导出课程',
    sourceBefore: '可查看这道题的参考资料',
    result: '练习回放',
    completed: '练习已完成',
    resultSub: '看看已经掌握的，也给还不熟悉的知识一点时间。',
    correct: '答对',
    incorrect: '待巩固',
    notYet: '还不会',
    score: '正确率',
    seeLesson: '查看讲解与巩固',
    hideLesson: '收起讲解',
    yours: '你的答案',
    answer: '参考答案',
    explanation: '为什么',
    takeaway: '记住这一点',
    miniPractice: '再练一题',
    miniSub: '这次巩固单独记录，不改变原练习成绩。',
    checkPractice: '检查答案',
    tryAgain: '再试一次',
    practiceCorrect: '答对了，继续保持！',
    practiceIncorrect: '再看一眼关键知识点。',
    practiceUnknown: '先读懂这段解析，再试一试。',
    retry: '重新练习',
    immutable: '已保存原始答卷，之后的巩固不会改动本次成绩。',
    sourcesForQuestion: '本题参考资料',
    openmaic: '把薄弱点学明白',
    openmaicSub: '使用当前模型，在内置 OpenMAIC 中生成针对本次练习的互动课堂。',
    downloadBrief: '下载课堂学习提纲',
    openClassroom: '生成互动课堂',
    openingClassroom: '正在准备课堂…',
    openmaicHint: '先确认最多 6 个场景的大纲，再生成课堂；每个场景通常调用模型两次，并计入每日生成额度。',
    openmaicMissing: '内置课堂模块尚未安装。部署者安装模块后即可使用，教学提纲仍可下载。',
    openmaicModelMissing: '先在“模型与设置”中配置模型，课堂会直接复用这组配置。',
    openmaicInstalled: '已安装',
    openmaicReady: '已就绪',
    openmaicStarting: '正在启动',
    openmaicFailed: '启动未完成',
    openmaicInvalidLink: '课堂入口无效，请重试。',
    openmaicCredit: '内置互动课堂使用 THU-MAIC / OpenMAIC。感谢原项目团队及所有贡献者。',
    records: '每一步，都算数。',
    recordsSub: '回到过去的练习，继续消化尚未熟悉的知识。',
    emptyHistory: '你的第一份答卷，还在前面。',
    emptyHistorySub: '完成任意一门课程的练习，就会出现在这里。',
    browse: '去选一门课程',
    replay: '回看答卷',
    sessionNote: '记录保存在当前浏览器会话中。更换浏览器或清除 Cookie 后，原记录将无法从这里访问。',
    setup: '连接你的模型与服务',
    setupSub: '在部署电脑上设置模型、搜索和课堂服务，开始创建自己的课程。',
    generation: '课程生成',
    enabled: '已配置',
    notConfigured: '未配置',
    searchService: '资料搜索',
    classroom: 'OpenMAIC 课堂',
    available: '可使用',
    unavailable: '不可用',
    setupStep1: '复制示例配置',
    setupStep1Text: '在项目目录中复制 .env.example 为 .env；示例文件只包含空白密钥和配置说明。',
    setupStep2: '选择模型服务',
    setupStep2Text:
      '填写模型服务的地址、模型名和你自己的 API Key。支持多家服务及兼容接口，详细参数见配置指南。',
    setupStep3: '重启并开始',
    setupStep3Text: '重启服务使配置生效。回到工作台输入主题，或导入你的资料。',
    setupNote: '密钥仅保存在服务端 .env 中，不会显示在浏览器，也不应提交到 GitHub。',
    fullGuide: '查看完整配置说明',
    viewGithub: '查看 GitHub 项目',
    voice: '讲解朗读',
    voiceNote:
      '使用当前浏览器与设备提供的语音能力；是否可用取决于浏览器。语音服务可能由系统供应商处理，不调用本项目的模型 API。',
    aboutTitle: '让学习，形成一个完整的循环。',
    aboutSub: 'StudyLoop 是一个开源学习工作台，把课程资料、练习、讲解和巩固连接起来。',
    aboutA: '从好奇心开始',
    aboutAText: '输入一个主题，上传笔记，或从自编示例开始。先确认学习目标，再做有依据的练习。',
    aboutB: '给答案一个来处',
    aboutBText: '课程保留资料来源，练习保存原始答卷。看见过程，才能更好地理解结果。',
    aboutC: '感谢 OpenMAIC',
    aboutCText:
      'StudyLoop 集成 OpenMAIC 的真实课堂生成与互动学习流程，并复用 StudyLoop 的模型配置。特别感谢 THU-MAIC 团队及所有贡献者；原项目的 MIT 许可和署名随内置模块保留。',
    upstream: '访问 OpenMAIC',
    license: '开源协议与第三方声明',
    version: '版本',
    sourceText: '资料正文',
    visitSource: '打开原始网页',
    close: '关闭',
    error: '操作未完成',
    dismiss: '关闭提示',
    loading: '正在载入学习空间…',
    noTitle: '未命名课程',
    privacy: '你的学习空间',
    loginTitle: '进入学习空间',
    loginSub: '这个学习空间由部署者设置了访问口令。',
    password: '访问口令',
    login: '进入',
    readAloud: '朗读讲解',
    stopReading: '停止朗读',
    voiceUnavailable: '此浏览器暂不支持语音朗读',
    chooseVoice: '选择朗读声音',
    systemVoice: '系统默认声音',
    voiceLang: '朗读语言',
    fileRequired: '请先选择一份课程文件。',
    textRequired: '请粘贴课程资料。',
    topicRequired: '请填写课程名称或知识点。',
    objectiveRequired: '请至少选择一个学习目标。',
    importError: '无法读取课程文件，请选择有效的课程 JSON。',
    fileTooBig: '课程资料超过 8 MB，请选择更小的文件。',
    importTooBig: '课程 JSON 不能超过 2 MB。',
    materialSize: '课程资料需包含 400 至 36,000 个字符。',
    importOk: '课程已导入，可以开始练习。',
    downloadFailed: '下载失败，请稍后重试。',
    resultFor: '的练习',
    learning: '学习目标',
    total: '共',
    selectAnswer: '请选择一个答案。',
  },
  en: {
    library: 'Workspace',
    history: 'Learning history',
    about: 'About',
    settings: 'Models & settings',
    tagline: 'Learn. Practice. Understand.',
    newCourse: 'New course',
    workspace: 'MY LEARNING SPACE',
    homeTitle: 'What are we learning today?',
    homeSub: 'Choose a topic or bring your own course materials.',
    search: 'Find a topic',
    text: 'Paste material',
    upload: 'Upload a file',
    topic: 'Course or topic',
    topicPlaceholder: 'Try fractions, photosynthesis, or English past tense…',
    materialTitle: 'Give your material a title',
    materialPlaceholder:
      'Paste course notes, an article, or learning material (400–36,000 characters)…',
    material: 'Course material',
    file: 'Choose a course file',
    fileHint: 'PDF, Markdown or TXT · up to 8 MB',
    chosen: 'Selected',
    level: 'Learning level',
    levelPlaceholder: 'e.g. Grade 6 / Beginner',
    language: 'Course language',
    zh: '中文',
    en: 'English',
    createPlan: 'Build course outline',
    planning: 'Preparing sources and outline…',
    configNotice:
      'Example courses are ready to practice. Configure a model API to build courses from your own topics and materials.',
    configure: 'Setup guide',
    courses: 'Your courses',
    coursesSub: 'Start with one course. Make the knowledge your own.',
    all: 'All courses',
    sample: 'Examples',
    generated: 'My material',
    imported: 'Imported · unreviewed',
    import: 'Import course',
    questions: 'questions',
    objectives: 'learning objectives',
    start: 'Start practice',
    emptyCourses: 'No courses yet. Start with something you want to learn.',
    flow1: 'Find material',
    flow2: 'Try it out',
    flow3: 'Understand',
    flow4: 'Practice again',
    original: 'ORIGINAL EXAMPLE · NO API NEEDED',
    back: 'Back',
    outline: 'Choose your learning scope',
    outlineSub: 'Pick your objectives before building a practice set.',
    scope: 'Learning objectives',
    chooseObjectives: 'What would you like to work on?',
    source: 'Sources',
    sourceCount: 'sources',
    viewSource: 'View source',
    questionCount: 'Practice length',
    generate: 'Build course & questions',
    generating: 'Generating and checking questions…',
    reviewed: 'Review the sources before confirming your learning scope.',
    sourceOriginal: 'Original material',
    sourceUpload: 'Uploaded material',
    sourceWeb: 'Web source',
    practice: 'Course practice',
    question: 'Question',
    of: 'of',
    unknown: 'I don’t know',
    unknownHint: 'That’s okay. A lesson will be available after you submit.',
    previous: 'Previous',
    next: 'Next question',
    submit: 'Submit & see explanations',
    submitting: 'Checking your answers…',
    progress: 'Your progress',
    answered: 'answered',
    unanswered: 'Unanswered',
    finishAll: 'Answer every question; choose “I don’t know yet” when you’re unsure.',
    export: 'Export course',
    sourceBefore: 'Reference material for this question',
    result: 'Practice replay',
    completed: 'Practice complete',
    resultSub: 'See what you know, and give unfamiliar ideas a little more time.',
    correct: 'Correct',
    incorrect: 'To revisit',
    notYet: 'Not yet',
    score: 'Accuracy',
    seeLesson: 'Explanation & practice',
    hideLesson: 'Hide explanation',
    yours: 'Your answer',
    answer: 'Correct answer',
    explanation: 'Why it works',
    takeaway: 'The idea to keep',
    miniPractice: 'Try one more',
    miniSub: 'Follow-up practice is separate and won’t change your original score.',
    checkPractice: 'Check answer',
    tryAgain: 'Try again',
    practiceCorrect: 'You’ve got it!',
    practiceIncorrect: 'Take another look at the key idea.',
    practiceUnknown: 'Read the explanation first, then give it another try.',
    retry: 'Practice again',
    immutable: 'Your original answers are saved. Follow-up practice won’t change this result.',
    sourcesForQuestion: 'References for this question',
    openmaic: 'Understand what needs more practice',
    openmaicSub: 'Generate a focused classroom in the built-in OpenMAIC using your current model.',
    downloadBrief: 'Download classroom brief',
    openClassroom: 'Generate an interactive classroom',
    openingClassroom: 'Preparing your classroom…',
    openmaicHint:
      'Review an outline of up to 6 scenes. Each scene normally makes two model requests, counted toward the daily generation limit.',
    openmaicMissing:
      'The classroom module is not installed yet. The deployment owner can install it; you can still download the brief.',
    openmaicModelMissing:
      'Configure a model in Model & settings first. The classroom will reuse that configuration.',
    openmaicInstalled: 'Installed',
    openmaicReady: 'Ready',
    openmaicStarting: 'Starting',
    openmaicFailed: 'Startup incomplete',
    openmaicInvalidLink: 'The classroom link is invalid. Please try again.',
    openmaicCredit:
      'The built-in classroom uses THU-MAIC / OpenMAIC. Thank you to its team and contributors.',
    records: 'Every step counts.',
    recordsSub: 'Return to earlier practice and keep building understanding.',
    emptyHistory: 'Your first practice is still ahead.',
    emptyHistorySub: 'Complete a course practice and your answers will appear here.',
    browse: 'Find a course',
    replay: 'Replay answers',
    sessionNote:
      'Records belong to this browser session. Switching browsers or clearing cookies means you can no longer access these records here.',
    setup: 'Connect the model you choose.',
    setupSub: 'Set up models, search and classroom services on the deployment computer.',
    generation: 'Course generation',
    enabled: 'Configured',
    notConfigured: 'Not configured',
    searchService: 'Source search',
    classroom: 'OpenMAIC classroom',
    available: 'Available',
    unavailable: 'Unavailable',
    setupStep1: 'Copy the example configuration',
    setupStep1Text:
      'Copy .env.example to .env in the project directory. The example contains only empty keys and configuration guidance.',
    setupStep2: 'Choose your model provider',
    setupStep2Text:
      'Set the provider URL, model name and your own API key. Multiple providers and compatible endpoints are supported; see the guide for details.',
    setupStep3: 'Restart and begin',
    setupStep3Text:
      'Restart the service to load the configuration. Return to the workspace and enter a topic or bring your material.',
    setupNote:
      'Keys stay in the server-side .env file. They are never displayed in the browser and should never be committed to GitHub.',
    fullGuide: 'Read the configuration guide',
    viewGithub: 'View project on GitHub',
    voice: 'Lesson read-aloud',
    voiceNote:
      'Uses voices supplied by your browser and device. Availability depends on the browser. Speech may be processed by your system’s voice provider; it does not call the project’s model API.',
    aboutTitle: 'Give learning a complete loop.',
    aboutSub:
      'StudyLoop is an open-source learning workspace connecting course material, practice, explanations and follow-up learning.',
    aboutA: 'Begin with curiosity',
    aboutAText:
      'Enter a topic, upload notes, or explore an original example. Confirm your learning objectives, then practice with source-backed questions.',
    aboutB: 'Give answers a source',
    aboutBText:
      'Courses retain their sources. Practice keeps an immutable record of your answers, so you can see and understand your progress.',
    aboutC: 'Thank you, OpenMAIC',
    aboutCText:
      'StudyLoop integrates the real OpenMAIC classroom generation and interactive learning workflow, using your StudyLoop model configuration. Special thanks to the THU-MAIC team and all contributors. The bundled module retains the original MIT license and attribution.',
    upstream: 'Explore OpenMAIC',
    license: 'License & third-party notices',
    version: 'Version',
    sourceText: 'Source material',
    visitSource: 'Open original page',
    close: 'Close',
    error: 'That didn’t finish',
    dismiss: 'Dismiss message',
    loading: 'Opening your learning space…',
    noTitle: 'Untitled course',
    privacy: 'YOUR LEARNING SPACE',
    loginTitle: 'Enter your learning space',
    loginSub: 'This instance requires an access password set by its owner.',
    password: 'Access password',
    login: 'Enter workspace',
    readAloud: 'Read lesson aloud',
    stopReading: 'Stop reading',
    voiceUnavailable: 'This browser does not support read-aloud',
    chooseVoice: 'Choose a voice',
    systemVoice: 'System default',
    voiceLang: 'Reading language',
    fileRequired: 'Choose a course file first.',
    textRequired: 'Paste your course material first.',
    topicRequired: 'Enter a course name or topic.',
    objectiveRequired: 'Choose at least one learning objective.',
    importError: 'Could not read this course. Choose a valid course JSON file.',
    fileTooBig: 'Course material exceeds 8 MB. Choose a smaller file.',
    importTooBig: 'Course JSON must be no larger than 2 MB.',
    materialSize: 'Course material must contain 400–36,000 characters.',
    importOk: 'Course imported. You’re ready to practice.',
    downloadFailed: 'Download failed. Please try again.',
    resultFor: 'practice',
    learning: 'Learning objectives',
    total: 'Total',
    selectAnswer: 'Choose an answer first.',
  },
};

async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    body:
      options.body && !isForm && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      `HTTP ${response.status}: ${response.statusText || 'Unexpected server response'}`,
    );
  }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function downloadText(name, text, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function CourseArt({ type = 0 }) {
  return (
    <svg className={`course-art art-${type}`} viewBox="0 0 96 88" aria-hidden="true">
      {type === 0 ? (
        <>
          <circle cx="46" cy="44" r="27" />
          <path className="art-fill" d="M46 44V17a27 27 0 0 1 27 27Z" />
          <path d="M46 17v54M19 44h54" />
          <path d="m75 15 7-5m-3 17h8" />
        </>
      ) : type === 1 ? (
        <>
          <path className="art-fill" d="M48 65C15 57 20 27 22 21c28-1 40 16 26 44Z" />
          <path d="M48 73V42m0 17c-5-13-12-21-19-28m19 23c3-25 19-30 29-27 2 17-9 27-29 27Z" />
          <circle cx="76" cy="13" r="5" />
          <path d="M76 3V0m-9 7-4-3m-1 10h-5m28-7 4-3" />
        </>
      ) : (
        <>
          <path className="art-fill" d="M18 23h48v35H43L29 68V58H18Z" />
          <path d="M33 33h21M33 42h14M70 35h9v36H55l-9 8v-9" />
          <path d="m73 11 4-6m4 14 7-2" />
        </>
      )}
    </svg>
  );
}
function StatusBadge({ status, t }) {
  return (
    <span className={`status-badge ${status}`}>
      {status === 'correct' ? (
        <Check size={13} />
      ) : status === 'unknown' ? (
        <CircleHelp size={13} />
      ) : (
        <span className="status-dot" />
      )}
      {status === 'correct' ? t.correct : status === 'unknown' ? t.notYet : t.incorrect}
    </span>
  );
}

export default function App() {
  const [lang, setLang] = useState(() =>
    localStorage.getItem('studyloop-language') === 'en' ? 'en' : 'zh',
  );
  const t = COPY[lang];
  const [view, setView] = useState(() =>
    new URLSearchParams(window.location.search).get('view') === 'settings' ? 'settings' : 'home',
  );
  const [config, setConfig] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [courses, setCourses] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('search');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState(lang === 'zh' ? '小学高年级' : 'Upper primary');
  const [courseLang, setCourseLang] = useState(lang);
  const [material, setMaterial] = useState('');
  const [file, setFile] = useState(null);
  const [filter, setFilter] = useState('all');
  const [plan, setPlan] = useState(null);
  const [objectives, setObjectives] = useState([]);
  const [questionCount, setQuestionCount] = useState(6);
  const [course, setCourse] = useState(null);
  const [answers, setAnswers] = useState({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [attempt, setAttempt] = useState(null);
  const [openResults, setOpenResults] = useState({});
  const [practiceAnswers, setPracticeAnswers] = useState({});
  const [practiceResults, setPracticeResults] = useState({});
  const [source, setSource] = useState(null);
  const [openingClassroom, setOpeningClassroom] = useState(false);
  const [password, setPassword] = useState('');
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [voiceLang, setVoiceLang] = useState(lang === 'zh' ? 'zh-CN' : 'en-US');
  const [speaking, setSpeaking] = useState(null);
  const importRef = useRef(null);
  const fileRef = useRef(null);
  const mainRef = useRef(null);
  const restoredAttemptRef = useRef(false);
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const work = async (fn) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };
  const loadLibrary = async () => {
    const [library, records] = await Promise.all([api('/api/courses'), api('/api/attempts')]);
    setCourses(library.courses);
    setAttempts(records.attempts);
  };
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [settings, session] = await Promise.all([api('/api/config'), api('/api/session')]);
        if (!active) return;
        setConfig(settings);
        setAuthenticated(session.authenticated || !session.accessRequired);
        if (session.authenticated || !session.accessRequired) await loadLibrary();
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setInitializing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (initializing || !authenticated || restoredAttemptRef.current) return;
    restoredAttemptRef.current = true;
    const id = new URLSearchParams(window.location.search).get('attempt');
    if (id) showAttempt(id);
  }, [initializing, authenticated]);
  useEffect(() => {
    localStorage.setItem('studyloop-language', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = `StudyLoop · ${t.library}`;
  }, [lang, t.library]);
  useEffect(() => {
    if (!speechSupported) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', update);
      window.speechSynthesis.cancel();
    };
  }, [speechSupported]);
  useEffect(() => {
    if (!source) return;
    const onKey = (event) => {
      if (event.key === 'Escape') setSource(null);
    };
    document.addEventListener('keydown', onKey);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = oldOverflow;
    };
  }, [source]);
  const navigate = (next, resultId) => {
    if (speechSupported) window.speechSynthesis.cancel();
    setSpeaking(null);
    if (next === 'classrooms') {
      window.location.assign('/studio');
      return;
    }
    setView(next);
    setError('');
    setNotice('');
    const url = new URL(window.location.href);
    if (next === 'results' && resultId) url.searchParams.set('attempt', resultId);
    else if (next !== 'results') url.searchParams.delete('attempt');
    if (next === 'settings') url.searchParams.set('view', 'settings');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', url.pathname + url.search);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const sourceKind = (kind) =>
    kind === 'web' ? t.sourceWeb : kind === 'upload' ? t.sourceUpload : t.sourceOriginal;
  const date = (value) =>
    new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  const showCourse = async (id) =>
    work(async () => {
      const data = await api(`/api/courses/${encodeURIComponent(id)}`);
      setCourse(data.course);
      setAnswers({});
      setQuestionIndex(0);
      navigate('quiz');
    });
  const showAttempt = async (id) =>
    work(async () => {
      const data = await api(`/api/attempts/${encodeURIComponent(id)}`);
      setAttempt(data.attempt);
      setOpenResults({});
      setPracticeAnswers({});
      setPracticeResults({});
      navigate('results', data.attempt.id);
    });
  const makePlan = (event) => {
    event.preventDefault();
    work(async () => {
      if (topic.trim().length < 2) throw new Error(t.topicRequired);
      if (mode === 'text' && !material.trim()) throw new Error(t.textRequired);
      if (mode === 'text' && (material.trim().length < 400 || material.trim().length > 36000))
        throw new Error(t.materialSize);
      if (mode === 'upload' && !file) throw new Error(t.fileRequired);
      if (file?.size > 8 * 1024 * 1024) throw new Error(t.fileTooBig);
      const body = new FormData();
      body.set('topic', topic);
      body.set('level', level);
      body.set('language', courseLang);
      body.set('mode', mode);
      if (mode === 'text') body.set('text', material);
      if (mode === 'upload') body.set('file', file);
      const data = await api('/api/plans', { method: 'POST', body });
      setPlan(data.plan);
      setObjectives(data.plan.objectives);
      navigate('plan');
    });
  };
  const makeCourse = () =>
    work(async () => {
      if (!objectives.length) throw new Error(t.objectiveRequired);
      const data = await api('/api/courses', {
        method: 'POST',
        body: { planId: plan.id, objectives, questionCount },
      });
      setCourse(data.course);
      setAnswers({});
      setQuestionIndex(0);
      await loadLibrary();
      navigate('quiz');
    });
  const submit = () =>
    work(async () => {
      if (course.questions.some((q) => answers[q.id] === undefined)) throw new Error(t.finishAll);
      const data = await api(`/api/courses/${encodeURIComponent(course.id)}/attempts`, {
        method: 'POST',
        body: { answers },
      });
      setAttempt(data.attempt);
      setOpenResults({});
      setPracticeAnswers({});
      setPracticeResults({});
      await loadLibrary();
      navigate('results', data.attempt.id);
    });
  const importCourse = async (event) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    work(async () => {
      if (selected.size > 2 * 1024 * 1024) throw new Error(t.importTooBig);
      let parsed;
      try {
        parsed = JSON.parse(await selected.text());
      } catch {
        throw new Error(t.importError);
      }
      const data = await api('/api/import', { method: 'POST', body: parsed });
      await loadLibrary();
      if (data.course) {
        setCourse(data.course);
        setAnswers({});
        setQuestionIndex(0);
        navigate('quiz');
      }
      setNotice(t.importOk);
    });
  };
  const getBrief = () =>
    work(async () => {
      const data = await api(`/api/attempts/${encodeURIComponent(attempt.id)}/openmaic`);
      downloadText(data.filename || 'studyloop-classroom-brief.md', data.markdown);
    });
  const openClassroom = () =>
    work(async () => {
      setOpeningClassroom(true);
      try {
        const data = await api(
          `/api/attempts/${encodeURIComponent(attempt.id)}/classroom-handoff`,
          {
            method: 'POST',
          },
        );
        const url = new URL(data.url, window.location.origin);
        if (url.origin !== window.location.origin || url.pathname !== '/studyloop-launch')
          throw new Error(t.openmaicInvalidLink);
        if (speechSupported) window.speechSynthesis.cancel();
        window.location.assign(url.pathname + url.search);
      } finally {
        setOpeningClassroom(false);
      }
    });
  const gradePractice = (id) =>
    work(async () => {
      if (practiceAnswers[id] === undefined) throw new Error(t.selectAnswer);
      const result = await api(
        `/api/attempts/${encodeURIComponent(attempt.id)}/practice/${encodeURIComponent(id)}`,
        { method: 'POST', body: { answer: practiceAnswers[id] } },
      );
      setPracticeResults((old) => ({ ...old, [id]: result }));
    });
  const readLesson = (result) => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    if (speaking === result.questionId) {
      setSpeaking(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(
      [
        result.lesson?.title,
        ...(result.lesson?.steps || []),
        result.lesson?.takeaway,
        result.explanation,
      ]
        .filter(Boolean)
        .join('. '),
    );
    utterance.lang = voiceLang;
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = 0.92;
    utterance.onend = () => setSpeaking(null);
    utterance.onerror = () => setSpeaking(null);
    setSpeaking(result.questionId);
    window.speechSynthesis.speak(utterance);
  };
  const viewSources = async (ids, courseId) => {
    if (course?.id === courseId) {
      const found = course.sources.filter((s) => ids?.includes(s.id));
      if (found.length) setSource(found);
      return;
    }
    work(async () => {
      const data = await api(`/api/courses/${encodeURIComponent(courseId)}`);
      setCourse(data.course);
      setSource(data.course.sources.filter((s) => ids?.includes(s.id)));
    });
  };
  const pageLabel = ['plan', 'quiz', 'results'].includes(view)
    ? view === 'plan'
      ? t.outline
      : view === 'quiz'
        ? t.practice
        : t.result
    : { home: t.library, history: t.history, about: t.about, settings: t.settings }[view];
  const navItems = [
    ['home', BookOpen, t.library],
    ['history', History, t.history],
    ...(config?.openmaicAvailable
      ? [['classrooms', GraduationCap, lang === 'zh' ? '互动课堂' : 'Classrooms']]
      : []),
    ['settings', Settings2, t.settings],
    ['about', Info, t.about],
  ];
  const renderSources = (sources) => (
    <div className="source-list">
      {sources.map((item, index) => (
        <button className="source-row" key={item.id} onClick={() => setSource([item])}>
          <span className="source-number">{String(index + 1).padStart(2, '0')}</span>
          <span>
            <strong>{item.title}</strong>
            <small>
              {sourceKind(item.kind)}
              {item.url
                ? ` · ${new URL(safeUrl(item.url) || 'https://invalid.local').hostname}`
                : ''}
            </small>
          </span>
          <ArrowUpRight size={17} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {lang === 'zh' ? '跳到主要内容' : 'Skip to content'}
      </a>
      <aside className="sidebar">
        <button
          className="brand-button"
          onClick={() => navigate('home')}
          aria-label="StudyLoop home"
        >
          <Logo inverse />
        </button>
        <p className="brand-caption">{t.tagline}</p>
        <button
          className="new-course"
          onClick={() => {
            navigate('home');
            setTimeout(() => document.getElementById('course-topic')?.focus(), 0);
          }}
        >
          <Plus size={18} />
          {t.newCourse}
        </button>
        <p className="nav-section-label">{lang === 'zh' ? '学习空间' : 'WORKSPACE'}</p>
        <nav aria-label={lang === 'zh' ? '主要导航' : 'Main navigation'}>
          {navItems.map(([key, Icon, label]) => (
            <button
              className={`nav-item ${view === key || (key === 'home' && ['plan', 'quiz', 'results'].includes(view)) ? 'active' : ''}`}
              key={key}
              aria-current={
                view === key || (key === 'home' && ['plan', 'quiz', 'results'].includes(view))
                  ? 'page'
                  : undefined
              }
              onClick={() => navigate(key)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key === 'home' && (
                <span className="nav-count">{courses.length.toString().padStart(2, '0')}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="connection" onClick={() => navigate('settings')}>
            <span className={`connection-dot ${config?.generationAvailable ? 'connected' : ''}`} />
            {config?.generationAvailable
              ? lang === 'zh'
                ? '模型已配置'
                : 'Model configured'
              : lang === 'zh'
                ? '从示例课程开始'
                : 'Start with examples'}
            <ChevronRight size={13} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            <span>StudyLoop</span>
            <ChevronRight size={12} />
            {pageLabel}
          </span>
          <button
            className="language-button"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            aria-label={lang === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            <Globe2 size={15} />
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
        </header>
        <main id="main-content" className={`main-content view-${view}`} ref={mainRef}>
          {error && (
            <div role="alert" className="message error-message">
              <Info size={18} />
              <div>
                <strong>{t.error}</strong>
                <p>{error}</p>
              </div>
              <button aria-label={t.dismiss} onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="message success-message">
              <Check size={18} />
              <p>{notice}</p>
              <button aria-label={t.dismiss} onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {initializing ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={28} />
              <p>{t.loading}</p>
            </div>
          ) : !authenticated && config?.accessRequired ? (
            <section className="login-section">
              <span className="eyebrow">{t.privacy}</span>
              <h1>{t.loginTitle}</h1>
              <p className="muted">{t.loginSub}</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  work(async () => {
                    await api('/api/login', { method: 'POST', body: { password } });
                    setPassword('');
                    setAuthenticated(true);
                    await loadLibrary();
                  });
                }}
              >
                <label htmlFor="instance-password">{t.password}</label>
                <input
                  id="instance-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button className="primary-button" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{' '}
                  {t.login}
                </button>
              </form>
            </section>
          ) : (
            <>
              {view === 'home' && (
                <div className="page-enter">
                  <section className="composer-section">
                    <div className="heading-line">
                      <div>
                        <h1>{t.homeTitle}</h1>
                        <p className="page-subtitle">{t.homeSub}</p>
                      </div>
                    </div>
                    <form className="course-composer" onSubmit={makePlan}>
                      <div className="composer-title">
                        <BookOpen size={20} />
                        <h2>{t.newCourse}</h2>
                        <span>
                          {lang === 'zh'
                            ? '从主题或资料开始'
                            : 'Start with a topic or your materials'}
                        </span>
                      </div>
                      <div className="composer-tabs" role="tablist" aria-label={t.newCourse}>
                        {[
                          ['search', Search, t.search],
                          ['text', FileText, t.text],
                          ['upload', Upload, t.upload],
                        ].map(([value, Icon, label]) => (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={mode === value}
                            tabIndex={mode === value ? 0 : -1}
                            onKeyDown={(event) => {
                              const modes = ['search', 'text', 'upload'];
                              const current = modes.indexOf(mode);
                              const next =
                                event.key === 'ArrowRight'
                                  ? (current + 1) % modes.length
                                  : event.key === 'ArrowLeft'
                                    ? (current + modes.length - 1) % modes.length
                                    : event.key === 'Home'
                                      ? 0
                                      : event.key === 'End'
                                        ? modes.length - 1
                                        : -1;
                              if (next < 0) return;
                              event.preventDefault();
                              setMode(modes[next]);
                              document.getElementById(`tab-${modes[next]}`)?.focus();
                            }}
                            aria-controls="composer-content"
                            id={`tab-${value}`}
                            className={mode === value ? 'selected' : ''}
                            key={value}
                            onClick={() => setMode(value)}
                          >
                            <Icon size={16} />
                            {label}
                          </button>
                        ))}
                      </div>
                      <div
                        id="composer-content"
                        role="tabpanel"
                        aria-labelledby={`tab-${mode}`}
                        className="composer-content"
                      >
                        <label htmlFor="course-topic" className="sr-only">
                          {mode === 'search' ? t.topic : t.materialTitle}
                        </label>
                        <input
                          className="topic-input"
                          id="course-topic"
                          value={topic}
                          onChange={(event) => setTopic(event.target.value)}
                          placeholder={mode === 'search' ? t.topicPlaceholder : t.materialTitle}
                          required
                          minLength={2}
                          maxLength={200}
                        />
                        {mode === 'text' && (
                          <>
                            <label className="sr-only" htmlFor="course-material">
                              {t.material}
                            </label>
                            <textarea
                              id="course-material"
                              className="material-input"
                              value={material}
                              onChange={(event) => setMaterial(event.target.value)}
                              placeholder={t.materialPlaceholder}
                              rows={5}
                              minLength={400}
                              maxLength={36000}
                              required
                            />
                          </>
                        )}
                        {mode === 'upload' && (
                          <div className="upload-area">
                            <input
                              ref={fileRef}
                              id="course-file"
                              type="file"
                              accept=".pdf,.txt,.md,.markdown,text/plain,application/pdf,text/markdown"
                              onChange={(event) => setFile(event.target.files?.[0] || null)}
                              className="sr-only"
                            />
                            <button
                              type="button"
                              onClick={() => fileRef.current?.click()}
                              className="upload-trigger"
                            >
                              <Upload size={23} />
                              <span>
                                <strong>{file ? file.name : t.file}</strong>
                                <small>
                                  {file
                                    ? `${t.chosen} · ${(file.size / 1024).toFixed(0)} KB`
                                    : t.fileHint}
                                </small>
                              </span>
                              {file && <Check size={17} />}
                            </button>
                          </div>
                        )}
                        <div className="composer-footer">
                          <div className="composer-options">
                            <label>
                              <GraduationCap size={16} />
                              <input
                                aria-label={t.level}
                                value={level}
                                onChange={(event) => setLevel(event.target.value)}
                                placeholder={t.levelPlaceholder}
                                maxLength={100}
                                required
                              />
                            </label>
                            <label className="select-label">
                              <Globe2 size={15} />
                              <select
                                aria-label={t.language}
                                value={courseLang}
                                onChange={(event) => setCourseLang(event.target.value)}
                              >
                                <option value="zh">中文</option>
                                <option value="en">English</option>
                              </select>
                              <ChevronDown size={12} />
                            </label>
                          </div>
                          <button className="primary-button" disabled={busy}>
                            {busy ? (
                              <LoaderCircle size={17} className="spin" />
                            ) : (
                              <Sparkles size={16} />
                            )}
                            <span>{busy ? t.planning : t.createPlan}</span>
                            {!busy && <ArrowRight size={16} />}
                          </button>
                        </div>
                      </div>
                    </form>
                    {!config?.generationAvailable && (
                      <p className="config-hint">
                        <Info size={14} />
                        <span>
                          {t.configNotice}{' '}
                          <button onClick={() => navigate('settings')}>
                            {t.configure}
                            <ArrowUpRight size={12} />
                          </button>
                        </span>
                      </p>
                    )}
                  </section>
                  <section className="library-section">
                    <div className="section-heading">
                      <div>
                        <h2>
                          {t.courses}
                          <span className="heading-count">
                            {courses.length.toString().padStart(2, '0')}
                          </span>
                        </h2>
                        <p className="library-caption">{t.coursesSub}</p>
                      </div>
                      <button
                        className="text-button import-button"
                        onClick={() => importRef.current?.click()}
                        disabled={busy}
                      >
                        <Upload size={15} />
                        {t.import}
                      </button>
                      <input
                        ref={importRef}
                        type="file"
                        accept="application/json,.json"
                        className="sr-only"
                        aria-label={t.import}
                        onChange={importCourse}
                      />
                    </div>
                    <div className="library-filters" aria-label={t.courses}>
                      {[
                        ['all', t.all],
                        ['sample', t.sample],
                        ['generated', t.generated],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          className={filter === key ? 'selected' : ''}
                          aria-pressed={filter === key}
                          onClick={() => setFilter(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="course-list">
                      {courses
                        .filter(
                          (item) =>
                            filter === 'all' ||
                            (filter === 'sample'
                              ? item.origin === 'sample'
                              : item.origin !== 'sample'),
                        )
                        .map((item, index) => (
                          <article className="course-row" key={item.id}>
                            <div className="course-card-top">
                              <div className="course-illustration">
                                <CourseArt
                                  type={
                                    /fraction|分数|math/i.test(item.title + item.subject)
                                      ? 0
                                      : /photo|光合|science|科学/i.test(item.title + item.subject)
                                        ? 1
                                        : 2
                                  }
                                />
                              </div>
                              <span className="course-order" aria-hidden="true">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                            </div>
                            <div className="course-info">
                              <span className="course-meta">
                                {item.subject}
                                <span>·</span>
                                {item.level || (item.language === 'zh' ? '中文' : 'English')}
                              </span>
                              <h3>
                                <button onClick={() => showCourse(item.id)} disabled={busy}>
                                  {item.title}
                                </button>
                              </h3>
                              <p>{item.description}</p>
                              <div className="course-footnote">
                                <span>
                                  <Layers3 size={13} />
                                  {item.questionCount} {t.questions}
                                </span>
                                <span>
                                  {item.origin === 'sample'
                                    ? t.original
                                    : item.origin === 'imported'
                                      ? t.imported
                                      : t.generated}
                                </span>
                              </div>
                            </div>
                            <button
                              className="course-start"
                              aria-label={`${t.start}：${item.title}`}
                              onClick={() => showCourse(item.id)}
                              disabled={busy}
                            >
                              <span>{t.start}</span>
                              <ArrowUpRight size={20} />
                            </button>
                          </article>
                        ))}
                      {!courses.filter(
                        (item) =>
                          filter === 'all' ||
                          (filter === 'sample'
                            ? item.origin === 'sample'
                            : item.origin !== 'sample'),
                      ).length && <p className="empty-inline">{t.emptyCourses}</p>}
                    </div>
                  </section>
                  <div className="learning-loop" aria-label={t.tagline}>
                    {[t.flow1, t.flow2, t.flow3, t.flow4].map((label, index) => (
                      <React.Fragment key={label}>
                        <span>
                          <i>{String(index + 1).padStart(2, '0')}</i>
                          {label}
                        </span>
                        {index < 3 && <ArrowRight size={13} />}
                      </React.Fragment>
                    ))}
                    <span className="loop-end">↺</span>
                  </div>
                </div>
              )}

              {view === 'plan' && plan && (
                <div className="page-enter">
                  <button className="back-button" onClick={() => navigate('home')}>
                    <ArrowLeft size={16} />
                    {t.back}
                  </button>
                  <span className="eyebrow">01 / {t.outline}</span>
                  <h1 className="content-title">{plan.title}</h1>
                  <p className="page-subtitle">{plan.description || t.outlineSub}</p>
                  <div className="outline-layout">
                    <section>
                      <h2>{t.scope}</h2>
                      <p className="muted compact">{t.chooseObjectives}</p>
                      <div className="objective-list">
                        {plan.objectives.map((objective, index) => (
                          <label className="objective-option" key={objective}>
                            <input
                              type="checkbox"
                              checked={objectives.includes(objective)}
                              onChange={(event) =>
                                setObjectives((current) =>
                                  event.target.checked
                                    ? [...current, objective]
                                    : current.filter((value) => value !== objective),
                                )
                              }
                            />
                            <span className="objective-index">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span>{objective}</span>
                          </label>
                        ))}
                      </div>
                      <div className="question-count">
                        <h3>{t.questionCount}</h3>
                        <div>
                          {[4, 6, 8].map((count) => (
                            <button
                              key={count}
                              className={questionCount === count ? 'selected' : ''}
                              aria-pressed={questionCount === count}
                              onClick={() => setQuestionCount(count)}
                            >
                              {count} {t.questions}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        className="primary-button generate-button"
                        onClick={makeCourse}
                        disabled={busy || !objectives.length}
                      >
                        {busy ? (
                          <LoaderCircle size={17} className="spin" />
                        ) : (
                          <Sparkles size={17} />
                        )}{' '}
                        {busy ? t.generating : t.generate}
                        <ArrowRight size={17} />
                      </button>
                    </section>
                    <aside className="outline-sources">
                      <span className="eyebrow">
                        {t.source} / {String(plan.sources.length).padStart(2, '0')}
                      </span>
                      {renderSources(plan.sources)}
                      <p className="small-note">{t.reviewed}</p>
                    </aside>
                  </div>
                </div>
              )}

              {view === 'quiz' &&
                course &&
                (() => {
                  const q = course.questions[questionIndex];
                  const answered = Object.keys(answers).length;
                  return (
                    <div className="page-enter">
                      <div className="practice-topline">
                        <button className="back-button" onClick={() => navigate('home')}>
                          <ArrowLeft size={16} />
                          {t.courses}
                        </button>
                        <a
                          className="text-button"
                          href={`/api/courses/${encodeURIComponent(course.id)}/export`}
                          download
                        >
                          <ArrowDownToLine size={15} />
                          {t.export}
                        </a>
                      </div>
                      <span className="eyebrow">02 / {t.practice}</span>
                      <h1 className="content-title">{course.title}</h1>
                      <div className="quiz-layout">
                        <section className="question-workspace" aria-labelledby="question-title">
                          <div className="question-top">
                            <span className="question-position">
                              {t.question} {String(questionIndex + 1).padStart(2, '0')}{' '}
                              <span>
                                {t.of} {String(course.questions.length).padStart(2, '0')}
                              </span>
                            </span>
                            <span className="concept-label">{q.concept}</span>
                          </div>
                          <h2 id="question-title" className="question-prompt">
                            {q.prompt}
                          </h2>
                          <div
                            className="answer-options"
                            role="radiogroup"
                            aria-labelledby="question-title"
                          >
                            {q.choices.map((choice, index) => (
                              <label
                                key={index}
                                className={`answer-option ${answers[q.id] === index ? 'selected' : ''}`}
                              >
                                <input
                                  type="radio"
                                  name={`answer-${q.id}`}
                                  value={index}
                                  checked={answers[q.id] === index}
                                  onChange={() => setAnswers((old) => ({ ...old, [q.id]: index }))}
                                />
                                <span className="answer-letter">
                                  {String.fromCharCode(65 + index)}
                                </span>
                                <span>{choice}</span>
                                <span className="answer-check">
                                  {answers[q.id] === index && <Check size={16} />}
                                </span>
                              </label>
                            ))}
                            <label
                              className={`answer-option unknown-option ${answers[q.id] === 'unknown' ? 'selected' : ''}`}
                            >
                              <input
                                type="radio"
                                name={`answer-${q.id}`}
                                checked={answers[q.id] === 'unknown'}
                                onChange={() =>
                                  setAnswers((old) => ({ ...old, [q.id]: 'unknown' }))
                                }
                              />
                              <CircleHelp size={19} />
                              <span>
                                {t.unknown}
                                <small>{t.unknownHint}</small>
                              </span>
                              {answers[q.id] === 'unknown' && (
                                <Check className="answer-check" size={16} />
                              )}
                            </label>
                          </div>
                          {q.sourceIds?.length > 0 && (
                            <button
                              className="source-link"
                              onClick={() =>
                                setSource(
                                  course.sources.filter((item) => q.sourceIds.includes(item.id)),
                                )
                              }
                            >
                              <FileText size={14} />
                              {t.sourceBefore}
                              <ArrowUpRight size={13} />
                            </button>
                          )}
                          <div className="question-actions">
                            <button
                              className="secondary-button"
                              disabled={questionIndex === 0 || busy}
                              onClick={() => setQuestionIndex((index) => index - 1)}
                            >
                              <ChevronLeft size={17} />
                              {t.previous}
                            </button>
                            {questionIndex < course.questions.length - 1 ? (
                              <button
                                className="primary-button"
                                onClick={() => setQuestionIndex((index) => index + 1)}
                              >
                                {t.next}
                                <ArrowRight size={16} />
                              </button>
                            ) : (
                              <button
                                className="primary-button"
                                onClick={submit}
                                disabled={busy || answered !== course.questions.length}
                              >
                                {busy ? (
                                  <LoaderCircle size={16} className="spin" />
                                ) : (
                                  <CheckCheck size={16} />
                                )}{' '}
                                {busy ? t.submitting : t.submit}
                              </button>
                            )}
                          </div>
                          {questionIndex === course.questions.length - 1 &&
                            answered !== course.questions.length && (
                              <p className="small-note">{t.finishAll}</p>
                            )}
                        </section>
                        <aside className="quiz-sidebar">
                          <h3>{t.progress}</h3>
                          <p>
                            <strong>{answered.toString().padStart(2, '0')}</strong> /{' '}
                            {course.questions.length.toString().padStart(2, '0')}{' '}
                            <span>{t.answered}</span>
                          </p>
                          <div className="progress-track">
                            <div
                              style={{ width: `${(answered / course.questions.length) * 100}%` }}
                            />
                          </div>
                          <div className="question-grid">
                            {course.questions.map((item, index) => (
                              <button
                                key={item.id}
                                aria-label={`${t.question} ${index + 1} · ${answers[item.id] === undefined ? t.unanswered : t.answered}`}
                                aria-current={index === questionIndex ? 'step' : undefined}
                                className={`${answers[item.id] !== undefined ? 'answered' : ''} ${index === questionIndex ? 'current' : ''}`}
                                onClick={() => setQuestionIndex(index)}
                              >
                                {String(index + 1).padStart(2, '0')}
                              </button>
                            ))}
                          </div>
                          <div className="quiz-objectives">
                            <span className="eyebrow">{t.learning}</span>
                            {course.objectives.map((objective) => (
                              <p key={objective}>
                                <span /> {objective}
                              </p>
                            ))}
                          </div>
                        </aside>
                      </div>
                    </div>
                  );
                })()}

              {view === 'results' && attempt && (
                <div className="page-enter">
                  <div className="practice-topline">
                    <button className="back-button" onClick={() => navigate('history')}>
                      <ArrowLeft size={16} />
                      {t.history}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => showCourse(attempt.courseId)}
                      disabled={busy}
                    >
                      <History size={15} />
                      {t.retry}
                    </button>
                  </div>
                  <span className="eyebrow">03 / {t.completed}</span>
                  <h1 className="content-title">{attempt.courseTitle}</h1>
                  <p className="page-subtitle">{t.resultSub}</p>
                  <div className="result-summary">
                    <div className="score-figure">
                      <strong>
                        {Math.round((attempt.correct / attempt.total) * 100)}
                        <span>%</span>
                      </strong>
                      <span>{t.score}</span>
                    </div>
                    <div className="result-counts">
                      <div>
                        <span className="result-number">{attempt.correct}</span>
                        <span>
                          <Check size={14} />
                          {t.correct}
                        </span>
                      </div>
                      <div>
                        <span className="result-number">
                          {attempt.total - attempt.correct - attempt.unknown}
                        </span>
                        <span>
                          <span className="status-dot" />
                          {t.incorrect}
                        </span>
                      </div>
                      <div>
                        <span className="result-number">{attempt.unknown}</span>
                        <span>
                          <CircleHelp size={14} />
                          {t.notYet}
                        </span>
                      </div>
                    </div>
                    <div className="result-date">
                      <Clock3 size={15} />
                      {date(attempt.createdAt)}
                      <small>{t.immutable}</small>
                    </div>
                  </div>
                  <div className="results-list">
                    {attempt.results.map((result, index) => {
                      const isOpen = openResults[result.questionId];
                      const followup = practiceResults[result.questionId];
                      const selected = result.selected;
                      const choices = result.choices || [];
                      return (
                        <article
                          className={`result-item ${isOpen ? 'expanded' : ''}`}
                          key={result.questionId}
                        >
                          <div className="result-item-head">
                            <span className="result-index">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <div>
                              <div className="result-meta">
                                <span>{result.concept}</span>
                                <StatusBadge status={result.status} t={t} />
                              </div>
                              <h2>{result.prompt}</h2>
                            </div>
                          </div>
                          <div className="answer-comparison">
                            <p>
                              <span>{t.yours}</span>
                              <strong>
                                {selected === 'unknown'
                                  ? t.unknown
                                  : `${String.fromCharCode(65 + selected)}. ${choices[selected] || ''}`}
                              </strong>
                            </p>
                            {result.status !== 'correct' && (
                              <p className="correct-answer">
                                <span>{t.answer}</span>
                                <strong>
                                  {String.fromCharCode(65 + result.correctIndex)}.{' '}
                                  {choices[result.correctIndex]}
                                </strong>
                              </p>
                            )}
                          </div>
                          <button
                            className="lesson-toggle"
                            aria-expanded={Boolean(isOpen)}
                            aria-controls={`lesson-${result.questionId}`}
                            onClick={() =>
                              setOpenResults((old) => ({ ...old, [result.questionId]: !isOpen }))
                            }
                          >
                            <BookOpen size={15} />
                            {isOpen ? t.hideLesson : t.seeLesson}
                            <ChevronDown size={15} className={isOpen ? 'rotate' : ''} />
                          </button>
                          {isOpen && (
                            <div className="lesson-content" id={`lesson-${result.questionId}`}>
                              <div className="explanation">
                                <h3>{t.explanation}</h3>
                                <p>{result.explanation}</p>
                              </div>
                              {result.lesson && (
                                <section className="micro-lesson">
                                  <div className="lesson-heading">
                                    <span className="eyebrow">{t.flow3}</span>
                                    <button
                                      className="text-button speech-button"
                                      onClick={() => readLesson(result)}
                                      disabled={!speechSupported}
                                      title={!speechSupported ? t.voiceUnavailable : undefined}
                                    >
                                      {speaking === result.questionId ? (
                                        <Square size={14} />
                                      ) : (
                                        <Volume2 size={16} />
                                      )}{' '}
                                      {speaking === result.questionId ? t.stopReading : t.readAloud}
                                    </button>
                                  </div>
                                  <h3>{result.lesson.title}</h3>
                                  <ol>
                                    {result.lesson.steps.map((step, stepIndex) => (
                                      <li key={stepIndex}>
                                        <span>{stepIndex + 1}</span>
                                        <p>{step}</p>
                                      </li>
                                    ))}
                                  </ol>
                                  <div className="takeaway">
                                    <Leaf size={17} />
                                    <div>
                                      <strong>{t.takeaway}</strong>
                                      <p>{result.lesson.takeaway}</p>
                                    </div>
                                  </div>
                                </section>
                              )}
                              {result.practice && (
                                <section className="followup-practice">
                                  <span className="eyebrow">04 / {t.miniPractice}</span>
                                  <h3>{result.practice.prompt}</h3>
                                  <div
                                    className="mini-choices"
                                    role="radiogroup"
                                    aria-label={result.practice.prompt}
                                  >
                                    {result.practice.choices.map((choice, choiceIndex) => (
                                      <label
                                        key={choiceIndex}
                                        className={`${practiceAnswers[result.questionId] === choiceIndex ? 'selected' : ''} ${followup?.answerIndex === choiceIndex ? 'correct-choice' : ''}`}
                                      >
                                        <input
                                          type="radio"
                                          name={`practice-${result.questionId}`}
                                          checked={
                                            practiceAnswers[result.questionId] === choiceIndex
                                          }
                                          onChange={() => {
                                            setPracticeAnswers((old) => ({
                                              ...old,
                                              [result.questionId]: choiceIndex,
                                            }));
                                            setPracticeResults((old) => ({
                                              ...old,
                                              [result.questionId]: undefined,
                                            }));
                                          }}
                                        />
                                        <span>{String.fromCharCode(65 + choiceIndex)}.</span>
                                        {choice}
                                      </label>
                                    ))}
                                    <label
                                      className={
                                        practiceAnswers[result.questionId] === 'unknown'
                                          ? 'selected'
                                          : ''
                                      }
                                    >
                                      <input
                                        type="radio"
                                        name={`practice-${result.questionId}`}
                                        checked={practiceAnswers[result.questionId] === 'unknown'}
                                        onChange={() => {
                                          setPracticeAnswers((old) => ({
                                            ...old,
                                            [result.questionId]: 'unknown',
                                          }));
                                          setPracticeResults((old) => ({
                                            ...old,
                                            [result.questionId]: undefined,
                                          }));
                                        }}
                                      />
                                      <CircleHelp size={14} />
                                      {t.unknown}
                                    </label>
                                  </div>
                                  <button
                                    className="secondary-button"
                                    onClick={() => gradePractice(result.questionId)}
                                    disabled={
                                      busy || practiceAnswers[result.questionId] === undefined
                                    }
                                  >
                                    <Check size={15} />
                                    {t.checkPractice}
                                  </button>
                                  {followup && (
                                    <div
                                      className={`practice-feedback ${followup.correct ? 'correct' : ''}`}
                                      role="status"
                                    >
                                      <strong>
                                        {followup.correct
                                          ? t.practiceCorrect
                                          : practiceAnswers[result.questionId] === 'unknown'
                                            ? t.practiceUnknown
                                            : t.practiceIncorrect}
                                      </strong>
                                      <p>{followup.explanation}</p>
                                    </div>
                                  )}
                                  <p className="small-note">{t.miniSub}</p>
                                </section>
                              )}
                              {result.sourceIds?.length > 0 && (
                                <button
                                  className="source-link"
                                  onClick={() => viewSources(result.sourceIds, attempt.courseId)}
                                  disabled={busy}
                                >
                                  <FileText size={14} />
                                  {t.sourcesForQuestion}
                                  <ArrowUpRight size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  <section className="classroom-handoff">
                    <div className="classroom-icon">
                      <GraduationCap size={27} />
                    </div>
                    <div>
                      <span className="eyebrow">WITH OPENMAIC</span>
                      <h2>{t.openmaic}</h2>
                      <p>{t.openmaicSub}</p>
                      <div className="handoff-actions">
                        <button
                          className="primary-button"
                          onClick={openClassroom}
                          disabled={
                            busy || !config?.openmaicAvailable || !config?.generationAvailable
                          }
                        >
                          {openingClassroom ? (
                            <LoaderCircle className="spin" size={16} />
                          ) : (
                            <GraduationCap size={17} />
                          )}
                          {openingClassroom ? t.openingClassroom : t.openClassroom}
                        </button>
                        <button className="secondary-button" onClick={getBrief} disabled={busy}>
                          <ArrowDownToLine size={16} />
                          {t.downloadBrief}
                        </button>
                      </div>
                      <p className="small-note">
                        {!config?.openmaicAvailable
                          ? t.openmaicMissing
                          : !config?.generationAvailable
                            ? t.openmaicModelMissing
                            : t.openmaicHint}
                      </p>
                      <a
                        className="attribution"
                        href="https://github.com/THU-MAIC/OpenMAIC"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.openmaicCredit}
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </section>
                </div>
              )}

              {view === 'history' && (
                <div className="page-enter">
                  <span className="eyebrow">{t.history}</span>
                  <h1>{t.records}</h1>
                  <p className="page-subtitle">{t.recordsSub}</p>
                  {attempts.length ? (
                    <div className="history-list">
                      {[...attempts]
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                        .map((record) => (
                          <button
                            className="history-row"
                            key={record.id}
                            onClick={() => showAttempt(record.id)}
                            disabled={busy}
                          >
                            <span className="history-score">
                              {Math.round((record.correct / record.total) * 100)}
                              <small>%</small>
                            </span>
                            <span className="history-info">
                              <strong>{record.courseTitle}</strong>
                              <small>
                                {date(record.createdAt)}
                                <span>·</span>
                                {record.correct} / {record.total} {t.correct}
                                {record.unknown ? ` · ${record.unknown} ${t.notYet}` : ''}
                              </small>
                            </span>
                            <span className="history-action">
                              {t.replay}
                              <ArrowUpRight size={19} />
                            </span>
                          </button>
                        ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <History size={36} />
                      <h2>{t.emptyHistory}</h2>
                      <p>{t.emptyHistorySub}</p>
                      <button className="primary-button" onClick={() => navigate('home')}>
                        {t.browse}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                  <p className="session-note">
                    <Info size={15} />
                    {t.sessionNote}
                  </p>
                </div>
              )}

              {view === 'settings' && (
                <div className="page-enter settings-page">
                  <span className="eyebrow">{t.settings}</span>
                  <h1>{t.setup}</h1>
                  <p className="page-subtitle">{t.setupSub}</p>
                  <div className="service-status">
                    {[
                      [
                        t.generation,
                        config?.generationAvailable,
                        config?.generationAvailable ? t.enabled : t.notConfigured,
                      ],
                      [
                        t.searchService,
                        config?.searchAvailable,
                        config?.searchAvailable ? t.enabled : t.notConfigured,
                      ],
                      [
                        t.classroom,
                        config?.openmaicStatus?.ready,
                        config?.openmaicStatus?.ready
                          ? t.openmaicReady
                          : config?.openmaicStatus?.state === 'starting'
                            ? t.openmaicStarting
                            : ['error', 'failed'].includes(config?.openmaicStatus?.state)
                              ? t.openmaicFailed
                              : config?.openmaicStatus?.installed
                                ? t.openmaicInstalled
                                : lang === 'zh'
                                  ? '未安装'
                                  : 'Not installed',
                      ],
                    ].map(([label, enabled, status]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong className={enabled ? 'enabled' : ''}>
                          <span className="connection-dot" />
                          {status}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <ModelSettings lang={lang} onSaved={setConfig} config={config} />
                  <details className="manual-configuration">
                    <summary>
                      {lang === 'zh' ? '手动配置与部署说明' : 'Manual configuration and deployment'}
                    </summary>
                    <ol className="setup-steps">
                      {[
                        [t.setupStep1, t.setupStep1Text],
                        [t.setupStep2, t.setupStep2Text],
                        [t.setupStep3, t.setupStep3Text],
                      ].map(([title, content], index) => (
                        <li key={title}>
                          <span className="setup-index">0{index + 1}</span>
                          <div>
                            <h2>{title}</h2>
                            <p>{content}</p>
                            {index === 0 && <code>cp .env.example .env</code>}
                          </div>
                        </li>
                      ))}
                    </ol>
                    <p className="setup-note">
                      <Info size={17} />
                      {t.setupNote}
                    </p>
                    <a
                      className="primary-button"
                      href={`${REPO}/blob/main/docs/configuration.md`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.fullGuide}
                      <ArrowUpRight size={16} />
                    </a>
                  </details>
                  <section className="voice-settings">
                    <h2>
                      <Volume2 size={20} />
                      {t.voice}
                    </h2>
                    <p className="muted">{t.voiceNote}</p>
                    {speechSupported ? (
                      <div className="voice-options">
                        <label>
                          {t.voiceLang}
                          <select
                            value={voiceLang}
                            onChange={(event) => {
                              setVoiceLang(event.target.value);
                              setVoiceURI('');
                            }}
                          >
                            <option value="zh-CN">中文</option>
                            <option value="en-US">English</option>
                          </select>
                        </label>
                        <label>
                          {t.chooseVoice}
                          <select
                            value={voiceURI}
                            onChange={(event) => setVoiceURI(event.target.value)}
                          >
                            <option value="">{t.systemVoice}</option>
                            {voices
                              .filter((voice) =>
                                voice.lang.toLowerCase().startsWith(voiceLang.slice(0, 2)),
                              )
                              .map((voice) => (
                                <option value={voice.voiceURI} key={voice.voiceURI}>
                                  {voice.name} ({voice.lang})
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                    ) : (
                      <p>{t.voiceUnavailable}</p>
                    )}
                  </section>
                </div>
              )}

              {view === 'about' && (
                <div className="page-enter about-page">
                  <span className="eyebrow">OPEN SOURCE · OPEN CURIOSITY</span>
                  <h1>{t.aboutTitle}</h1>
                  <p className="page-subtitle">{t.aboutSub}</p>
                  <div className="about-loop">
                    <span>{t.flow1}</span>
                    <ArrowRight size={18} />
                    <span>{t.flow2}</span>
                    <ArrowRight size={18} />
                    <span>{t.flow3}</span>
                    <ArrowRight size={18} />
                    <span>{t.flow4}</span>
                    <span className="return-arrow">↺</span>
                  </div>
                  <section className="about-sections">
                    <article>
                      <span className="setup-index">01</span>
                      <div>
                        <h2>{t.aboutA}</h2>
                        <p>{t.aboutAText}</p>
                      </div>
                    </article>
                    <article>
                      <span className="setup-index">02</span>
                      <div>
                        <h2>{t.aboutB}</h2>
                        <p>{t.aboutBText}</p>
                      </div>
                    </article>
                    <article className="credit-section">
                      <span className="setup-index">03</span>
                      <div>
                        <h2>{t.aboutC}</h2>
                        <p>{t.aboutCText}</p>
                        <a
                          className="text-button"
                          href="https://github.com/THU-MAIC/OpenMAIC"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t.upstream}
                          <ArrowUpRight size={16} />
                        </a>
                      </div>
                    </article>
                  </section>
                  <div className="about-footer">
                    <a className="primary-button" href={REPO} target="_blank" rel="noreferrer">
                      {t.viewGithub}
                      <ArrowUpRight size={16} />
                    </a>
                    <a
                      className="text-button"
                      href={`${REPO}/blob/main/THIRD_PARTY_NOTICES.md`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.license}
                      <ExternalLink size={13} />
                    </a>
                    <span>
                      {t.version} {config?.version || '0.1.0'}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>StudyLoop</span>
            <span>
              {lang === 'zh'
                ? '让每一次练习，都通向理解。'
                : 'Let every practice lead to understanding.'}
            </span>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
              <ArrowUpRight size={12} />
            </a>
          </footer>
        </main>
      </div>
      {source && (
        <SourceDialog
          sources={source}
          t={t}
          sourceKind={sourceKind}
          onClose={() => setSource(null)}
        />
      )}
    </div>
  );
}

function SourceDialog({ sources, t, sourceKind, onClose }) {
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);
  const trapFocus = (event) => {
    if (event.key !== 'Tab') return;
    const items = panelRef.current?.querySelectorAll(
      'button, a[href], input, select, textarea, [tabindex="0"]',
    );
    if (!items?.length) return;
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
      event.preventDefault();
      items[0].focus();
    }
  };
  return (
    <div
      className="dialog-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="source-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-dialog-title"
        ref={panelRef}
        onKeyDown={trapFocus}
      >
        <div className="dialog-header">
          <span className="eyebrow" id="source-dialog-title">
            {t.sourceText}
          </span>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label={t.close}>
            <X size={21} />
          </button>
        </div>
        {sources.map((item) => (
          <article key={item.id}>
            <span className="source-kind">{sourceKind(item.kind)}</span>
            <h2>{item.title}</h2>
            {safeUrl(item.url) && (
              <a
                className="text-button source-url"
                href={safeUrl(item.url)}
                target="_blank"
                rel="noreferrer"
              >
                {t.visitSource}
                <ArrowUpRight size={15} />
              </a>
            )}
            <div className="source-material">{item.text}</div>
            {item.license && <p className="small-note">{item.license}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
