import { supabase } from '@/integrations/supabase/client';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_COMPRESS_THRESHOLD = 1 * 1024 * 1024;
const IMAGE_TARGET_BYTES = 1 * 1024 * 1024;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image-load-failed'));
    };
    img.src = url;
  });

const canvasToFile = (canvas: HTMLCanvasElement, type: string, quality: number, name: string) =>
  new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('image-compress-failed'));
          return;
        }
        resolve(new File([blob], name, { type: blob.type }));
      },
      type,
      quality
    );
  });

const compressImage = async (file: File): Promise<File | null> => {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let scale = 1;
  let quality = 0.9;
  let outputType = file.type;
  if (outputType === 'image/png') {
    outputType = 'image/png';
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let candidate = await canvasToFile(canvas, outputType, quality, file.name);
    if (candidate.size <= IMAGE_TARGET_BYTES) return candidate;

    quality = Math.max(0.5, quality - 0.15);
    if (quality <= 0.6) {
      scale *= 0.85;
    }
    if (candidate.size <= MAX_FILE_BYTES) {
      return candidate;
    }
  }
  return null;
};

const ensureFileSize = async (file: File): Promise<File | null> => {
  if (!file.type.startsWith('image/')) {
    return file.size <= MAX_FILE_BYTES ? file : null;
  }

  if (file.size <= IMAGE_COMPRESS_THRESHOLD) {
    return file.size <= MAX_FILE_BYTES ? file : null;
  }

  const compressed = await compressImage(file);
  if (!compressed) return null;
  return compressed.size <= MAX_FILE_BYTES ? compressed : null;
};

export async function uploadFile(
  file: File,
  folder: string = 'general'
): Promise<string | null> {
  const normalized = await ensureFileSize(file);
  if (!normalized) {
    console.error('File too large:', { bytes: file.size });
    return null;
  }
  const ext = normalized.name.split('.').pop();
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
  
  const { data, error } = await supabase.storage
    .from('uploads')
    .upload(fileName, normalized, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('uploads')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

export async function deleteFile(url: string): Promise<boolean> {
  // Extract path from URL
  const match = url.match(/\/uploads\/(.+)$/);
  if (!match) return false;

  const path = match[1];
  const { error } = await supabase.storage
    .from('uploads')
    .remove([path]);

  return !error;
}
