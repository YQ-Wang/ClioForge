'use client';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Inbox,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  Layers,
  Link2,
  ListChecks,
  MessageSquare,
  NotebookPen,
  Quote,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Waypoints,
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client-api';
import { accountSections, projectSections } from '@/lib/navigation';
import { useI18n } from '@/lib/i18n/provider';
import type { Project } from '@/lib/types';
const icons: Record<string, typeof BookOpen> = {
  overview: FolderOpen,
  inbox: Inbox,
  sources: BookOpen,
  search: Search,
  bibliography: ListChecks,
  drive: Link2,
  notes: NotebookPen,
  evidence: Quote,
  arguments: MessageSquare,
  platform: GitBranch,
  findings: Layers,
  team: Users,
  runs: Sparkles,
  provenance: Waypoints,
  history: History,
  data: Settings2,
  agents: Sparkles,
  profile: Users,
  security: ShieldCheck,
  models: Sparkles,
  connections: Link2,
  usage: Layers,
};
export default function WorkspaceNavigation({
  project,
  active,
  settings,
  counts,
  onProject,
  onSection,
  onSettings,
  onProjects,
  onBack,
  onInbox,
  inbox,
}: {
  project: Project | null;
  active: string;
  settings: string;
  counts: Record<string, number>;
  onProject: (project: Project) => void;
  onSection: (id: string) => void;
  onSettings: (id: string) => void;
  onProjects: () => void;
  onBack: () => void;
  onInbox: () => void;
  inbox: boolean;
}) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const { setOpenMobile } = useSidebar();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    sources: true,
    writing: true,
    research: true,
    manage: false,
  });
  const activeGroup = projectSections.find((item) => item.id === active)?.group;
  useEffect(() => {
    if (activeGroup)
      setExpanded((value) => ({ ...value, [activeGroup]: true }));
  }, [activeGroup]);
  function go(action: () => void) {
    action();
    setOpenMobile(false);
  }
  function item(
    id: string,
    label: string,
    selected: boolean,
    onClick: () => void,
  ) {
    const Icon = icons[id] || FileText;
    return (
      <SidebarMenuItem key={id}>
        <SidebarMenuButton
          className="workspace-nav section-nav"
          isActive={selected}
          aria-current={selected ? 'page' : undefined}
          onClick={() => go(onClick)}
        >
          <Icon />
          <span>{label}</span>
          {counts[id] !== undefined && !settings && (
            <small className="nav-count">{counts[id]}</small>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }
  if (settings)
    return (
      <nav
        aria-label={L('账号设置', 'Account settings')}
        className="workspace-navigation"
      >
        <Button variant="ghost" className="nav-back" onClick={() => go(onBack)}>
          <ArrowLeft size={16} />
          {L('返回研究工作区', 'Back to research')}
        </Button>
        <p className="nav-caption">{L('账号设置', 'Account settings')}</p>
        <SidebarMenu>
          {accountSections.map((section) =>
            item(
              section.id,
              L(section.zh, section.en),
              settings === section.id,
              () => onSettings(section.id),
            ),
          )}
        </SidebarMenu>
      </nav>
    );
  return (
    <nav
      aria-label={L('研究导航', 'Research navigation')}
      className="workspace-navigation"
    >
      <SidebarMenu>
        {item(
          'overview',
          L('所有研究项目', 'All projects'),
          !project && !inbox,
          onProjects,
        )}
        {item('inbox', L('研究收件箱', 'Research inbox'), inbox, onInbox)}
      </SidebarMenu>
      {project && (
        <>
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) {
                setError('');
                void api<{ projects: Project[] }>('/api/workspace')
                  .then((data) => setProjects(data.projects))
                  .catch(() =>
                    setError(
                      L(
                        '无法读取项目，请重试。',
                        'Could not load projects. Please retry.',
                      ),
                    ),
                  );
              }
            }}
          >
            <DropdownMenuTrigger
              render={<Button variant="ghost" />}
              className="project-switcher"
            >
              <span>
                <small>{L('当前项目', 'CURRENT PROJECT')}</small>
                <strong>{project.title}</strong>
              </span>
              <ChevronDown size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="project-switcher-menu"
              aria-label={L('切换项目', 'Switch project')}
            >
              {error && <output>{error}</output>}
              {projects.map((value) => (
                <DropdownMenuItem
                  key={value.id}
                  onClick={() => go(() => onProject(value))}
                >
                  <FolderOpen size={16} />
                  <span>{value.title}</span>
                  {value.id === project.id && <span aria-hidden>✓</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => go(onProjects)}>
                {L('查看所有项目', 'View all projects')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SidebarMenu>
            {item(
              'overview',
              L('项目概览', 'Overview'),
              active === 'overview',
              () => onSection('overview'),
            )}
          </SidebarMenu>
          {[
            { id: 'sources', zh: '研究材料', en: 'SOURCES' },
            { id: 'writing', zh: '解读与写作', en: 'READING & WRITING' },
            { id: 'research', zh: '研究与协作', en: 'RESEARCH & PEOPLE' },
            { id: 'manage', zh: '项目管理', en: 'PROJECT TOOLS' },
          ].map((group) => (
            <section className="nav-section" key={group.id}>
              <button
                className="nav-section-heading"
                aria-expanded={!!expanded[group.id]}
                aria-controls={`nav-${group.id}`}
                onClick={() =>
                  setExpanded((value) => ({
                    ...value,
                    [group.id]: !value[group.id],
                  }))
                }
              >
                <span>{L(group.zh, group.en)}</span>
                {expanded[group.id] ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )}
              </button>
              <div id={`nav-${group.id}`} hidden={!expanded[group.id]}>
                <SidebarMenu>
                  {projectSections
                    .filter((section) => section.group === group.id)
                    .map((section) =>
                      item(
                        section.id,
                        L(section.zh, section.en),
                        active === section.id,
                        () => onSection(section.id),
                      ),
                    )}
                </SidebarMenu>
              </div>
            </section>
          ))}
        </>
      )}
    </nav>
  );
}
