'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n/provider';
import { exportMethodPackage, readMethodPackage } from '@/lib/method-package';
import type { ResearchMethod } from '@/lib/platform/research-recipes';
export default function MethodPackage({
  method,
  onApply,
  onProtocol,
}: {
  method: ResearchMethod;
  onApply: (method: ResearchMethod) => void;
  onProtocol: (protocol: NonNullable<ResearchMethod['protocol']>) => void;
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const input = useRef<HTMLInputElement>(null),
    [candidate, setCandidate] = useState<ResearchMethod | null>(null),
    [error, setError] = useState('');
  const protocol = method.protocol || {
    scope: '',
    limitations: '',
    evaluation_scope: '',
    examples: [],
  };
  return (
    <details className="method-evaluation research-scale-panel">
      <summary>
        {L('方法说明、示例与跨项目复用', 'Method notes, examples and reuse')}
      </summary>
      <p>
        {L(
          '保存适用材料、已测范围和局限。导入只会准备草稿；请检查后应用，再确认计划与预算。示例仅用于说明规则，不会变成新材料的证据。',
          'Record applicable material, tested scope and limitations. Imports prepare a draft: inspect it before applying, then confirm the plan and budget. Examples illustrate rules and never become evidence for new sources.',
        )}
      </p>
      {(
        [
          ['scope', '适用材料', 'Applicable sources'],
          ['evaluation_scope', '实际验证过的范围', 'Actually evaluated scope'],
          ['limitations', '局限与不适用情况', 'Limitations and exclusions'],
        ] as const
      ).map(([key, zh, en]) => (
        <label key={key}>
          {L(zh, en)}
          <Textarea
            value={protocol[key]}
            maxLength={2000}
            onChange={(e) => onProtocol({ ...protocol, [key]: e.target.value })}
          />
        </label>
      ))}
      <label>
        {L(
          '已获准复用的示例原文（可选）',
          'Example text approved for reuse (optional)',
        )}
        <Textarea
          value={protocol.examples[0]?.text || ''}
          maxLength={2000}
          onChange={(e) =>
            onProtocol({
              ...protocol,
              examples: [
                {
                  text: e.target.value,
                  interpretation: protocol.examples[0]?.interpretation || '',
                },
                ...protocol.examples.slice(1),
              ],
            })
          }
        />
      </label>
      <label>
        {L('这个例子如何应用规则', 'How the example applies the rule')}
        <Textarea
          value={protocol.examples[0]?.interpretation || ''}
          maxLength={2000}
          onChange={(e) =>
            onProtocol({
              ...protocol,
              examples: [
                {
                  text: protocol.examples[0]?.text || '',
                  interpretation: e.target.value,
                },
                ...protocol.examples.slice(1),
              ],
            })
          }
        />
      </label>
      <div className="flow-actions">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            try {
              const packet = exportMethodPackage(method);
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(packet, null, 2)], {
                  type: 'application/json',
                }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'clioforge-method.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setError('');
            } catch {
              setError(
                L(
                  '请先填写研究问题和摘录栏目。',
                  'Fill in the research question and fields first.',
                ),
              );
            }
          }}
        >
          {L('导出方法包', 'Export method')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => input.current?.click()}
        >
          {L('导入方法包', 'Import method')}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label={L('选择方法包', 'Choose a method package')}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              if (file.size > 100000) throw new Error();
              setCandidate(readMethodPackage(await file.text()));
              setError('');
            } catch {
              setError(
                L(
                  '方法包格式不正确或超过 100 KB，当前内容未改变。',
                  'Invalid method package or over 100 KB. Current contents are unchanged.',
                ),
              );
            }
          }}
        />
      </div>
      {error && (
        <p role="alert" className="platform-notice">
          {error}
        </p>
      )}
      {candidate && (
        <section className="platform-notice">
          <strong>
            {candidate.title} · v{candidate.version || 1}
          </strong>
          <p>{candidate.instructions}</p>
          <p>{candidate.protocol?.scope}</p>
          <p>{candidate.protocol?.evaluation_scope}</p>
          <p>{candidate.protocol?.limitations}</p>
          <p>{candidate.fields.join(' · ')}</p>
          {candidate.protocol?.examples.map((example, index) => (
            <details key={index}>
              <summary>
                {L('示例', 'Example')} {index + 1}
              </summary>
              <blockquote>{example.text}</blockquote>
              <p>{example.interpretation}</p>
            </details>
          ))}
          <Button
            type="button"
            onClick={() => {
              onApply(candidate);
              setCandidate(null);
            }}
          >
            {L('检查后应用到草稿', 'Apply reviewed method to draft')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setCandidate(null)}
          >
            {L('取消', 'Cancel')}
          </Button>
        </section>
      )}
    </details>
  );
}
