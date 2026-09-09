'use client';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
const purposes: Record<
  string,
  { body: [string, string]; next: string; action: [string, string] }
> = {
  sources: {
    body: [
      '保存原件、校订转录、留下高亮与阅读问题。在原页选择关键语句可保存为证据，再用于论证和笔记。',
      'Keep originals, correct transcriptions and leave highlights or questions. Select a passage on its page to save evidence for arguments and notes.',
    ],
    next: 'evidence',
    action: ['查看已保存的证据', 'See saved evidence'],
  },
  search: {
    body: [
      '在项目材料中寻找相关页。近似写法和已确认别名减少漏检；回到原文后，才能判断是否是同一人物或同一事件。',
      'Find relevant pages in this project. Similar spellings and reviewed aliases reduce missed leads; return to the text to judge identity or events.',
    ],
    next: 'provenance',
    action: ['整理人物与来源关系', 'Organize people and source relations'],
  },
  evidence: {
    body: [
      '这里保存原文摘录及其用途，引用绑定当时的页码和版本。证据支持什么解释，需要由你说明。',
      'Keep original excerpts and their purpose, tied to the page and version you read. Explain which interpretation each excerpt supports.',
    ],
    next: 'arguments',
    action: ['将证据连接到论证', 'Connect evidence to an argument'],
  },
  provenance: {
    body: [
      '整理人物、地点、别名和材料之间的转引关系。记录判断依据，避免同姓误合并或将转载当作独立证言。',
      'Organize people, places, aliases and dependencies between sources. Preserve reasons to avoid merging namesakes or treating reprints as independent testimony.',
    ],
    next: 'search',
    action: ['用姓名与别名继续检索', 'Continue searching names and aliases'],
  },
  arguments: {
    body: [
      '把研究问题拆成可以检验的主张，连接支持与挑战它们的证据，并记录仍缺少什么材料。',
      'Break questions into assessable claims, connect supporting and challenging evidence, and record what is still missing.',
    ],
    next: 'platform',
    action: ['围绕缺口安排研究', 'Plan research around the gaps'],
  },
  platform: {
    body: [
      '给助手一个明确问题、固定材料范围和预算。先保存草案，再开始后台执行；流程图展示分工，核对工作台用于审读和纠正结果。',
      'Give the assistant a question, fixed source scope and budget. Save a draft before starting background work. The workflow shows responsibilities; the review workbench supports checking and correction.',
    ],
    next: 'findings',
    action: ['查看已经采纳的成果', 'See accepted findings'],
  },
  findings: {
    body: [
      '阅读和下载已经采纳的研究成果。先核对出处及是否有后续修改提示，再将结果用于写作。',
      'Read and download accepted findings. Check their sources and any later-change notices before using them in writing.',
    ],
    next: 'notes',
    action: ['把成果用于写作', 'Use findings in writing'],
  },
  notes: {
    body: [
      '组织阅读笔记与论述，加入表格、图示、公式和证据引用。保存会保留版本；写作遇到缺口可返回材料继续查找。',
      'Develop notes and arguments with tables, drawings, formulas and evidence citations. Saves preserve versions; return to sources when writing exposes a gap.',
    ],
    next: 'search',
    action: ['查找缺少的依据', 'Find missing evidence'],
  },
  bibliography: {
    body: [
      '补充作者、题名、年代、出处与许可，用于规范引注和导出。书目信息不代替正文阅读。',
      'Record authors, titles, dates, provenance and licenses for citations and exports. Bibliographic metadata does not replace reading the text.',
    ],
    next: 'sources',
    action: ['阅读对应材料', 'Read the sources'],
  },
  drive: {
    body: [
      '选择允许 ClioForge 读取的 Google Drive 文件并导入项目。导入保存一份材料版本，不会自动跟随云端文件变化。',
      'Select authorized Google Drive files and import them into the project. An import preserves a source version; it does not continuously mirror the cloud file.',
    ],
    next: 'sources',
    action: ['查看导入的材料', 'See imported sources'],
  },
  runs: {
    body: [
      '查看转录与分析任务、项目预算和资料关注。遇到失败先查看执行记录，确认是否已经请求模型，再决定是否重试。',
      'Inspect transcription and analysis jobs, the project budget and source watches. After a failure, check whether the model was contacted before deciding to retry.',
    ],
    next: 'platform',
    action: ['返回研究计划', 'Return to research plans'],
  },
  team: {
    body: [
      '邀请合作者，调整项目权限，并讨论证据或研究步骤。只有具备审读权限的成员可以采纳研究结果。',
      'Invite collaborators, manage project permissions and discuss evidence or steps. Accepting findings requires review permission.',
    ],
    next: 'platform',
    action: ['查看分工与待办', 'See responsibilities and pending work'],
  },
  history: {
    body: [
      '查看材料和笔记的版本变化，比较与恢复旧内容。后续研究仍需核对是否受这些修改影响。',
      'Inspect changes to sources and notes, compare versions and restore content. Check whether subsequent research is affected by these changes.',
    ],
    next: 'sources',
    action: ['回到资料核对', 'Return to sources'],
  },
  data: {
    body: [
      '管理项目设置，导出研究备份。备份保留资料和研究记录，适合归档或迁移。',
      'Manage project settings and export a research backup. Backups preserve sources and research records for archiving or migration.',
    ],
    next: 'overview',
    action: ['查看整个研究项目', 'See the whole project'],
  },
  agents: {
    body: [
      '为外部助手创建限定权限的访问凭据，让它领取已安排的步骤。适用于已有自己的助手程序；普通研究使用研究计划即可。',
      'Give external agents scoped credentials to claim scheduled steps. This is for researchers with their own agent software; ordinary research can use Research plans.',
    ],
    next: 'platform',
    action: ['使用内置研究助手', 'Use the built-in research assistant'],
  },
};
export default function FeaturePurpose({
  tab,
  onNavigate,
}: {
  tab: string;
  onNavigate: (tab: string) => void;
}) {
  const { locale } = useI18n(),
    item = purposes[tab];
  if (!item) return null;
  const index = locale === 'en' ? 1 : 0;
  return (
    <details className="feature-purpose" key={tab}>
      <summary>
        {index
          ? 'What is this for, and what comes next?'
          : '这里可以做什么？下一步去哪？'}
      </summary>
      <p>{item.body[index]}</p>
      <Button variant="ghost" size="sm" onClick={() => onNavigate(item.next)}>
        {item.action[index]}
        <ArrowRight size={14} />
      </Button>
    </details>
  );
}
