import { z } from 'zod';
import { richDocumentString } from './rich-document';
import { thinkingEffort } from './model-routing';
import { regionInput } from './workbench-inputs';
const uuid = z.uuid();
export const modelInput = z.object({
  label: z.string().min(1).max(100),
  provider: z.enum([
    'openai',
    'anthropic',
    'google',
    'openrouter',
    'fireworks',
  ]),
  model_id: z.string().min(1).max(150),
  key: z.string().min(1).max(4000),
  vision: z.boolean().optional(),
});
export const deleteModelInput = z.object({ id: uuid });
export const researchInput = z.object({
  region: regionInput.optional(),
  reuse_completed: z.boolean().default(false),
  locale: z.enum(['zh-CN', 'en']).default('zh-CN'),
  effort: thinkingEffort.optional(),
  id: uuid,
  project_id: uuid,
  model_id: uuid,
  version_ids: z.array(uuid).min(1).max(10),
  kind: z.enum(['analysis', 'ocr']).default('analysis'),
  prompt: z.string().min(1).max(4000),
  image: z.string().max(7900000).optional(),
  page: z.number().int().positive().max(500).optional(),
});
export const workspaceInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_source_group'),
    project_id: uuid,
    name: z.string().trim().min(1).max(100),
  }),
  z.object({
    action: z.literal('move_sources'),
    project_id: uuid,
    source_ids: z.array(uuid).min(1).max(100),
    group_id: uuid.nullable(),
  }),
  z.object({
    action: z.literal('delete_source_group'),
    project_id: uuid,
    group_id: uuid,
  }),
  z.object({
    action: z.literal('trash_sources'),
    project_id: uuid,
    source_ids: z.array(uuid).min(1).max(100),
    confirm: z.literal('DELETE'),
  }),
  z.object({
    action: z.literal('restore_sources'),
    project_id: uuid,
    source_ids: z.array(uuid).min(1).max(100),
  }),
  z.object({
    action: z.literal('update_project'),
    id: uuid,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10000),
    expected_title: z.string().max(200),
    expected_description: z.string().max(10000),
  }),
  z.object({
    action: z.literal('set_note_state'),
    p_project: uuid,
    p_note: uuid,
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('create_project'),
    title: z.string().min(1).max(200),
    description: z.string().max(10000).default(''),
  }),
  z.object({
    action: z.literal('import_source'),
    p_id: uuid,
    p_project: uuid,
    p_title: z.string().min(1).max(300),
    p_path: z.string().max(2048),
    p_type: z.string().max(50),
    p_pages: z.unknown(),
  }),
  z.object({
    action: z.literal('revise_source'),
    p_source: uuid,
    p_expected: z.number().int().positive(),
    p_pages: z.unknown(),
    p_method: z.enum(['manual', 'ocr-reviewed', 'restore']),
  }),
  z.object({
    action: z.literal('save_note'),
    p_id: uuid.optional(),
    p_project: uuid,
    p_parent: uuid.nullable(),
    p_title: z.string().min(1).max(200),
    p_body: z.string().max(100000),
    p_document: richDocumentString.nullable().optional(),
  }),
  z.object({
    action: z.literal('add_evidence'),
    p_start: z.number().int().min(0).optional(),
    p_region: regionInput.nullable().optional(),
    p_version: uuid,
    p_page: z.number().int().positive(),
    p_quote: z.string().min(1).max(10000),
    p_question: z.string().min(1).max(2000),
    p_interpretation: z.string().max(10000),
    p_relation: z.enum(['supports', 'challenges', 'context']),
  }),
]);
