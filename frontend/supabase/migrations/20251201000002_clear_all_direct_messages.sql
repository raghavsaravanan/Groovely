-- Clear all direct messages for testing purposes
-- WARNING: This will delete ALL direct messages, threads, and participants
-- Use only for development/testing

-- Delete in order to respect foreign key constraints:
-- 1. Delete all message receipts first (they reference messages)
DELETE FROM public.direct_message_receipts;

-- 2. Delete all direct messages (they reference threads, but CASCADE will handle cleanup)
-- This will also set last_message_id to NULL in threads due to ON DELETE SET NULL
DELETE FROM public.direct_messages;

-- 3. Delete all participants (they reference threads)
DELETE FROM public.direct_message_participants;

-- 4. Delete all threads (all references are now cleared)
DELETE FROM public.direct_message_threads;

-- Verify deletion
DO $$
DECLARE
  message_count integer;
  thread_count integer;
  participant_count integer;
  receipt_count integer;
BEGIN
  SELECT COUNT(*) INTO message_count FROM public.direct_messages;
  SELECT COUNT(*) INTO thread_count FROM public.direct_message_threads;
  SELECT COUNT(*) INTO participant_count FROM public.direct_message_participants;
  SELECT COUNT(*) INTO receipt_count FROM public.direct_message_receipts;
  
  RAISE NOTICE '✅ Deleted all direct messages. Remaining counts:';
  RAISE NOTICE '  Messages: %', message_count;
  RAISE NOTICE '  Threads: %', thread_count;
  RAISE NOTICE '  Participants: %', participant_count;
  RAISE NOTICE '  Receipts: %', receipt_count;
  
  IF message_count = 0 AND thread_count = 0 AND participant_count = 0 AND receipt_count = 0 THEN
    RAISE NOTICE '✅ All direct message data cleared successfully!';
  ELSE
    RAISE WARNING '⚠️  Some data may still remain. Check the counts above.';
  END IF;
END $$;

