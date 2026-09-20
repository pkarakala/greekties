import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';
import type { Profile } from './types';
import { geocodeCity } from './geocode';

export type EditableProfileFields = Partial<
  Pick<
    Profile,
    | 'name'
    | 'class_year'
    | 'role'
    | 'industry'
    | 'company'
    | 'job_title'
    | 'linkedin_url'
    | 'bio'
    | 'open_to_mentor'
    | 'is_hiring'
    | 'avatar_url'
  >
>;

/** Update the caller's own profile row. RLS restricts writes to the owner. */
export async function updateProfile(
  profileId: string,
  fields: EditableProfileFields,
): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(fields)
      .eq('id', profileId)
      .select('id')
      .single();
    return { error: error?.message ?? (data ? null : 'Profile was not saved.') };
  } catch {
    return { error: 'Couldn’t save your profile. Please try again.' };
  }
}

/** Clear the old pin durably before lookup; never fall back to direct coordinates. */
export async function saveProfileWithMap(
  profile: Profile,
  fields: EditableProfileFields,
  city: string,
  sharing: boolean,
  isCurrent: () => boolean = () => true,
): Promise<{ error: string | null; revision?: string }> {
  const trimmedCity = city.trim();
  let revision: string | null = null;
  let locationError: string | null = null;
  try {
    if (!profile.map_revision || typeof profile.map_sharing_enabled !== 'boolean') {
      locationError =
        'City and map settings could not be saved because map privacy controls are unavailable. Try again after the app service is updated.';
    } else {
      const { data, error } = await supabase.rpc('set_profile_map_sharing', {
        target_profile_id: profile.id,
        expected_revision: profile.map_revision,
        profile_city: trimmedCity || null,
        sharing_enabled: sharing && !!trimmedCity,
      });
      if (error || typeof data !== 'string') {
        locationError =
          'City and map settings could not be confirmed. Your previous map setting may still be in effect. Close and reopen Edit profile before trying again.';
      } else revision = data;
    }
  } catch {
    locationError =
      'City and map settings could not be confirmed. Your previous map setting may still be in effect. Close and reopen Edit profile before trying again.';
  }

  // Independent valid edits survive a failed lookup or unavailable consent API.
  const { error: profileError } = await updateProfile(profile.id, fields);
  if (profileError)
    return {
      revision: revision ?? undefined,
      error: [
        locationError ?? 'City and map settings saved; the previous pin was removed.',
        'Other profile edits could not be saved. Please try again.',
      ].join(' '),
    };
  if (locationError || !revision) return { error: `Other profile edits saved. ${locationError}` };
  if (!isCurrent() || !sharing || !trimmedCity || profile.membership_type !== 'alumni')
    return { error: null, revision };

  const coords = await geocodeCity(trimmedCity);
  if (!isCurrent()) return { error: null, revision };
  if (!coords)
    return {
      revision,
      error:
        'Profile and city saved. We couldn’t find this city’s map location. Your pin is removed. Check the city and save again to retry, or turn map sharing off.',
    };
  try {
    const { data, error } = await supabase.rpc('complete_profile_map_location', {
      target_profile_id: profile.id,
      expected_revision: revision,
      latitude: coords.lat,
      longitude: coords.lng,
    });
    if (error || typeof data !== 'string')
      return {
        error:
          'Profile and city saved, but the map update could not be confirmed. Close and reopen Edit profile before retrying.',
      };
    return { error: null, revision: data };
  } catch {
    return {
      error:
        'Profile and city saved, but the map update could not be confirmed. Close and reopen Edit profile before retrying.',
    };
  }
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
