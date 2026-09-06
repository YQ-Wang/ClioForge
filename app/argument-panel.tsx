'use client';
import { useI18n } from '@/lib/i18n/provider';
import { useState } from 'react';
import { Plus, GitBranch, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Field, Notice } from './workspace';
import { api } from '@/lib/client-api';
import type { Evidence, Source } from '@/lib/types';
import type { WorkbenchData, Question, Claim } from '@/lib/workbench-types';
const relationName = { supports: '支持', challenges: '质疑', context: '背景' };
export default function ArgumentPanel({
  projectId,
  data,
  evidence,
  sources,
  onSaved,
  onOpenEvidence,
}: {
  projectId: string;
  data: WorkbenchData;
  evidence: Evidence[];
  sources: Source[];
  onSaved: () => Promise<unknown>;
  onOpenEvidence: (evidence: Evidence) => void;
}) {
  const { t } = useI18n();
  const [question, setQuestion] = useState<Question | null | undefined>(
      undefined,
    ),
    [claim, setClaim] = useState<Partial<Claim> | null>(null),
    [link, setLink] = useState<Claim | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(
    event: React.SyntheticEvent<HTMLFormElement>,
    kind: 'question' | 'claim' | 'link_evidence',
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      let fields: object;
      if (kind === 'question')
        fields = {
          id: question?.id,
          expected: question?.revision,
          title: form.get('title'),
          detail: form.get('detail'),
        };
      else if (kind === 'claim')
        fields = {
          id: claim?.id,
          expected: claim?.revision,
          question_id: form.get('question_id'),
          body: form.get('body'),
          kind: form.get('kind'),
          status: form.get('status'),
        };
      else
        fields = {
          claim_id: link?.id,
          evidence_id: form.get('evidence_id'),
          relation: form.get('relation'),
        };
      await api('/api/workbench', {
        action: kind,
        project_id: projectId,
        ...fields,
      });
      setQuestion(undefined);
      setClaim(null);
      setLink(null);
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-toolbar">
        <div>
          <h2 className="tool-heading">{t('问题、论证与反证')}</h2>
          <p>{t('把判断、竞争解释和下一步行动分别记录，证据保持独立出处。')}</p>
        </div>
        <Button onClick={() => setQuestion(null)}>
          <Plus size={16} />
          {t('新研究问题')}
        </Button>
      </div>
      {message && <Notice text={message} />}
      {!data.questions.length && (
        <section className="empty-project">
          <GitBranch size={34} />
          <h2>{t('从一个还没有答案的问题开始')}</h2>
          <p>{t('为它添加判断、替代解释，再把支持和质疑的证据放在一起。')}</p>
        </section>
      )}
      {data.questions.map((q) => (
        <section className="question-board" key={q.id}>
          <div className="section-toolbar">
            <div>
              <h2>{q.title}</h2>
              <p>{q.detail}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setQuestion(q)}>
                {t('编辑问题')}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  setClaim({
                    question_id: q.id,
                    kind: 'claim',
                    status: 'draft',
                  })
                }
              >
                {t('添加论证')}
              </Button>
            </div>
          </div>
          <div className="argument-columns">
            {(['claim', 'alternative', 'next_step'] as const).map((kind) => (
              <div className="argument-column" key={kind}>
                <h3>
                  {kind === 'claim'
                    ? t('研究判断')
                    : kind === 'alternative'
                      ? t('竞争解释')
                      : t('下一步行动')}
                </h3>
                {data.claims
                  .filter((c) => c.question_id === q.id && c.kind === kind)
                  .map((c) => (
                    <article className="claim-card" key={c.id}>
                      <span
                        className="status-tag"
                        data-state={c.status === 'reviewed' ? 'saved' : 'dirty'}
                      >
                        {c.status === 'reviewed'
                          ? t('研究者已复核')
                          : t('待核查')}
                      </span>
                      <p>{c.body}</p>
                      {data.claim_evidence
                        .filter((edge) => edge.claim_id === c.id)
                        .map((edge) => {
                          const item = evidence.find(
                            (e) => e.id === edge.evidence_id,
                          );
                          return item ? (
                            <button
                              key={edge.id}
                              className="linked-evidence"
                              onClick={() => onOpenEvidence(item)}
                            >
                              <span
                                className="status-tag"
                                data-relation={edge.relation}
                              >
                                {t(relationName[edge.relation])}
                              </span>
                              <Quote size={13} />
                              <span>{item.quote.slice(0, 140)}</span>
                              <small>
                                {
                                  sources.find((s) => s.id === item.source_id)
                                    ?.title
                                }{' '}
                                {' · '}
                                {t('文件第 {0} 页', { 0: item.page })}
                              </small>
                            </button>
                          ) : null;
                        })}
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setClaim(c)}
                        >
                          {t('编辑')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLink(c)}
                        >
                          {t('关联证据')}
                        </Button>
                      </div>
                    </article>
                  ))}
                {!data.claims.some(
                  (c) => c.question_id === q.id && c.kind === kind,
                ) && (
                  <p className="text-xs text-muted-foreground p-3">
                    {t('尚未记录')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <Dialog
        open={question !== undefined}
        onOpenChange={(open) => {
          if (!open) setQuestion(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {question ? t('编辑问题') : t('新研究问题')}
            </DialogTitle>
            <DialogDescription>
              {t('限定时期、地区和希望解释的现象。')}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => void submit(event, 'question')}
            className="space-y-4"
          >
            <Field label={t('研究问题')}>
              <Input
                name="title"
                required
                maxLength={2000}
                defaultValue={question?.title}
              />
            </Field>
            <Field label={t('范围与说明')}>
              <Textarea
                name="detail"
                maxLength={10000}
                defaultValue={question?.detail}
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {t('保存问题')}
            </Button>
            {message && <Notice text={message} />}
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!claim}
        onOpenChange={(open) => {
          if (!open) setClaim(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {claim?.id ? t('编辑论证') : t('添加论证')}
            </DialogTitle>
            <DialogDescription>
              {t('复核表示研究者检查过这一判断，不等于历史结论已经成立。')}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => void submit(event, 'claim')}
            className="space-y-4"
          >
            <Field label={t('所属问题')}>
              <NativeSelect
                name="question_id"
                className="w-full"
                defaultValue={claim?.question_id}
              >
                {data.questions.map((q) => (
                  <NativeSelectOption key={q.id} value={q.id}>
                    {q.title}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t('类型')}>
              <NativeSelect name="kind" defaultValue={claim?.kind}>
                <NativeSelectOption value="claim">
                  {t('研究判断')}
                </NativeSelectOption>
                <NativeSelectOption value="alternative">
                  {t('竞争解释')}
                </NativeSelectOption>
                <NativeSelectOption value="next_step">
                  {t('下一步行动')}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label={t('内容')}>
              <Textarea
                name="body"
                required
                maxLength={2000}
                defaultValue={claim?.body}
              />
            </Field>
            <Field label={t('复核状态')}>
              <NativeSelect name="status" defaultValue={claim?.status}>
                <NativeSelectOption value="draft">
                  {t('待核查')}
                </NativeSelectOption>
                <NativeSelectOption value="reviewed">
                  {t('研究者已复核')}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button type="submit" disabled={busy}>
              {t('保存论证')}
            </Button>
            {message && <Notice text={message} />}
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!link}
        onOpenChange={(open) => {
          if (!open) setLink(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('关联已有证据')}</DialogTitle>
            <DialogDescription>{link?.body}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => void submit(event, 'link_evidence')}
            className="space-y-4"
          >
            <Field label={t('证据')}>
              <NativeSelect name="evidence_id" required className="w-full">
                {evidence.map((item) => (
                  <NativeSelectOption value={item.id} key={item.id}>
                    {item.quote.slice(0, 90)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t('对这条论证的关系')}>
              <NativeSelect name="relation">
                {Object.entries(relationName).map(([value, label]) => (
                  <NativeSelectOption value={value} key={value}>
                    {t(label)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit" disabled={busy || !evidence.length}>
              {t('保存关联')}
            </Button>
            {!evidence.length && (
              <Notice text={t('请先从资料阅读器摘录证据。')} />
            )}
            {message && <Notice text={message} />}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
