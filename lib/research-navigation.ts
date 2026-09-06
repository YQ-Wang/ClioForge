import { projectPath } from './navigation';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export type TaskViewMode = 'list' | 'board' | 'flow';
export function researchRoute(search: string, projectId: string) {
  const params = new URLSearchParams(search);
  const belongs =
    params.get('project') === projectId && params.get('tab') === 'platform';
  const mission = params.get('mission') || '';
  const task = params.get('task') || '';
  const mode = params.get('tasks');
  return {
    mission: belongs && uuid.test(mission) ? mission : '',
    task: belongs && uuid.test(mission) && uuid.test(task) ? task : '',
    mode: (mode === 'board' || mode === 'flow' ? mode : 'list') as TaskViewMode,
  };
}
export function missionPath(
  projectId: string,
  mission = '',
  task = '',
  mode: TaskViewMode = 'list',
) {
  const url = new URL(
    projectPath(projectId, 'platform'),
    'https://canwoo.invalid',
  );
  if (uuid.test(mission)) {
    url.searchParams.set('mission', mission);
    if (uuid.test(task)) url.searchParams.set('task', task);
  }
  if (mode !== 'list') url.searchParams.set('tasks', mode);
  return url.pathname + url.search;
}
