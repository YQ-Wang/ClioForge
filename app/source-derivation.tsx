'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
type Derivation = {
  parent_version_id: string;
  parent_revision: number;
  run_id: string | null;
  page: number | null;
  reason: string;
  created_at: string;
};
export default function SourceDerivation({
  versionId,
  disabled,
  onVersion,
}: {
  versionId: string;
  disabled: boolean;
  onVersion: (id: string) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [value, setValue] = useState<{
      versionId: string;
      derivation: Derivation | null;
    } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<{ derivation: Derivation | null }>(
      `/api/source-derivation?version_id=${versionId}`,
    )
      .then((r) => {
        if (active) {
          setValue({ versionId, ...r });
          setError('');
        }
      })
      .catch(() => {
        if (active) setError(versionId);
      });
    return () => {
      active = false;
    };
  }, [versionId]);
  const row = value?.versionId === versionId ? value.derivation : null;
  if (!row)
    return error === versionId ? (
      <p className="settings-hint">
        {L(
          '校订来源暂不可用，请刷新后查看。',
          'Revision provenance is unavailable; refresh to retry.',
        )}
      </p>
    ) : null;
  return (
    <details className="method-evaluation research-scale-panel">
      <summary>{L('这次校订从哪里来', 'Provenance of this revision')}</summary>
      <p>
        {L('基于原文版本', 'Based on source version')} v{row.parent_revision}
        {row.page ? ` · ${L('页', 'p.')} ${row.page}` : ''} ·{' '}
        {row.run_id
          ? L('模型候选经人工核查', 'Model candidate reviewed by a researcher')
          : L('人工校订或恢复', 'Manual revision or restoration')}
      </p>
      <p>
        {row.reason === 'manual'
          ? L('人工修改原文。', 'The source text was edited by a researcher.')
          : row.reason === 'ocr-reviewed'
            ? L(
                '核查转写候选后保存。',
                'Saved after reviewing the transcription candidate.',
              )
            : row.reason}
      </p>
      <small>{new Date(row.created_at).toLocaleString(locale)}</small>
      <div className="flow-actions">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onVersion(row.parent_version_id)}
        >
          {L('查看校订前的版本', 'Open previous source version')}
        </Button>
      </div>
    </details>
  );
}
