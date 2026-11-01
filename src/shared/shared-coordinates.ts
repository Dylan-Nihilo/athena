/** Map a letterboxed image in CSS pixels into the authoritative page's CSS viewport. */
export function sharedPoint(
  x: number,
  y: number,
  bounds: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
) {
  const scale = Math.min(bounds.width / viewport.width, bounds.height / viewport.height);
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  const left = bounds.left + (bounds.width - viewport.width * scale) / 2;
  const top = bounds.top + (bounds.height - viewport.height * scale) / 2;
  const px = (x - left) / scale,
    py = (y - top) / scale;
  if (px < 0 || py < 0 || px > viewport.width || py > viewport.height) return undefined;
  return { x: px, y: py, scale };
}
