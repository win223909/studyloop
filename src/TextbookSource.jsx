import { BookOpen, ChevronDown, ExternalLink, Upload } from 'lucide-react';
import './textbook-source.css';

const COPY = {
  zh: {
    title: '从国内教材开始',
    description: '按学段、学科、版本和年级选择教材，在官方页面登录阅读，再粘贴或上传需要的章节。',
    catalog: '打开官方教材目录',
    import: '导入教材章节',
    metadata: '补充资料来源（可选）',
    sourceTitle: '教材 / 资料名称',
    titleHint: '可填写教材版本、年级、册次及章节或页码，方便之后查阅来源。',
    titlePlaceholder: '例如：人教版数学 · 六年级上册 · 第一单元，第 2–5 页',
    sourceUrl: '原文地址',
    urlHint: '填写教材或章节的公开页面地址，以 http:// 或 https:// 开头。',
    limits:
      '可粘贴文字，或上传 PDF、Markdown、TXT；文件不超过 8 MB，PDF 不超过 60 页，可读文字为 400–36,000 字符。',
  },
  en: {
    title: 'Start with a Chinese school textbook',
    description:
      'Choose a stage, subject, edition and grade in the official catalog. Sign in there to read, then paste or upload the chapter you want to study.',
    catalog: 'Open official textbook catalog',
    import: 'Import a textbook chapter',
    metadata: 'Add source details (optional)',
    sourceTitle: 'Textbook / source title',
    titleHint:
      'Include the edition, grade, volume, chapter or page numbers to make the source easy to revisit.',
    titlePlaceholder: 'For example: Mathematics · Grade 6 · Volume 1 · Chapter 1, pp. 2–5',
    sourceUrl: 'Original source URL',
    urlHint: 'Use the public textbook or chapter page, starting with http:// or https://.',
    limits:
      'Paste text or upload PDF, Markdown or TXT. Maximum 8 MB, 60 PDF pages and 400–36,000 readable characters.',
  },
};

export function SourceMetadataFields({
  lang,
  title,
  url,
  onTitleChange,
  onUrlChange,
  expanded,
  onExpandedChange,
  disabled,
}) {
  const t = COPY[lang];
  return (
    <details
      className="source-metadata"
      open={expanded}
      onToggle={(event) => onExpandedChange(event.currentTarget.open)}
    >
      <summary>
        <BookOpen size={15} />
        {t.metadata}
        <ChevronDown size={15} />
      </summary>
      <div className="source-metadata-fields">
        <div className="source-metadata-field">
          <label htmlFor="material-source-title">{t.sourceTitle}</label>
          <input
            id="material-source-title"
            name="sourceTitle"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder={t.titlePlaceholder}
            maxLength={200}
            aria-describedby="material-source-title-hint"
            disabled={disabled}
          />
          <p id="material-source-title-hint">{t.titleHint}</p>
        </div>
        <div className="source-metadata-field">
          <label htmlFor="material-source-url">{t.sourceUrl}</label>
          <input
            id="material-source-url"
            name="sourceUrl"
            type="url"
            pattern="https?://.*"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            onInvalid={(event) => {
              event.currentTarget.closest('details').open = true;
              onExpandedChange(true);
            }}
            placeholder="https://"
            maxLength={2000}
            aria-describedby="material-source-url-hint"
            disabled={disabled}
          />
          <p id="material-source-url-hint">{t.urlHint}</p>
        </div>
      </div>
    </details>
  );
}

export default function TextbookSource({ lang, onImport, disabled }) {
  const t = COPY[lang];
  return (
    <section className="textbook-source" aria-labelledby="textbook-source-title">
      <BookOpen className="textbook-source-icon" size={21} />
      <div className="textbook-source-content">
        <h3 id="textbook-source-title">{t.title}</h3>
        <p>{t.description}</p>
        <div className="textbook-source-actions">
          <a href="https://basic.smartedu.cn/tchMaterial" target="_blank" rel="noopener noreferrer">
            {t.catalog}
            <ExternalLink size={14} />
          </a>
          <button type="button" onClick={onImport} disabled={disabled}>
            <Upload size={14} />
            {t.import}
          </button>
        </div>
        <p className="textbook-source-limits">{t.limits}</p>
      </div>
    </section>
  );
}
