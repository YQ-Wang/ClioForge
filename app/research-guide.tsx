'use client';
import {
  BookOpen,
  Quote,
  NotebookPen,
  Search,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
export default function ResearchGuide({ onStart }: { onStart: () => void }) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const steps = [
    {
      icon: BookOpen,
      title: L('把材料放到书桌上', 'Bring your sources to the desk'),
      body: L(
        '创建一个项目，从电脑或 Google Drive 导入 PDF、照片和文本。Canwoo 保留原件，阅读和校订始终可以对照。',
        'Create a project and import PDFs, photographs or text from your computer or Google Drive. The original stays available beside your reading and corrections.',
      ),
    },
    {
      icon: Quote,
      title: L('留下可以回到原文的摘录', 'Keep excerpts you can trace'),
      body: L(
        '在阅读中摘录一段文字，写下它支持、质疑或补充了什么。每条摘录记住资料、页码和当时的版本。',
        'Save a passage and note what it supports, challenges or contextualizes. Each excerpt remembers its source, page and the version you read.',
      ),
    },
    {
      icon: Search,
      title: L('带着问题比较材料', 'Compare sources with a question'),
      body: L(
        '在「检索材料」查找名字、地点或词句，点击结果回到原页。也可以在「资料与阅读」并排对读两份材料，选择原文并写成带出处的笔记。需要分析一批材料时，再建立研究计划；相似措辞只是一条线索。',
        'Use Search sources to find a name, place or phrase and open its original page. In Sources & reading, compare two sources side by side and turn selected passages into an attributed note. Use a research plan for a collection. Similar wording is a lead to investigate.',
      ),
    },
    {
      icon: NotebookPen,
      title: L('把判断写成自己的论述', 'Develop your own argument'),
      body: L(
        '在笔记中组织理解，用证据连接判断。提交前逐条核对引文，保留不同解释和材料缺口；已采纳的研究成果可以阅读和下载。',
        'Develop your interpretation in notes and connect claims to evidence. Check citations before sharing, preserving alternatives and gaps. Accepted findings can be read and downloaded.',
      ),
    },
  ];
  return (
    <section className="research-help">
      <div className="page-title">
        <div>
          <p className="eyebrow">
            {L('CANWOO · 使用指南', 'CANWOO · A SHORT GUIDE')}
          </p>
          <h1>
            {L(
              '从第一份材料，到有依据的判断',
              'From a source to an informed judgment',
            )}
          </h1>
          <p>
            {L(
              '不用先了解模型、接口或工作流术语。从你的研究问题开始就好。',
              'Begin with your research question. No knowledge of models, APIs or workflow terminology is needed.',
            )}
          </p>
        </div>
      </div>
      <div className="guide-steps">
        {steps.map((step, i) => (
          <article key={i}>
            <span className="guide-number">0{i + 1}</span>
            <step.icon size={23} />
            <div>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </div>
          </article>
        ))}
      </div>
      <aside className="research-boundary">
        <div>
          <h2>{L('与合作者一起研究', 'Work with collaborators')}</h2>
          <p>
            {L(
              '项目负责人可以在「成员与讨论」输入对方邮箱，创建并分享邀请链接。对方登录后接受邀请，即可共同阅读、整理笔记或复核成果。负责人可以调整权限或移除成员；已有研究记录会保留。',
              'In People & discussion, the project owner enters a colleague’s email and shares an invitation link. After signing in and accepting, they can read, contribute or review according to their permissions. The owner can change access or remove members; existing research records remain.',
            )}
          </p>
        </div>
      </aside>
      <aside className="research-boundary">
        <ShieldCheck size={22} />
        <div>
          <h2>{L('研究判断始终由你作出', 'Your judgment remains central')}</h2>
          <p>
            {L(
              '助手可以寻找线索、整理材料和起草文字，不能替代史料批判。自动识别的文字需要核查，材料中没有的内容应保持未知。',
              'Assistance can surface leads, organize sources and draft text. It cannot replace source criticism. Check automatic transcriptions and preserve what the sources leave unknown.',
            )}
          </p>
          <p>
            {L(
              '阅读、笔记和对读材料不需要模型密钥。需要智能转录或分析时，在「账号设置 → 模型连接」连接自己的模型账户，并在项目「任务与关注」设置预算。转录与后台分析共用预算，费用由模型账户承担。批量转录每次最多 10 页，请保持页面打开；候选保存后仍需对照原件核查。',
              'Reading, notes and side-by-side comparison need no model key. For assisted transcription or analysis, connect your model account under Account settings → Model connections and set a project budget under Tasks and alerts. Transcription and background analysis share that budget; your provider account pays the charges. Batch transcription handles up to 10 pages with the page kept open. Check saved candidates against the original.',
            )}
          </p>
        </div>
      </aside>
      <Button onClick={onStart}>
        {L('回到我的研究', 'Go to my research')}
        <ArrowRight size={16} />
      </Button>
    </section>
  );
}
