// Shapes of the existing (live) Supabase tables the app reads.
// Source of truth: greek-ties-app-docs/docs/DATABASE.md. Do NOT change their shape.

export type AdminRole = 'owner' | 'manager' | 'viewer' | null;
export type ProfileStatus = 'pending' | 'approved';

export interface Profile {
  id: string;
  user_id: string;
  chapter_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  class_year: number | null;
  role: string | null;
  industry: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  company: string | null;
  job_title: string | null;
  open_to_mentor: boolean | null;
  is_hiring: boolean | null;
  status: ProfileStatus | null;
  admin_role: AdminRole;
  linkedin_url: string | null;
  bio: string | null;
  created_at: string;
}

export interface Chapter {
  id: string;
  name: string | null;
  designation: string | null;
  university: string | null;
  founded: number | null;
  created_by: string | null;
  subscription_status: string | null;
  plan_tier: string | null;
  founding_chapter: boolean | null;
  is_trial: boolean | null;
  trial_ends_at: string | null;
  created_at: string;
}

export function isAdmin(profile: Profile | null): boolean {
  return profile?.admin_role === 'owner' || profile?.admin_role === 'manager';
}

export type RequestStatus = 'pending' | 'accepted' | 'declined';

export interface MentorshipRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  chapter_id: string;
  focus_areas: string[] | null;
  message: string | null;
  preferred_format: string | null;
  status: RequestStatus;
  created_at: string;
}

export interface Message {
  id: string;
  request_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export type ChannelVisibility = 'all' | 'alumni_only' | 'exec_only' | 'custom';

export interface Channel {
  id: string;
  chapter_id: string;
  name: string;
  description: string | null;
  visibility: ChannelVisibility;
  created_by: string | null;
  created_at: string;
}

export interface ChannelMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface JobPosting {
  id: string;
  chapter_id: string;
  posted_by: string;
  title: string;
  company: string;
  location: string | null;
  industry: string | null;
  description: string | null;
  apply_url: string | null;
  created_at: string;
}

// ── V2 tables (may not exist in the live DB yet — callers degrade gracefully) ──

export type EventCategory = 'chapter' | 'alumni' | 'philanthropy' | 'social' | 'recruitment';

export interface Event {
  id: string;
  chapter_id: string;
  created_by: string;
  title: string;
  description: string | null;
  location: string | null;
  category: EventCategory;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
}

export type RsvpStatus = 'going' | 'maybe' | 'declined';

export interface EventRsvp {
  event_id: string;
  user_id: string;
  status: RsvpStatus;
  created_at: string;
}

export interface DeviceToken {
  user_id: string;
  token: string;
  platform: string;
  created_at: string;
  updated_at: string;
}

export interface ChapterInvite {
  id: string;
  chapter_id: string;
  code: string;
  created_by: string | null;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
}
