'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArchiveRestore,
  Folder,
  FolderPlus,
  Loader2,
  Search,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/client-api';
import type { Source, SourceGroup, SourceOrganization } from '@/lib/types';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ManagementData = {
  sources: Source[];
  groups: SourceGroup[];
  organization: SourceOrganization[];
};

export default function SourceManagement({
  projectId,
  role,
  onSourcesChanged,
}: {
  projectId: string;
  role: string;
  onSourcesChanged: () => Promise<unknown> | void;
}) {
  const { locale } = useI18n();
  const L = useCallback(
    (zh: string, en: string) => (locale === 'en' ? en : zh),
    [locale],
  );
  const [data, setData] = useState<ManagementData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [targetGroup, setTargetGroup] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canWrite = ['owner', 'editor', 'reviewer'].includes(role);
  const isOwner = role === 'owner';

  const load = useCallback(async () => {
    setError('');
    try {
      setData(
        await api<ManagementData>(
          `/api/workspace?project_id=${encodeURIComponent(projectId)}&source_management=1`,
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : L('无法读取资料管理信息。', 'Could not load source management.'),
      );
    }
  }, [projectId, L]);
  useEffect(() => void load(), [load]);

  const organization = useMemo(
    () =>
      new Map(data?.organization.map((item) => [item.source_id, item]) || []),
    [data],
  );
  const filtered = (data?.sources || []).filter((source) => {
    const trashed = !!organization.get(source.id)?.trashed_at;
    return (
      trashed === showTrash &&
      source.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    );
  });
  const groups = [
    { id: '', name: L('未分组', 'Ungrouped') },
    ...(data?.groups || []),
  ];

  async function mutate(body: Record<string, unknown>, refreshSources = false) {
    setBusy(true);
    setError('');
    try {
      await api('/api/workspace', body);
      setSelected(new Set());
      await load();
      if (refreshSources) await onSourcesChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : L('操作失败。', 'Action failed.'),
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!data && !error)
    return (
      <div className="source-management-loading">
        <Loader2 className="animate-spin" size={18} />
        {L('正在读取资料…', 'Loading sources…')}
      </div>
    );

  return (
    <div className="source-management">
      <header className="source-management-header">
        <div>
          <h1>{L('资料管理', 'Source management')}</h1>
          <p>
            {L(
              '建立分组、批量移动或清理未使用的资料。回收站中的资料不会进入阅读列表或代理检索。',
              'Create groups, move sources in bulk, or clean up unused material. Trashed sources are excluded from reading and agent search.',
            )}
          </p>
        </div>
        <div className="source-management-tabs">
          <Button
            variant={showTrash ? 'outline' : 'secondary'}
            onClick={() => {
              setShowTrash(false);
              setSelected(new Set());
            }}
          >
            <Folder size={16} />
            {L('资料', 'Sources')}
          </Button>
          <Button
            variant={showTrash ? 'secondary' : 'outline'}
            onClick={() => {
              setShowTrash(true);
              setSelected(new Set());
            }}
          >
            <Trash2 size={16} />
            {L('回收站', 'Trash')}
          </Button>
        </div>
      </header>

      {error && (
        <p role="alert" className="source-management-error">
          {error}
        </p>
      )}

      {!showTrash && canWrite && (
        <form
          className="source-group-create"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newGroup.trim()) return;
            void mutate({
              action: 'create_source_group',
              project_id: projectId,
              name: newGroup,
            })
              .then(() => setNewGroup(''))
              .catch(() => {});
          }}
        >
          <Input
            value={newGroup}
            onChange={(event) => setNewGroup(event.target.value)}
            maxLength={100}
            placeholder={L('新分组名称', 'New group name')}
            aria-label={L('新分组名称', 'New group name')}
          />
          <Button type="submit" variant="outline" disabled={busy}>
            <FolderPlus size={16} />
            {L('建立分组', 'Create group')}
          </Button>
        </form>
      )}

      <div className="source-management-filter">
        <div className="source-management-search">
          <Search size={16} />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={L('搜索资料标题', 'Search source titles')}
            aria-label={L('搜索资料标题', 'Search source titles')}
          />
        </div>
        {!!filtered.length && (
          <Button
            variant="ghost"
            onClick={() => {
              const allSelected = filtered.every((source) =>
                selected.has(source.id),
              );
              setSelected((current) => {
                const next = new Set(current);
                for (const source of filtered)
                  if (allSelected) next.delete(source.id);
                  else next.add(source.id);
                return next;
              });
            }}
          >
            {filtered.every((source) => selected.has(source.id))
              ? L('取消全选', 'Clear selection')
              : L('选择当前全部资料', 'Select all shown')}
          </Button>
        )}
      </div>

      {!!selected.size && (
        <div className="source-bulk-actions">
          <strong>
            {L(`已选择 ${selected.size} 份资料`, `${selected.size} selected`)}
          </strong>
          {!showTrash && canWrite && (
            <>
              <NativeSelect
                aria-label={L('目标分组', 'Destination group')}
                value={targetGroup}
                onChange={(event) => setTargetGroup(event.target.value)}
              >
                {groups.map((group) => (
                  <NativeSelectOption key={group.id || 'none'} value={group.id}>
                    {group.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void mutate({
                    action: 'move_sources',
                    project_id: projectId,
                    source_ids: [...selected],
                    group_id: targetGroup || null,
                  }).catch(() => {})
                }
              >
                {L('移动', 'Move')}
              </Button>
            </>
          )}
          {!showTrash && isOwner && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={16} />
              {L('删除', 'Delete')}
            </Button>
          )}
          {showTrash && isOwner && (
            <Button
              disabled={busy}
              onClick={() =>
                void mutate(
                  {
                    action: 'restore_sources',
                    project_id: projectId,
                    source_ids: [...selected],
                  },
                  true,
                ).catch(() => {})
              }
            >
              <ArchiveRestore size={16} />
              {L('恢复', 'Restore')}
            </Button>
          )}
        </div>
      )}

      {showTrash ? (
        <SourceGroupBlock
          title={L('回收站', 'Trash')}
          sources={filtered}
          selected={selected}
          onToggle={toggle}
          empty={L('回收站为空。', 'Trash is empty.')}
        />
      ) : (
        <div className="source-group-grid">
          {groups.map((group) => {
            const sources = filtered.filter(
              (source) =>
                (organization.get(source.id)?.group_id || '') === group.id,
            );
            if (search && !sources.length) return null;
            return (
              <SourceGroupBlock
                key={group.id || 'none'}
                title={group.name}
                sources={sources}
                selected={selected}
                onToggle={toggle}
                empty={L('此分组还没有资料。', 'No sources in this group.')}
                onDelete={
                  group.id && canWrite
                    ? () => {
                        if (
                          !window.confirm(
                            L(
                              `删除分组“${group.name}”？其中资料会移到“未分组”。`,
                              `Delete “${group.name}”? Its sources will become ungrouped.`,
                            ),
                          )
                        )
                          return;
                        void mutate({
                          action: 'delete_source_group',
                          project_id: projectId,
                          group_id: group.id,
                        }).catch(() => {});
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}

      {!isOwner && (
        <p className="source-management-hint">
          {L(
            '只有项目负责人可以删除或恢复资料。',
            'Only the project owner can delete or restore sources.',
          )}
        </p>
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setConfirmation('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {L('将资料移入回收站？', 'Move sources to Trash?')}
            </DialogTitle>
            <DialogDescription>
              {L(
                '资料将从阅读列表和代理检索中消失，但原件与版本仍会保留并可恢复。已被证据、书目或研究任务引用的资料不会被删除。输入 DELETE 继续。',
                'The sources will disappear from reading and agent search, while originals and versions remain recoverable. Sources used by evidence, bibliography, or research tasks cannot be deleted. Type DELETE to continue.',
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            aria-label={L('输入 DELETE 确认', 'Type DELETE to confirm')}
            placeholder="DELETE"
          />
          <div className="source-delete-actions">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {L('取消', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || confirmation !== 'DELETE'}
              onClick={() =>
                void mutate(
                  {
                    action: 'trash_sources',
                    project_id: projectId,
                    source_ids: [...selected],
                    confirm: confirmation,
                  },
                  true,
                )
                  .then(() => setDeleteOpen(false))
                  .catch(() => {})
              }
            >
              {busy && <Loader2 className="animate-spin" size={16} />}
              {L('移入回收站', 'Move to Trash')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SourceGroupBlock({
  title,
  sources,
  selected,
  onToggle,
  empty,
  onDelete,
}: {
  title: string;
  sources: Source[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
  onDelete?: () => void;
}) {
  return (
    <section className="source-group-card">
      <header>
        <span>
          <Folder size={17} />
          <strong>{title}</strong>
          <small>{sources.length}</small>
        </span>
        {onDelete && (
          <Button variant="ghost" size="icon-sm" onClick={onDelete}>
            <Trash2 size={15} />
            <span className="sr-only">Delete group</span>
          </Button>
        )}
      </header>
      {sources.map((source) => (
        <label
          className="source-manage-row"
          key={source.id}
          aria-label={source.title}
        >
          <input
            type="checkbox"
            checked={selected.has(source.id)}
            onChange={() => onToggle(source.id)}
          />
          <span>
            <strong>{source.title}</strong>
            <small>{source.media_type}</small>
          </span>
        </label>
      ))}
      {!sources.length && <p>{empty}</p>}
    </section>
  );
}
