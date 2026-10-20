-- Iris media storage policies.
--
-- The app authenticates with Firebase Auth, not Supabase Auth, so every
-- storage request from the app arrives as the `anon` role with no session.
-- Marking a bucket public only makes objects *readable* - writes are still
-- denied unless a policy allows them. Without these policies every upload
-- fails with:
--   StorageApiError: new row violates row-level security policy
--
-- Run this in the Supabase SQL editor for project socialapp-e5192:
--   https://supabase.com/dashboard/project/socialapp-e5192/sql/new
--
-- The script is re-runnable: it drops the policies first if they exist.

drop policy if exists "iris_media_read"   on storage.objects;
drop policy if exists "iris_media_insert" on storage.objects;
drop policy if exists "iris_media_update" on storage.objects;
drop policy if exists "iris_media_delete" on storage.objects;

-- Read: the buckets are public, but keep an explicit policy so reads keep
-- working even if a bucket is ever made private.
create policy "iris_media_read"
  on storage.objects for select
  to public
  using (bucket_id in ('avatars', 'posts', 'stories', 'messages', 'glimpses'));

-- Insert: any client may write into the media buckets. The app writes to
-- <userId>/... paths, but storage cannot verify ownership because user
-- identity lives in Firebase - so this is intentionally unscoped.
create policy "iris_media_insert"
  on storage.objects for insert
  to public
  with check (bucket_id in ('avatars', 'posts', 'stories', 'messages', 'glimpses'));

-- Update: required for upsert uploads (uploadAvatar uses upsert = true);
-- without it, file replacement fails even when INSERT is allowed.
create policy "iris_media_update"
  on storage.objects for update
  to public
  using (bucket_id in ('avatars', 'posts', 'stories', 'messages', 'glimpses'))
  with check (bucket_id in ('avatars', 'posts', 'stories', 'messages', 'glimpses'));

-- Delete: the app removes replaced/removed media (e.g. deleteAvatar) via
-- storage .remove() calls.
create policy "iris_media_delete"
  on storage.objects for delete
  to public
  using (bucket_id in ('avatars', 'posts', 'stories', 'messages', 'glimpses'));
