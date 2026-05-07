-- Revert: Remove the additional RLS policy we added
drop policy if exists "dm_participants_select_thread_members" on public.direct_message_participants;

