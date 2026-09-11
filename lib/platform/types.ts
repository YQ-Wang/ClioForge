import { z } from 'zod';
import { thinkingEffort } from '../model-routing';
export const taskKinds = [
  'search',
  'extract',
  'compare',
  'counter',
  'verify',
  'review',
  'publish',
  'compute',
  'ocr',
  'manual',
] as const;
export const taskStates = [
  'blocked',
  'ready',
  'queued',
  'running',
  'succeeded',
  'review',
  'accepted',
  'rejected',
  'failed',
  'uncertain',
  'cancelled',
  'stale',
] as const;
export type TaskState = (typeof taskStates)[number];
export const citationSchema = z.object({
  version_id: z.uuid(),
  page: z.number().int().positive(),
  quote: z.string().min(1).max(10000),
  start: z.number().int().nonnegative().optional(),
});
export const resultSchema = z.object({
  summary: z.string().max(100000),
  citations: z.array(citationSchema).max(100).default([]),
  data: z.unknown().optional(),
  checks: z
    .array(
      z.object({ name: z.string(), passed: z.boolean(), detail: z.string() }),
    )
    .max(100)
    .default([]),
});
export const taskInputSchema = z.object({
  page_refs: z
    .array(
      z.object({ version_id: z.uuid(), page: z.number().int().positive() }),
    )
    .min(1)
    .max(100)
    .optional(),
  effort: thinkingEffort.optional(),
  version_ids: z.array(z.uuid()).max(100).default([]),
  query: z.string().max(2000).default(''),
  prompt: z.string().max(12000).default(''),
  locale: z.enum(['zh-CN', 'en']).default('zh-CN'),
  model_id: z.uuid().optional(),
  input_rate: z.number().min(0).max(10000).default(0),
  output_rate: z.number().min(0).max(10000).default(0),
  max_output: z.number().int().min(64).default(16384),
  parameters: z.record(z.string(), z.unknown()).default({}),
});
export const taskDraftSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  kind: z.enum(taskKinds),
  executor: z.enum(['builtin', 'model', 'external', 'human']),
  assignee: z.string().max(150).default(''),
  dependencies: z.array(z.uuid()).max(30).default([]),
  input: taskInputSchema,
});
export const missionDraftSchema = z.object({
  title: z.string().min(1).max(200),
  question: z.string().min(1).max(10000),
  scope: z.string().max(10000),
  acceptance: z.string().min(1).max(10000),
  tasks: z.array(taskDraftSchema).min(1).max(1200),
});
export type TaskInput = z.infer<typeof taskInputSchema>;
export type TaskResult = z.infer<typeof resultSchema>;
export type TaskDraft = z.infer<typeof taskDraftSchema>;
export type MissionDraft = z.infer<typeof missionDraftSchema>;
export type Mission = {
  id: string;
  project_id: string;
  title: string;
  question: string;
  scope: string;
  acceptance: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  created_by: string;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type MissionTask = {
  failure_stage?: string | null;
  board_stage?: 'planned' | 'active' | 'waiting';
  id: string;
  mission_id: string;
  project_id: string;
  title: string;
  kind: (typeof taskKinds)[number];
  executor: TaskDraft['executor'];
  assignee: string;
  status: TaskState;
  input: TaskInput;
  result: TaskResult | null;
  error: string | null;
  attempt: number;
  lease_until: string | null;
  claimed_by: string | null;
  cost_units: number;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type TaskEdge = {
  task_id: string;
  depends_on: string;
  mission_id: string;
};
export type TaskEvent = {
  id: number;
  task_id: string | null;
  mission_id: string;
  actor: string;
  kind: string;
  detail: string;
  created_at: string;
};
export type Artifact = {
  id: string;
  project_id: string;
  mission_id: string | null;
  task_id: string | null;
  title: string;
  kind: string;
  body: TaskResult;
  source_versions: string[];
  sha256: string;
  license: string;
  created_by: string;
  derived_from: string | null;
  supersedes: string | null;
  created_at: string;
};
export type MissionView = {
  board?: {
    revision: number;
    order: string[];
    stages: Record<
      string,
      { stage: 'planned' | 'active' | 'waiting'; revision: number }
    >;
  };
  mission: Mission;
  tasks: MissionTask[];
  edges: TaskEdge[];
  events: TaskEvent[];
  artifacts: Artifact[];
  role: string;
  corrections?: TaskCorrection[];
  evaluations?: import('./evaluation').Evaluation[];
};
export type TaskCorrection = {
  id: string;
  task_id: string;
  reason: string;
  actor: string;
  created_at: string;
  body: { before: TaskResult | null; after: TaskResult };
};
export function validateGraph(tasks: TaskDraft[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (byId.size !== tasks.length) throw new Error('Duplicate task ID');
  const visited = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw new Error('Task dependencies contain a cycle');
    if (visited.has(id)) return;
    const task = byId.get(id);
    if (!task) throw new Error('Unknown task dependency');
    active.add(id);
    for (const dependency of task.dependencies) visit(dependency);
    active.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);
}
export function graphLevels(
  tasks: Pick<MissionTask, 'id'>[],
  edges: TaskEdge[],
) {
  const levels = new Map<string, number>(),
    active = new Set<string>();
  const level = (id: string): number => {
    if (levels.has(id)) return levels.get(id)!;
    if (active.has(id)) return 0;
    active.add(id);
    const parents = edges.filter((edge) => edge.task_id === id);
    const value = parents.length
      ? 1 + Math.max(...parents.map((edge) => level(edge.depends_on)))
      : 0;
    active.delete(id);
    levels.set(id, value);
    return value;
  };
  for (const task of tasks) level(task.id);
  return levels;
}
