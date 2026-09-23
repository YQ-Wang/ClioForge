import { z } from 'zod';
import { cslInput } from './workbench-inputs';

export const candidateSchema = z.object({
  id: z.string().max(1000),
  title: z.string().max(2000),
  url: z
    .string()
    .max(2000)
    .refine((v) => v.startsWith('/?project=') || /^https:\/\//i.test(v)),
  access: z.enum(['project_text', 'catalog_only']),
  detail: z.string().max(4000),
  saved_to_bibliography: z.boolean().optional(),
  match_score: z.number().min(0).max(1).optional(),
  matched_terms: z.array(z.string()).optional(),
  catalogs: z.array(z.string()).optional(),
  matched_queries: z.array(z.string()).optional(),
  csl: cslInput.optional(),
  fulltext_url: z.url().optional(),
  license: z.string().max(500).optional(),
});
export type Candidate = z.infer<typeof candidateSchema>;
export type Catalog = 'crossref' | 'openalex' | 'loc' | 'exa';
export type CatalogResult = {
  candidates: Candidate[];
  status:
    | 'completed'
    | 'unavailable'
    | 'rate_limited'
    | 'budget_exhausted'
    | 'uncertain';
  cached?: boolean;
};
