import { WorkbenchStore } from './workbench-store';
import { footnote } from './bibliography';
import { sourcePath } from './navigation';
import { writingCitationKey, type WritingCitation } from './writing-export';
import type { Evidence, Source, SourceVersion } from './types';
import type { ResearchStore } from './store';
export async function writingSources(
  store: ResearchStore,
  projectId: string,
  origin: string,
  pageReferences = new Set<string>(),
) {
  const snapshot = await store.readProject(projectId),
    work = await new WorkbenchStore(store.db, store.owner).workbench(projectId);
  const citations: WritingCitation[] = (snapshot.evidence as Evidence[]).map(
    (e) => {
      const source = (snapshot.sources as Source[]).find(
          (s) => s.id === e.source_id,
        ),
        version = (snapshot.source_versions as SourceVersion[]).find(
          (v) => v.id === e.version_id,
        ),
        entry = work.bibliography.find((b) => b.source_id === e.source_id);
      return {
        id: e.id,
        label: `${source?.title || 'Source'} · ${e.page}`,
        text: `${entry ? footnote(entry, '').trim() : `${source?.title || 'Source'}.`} “${e.quote}” (Canwoo version ${version?.revision || '?'}; file page ${e.page}; ${e.version_id})`,
        href: origin + sourcePath(projectId, e.version_id, e.page),
        stale: (snapshot.source_versions as SourceVersion[]).some(
          (v) =>
            v.source_id === e.source_id &&
            v.revision > (version?.revision || 0),
        ),
      };
    },
  );
  // Only authenticated project pages requested by the document can become
  // source footnotes. Page links do not invent a saved quotation/evidence item.
  for (const version of snapshot.source_versions as SourceVersion[]) {
    const source = (snapshot.sources as Source[]).find(
      (s) => s.id === version.source_id,
    );
    if (!source) continue;
    const entry = work.bibliography.find((b) => b.source_id === source.id);
    for (const page of version.pages) {
      const href = origin + sourcePath(projectId, version.id, page.page);
      const id = writingCitationKey(href, origin)!;
      if (!pageReferences.has(id)) continue;
      citations.push({
        id,
        href,
        label: `${source.title} · ${page.page}`,
        text: `${entry ? footnote(entry, '').trim() : `${source.title}.`} (Canwoo version ${version.revision}; file page ${page.page}; ${version.id})`,
        stale: (snapshot.source_versions as SourceVersion[]).some(
          (v) => v.source_id === source.id && v.revision > version.revision,
        ),
      });
    }
  }
  return {
    citations,
    evidence: snapshot.evidence,
    claims: work.claims,
    links: work.claim_evidence,
  };
}
