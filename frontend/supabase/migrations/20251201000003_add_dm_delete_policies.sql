-- Add DELETE policy for direct_message_threads
-- This allows users to delete threads they are participants in

CREATE POLICY "dm_threads_delete" ON public.direct_message_threads
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.direct_message_participants p
    WHERE p.thread_id = direct_message_threads.id AND p.user_id = auth.uid()
  )
);

-- Note: The UPDATE policy for direct_messages already exists and allows users to:
-- 1. Edit their own messages (update body and edited_at)
-- 2. Delete their own messages (set is_deleted = true)
-- Both operations use the same UPDATE policy: sender_id = auth.uid()

