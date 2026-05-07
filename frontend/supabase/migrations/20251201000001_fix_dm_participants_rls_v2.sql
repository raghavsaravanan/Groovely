-- Fix for the broken RLS policy - this should restore functionality
-- Run this after the previous migration if threads aren't loading

-- First, ensure we drop any broken policies
DROP POLICY IF EXISTS "dm_participants_select" ON public.direct_message_participants;

-- Drop the function if it exists (from previous migration attempt)
DROP FUNCTION IF EXISTS public.check_user_is_thread_participant(uuid);
DROP FUNCTION IF EXISTS public.user_is_thread_participant(uuid, uuid);

-- Create a simple, efficient helper function using SECURITY DEFINER
-- This bypasses RLS when checking, avoiding recursion
CREATE OR REPLACE FUNCTION public.check_user_is_thread_participant(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_result boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM public.direct_message_participants
    WHERE thread_id = p_thread_id AND user_id = auth.uid()
  ) INTO v_result;
  RETURN COALESCE(v_result, false);
END;
$$;

-- Create the select policy that allows seeing all participants in threads you're part of
CREATE POLICY "dm_participants_select" ON public.direct_message_participants
FOR SELECT
USING (
  -- Allow if it's your own participant record (fast path)
  user_id = auth.uid()
  OR
  -- OR allow if you are a participant in this thread (using function to avoid recursion)
  public.check_user_is_thread_participant(thread_id)
);

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.check_user_is_thread_participant(uuid) TO authenticated, anon;

