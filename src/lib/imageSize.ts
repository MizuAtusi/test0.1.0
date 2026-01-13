export type ImageSize = { width: number; height: number };

const cache = new Map<string, Promise<ImageSize | null>>();

export function getImageSize(url: string): Promise<ImageSize | null> {
  if (!url) return Promise.resolve(null);
  const cached = cache.get(url);
  if (cached) return cached;
  const promise = new Promise<ImageSize | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
  cache.set(url, promise);
  return promise;
}
