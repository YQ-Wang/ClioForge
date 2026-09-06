'use client';
import { useState } from 'react';
import { Download, FolderPen, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from './workspace';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import type { Project } from '@/lib/types';
export default function ProjectSettings({
  project,
  onUpdated,
  onExport,
  busy,
}: {
  project: Project;
  onUpdated: (project: Project) => void;
  onExport: () => Promise<unknown>;
  busy: boolean;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [title, setTitle] = useState(project.title),
    [description, setDescription] = useState(project.description),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const canManage = project.role === 'owner';
  async function downloadArchive() {
    setExporting(true);
    setExported(false);
    setError('');
    try {
      const response = await fetch(
        `/api/project-export?project_id=${project.id}`,
      );
      if (!response.ok)
        throw new Error(
          L(
            '资料包下载失败，请重试。',
            'Could not download the research package. Please retry.',
          ),
        );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 100)}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setExported(true);
    } catch {
      setError(
        L(
          '资料包未完成，请重试；若仍失败，请联系支持。',
          'The package was not completed. Please retry, or contact support if it keeps failing.',
        ),
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="project-settings">
      {error && (
        <p role="alert" className="settings-feedback error">
          {error}
        </p>
      )}
      {saved && (
        <output className="settings-feedback">
          <CheckCircle2 size={17} />
          {L('项目信息已保存。', 'Project information saved.')}
        </output>
      )}
      <form
        className="settings-card"
        onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          setError('');
          setSaved(false);
          void api<{ result: Project }>('/api/workspace', {
            action: 'update_project',
            id: project.id,
            title,
            description,
            expected_title: project.title,
            expected_description: project.description,
          })
            .then((data) => {
              onUpdated(data.result);
              setSaved(true);
            })
            .catch((e) => setError(e.message))
            .finally(() => setSaving(false));
        }}
      >
        <div className="settings-card-heading">
          <FolderPen size={21} />
          <div>
            <h2>{L('研究项目', 'Research project')}</h2>
            <p>
              {L(
                '让合作者了解这项研究的范围与问题。',
                'Help collaborators understand the scope and question.',
              )}
            </p>
          </div>
        </div>
        <Field label={L('项目名称', 'Project name')}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            readOnly={!canManage}
          />
        </Field>
        <Field label={L('研究问题与范围', 'Research question and scope')}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={10000}
            rows={5}
            readOnly={!canManage}
          />
        </Field>
        {canManage ? (
          <Button type="submit" disabled={saving}>
            {L('保存项目信息', 'Save project information')}
          </Button>
        ) : (
          <p className="settings-hint">
            {L(
              '只有项目负责人可以修改这些信息。',
              'Only the project owner can change this information.',
            )}
          </p>
        )}
      </form>
      <section className="settings-card">
        <div className="settings-card-heading">
          <Download size={21} />
          <div>
            <h2>{L('带走你的研究', 'Keep a copy of your research')}</h2>
            <p>
              {L(
                '把原始附件、资料文字、笔记版本、引文和研究过程一起保存到电脑。',
                'Keep original attachments, source text, note versions, quotations and research records on your computer.',
              )}
            </p>
          </div>
        </div>
        <Button
          disabled={exporting || busy}
          onClick={() => void downloadArchive()}
        >
          {exporting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
          {exporting
            ? L('正在打包资料…', 'Preparing your package…')
            : L('下载资料包（含原件）', 'Download package with originals')}
        </Button>
        {exported && (
          <output className="settings-hint">
            {L(
              '资料包已准备好，浏览器已开始下载。',
              'Your package is ready and the browser has started downloading it.',
            )}
          </output>
        )}
        <Button
          variant="outline"
          disabled={busy || exporting}
          onClick={() => void onExport()}
        >
          <Download size={16} />
          {L('仅导出文字记录', 'Export text records only')}
        </Button>
        <p className="settings-hint">
          {L(
            '资料包保留版本与出处，并附文件校验清单；不含登录凭证或模型密钥。可从「我的研究 → 从备份恢复项目」创建独立副本。单次下载上限 512 MB；网页恢复支持 500 份原件、8 MB 研究记录。',
            'The package preserves versions and provenance with file checksums, excluding login credentials and model keys. Restore an independent copy from My research → Restore a backup. Downloads are limited to 512 MB; browser restoration supports 500 originals and 8 MB of research records.',
          )}
        </p>
      </section>
    </div>
  );
}
