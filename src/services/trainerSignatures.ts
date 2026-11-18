import { isSupabaseConfigured, supabase } from '../lib/supabase';

const storageKey = 'koruna_trainer_signatures';

export async function getTrainerSignature(profileId: string, trainerName?: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return JSON.parse(localStorage.getItem(storageKey) || '{}')[profileId] || null;
  if (trainerName !== undefined) {
    if (!trainerName.trim()) return null;
    // Learners cannot read another trainer's profile under RLS. The checked
    // RPC uses the course creator ID as the signature authority; display names
    // can change after a course has been published.
    const { data, error } = await supabase.rpc('get_trainer_signature', {
      p_profile_id: profileId, p_trainer_name: trainerName,
    });
    if (error) {
      if (['42883','PGRST202','PGRST205'].includes(error.code || '')) {
        throw new Error('Certificate signatures are not set up yet. Apply the certificate signature lookup migration.');
      }
      throw new Error('Unable to load trainer signature.');
    }
    return typeof data === 'string' ? data : null;
  }
  const { data, error } = await supabase.from('trainer_signatures').select('image').eq('profile_id', profileId).maybeSingle();
  if (error) throw new Error('Unable to load trainer signature.');
  return data?.image || null;
}

export async function saveTrainerSignature(profileId: string, image: string | null): Promise<void> {
  if (image && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 700000)) {
    throw new Error('Choose a PNG, JPEG, or WebP signature smaller than 500 KB.');
  }
  if (!isSupabaseConfigured()) {
    const signatures = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (image) signatures[profileId] = image;
    else delete signatures[profileId];
    localStorage.setItem(storageKey, JSON.stringify(signatures));
    return;
  }
  const { error } = image
    ? await supabase.from('trainer_signatures').upsert({ profile_id: profileId, image })
    : await supabase.from('trainer_signatures').delete().eq('profile_id', profileId);
  if (error) throw new Error('Unable to save trainer signature. Check that the signature migration has been applied and you are an administrator.');
}

export async function readSignatureFile(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 500 * 1024) {
    throw new Error('Choose a PNG, JPEG, or WebP signature smaller than 500 KB.');
  }
  const image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read signature file.'));
    reader.readAsDataURL(file);
  });
  const preview = new Image();
  preview.src = image;
  await preview.decode().catch(() => { throw new Error('This image could not be opened. Choose another signature file.'); });
  return image;
}
