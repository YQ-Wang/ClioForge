'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Check,
  Download,
  GitBranch,
  Quote,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { ClioForgeBrand } from '@/components/clioforge-brand';
import { useI18n } from '@/lib/i18n/provider';
import { SOURCE_CODE_URL, SUPPORT_URL } from '@/lib/platform-contact';
import { publicTitle, WORKSPACE_URL, type PublicPage } from '@/lib/public-site';
import adams from '@/lib/adams-public-case.json';
import { LanguageSwitcher } from './language-switcher';
import { ThemeSwitcher } from './theme-switcher';

type Translate = (zh: string, en: string) => string;
export default function PublicSite({ page }: { page: PublicPage }) {
  const { locale } = useI18n();
  const L: Translate = (zh, en) => (locale === 'en' ? en : zh);
  useEffect(() => {
    document.title = publicTitle(page, locale);
  }, [page, locale]);
  return (
    <div className="public-shell discovery-site">
      <Link prefetch={false} className="skip-link" href="#main-content">
        {L('跳到主要内容', 'Skip to content')}
      </Link>
      <header className="public-header discovery-header">
        <Link prefetch={false} href="/" className="brand public-brand">
          <ClioForgeBrand />
        </Link>
        <nav aria-label={L('网站导航', 'Site navigation')}>
          <Link
            prefetch={false}
            href="/research/adams"
            aria-current={page === 'adams' ? 'page' : undefined}
          >
            {L('研究案例', 'Research example')}
          </Link>
          <Link
            prefetch={false}
            href="/guide"
            aria-current={page === 'guide' ? 'page' : undefined}
          >
            {L('使用指南', 'Guide')}
          </Link>
          <Link prefetch={false} href={SOURCE_CODE_URL}>
            GitHub <ExternalLink size={13} />
          </Link>
        </nav>
        <div className="appearance-actions">
          <Link
            prefetch={false}
            href={WORKSPACE_URL}
            className="discovery-button primary"
          >
            {L('登录工作台', 'Sign in to workspace')}
            <ArrowRight size={16} />
          </Link>
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </header>
      <main id="main-content" className="discovery-main" tabIndex={-1}>
        {page === 'home' ? (
          <HomeContent L={L} />
        ) : page === 'adams' ? (
          <AdamsContent L={L} />
        ) : (
          <GuideContent L={L} />
        )}
      </main>
      <footer className="discovery-footer">
        <p>
          ClioForge <span>·</span>{' '}
          {L(
            '开源，让研究有据可循。',
            'Open source. Research with a traceable record.',
          )}
        </p>
        <nav aria-label={L('页脚导航', 'Footer navigation')}>
          <Link prefetch={false} href="/privacy">
            {L('隐私', 'Privacy')}
          </Link>
          <Link prefetch={false} href={SUPPORT_URL}>
            {L('联系', 'Contact')}
          </Link>
          <Link prefetch={false} href={SOURCE_CODE_URL + '/blob/main/LICENSE'}>
            AGPL-3.0
          </Link>
          <Link prefetch={false} href={WORKSPACE_URL}>
            {L('登录', 'Sign in')}
          </Link>
        </nav>
      </footer>
    </div>
  );
}

function HomeContent({ L }: { L: Translate }) {
  return (
    <>
      <section className="discovery-hero">
        <div>
          <p className="discovery-eyebrow">
            {L(
              '开源 · 历史与人文研究 · ALPHA',
              'OPEN SOURCE · HISTORY & HUMANITIES · ALPHA',
            )}
          </p>
          <h1>
            {L('让每一次发现，', 'Every discovery,')}
            <br />
            <em>{L('都有来处。', 'grounded in sources.')}</em>
          </h1>
          <p className="discovery-lead">
            {L(
              '与 AI 一起阅读材料、比较证据、推敲论证。把原文、研究过程和写作放在同一个工作台，让学者把时间留给判断与发现。',
              'Read sources, compare evidence and develop arguments with AI. Keep originals, research decisions and writing in one workspace, with more room for scholarly judgment.',
            )}
          </p>
          <div className="discovery-actions">
            <Link
              prefetch={false}
              className="discovery-button primary"
              href={WORKSPACE_URL}
            >
              {L('进入研究工作台', 'Open the workspace')}
              <ArrowRight size={17} />
            </Link>
            <Link
              prefetch={false}
              className="discovery-button"
              href="/research/adams"
            >
              {L('先看一个真实史料案例', 'Explore the Adams example')}
            </Link>
          </div>
          <p className="discovery-caption">
            {L(
              'ClioForge 是自托管软件。账号与资料保存在本实例；模型使用你自己的密钥，费用由服务商收取。',
              'ClioForge is self-hosted software. Accounts and research belong to this installation. Bring your own model key; providers bill model usage.',
            )}
          </p>
        </div>
        <aside
          className="discovery-preview"
          aria-label={L('示例研究过程', 'Example research process')}
        >
          <div className="discovery-preview-top">
            <span className="discovery-dot" />
            {L('研究问题', 'RESEARCH QUESTION')}
            <span>1776</span>
          </div>
          <h2>
            {L(
              '“记住女士们”意味着什么？',
              'What did “remember the ladies” ask for?',
            )}
          </h2>
          <blockquote lang="en">
            “Do not put such unlimited power into the hands of the husbands.”
          </blockquote>
          <Link
            prefetch={false}
            href="/research/adams#letter-91"
            className="discovery-source-link"
          >
            <Quote size={15} />
            Abigail Adams · 31 March 1776
            <ArrowRight size={15} />
          </Link>
          <div className="discovery-preview-path">
            <span>
              <BookOpen size={17} />
              {L('回看原文', 'Read in context')}
            </span>
            <span>
              <GitBranch size={17} />
              {L('比较回信', 'Compare the reply')}
            </span>
            <span>
              <Check size={17} />
              {L('审读解释', 'Review the interpretation')}
            </span>
          </div>
          <p>
            {L(
              '有出处的解释，也需要说明材料的边界。',
              'An interpretation needs both evidence and limits.',
            )}
          </p>
        </aside>
      </section>
      <section className="discovery-section">
        <div className="discovery-section-heading">
          <p className="discovery-eyebrow">
            {L('从材料到论证', 'FROM SOURCES TO AN ARGUMENT')}
          </p>
          <h2>{L('一条连续的研究路径', 'A connected research workflow')}</h2>
        </div>
        <Workflow L={L} />
      </section>
      <section className="discovery-split discovery-section">
        <div>
          <p className="discovery-eyebrow">
            {L('给研究者，也给贡献者', 'FOR RESEARCHERS & CONTRIBUTORS')}
          </p>
          <h2>
            {L(
              '让助手做准备，让判断可追溯。',
              'Delegate preparation. Keep a record of the decisions.',
            )}
          </h2>
          <p>
            {L(
              '后台研究任务可以整理材料与候选证据。你可以检查任务状态，打开原文，审读结果，再把已核对的研究推进到草稿。',
              'Background research tasks can prepare source material and candidate evidence. Inspect task status, return to the original, review the results and carry checked research into a draft.',
            )}
          </p>
        </div>
        <div className="discovery-card">
          <h3>
            {L(
              '仍在打磨，欢迎真实研究反馈',
              'An alpha built for real research feedback',
            )}
          </h3>
          <p>
            {L(
              'ClioForge 不保证 AI 结论正确，也没有已验证的生产力提升倍数。请用你的研究问题检验它，报告不准确的引用、遗漏与使用障碍。',
              'ClioForge does not guarantee AI conclusions or claim a measured productivity multiplier. Try it on your question and report inaccurate citations, omissions and friction.',
            )}
          </p>
          <Link
            prefetch={false}
            className="discovery-inline-link"
            href={SOURCE_CODE_URL}
          >
            {L('查看代码与贡献方式', 'Explore the code and contribute')}
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}

function Workflow({ L }: { L: Translate }) {
  const steps = [
    [
      BookOpen,
      L('收集与阅读', 'Collect & read'),
      L(
        '导入 PDF、照片或文字；保留原件，在阅读时高亮与批注。',
        'Import PDFs, images or text. Keep originals and annotate while reading.',
      ),
    ],
    [
      Quote,
      L('摘录与比较', 'Extract & compare'),
      L(
        '把摘录连到出处，比较支持、质疑与不同解释。',
        'Link excerpts to sources and compare support, objections and alternative readings.',
      ),
    ],
    [
      GitBranch,
      L('追问与审读', 'Investigate & review'),
      L(
        '安排研究任务，检查助手的证据与推理，标出尚未解决的问题。',
        'Plan research tasks, check the assistant’s evidence and reasoning, and mark open questions.',
      ),
    ],
    [
      FileText,
      L('组织与写作', 'Organize & write'),
      L(
        '把已审读的研究组织成草稿，回查引文，保留版本并导出。',
        'Turn reviewed research into a draft, check citations, keep revisions and export.',
      ),
    ],
  ] as const;
  return (
    <ol className="discovery-workflow">
      {steps.map(([Icon, title, description], i) => (
        <li key={i}>
          <span className="discovery-step-number">
            0{i + 1}
            <Icon size={21} />
          </span>
          <h3>{title}</h3>
          <p>{description}</p>
        </li>
      ))}
    </ol>
  );
}

function AdamsContent({ L }: { L: Translate }) {
  const readings = [
    L(
      'Abigail 把限制丈夫的权力与“新的法律”联系起来。这支持一种有关婚姻权力与代表权的解释，但不能单凭这段话重构一套完整的政策主张。',
      'Abigail connects limits on husbands’ power to a new code of laws. This supports a reading about marital authority and representation, without establishing a complete policy program.',
    ),
    L(
      'John 以玩笑和社会秩序失控的意象回应，并表示不会废除男性制度。语气不能替代内容：它既是私人书信的修辞，也是需要面对的反对证据。',
      'John responds through humor and images of disorder, while rejecting repeal of masculine systems. Tone does not settle meaning: the passage is both personal rhetoric and evidence of resistance.',
    ),
    L(
      'Abigail 再次指出对外宣扬自由与保留对妻子绝对权力之间的张力。这表明她继续追问，但三封信不足以证明制度变化或因果影响。',
      'Abigail returns to the tension between proclaimed emancipation and absolute power over wives. She persists, but three letters do not establish institutional change or causal influence.',
    ),
  ];
  return (
    <article className="discovery-article">
      <Link prefetch={false} href="/" className="discovery-back">
        ← {L('返回首页', 'Back to home')}
      </Link>
      <header className="discovery-article-header">
        <p className="discovery-eyebrow">
          {L(
            '公开史料 · 研究方法示例',
            'PUBLIC-DOMAIN SOURCES · A WORKED EXAMPLE',
          )}
        </p>
        <h1>
          {L(
            '“记住女士们”：从三封书信到一个有限的论证',
            '“Remember the ladies”: three letters, a bounded argument',
          )}
        </h1>
        <p className="discovery-lead">
          {L(
            '1776 年，Abigail 与 John Adams 如何讨论法律、自由与婚姻中的权力？从可以核对的原文出发，看看研究工作台应该怎样帮助，而不是跳过学者的判断。',
            'How did Abigail and John Adams discuss law, liberty and power within marriage in 1776? Start with inspectable text and see how a research workspace can support scholarly judgment.',
          )}
        </p>
      </header>
      <div className="discovery-case-facts">
        <span>
          {L('3 封信 · 1876 年出版版本', '3 letters · 1876 published edition')}
        </span>
        <span>{L('美国公有领域', 'Public domain in the USA')}</span>
        <span>{L('无需注册即可阅读', 'Read without an account')}</span>
      </div>
      <section className="discovery-case-intro">
        <h2>
          {L('先确定问题和材料边界', 'Set the question and its boundaries')}
        </h2>
        <p>
          {L(
            '这是一份重新依据公有领域版本编写的教学示例，不是新的无人值守运行记录，也不是经过同行评审的论文。下面每封信只展示一个完整段落。点击出处阅读整封信及上下文；不要把摘录当作全部材料。',
            'This is an editorial walkthrough rebuilt from a public-domain edition, not a new unattended run or a peer-reviewed paper. Each letter below shows one complete paragraph. Follow the source link for the whole letter and surrounding context; excerpts are not the whole corpus.',
          )}
        </p>
      </section>
      <div className="discovery-case-letters">
        {adams.letters.map((letter, i) => (
          <section className="discovery-letter" id={letter.id} key={letter.id}>
            <div className="discovery-letter-heading">
              <span className="discovery-eyebrow">
                0{i + 1} · {letter.date}
              </span>
              <Link prefetch={false} href={letter.file} download>
                <Download size={16} />
                {L('下载摘录', 'Download excerpt')}
              </Link>
            </div>
            <h2>
              {letter.author} → {letter.recipient}
            </h2>
            <p className="discovery-caption">
              {L(
                `第 ${letter.number} 封 · 单段摘录，其他段落省略`,
                `Letter ${letter.number} · one paragraph; other paragraphs omitted`,
              )}
            </p>
            <blockquote lang="en">{letter.excerpt}</blockquote>
            <p className="discovery-citation">
              <Link prefetch={false} href={adams.sourceUrl}>
                {L('阅读 1876 年版全文', 'Read the full 1876 edition')}
                <ExternalLink size={14} />
              </Link>{' '}
              ·{' '}
              {L(`查找第 ${letter.number} 封`, `Find letter ${letter.number}`)}
            </p>
            <div className="discovery-interpretation">
              <h3>{L('一种解释，供你审读', 'An interpretation to review')}</h3>
              <p>{readings[i]}</p>
            </div>
          </section>
        ))}
      </div>
      <section className="discovery-card discovery-conclusion">
        <h2>
          {L('一个可以支持的结论', 'A conclusion this selection can support')}
        </h2>
        <p>
          {L(
            '这段往来显示，革命时期的自由语言也被用于质疑婚姻中的权力。John 的回应与 Abigail 的再次追问提醒我们：表达诉求、接受诉求与改变制度，是不同的证据问题。',
            'This exchange shows language of revolutionary liberty being used to question power within marriage. John’s response and Abigail’s renewed challenge distinguish three evidentiary questions: making a demand, accepting it and changing institutions.',
          )}
        </p>
        <h3>{L('下一步还需要什么？', 'What would the next step require?')}</h3>
        <p>
          {L(
            '阅读完整通信、当时的婚姻法律与相关研究，再检验更广的代表性和影响。这里没有证据支持“这三封信直接改变了立法”，也不能把两个人的通信推广为所有女性的经历。',
            'Read the full correspondence, contemporary marriage law and relevant scholarship before assessing wider representation or influence. This selection does not establish a direct legislative effect or stand for all women’s experiences.',
          )}
        </p>
      </section>
      <section className="discovery-section">
        <h2>
          {L(
            '在 ClioForge 里继续这个问题',
            'Continue the question in ClioForge',
          )}
        </h2>
        <ol className="discovery-instructions">
          <li>
            {L(
              '创建独立项目。下载摘录以核对版本；如要导入，请只选书信正文，并把出处与许可放在资料说明中。',
              'Create a separate project. Download excerpts to check the edition. For import, select the letter body and keep source and rights information in the source description.',
            )}
          </li>
          <li>
            {L(
              '高亮与问题有关的段落，记录一个支持性解释与一个反对解释。',
              'Highlight relevant passages and record one supporting interpretation and one objection.',
            )}
          </li>
          <li>
            {L(
              '让助手比较三封信，要求逐项给出处和不确定性。回看原文后再接受证据。',
              'Ask the assistant to compare the letters with sources and uncertainties for each claim. Return to the originals before accepting evidence.',
            )}
          </li>
          <li>
            {L(
              '在问题与论证中记录边界，再根据已审读材料准备草稿。不要把这份示例当成效率测量结果。',
              'Record limits in your argument and prepare a draft from reviewed material. This walkthrough is not a measured productivity result.',
            )}
          </li>
        </ol>
        <div className="discovery-actions">
          <Link
            prefetch={false}
            className="discovery-button primary"
            href={WORKSPACE_URL}
          >
            {L('打开工作台', 'Open the workspace')}
            <ArrowRight size={17} />
          </Link>
          <Link prefetch={false} className="discovery-button" href="/guide">
            {L('阅读完整工作流指南', 'Read the workflow guide')}
          </Link>
        </div>
      </section>
      <section className="discovery-rights">
        <h2>{L('版本与使用权', 'Edition and reuse')}</h2>
        <p>
          {adams.edition}.{' '}
          {L(
            '数字版由 Carla Foust 与 Distributed Proofreading 团队制作。保留该数字版措辞，只合并换行并移除页码；不是手稿的逐字转录。中文解释为本示例的解读，不是原信译文。',
            'Digital text prepared by Carla Foust and the Distributed Proofreading team. Wording is retained, with line breaks normalized and page markers removed; this is not a diplomatic manuscript transcription. Interpretations belong to this example.',
          )}
        </p>
        <p>
          <Link prefetch={false} href={adams.rightsUrl}>
            {L('查看公有领域标注', 'Public-domain notice')}
          </Link>{' '}
          ·{' '}
          <Link prefetch={false} href="/examples/adams/GUTENBERG-LICENSE.txt">
            {L('数字版使用条款', 'Digital edition terms')}
          </Link>{' '}
          ·{' '}
          <Link
            prefetch={false}
            href={SOURCE_CODE_URL + '/blob/main/docs/adams-source-rights.md'}
          >
            {L('完整史料版权说明', 'Source-rights record')}
          </Link>
        </p>
        <p>
          {L(
            '没有复制现代 Adams Papers 注释、批量元数据或手稿照片，也不暗示任何档案馆为 ClioForge 背书。下载免费；美国以外的使用须核对当地版权规则。',
            'No modern Adams Papers annotations, bulk metadata or manuscript photographs are reproduced. No archive endorsement is implied. Downloads are free; check local copyright rules for use outside the USA.',
          )}
        </p>
      </section>
    </article>
  );
}

function GuideContent({ L }: { L: Translate }) {
  return (
    <article className="discovery-article">
      <header className="discovery-article-header">
        <p className="discovery-eyebrow">{L('使用指南', 'WORKFLOW GUIDE')}</p>
        <h1>
          {L(
            '从一个问题开始，带着证据写作。',
            'Start with a question. Write with evidence.',
          )}
        </h1>
        <p className="discovery-lead">
          {L(
            '先完成一个小而真实的研究回路，再扩大材料与任务规模。每一步都有可以检查的产物。',
            'Complete one small, real research cycle before expanding the corpus or task queue. Each step leaves something you can inspect.',
          )}
        </p>
      </header>
      <h2 className="discovery-eyebrow">
        {L('研究路径', 'THE RESEARCH WORKFLOW')}
      </h2>
      <Workflow L={L} />
      <div className="discovery-guide-steps">
        {[
          [
            L(
              '01 · 创建项目，放入材料',
              '01 · Create a project and bring sources',
            ),
            L(
              '登录后创建项目，写下研究问题。从电脑导入材料，或授权连接 Google Drive 后选择文件。第一次先用少量材料，确认原件、正文与出处都能打开。',
              'Sign in, create a project and write down a question. Import sources from your computer or connect Google Drive and select files. Begin with a few sources and confirm that originals, text and provenance open correctly.',
            ),
          ],
          [
            L('02 · 阅读、校对、留下注释', '02 · Read, correct and annotate'),
            L(
              '在资料与阅读中回看原件。转录和 OCR 可能出错，尤其是手写文字、人名与日期。高亮重要段落，保留疑问，不要先把所有材料交给模型总结。',
              'Return to originals in Sources & reading. Transcription and OCR can misread handwriting, names and dates. Highlight useful passages and preserve questions before summarizing the whole collection.',
            ),
          ],
          [
            L(
              '03 · 配置助手，安排一个有限任务',
              '03 · Configure assistance and define a bounded task',
            ),
            L(
              '在助手设置中添加模型服务商与密钥。模型费用由服务商收取。先安排一个明确任务，例如比较三封信如何使用“自由”，指定材料范围、产物和预算。检查失败原因再决定是否重试。',
              'Add your provider and model key in assistant settings. Providers charge for model use. Start with a specific task, such as comparing uses of “liberty” across three letters, with a defined source set, output and budget. Inspect failures before retrying.',
            ),
          ],
          [
            L(
              '04 · 审读证据，检查不同解释',
              '04 · Review evidence and competing readings',
            ),
            L(
              '打开候选证据对应的原文，检查摘录、上下文与推论。人物与材料脉络可以帮助导航，但关联不等于因果。把支持、反对和未解决的问题写进论证。',
              'Open the original behind each candidate excerpt and check wording, context and inference. People and source connections help navigation; an association is not causation. Record support, objections and unresolved questions in the argument.',
            ),
          ],
          [
            L(
              '05 · 准备草稿，再核对与导出',
              '05 · Prepare a draft, then check and export',
            ),
            L(
              '在审读研究材料后准备论文草稿，或在笔记与写作中自行组织。逐项核对引文与书目，区分已支持的判断和待验证的假说。导出时保留出处，利用版本历史回看修改。',
              'Prepare a manuscript draft after reviewing the research, or compose it in Notes & writing. Check citations and bibliography, distinguish supported judgments from hypotheses, and retain provenance in exports. Use revision history to revisit changes.',
            ),
          ],
        ].map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
      </div>
      <section className="discovery-card">
        <h2>
          {L(
            '在后台推进，也要保留检查点',
            'Keep checkpoints when work runs in the background',
          )}
        </h2>
        <p>
          {L(
            '后台任务适合重复性的整理与比较。先在小材料集上核对产物，再增大规模；定期查看预算、失败和待审读结果。无人值守执行不等于自动获得可靠的学术结论。',
            'Background tasks suit repeated preparation and comparison. Check outputs on a small source set before scaling, then review budgets, failures and pending results. Unattended execution does not make a scholarly conclusion reliable by itself.',
          )}
        </p>
      </section>
      <div className="discovery-actions discovery-section">
        <Link
          prefetch={false}
          className="discovery-button primary"
          href={WORKSPACE_URL}
        >
          {L('开始研究', 'Start researching')}
          <ArrowRight size={17} />
        </Link>
        <Link
          prefetch={false}
          className="discovery-button"
          href="/research/adams"
        >
          {L('用 Adams 书信走一遍', 'Walk through the Adams example')}
        </Link>
        <Link
          prefetch={false}
          className="discovery-inline-link"
          href={SOURCE_CODE_URL + '#readme'}
        >
          {L('自行部署与开发文档', 'Self-hosting and developer docs')}
          <ExternalLink size={16} />
        </Link>
      </div>
    </article>
  );
}
