import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';
import type { Profile } from './types';

/** Update the caller's own profile row. RLS restricts writes to the owner. */
export async function updateProfile(
  profileId: string,
  fields: Partial<Profile>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').update(fields).eq('id', profileId);
  return { error: error?.message ?? null };
}

/**
 * Resize a locally-picked photo to a 512×512 JPEG and upload it to the
 * `avatars` storage bucket at `<userId>/avatar.jpg` (owner-scoped write,
 * public read). Returns the public URL with a cache-busting version param so
 * clients re-fetch after each change.
 *
 * Degrades gracefully: if the bucket hasn't been created yet the user sees a
 * clear message instead of a raw storage error.
 */
export async function uploadAvatar(
  userId: string,
  localUri: string,
): Promise<{ url: string | null; error: string | null }> {
  try {
    // Square-crop happens in the picker (aspect [1,1]); here we just downscale.
    const context = ImageManipulator.manipulate(localUri);
    context.resize({ width: 512, height: 512 });
    const image = await context.renderAsync();
    const resized = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });

    // React Native can't upload a File/Blob directly — pass an ArrayBuffer.
    const response = await fetch(resized.uri);
    const body = await response.arrayBuffer();

    const path = `${userId}/avatar.jpg`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, body, {
      upsert: true,
      contentType: 'image/jpeg',
    });

    if (uploadError) {
      if (/bucket/i.test(uploadError.message)) {
        return { url: null, error: 'Photo uploads aren’t set up yet. Try again later.' };
      }
      return { url: null, error: 'Couldn’t upload your photo. Please try again.' };
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // The path is stable, so bust image caches with a version param.
    return { url: `${data.publicUrl}?v=${Date.now()}`, error: null };
  } catch {
    return { url: null, error: 'Couldn’t process that photo. Try a different one.' };
  }
}
