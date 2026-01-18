export type StageRect = { x: number; y: number; width: number; height: number };

export function fitRectContain(
  containerWidth: number,
  containerHeight: number,
  ratio = 16 / 9
): StageRect {
  if (!containerWidth || !containerHeight) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const width = Math.min(containerWidth, containerHeight * ratio);
  const height = width / ratio;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}
