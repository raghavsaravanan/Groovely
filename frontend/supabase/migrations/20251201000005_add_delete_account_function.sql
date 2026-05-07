-- Add DELETE policy for profiles
-- This allows users to delete their own profile
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;
CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- Create function to delete user account
-- This function deletes the profile, which will cascade delete all related data
-- The auth user will remain but will be inaccessible without a profile
-- To fully delete the auth user, use Supabase Admin API or Dashboard
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get the current user's ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- Delete the profile (this will cascade delete all related data due to foreign keys)
  -- All tables with ON DELETE CASCADE will automatically delete related records
  DELETE FROM public.profiles WHERE id = v_user_id;
  
  -- Note: The auth user in auth.users will remain but will be inaccessible
  -- To fully delete the auth user, you would need to use Supabase Admin API
  -- For most purposes, deleting the profile is sufficient as it removes all user data
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user_account() TO authenticated;

