-- Fix RLS policy for direct_message_participants to allow seeing all participants in threads you're part of
-- This fixes the issue where "Unknown Dancer" appears instead of participant names
-- Also ensures threads and messages still work properly

-- Drop and recreate the select policy to allow seeing all participants in threads you're part of
DROP POLICY IF EXISTS "dm_participants_select" ON public.direct_message_participants;

-- Create a helper function that uses SECURITY DEFINER to bypass RLS for the check
-- This avoids recursion issues when checking if a user is a participant
CREATE OR REPLACE FUNCTION public.check_user_is_thread_participant(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.direct_message_participants
    WHERE thread_id = p_thread_id AND user_id = auth.uid()
  );
$$;

-- Now create the policy using the function
CREATE POLICY "dm_participants_select" ON public.direct_message_participants
FOR SELECT
USING (
  -- Allow if it's your own participant record
  user_id = auth.uid()
  OR
  -- OR allow if you are a participant in this thread (using function to avoid recursion)
  public.check_user_is_thread_participant(thread_id)
);

