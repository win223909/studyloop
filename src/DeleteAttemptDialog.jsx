import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FolderDown, LoaderCircle, RefreshCw, Trash2, X } from 'lucide-react';
import { formatApiError } from './api-errors.js';

export const DELETION_COPY = {
  zh: {
    title: '删除这条学习记录？',
    delete: '删除记录',
    deleting: '正在删除…',
    previewing: '正在核对删除范围…',
    confirm: '确认删除',
    retryDelete: '重试删除',
    cancel: '取消',
    close: '关闭删除预览',
    reload: '重新预览',
    irreversible: '此操作不可恢复。以下是本次将删除的数据：',
    browser:
      '同时清除此浏览器中能准确关联到这条记录的互动课堂。缺少关联信息的旧课堂可能保留；其他浏览器中的课堂需分别清理。',
    exports: '已下载到「下载」文件夹或其他目录的导出副本，需你手动删除；网页无法代为删除。',
    retained: '以下数据会保留',
    changed: '数据的引用关系已发生变化。请重新预览删除范围，再次确认。',
    invalid: '暂时无法确认完整的删除范围，请重新预览。',
    missing:
      '当前无法读取这条记录的删除范围。如果上次删除结果未确认，请关闭此预览，再用页面上的「重试课堂清理」核对删除凭据并刷新记录。',
    counts: {
      attempts: '学习记录',
      practice: '追加练习记录',
      handoffs: '课堂交接简报',
      courses: '生成或导入课程与题库',
      plans: '生成大纲',
    },
    deleted:
      '学习记录及预览中列出的关联数据已删除，此浏览器中能准确关联的课堂已完成清理。缺少关联信息的旧课堂可能保留；其他浏览器需分别清理。',
    cleanupPending:
      '学习记录已删除，但此浏览器中能准确关联的课堂尚未清理完成。请先关闭其他互动课堂页面，再重试；保留此浏览器的 Cookie 与存储。',
    refreshPending: '课程与记录列表未能刷新。请重试刷新，核对当前状态。',
    retryCleanup: '重试课堂清理',
    retryRefresh: '刷新课程与记录',
    cleanupBusy: '正在清理关联课堂…',
    cleanupPendingTitle: '课堂清理待完成',
    cleanupDone:
      '已确认删除的学习记录，在此浏览器中能准确关联的课堂已完成清理。缺少关联信息的旧课堂可能保留；其他浏览器需分别清理。',
    savedPending:
      '仍有删除任务的课堂清理待确认或未完成。请先关闭其他互动课堂页面，再重试；保留此浏览器的 Cookie 与存储。系统会先核对删除凭据，学习记录未删除时不会清理关联课堂。',
    queueFailed: '无法保存课堂清理任务，尚未删除学习记录。请允许浏览器存储后重试。',
    unconfirmed: '尚未确认删除结果。请重试删除；系统会先核对已有删除凭据。',
  },
  en: {
    title: 'Delete this learning record?',
    delete: 'Delete record',
    deleting: 'Deleting…',
    previewing: 'Checking what will be deleted…',
    confirm: 'Confirm deletion',
    retryDelete: 'Retry deletion',
    cancel: 'Cancel',
    close: 'Close deletion preview',
    reload: 'Refresh preview',
    irreversible: 'This cannot be undone. The following data will be deleted:',
    browser:
      'Classrooms in this browser that can be reliably linked to this record will also be removed. Older classrooms without association data may remain. Clean up classrooms in other browsers separately.',
    exports:
      'Exported copies saved to Downloads or another folder must be deleted manually. This webpage cannot delete those files.',
    retained: 'These items will be kept',
    changed:
      'Data references have changed. Refresh the deletion preview and confirm the updated scope.',
    invalid: 'The full deletion scope could not be verified. Refresh the preview.',
    missing:
      'This record’s deletion scope is unavailable. If a previous deletion is unconfirmed, close this preview and use “Retry classroom cleanup” to verify its receipt and refresh the records.',
    counts: {
      attempts: 'Learning records',
      practice: 'Follow-up practice records',
      handoffs: 'Classroom handoff briefs',
      courses: 'Generated or imported courses and question banks',
      plans: 'Generated outlines',
    },
    deleted:
      'The learning record and data listed in the preview were deleted. Reliably linked classrooms in this browser have been cleaned up. Older classrooms without association data may remain; other browsers need separate cleanup.',
    cleanupPending:
      'The learning record was deleted, but cleanup of reliably linked classrooms in this browser is unfinished. Close other interactive classroom pages, then retry. Keep this browser’s cookies and storage.',
    refreshPending:
      'The course and history lists could not be refreshed. Retry to check their current state.',
    retryCleanup: 'Retry classroom cleanup',
    retryRefresh: 'Refresh courses and history',
    cleanupBusy: 'Cleaning up related classrooms…',
    cleanupPendingTitle: 'Classroom cleanup is pending',
    cleanupDone:
      'Classroom cleanup is complete for reliably linked records confirmed as deleted in this browser. Older classrooms without association data may remain; other browsers need separate cleanup.',
    savedPending:
      'A deletion task has unconfirmed or unfinished classroom cleanup. Close other interactive classroom pages, then retry. Keep this browser’s cookies and storage. The server receipt is checked first; classrooms are not removed while their learning record still exists.',
    queueFailed:
      'The classroom cleanup task could not be saved. The learning record was not deleted. Allow browser storage and retry.',
    unconfirmed:
      'The deletion result is not confirmed. Retry deletion; the server will check for an existing deletion receipt first.',
  },
};

export function retainedDescription(item, lang) {
  const zh = lang === 'zh';
  const resource =
    item.resource === 'plan'
      ? zh
        ? '大纲'
        : 'outlines'
      : zh
        ? '课程与题库'
        : 'courses and question banks';
  const count = Number.isInteger(item.count) ? item.count : 0;
  if (item.reason === 'sample')
    return zh ? `保留 ${count} 份内置示例课程。` : `${count} built-in sample courses will be kept.`;
  if (item.reason === 'shared') {
    const references = Number.isInteger(item.references) ? ` ${item.references} ` : ' ';
    return zh
      ? `${count} 份${resource}仍由其他${references}${item.resource === 'plan' ? '门课程' : '条学习记录'}引用，将保留。`
      : `${count} ${resource} are still referenced by other${references}${item.resource === 'plan' ? 'courses' : 'learning records'} and will be kept.`;
  }
  if (item.reason === 'ambiguous')
    return zh
      ? `${count} 份历史${resource}的关联无法唯一确认，将保留。`
      : `${count} older ${resource} cannot be uniquely linked and will be kept.`;
  if (item.reason === 'unmatched')
    return zh
      ? `没有明确关联的历史${resource}，不会删除其他${resource}。`
      : `No older ${resource} could be reliably linked. Other ${resource} will not be deleted.`;
  return zh ? `${count} 份${resource}将保留。` : `${count} ${resource} will be kept.`;
}

export default function DeleteAttemptDialog({ record, lang, loadPreview, onConfirm, onClose }) {
  const t = DELETION_COPY[lang];
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [triedDelete, setTriedDelete] = useState(false);
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  const callbacks = useRef({ loadPreview, onClose, deleting });
  callbacks.current = { loadPreview, onClose, deleting };
  const submittingRef = useRef(false);

  useEffect(() => {
    if (deleting) panelRef.current?.focus();
  }, [deleting]);

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape' && !callbacks.current.deleting) {
        event.preventDefault();
        callbacks.current.onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus?.();
      else document.querySelector('.nav-item.active')?.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setLoading(true);
    setError(null);
    void callbacks.current
      .loadPreview(record.id, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (
          typeof data.courseTitle !== 'string' ||
          !data.courseTitle.trim() ||
          typeof data.revision !== 'string' ||
          !data.revision ||
          !Array.isArray(data.handoffIds) ||
          !Object.keys(t.counts).every(
            (key) => Number.isInteger(data.counts?.[key]) && data.counts[key] >= 0,
          )
        )
          throw new Error(t.invalid);
        setPreview(data);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [record.id, refresh]);

  const confirm = async () => {
    if (!preview || loading || submittingRef.current) return;
    submittingRef.current = true;
    setDeleting(true);
    setError(null);
    setTriedDelete(true);
    try {
      await onConfirm(record, preview);
    } catch (cause) {
      if (cause.status === 409) setPreview(null);
      setError(cause);
    } finally {
      submittingRef.current = false;
      setDeleting(false);
    }
  };
  const trapFocus = (event) => {
    if (event.key !== 'Tab') return;
    const buttons = [...panelRef.current.querySelectorAll('button:not(:disabled), a[href]')];
    if (!buttons.length) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    if (!buttons.includes(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? buttons.at(-1) : buttons[0]).focus();
    } else if (event.shiftKey && document.activeElement === buttons[0]) {
      event.preventDefault();
      buttons.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
      event.preventDefault();
      buttons[0].focus();
    }
  };

  return (
    <div
      className="dialog-overlay deletion-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !deleting) onClose();
      }}
    >
      <section
        className="deletion-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-attempt-title"
        aria-describedby="delete-attempt-warning"
        aria-busy={loading || deleting}
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <div className="deletion-heading">
          <span className="deletion-symbol">
            <Trash2 size={21} />
          </span>
          <h2 id="delete-attempt-title">{t.title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={deleting}
            aria-label={t.close}
          >
            <X size={19} />
          </button>
        </div>
        <p className="deletion-course">{preview?.courseTitle || record.courseTitle}</p>
        <p className="deletion-warning" id="delete-attempt-warning">
          <AlertTriangle size={17} />
          {t.irreversible}
        </p>
        {loading && (
          <p className="deletion-loading" role="status">
            <LoaderCircle className="spin" size={18} />
            {t.previewing}
          </p>
        )}
        {preview && (
          <>
            <dl className="deletion-counts">
              {Object.entries(t.counts).map(([key, label]) => (
                <div key={key} data-count={key}>
                  <dt>{label}</dt>
                  <dd>{preview.counts[key]}</dd>
                </div>
              ))}
            </dl>
            {preview.retained?.length > 0 && (
              <section className="deletion-retained">
                <h3>{t.retained}</h3>
                <ul>
                  {preview.retained.map((item, index) => (
                    <li key={index}>{retainedDescription(item, lang)}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        <p className="deletion-local-note">{t.browser}</p>
        <p className="deletion-export-note">
          <FolderDown size={17} />
          {t.exports}
        </p>
        {error && (
          <div className="deletion-error" role="alert">
            <p>
              {error.status === 409
                ? t.changed
                : error.status === 404
                  ? t.missing
                  : formatApiError(error, lang)}
            </p>
            {!preview && (
              <button
                className="text-button"
                onClick={() => setRefresh((value) => value + 1)}
                disabled={loading || deleting}
              >
                <RefreshCw size={14} />
                {t.reload}
              </button>
            )}
          </div>
        )}
        <div className="deletion-actions">
          <button
            className="secondary-button"
            onClick={onClose}
            disabled={deleting}
            ref={cancelRef}
          >
            {t.cancel}
          </button>
          <button
            className="danger-button"
            onClick={confirm}
            disabled={loading || deleting || !preview}
          >
            {deleting ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
            {deleting ? t.deleting : triedDelete && preview ? t.retryDelete : t.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}
