import { supabase } from '@/integrations/supabase/client';

export async function uploadFile(
  file: File,
  folder: string = 'general'
): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
  
  const { data, error } = await supabase.storage
    .from('uploads')
    .upload(fileName, file, {
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
