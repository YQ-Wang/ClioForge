import { Unzip, UnzipInflate } from 'fflate';
import {
  checkManifest,
  packageManifest,
  packageMetadata,
  MAX_METADATA_BYTES,
  MAX_PACKAGE_BYTES,
} from './backup-format';
import { MAX_FILE_BYTES } from './files';
import { sha256 } from './platform/search';
export async function readBackup(
  file: File,
  onProgress: (bytes: number) => void = () => {},
) {
  if (file.size > MAX_PACKAGE_BYTES + 1024 * 1024)
    throw new Error('备份超过 512 MB。');
  const entries = new Map<string, Blob>(),
    names = new Set<string>();
  let error: Error | null = null,
    total = 0,
    open = 0;
  const unzip = new Unzip((entry) => {
    if (
      names.has(entry.name) ||
      names.size >= 502 ||
      !/^(manifest\.json|project\.json|originals\/[a-f0-9-]{36}\.(pdf|txt|md|png|jpg|webp))$/.test(
        entry.name,
      )
    ) {
      error = new Error('备份包含重复或无效的文件路径。');
      entry.terminate();
      return;
    }
    names.add(entry.name);
    open++;
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let bytes = 0;
    const max =
      entry.name === 'project.json'
        ? MAX_METADATA_BYTES
        : entry.name === 'manifest.json'
          ? 1024 * 1024
          : MAX_FILE_BYTES;
    entry.ondata = (err, chunk, final) => {
      if (err) {
        error = err;
        return;
      }
      bytes += chunk.byteLength;
      total += chunk.byteLength;
      if (bytes > max || total > MAX_PACKAGE_BYTES) {
        error = new Error(
          '备份解压后超过允许大小（项目记录 8 MB、单份原件 20 MB）。',
        );
        entry.terminate();
        return;
      }
      chunks.push(new Uint8Array(chunk));
      if (final) {
        entries.set(entry.name, new Blob(chunks));
        open--;
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  const reader = file.stream().getReader();
  let consumed = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        unzip.push(new Uint8Array(), true);
        break;
      }
      consumed += next.value.length;
      unzip.push(next.value);
      if (error) throw error;
      onProgress(consumed);
    }
    if (error) throw error;
    if (open) throw new Error('备份文件被截断。');
  } finally {
    await reader.cancel();
  }
  const manifest = packageManifest.parse(
    JSON.parse((await entries.get('manifest.json')?.text()) || 'null'),
  );
  checkManifest(manifest);
  if (entries.size !== manifest.files.length + 1)
    throw new Error('备份文件数量与清单不匹配。');
  for (const item of manifest.files) {
    const blob = entries.get(item.path);
    if (
      !blob ||
      blob.size !== item.bytes ||
      (await sha256(new Uint8Array(await blob.arrayBuffer()))) !== item.sha256
    )
      throw new Error('备份校验失败。请重新下载备份后重试。');
  }
  const metadataText = await entries.get('project.json')!.text();
  const metadata = packageMetadata.parse(JSON.parse(metadataText));
  return { entries, manifest, metadataText, metadata };
}
