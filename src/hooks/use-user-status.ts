import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useUserProfile } from "./use-user-profile";
import { useQueryClient } from "@tanstack/react-query";

type UserRole = Tables<'profiles'>['role'];

// --- TEMPORARY TEST MODE FLAG ---
const IS_TEST_MODE = true; // Set to false when testing is complete
// --------------------------------

// Define limits based on roles
const MAX_ACTIVE_TRAININGS: Record<UserRole, number> = {
    'free': 1,
    'pro': 1,
    'studio': 3,
};

export const useUserStatus = () => {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // 1. Handle Auth State
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id);
      setIsAuthLoading(false);
    };

    checkAuth();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id;
      setUserId(newUserId);
      
      // Invalidate profile query on sign in/out OR user update (which happens after Stripe webhook)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  // 2. Fetch Profile Data using TanStack Query
  const { data: profile, isLoading: isProfileLoading } = useUserProfile(userId);

  const role: UserRole = profile?.role ?? "free"; // Default role is now 'free'
  const stripeCustomerId = profile?.stripe_customer_id ?? null;
  
  // Apply Test Mode overrides
  const credits = IS_TEST_MODE ? 999 : (profile?.credits ?? 0); 
  const isPremium = IS_TEST_MODE ? true : (role === "pro" || role === "studio"); // Force Premium features
  
  // Use active_trainings counter
  const active_trainings = profile?.active_trainings ?? 0; 
  const max_active_trainings = MAX_ACTIVE_TRAININGS[role];
  
  // In Test Mode, always allow training
  const is_in_training = IS_TEST_MODE ? false : (active_trainings >= max_active_trainings); 
  
  const isLoading = isAuthLoading || isProfileLoading;

  return { 
    userId,
    role, 
    isPremium, 
    isLoading, 
    stripeCustomerId,
    active_trainings, 
    max_active_trainings, 
    is_in_training, 
    credits,
    isTestMode: IS_TEST_MODE, // Expose the flag
  };
};