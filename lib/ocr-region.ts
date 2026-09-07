import { regionInput } from './workbench-inputs';
import type { Region } from './workbench-types';

export function cropBounds(
  width: number,
  height: number,
  region?: Region | null,
) {
  const r = regionInput.parse(region || { x: 0, y: 0, width: 1, height: 1 });
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    r.x >= 1 ||
    r.y >= 1
  )
    throw new Error('无效的图像区域。');
  const x = Math.floor(r.x * width),
    y = Math.floor(r.y * height);
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.ceil(r.width * width))),
    height: Math.max(1, Math.min(height - y, Math.ceil(r.height * height))),
  };
}
