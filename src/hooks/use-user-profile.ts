import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type UserProfile = Tables<'profiles'>;

const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const { data: profile, error } = await supabase
    .from('profiles') // Renamed table
    .select('*')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
    throw new Error(error.message);
  }

  return profile;
};

export const useUserProfile = (userId: string | undefined) => {
  return useQuery({
    queryKey: ["userProfile", userId],
    queryFn: () => fetchUserProfile(userId!),
    enabled: !!userId, // Only run the query if userId is available
    staleTime: 1000 * 60 * 5, // Cache profile data for 5 minutes
  });
};