'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Library, Loader2, RefreshCw } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { listStages, type StageListItem } from '@/lib/utils/stage-storage';

export default function StudyLoopClassroomLibrary() {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void listStages()
      .then((saved) => {
        if (active) setClassrooms(saved);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  const formattedDate = (timestamp: number) => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
    return new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(timestamp));
  };

  return (
    <main className="studyloop-library">
      <header className="studyloop-library-heading">
        <div>
          <span className="studyloop-runtime-eyebrow">STUDYLOOP × OPENMAIC</span>
          <h1>{zh ? '我的互动课堂' : 'My interactive classrooms'}</h1>
          <p>
            {zh
              ? '继续学习已生成的课堂。课堂内容保存在当前浏览器中。'
              : 'Continue learning in your generated classrooms, saved in this browser.'}
          </p>
        </div>
        <a className="studyloop-library-primary" href="/">
          {zh ? '返回 StudyLoop' : 'Back to StudyLoop'}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </header>

      <section className="studyloop-library-guide" aria-labelledby="new-classroom-title">
        <BookOpen size={22} aria-hidden="true" />
        <div>
          <h2 id="new-classroom-title">
            {zh ? '从课程答卷创建课堂' : 'Create a classroom from your results'}
          </h2>
          <p>
            {zh
              ? '在 StudyLoop 选择课程并完成练习，再从答卷点击「生成互动课堂」。课堂会根据学习简报生成大纲，确认后继续生成课程内容。'
              : 'Choose a course and complete its practice in StudyLoop, then select “Create interactive classroom” on your results. Review the outline based on your learning brief before generating the classroom.'}
          </p>
        </div>
      </section>

      <section
        className="studyloop-library-saved"
        aria-labelledby="saved-classrooms-title"
        aria-busy={loading}
      >
        <div className="studyloop-library-section-heading">
          <h2 id="saved-classrooms-title">{zh ? '已保存的课堂' : 'Saved classrooms'}</h2>
          <button
            type="button"
            className="studyloop-library-refresh"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {zh ? '刷新列表' : 'Refresh'}
          </button>
        </div>
        {loading ? (
          <div className="studyloop-library-state" role="status">
            <Loader2 className="studyloop-library-spinner" size={24} aria-hidden="true" />
            <p>{zh ? '正在读取此浏览器中的课堂…' : 'Loading classrooms saved in this browser…'}</p>
          </div>
        ) : failed ? (
          <div className="studyloop-library-state studyloop-library-error" role="alert">
            <h3>{zh ? '暂时无法读取课堂' : 'Classrooms could not be loaded'}</h3>
            <p>
              {zh
                ? '浏览器存储当前不可用。请允许此网站使用浏览器存储，再刷新列表。'
                : 'Browser storage is currently unavailable. Allow storage for this site, then refresh the list.'}
            </p>
          </div>
        ) : classrooms.length === 0 ? (
          <div className="studyloop-library-state">
            <Library size={31} aria-hidden="true" />
            <h3>{zh ? '这里还没有课堂' : 'No saved classrooms yet'}</h3>
            <p>
              {zh
                ? '从 StudyLoop 的课程答卷生成第一堂课，之后就能在这里继续学习。'
                : 'Create your first classroom from a StudyLoop course result, then continue learning here.'}
            </p>
          </div>
        ) : (
          <ul className="studyloop-library-grid">
            {classrooms.map((classroom) => {
              const updated = formattedDate(classroom.updatedAt);
              return (
                <li key={classroom.id}>
                  <Link
                    className="studyloop-library-card"
                    href={`/classroom/${encodeURIComponent(classroom.id)}`}
                  >
                    <span className="studyloop-library-card-icon">
                      <BookOpen size={23} aria-hidden="true" />
                    </span>
                    <h3>{classroom.name || (zh ? '未命名课堂' : 'Untitled classroom')}</h3>
                    {classroom.description && (
                      <p className="studyloop-library-description">{classroom.description}</p>
                    )}
                    <p className="studyloop-library-meta">
                      <span>
                        {zh ? `${classroom.sceneCount} 个场景` : `${classroom.sceneCount} scenes`}
                      </span>
                      {updated && <span>{zh ? `更新于 ${updated}` : `Updated ${updated}`}</span>}
                    </p>
                    <span className="studyloop-library-open">
                      {zh ? '继续学习' : 'Continue learning'}
                      <ArrowRight size={16} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="studyloop-library-attribution">
        {zh ? '感谢 ' : 'With thanks to '}
        <a href="https://github.com/THU-MAIC/OpenMAIC" target="_blank" rel="noreferrer">
          THU-MAIC / OpenMAIC
        </a>
        {zh
          ? ' 团队与贡献者。课堂生成、编辑与播放基于原项目，保留其 MIT 许可与署名。'
          : ' and its contributors. Classroom generation, editing and playback build on the upstream project, with its MIT license and attribution retained.'}
      </footer>
    </main>
  );
}
