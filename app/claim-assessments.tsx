'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n/provider';
import type { claimAssessments } from '@/lib/claim-assessments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formText } from '@/lib/form-values';
export default function ClaimAssessments({ taskId }: { taskId: string }) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [data, setData] = useState<Awaited<
      ReturnType<typeof claimAssessments>
    > | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void api<NonNullable<typeof data>>(
      `/api/claim-assessments?task_id=${taskId}`,
    )
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [taskId]);
  return (
    <section className="claim-assessments">
      <h4>{L('逐条记录你的判断', 'Record your assessment of each claim')}</h4>
      <p>
        {L(
          '采纳、需要修改或不采纳，并留下理由。所有条目审读后，再完成整个步骤的复核。',
          'Accept, request revision or reject, with your reason. Assess every item before completing the overall review.',
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.findings.map((finding, index) => {
        const saved = data.reviews.find((r) => r.claim_index === index);
        return (
          <form
            key={index}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy(index);
              setError('');
              try {
                await api('/api/claim-assessments', {
                  task_id: taskId,
                  index,
                  hash: data.hash,
                  revision: data.revision,
                  decision: formText(form, 'decision'),
                  reason: formText(form, 'reason'),
                });
                setData(await api(`/api/claim-assessments?task_id=${taskId}`));
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Save failed');
              } finally {
                setBusy(null);
              }
            }}
          >
            <p>
              <strong>{index + 1}.</strong> {finding.claim}
            </p>
            {saved && (
              <p className="settings-feedback">
                {saved.reviewer_name} ·{' '}
                {
                  {
                    accept: L('采纳', 'Accepted'),
                    revise: L('需要修改', 'Needs revision'),
                    reject: L('不采纳', 'Rejected'),
                  }[saved.decision]
                }{' '}
                · {saved.reason}
              </p>
            )}
            {data.reviewable && (
              <fieldset disabled={busy !== null}>
                <select
                  name="decision"
                  aria-label={L(
                    `第 ${index + 1} 条的判断`,
                    `Assessment for claim ${index + 1}`,
                  )}
                  defaultValue={saved?.decision || 'revise'}
                >
                  <option value="revise">
                    {L('需要修改', 'Needs revision')}
                  </option>
                  <option value="accept">
                    {L('采纳这条论述', 'Accept this claim')}
                  </option>
                  <option value="reject">
                    {L('不采纳这条论述', 'Reject this claim')}
                  </option>
                </select>
                <Input
                  name="reason"
                  required
                  maxLength={2000}
                  defaultValue={saved?.reason}
                  aria-label={L(
                    `第 ${index + 1} 条的理由`,
                    `Reason for claim ${index + 1}`,
                  )}
                  placeholder={L(
                    '原文依据、保留意见或需要改写之处',
                    'Evidence, reservations or changes needed',
                  )}
                />
                <Button type="submit" variant="outline" size="sm">
                  {L('保存判断', 'Save assessment')}
                </Button>
              </fieldset>
            )}
          </form>
        );
      })}
    </section>
  );
}
