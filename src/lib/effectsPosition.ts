import type { ImageSize } from '@/lib/imageSize';

export function getDisplaySize(params: {
  size: ImageSize;
  baseWidth: number;
  baseHeight: number;
  scale: number;
}) {
  const { size, baseWidth, baseHeight, scale } = params;
  const fitScale = Math.min(1, baseWidth / size.width, baseHeight / size.height);
  return {
    width: size.width * fitScale * scale,
    height: size.height * fitScale * scale,
  };
}

export function convertCenterRelToTopLeftRel(params: {
  x: number;
  y: number;
  scale: number;
  size: ImageSize;
  baseWidth: number;
  baseHeight: number;
}) {
  const { x, y, scale, size, baseWidth, baseHeight } = params;
  const display = getDisplaySize({ size, baseWidth, baseHeight, scale });
  const centerX = baseWidth / 2 + x * baseWidth;
  const centerY = baseHeight / 2 + y * baseHeight;
  return {
    x: (centerX - display.width / 2) / baseWidth,
    y: (centerY - display.height / 2) / baseHeight,
  };
}
