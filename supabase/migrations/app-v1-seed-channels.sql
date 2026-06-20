-- ============================================================================
-- Greek Ties Mobile App — Seed: Default Channels
-- ============================================================================
-- Creates the 6 default channels for EVERY existing chapter that doesn't
-- already have channels. Run AFTER app-v1-chat.sql.
--
-- Re-runnable: the WHERE NOT EXISTS guard prevents duplicates.
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================================

-- For each chapter, insert the default channel set if it has none yet.
insert into channels (chapter_id, name, description, visibility)
select c.id, d.name, d.description, d.visibility
from chapters c
cross join (
  values
    ('general',      'Main chapter chat',        'all'),
    ('exec',         'Executive board',          'exec_only'),
    ('housing',      'Housing coordination',     'all'),
    ('abroad',       'Study abroad',             'all'),
    ('philanthropy', 'Philanthropy & events',    'all'),
    ('alumni',       'Alumni-only network',      'alumni_only')
) as d(name, description, visibility)
where not exists (
  select 1 from channels existing where existing.chapter_id = c.id
);

-- ============================================================================
-- To seed channels for a SINGLE new chapter later (e.g. from app code when a
-- chapter is created), run the same insert filtered to one chapter_id, or
-- replicate this logic in a Supabase Edge Function / the website's onboarding
-- completion handler.
-- ============================================================================
