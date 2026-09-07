'use client';
import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Search,
  Quote,
  Network,
  Activity,
  NotebookPen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
export default function ResearchPath({
  onNavigate,
  counts,
}: {
  onNavigate: (tab: string) => void;
  counts: { sources: number; evidence: number; notes: number };
}) {
  const { locale } = useI18n(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [selected, setSelected] = useState(0);
  const steps = [
    {
      icon: BookOpen,
      title: L('准备材料', 'Prepare sources'),
      tab: 'sources',
      action: L('阅读与校订', 'Read and annotate'),
      count: `${counts.sources} ${L('份材料', 'sources')}`,
      body: L(
        '导入原件，核对转录，留下页内高亮与阅读问题。保存的版本让之后的引用能回到同一份原文。',
        'Import originals, check transcriptions and leave highlights or reading questions. Saved versions let later citations return to the text you actually read.',
      ),
      output: L('可阅读、可引用的材料', 'Readable, citable sources'),
    },
    {
      icon: Search,
      title: L('带着问题查找', 'Search with a question'),
      tab: 'search',
      action: L('检索材料', 'Search sources'),
      body: L(
        '用名字、别名、相近写法或原句找到相关页。按意思查找可补充线索；命中本身不是身份或因果证据。',
        'Find relevant pages through names, aliases, similar spellings or phrases. Search by meaning can add leads; a match itself does not prove identity or causation.',
      ),
      output: L(
        '值得细读的页与检索盲区',
        'Pages to read and gaps to investigate',
      ),
    },
    {
      icon: Quote,
      title: L('保留证据', 'Keep evidence'),
      tab: 'evidence',
      action: L('整理证据摘录', 'Organize excerpts'),
      count: `${counts.evidence} ${L('条摘录', 'excerpts')}`,
      body: L(
        '在原页摘录关键语句，再记录它支持、挑战或限制了什么解释。不是把助手的总结当作原文。',
        'Save a passage on its source page, then record which interpretation it supports, challenges or limits. Keep the assistant’s summary distinct from the original.',
      ),
      output: L('带页码与版本的证据', 'Evidence with pages and versions'),
    },
    {
      icon: Network,
      title: L('厘清人物与关系', 'Trace people and sources'),
      tab: 'provenance',
      action: L('整理人物与材料脉络', 'Trace people and sources'),
      body: L(
        '记录人物别名、约年与判断依据；标出材料的转引、翻译或共同来源，避免把重复转述计算为独立证言。',
        'Record aliases, approximate dates and your reasoning. Track quotation, translation or shared origins so repeated accounts are not counted as independent testimony.',
      ),
      output: L(
        '可复查的身份与来源判断',
        'Reviewable identity and source judgments',
      ),
    },
    {
      icon: Activity,
      title: L('委托批量研究', 'Delegate a collection'),
      tab: 'platform',
      action: L('建立或查看研究计划', 'Open research plans'),
      body: L(
        '把问题和材料范围交给助手，先试读与纠正，再处理后续材料。后台按依赖推进，在审读、异常或预算限制处等待。',
        'Give the assistant a question and a source scope. Pilot and correct the method before processing more material. Background work follows dependencies and waits at review, error or budget checkpoints.',
      ),
      output: L(
        '待审读的摘录、比较与反证线索',
        'Excerpts, comparisons and counterevidence for review',
      ),
    },
    {
      icon: NotebookPen,
      title: L('审读后写作', 'Review and write'),
      tab: 'notes',
      action: L('打开笔记与写作', 'Open notes and writing'),
      count: `${counts.notes} ${L('篇笔记', 'notes')}`,
      body: L(
        '对照原文采纳或纠正结果，将证据插入笔记，保留竞争解释和缺口。新问题可以回到检索或创建下一轮研究计划。',
        'Accept or correct findings against the sources, cite evidence in notes and retain competing explanations and gaps. New questions lead back to search or another research plan.',
      ),
      output: L(
        '有出处、可修改的研究论述',
        'An attributed, revisable argument',
      ),
    },
  ];
  const step = steps[selected];
  return (
    <section className="overview-section research-path">
      <header>
        <h3>
          {L('研究路径：每一步如何接起来', 'Your research path, connected')}
        </h3>
        <p>
          {L(
            '点选一步，查看用途和下一步。可以往返，不必按顺序填完。',
            'Choose a step to see its purpose and next action. Move back and forth as your question develops.',
          )}
        </p>
      </header>
      <ol aria-label={L('研究路径', 'Research path')}>
        {steps.map((item, i) => (
          <li key={item.tab}>
            <button
              type="button"
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
            >
              <item.icon size={18} />
              <span>
                <strong>
                  {i + 1}. {item.title}
                </strong>
                {item.count && <small>{item.count}</small>}
              </span>
              <ArrowRight size={14} />
            </button>
          </li>
        ))}
      </ol>
      <div className="research-path-detail" aria-live="polite">
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <p>
          <strong>{L('得到什么：', 'You leave with: ')}</strong>
          {step.output}
        </p>
        <Button variant="outline" onClick={() => onNavigate(step.tab)}>
          {step.action}
          <ArrowRight size={15} />
        </Button>
      </div>
      <p className="muted">
        {L(
          '新的材料或反例 → 回到原文 → 修订判断 → 再次研究。',
          'New sources or counterexamples → return to the text → revise your interpretation → investigate again.',
        )}
      </p>
    </section>
  );
}
