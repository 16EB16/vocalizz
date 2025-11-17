import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useUserProfile } from "./use-user-profile";
import { useQueryClient } from "@tanstack/react-query";

type UserRole = Tables<'profiles'>['role'];

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
  const credits = profile?.credits ?? 0; // NEW: Expose credits
  const isPremium = role === "pro" || role === "studio"; // Premium status for Pro and Studio
  
  // Use active_trainings counter
  const active_trainings = profile?.active_trainings ?? 0; 
  const max_active_trainings = MAX_ACTIVE_TRAININGS[role];
  const is_in_training = active_trainings >= max_active_trainings; // True if limit is reached
  
  const isLoading = isAuthLoading || isProfileLoading;

  return { 
    userId,
    role, 
    isPremium, 
    isLoading, 
    stripeCustomerId,
    active_trainings, // NEW
    max_active_trainings, // NEW
    is_in_training, // Renamed for compatibility, but now based on counter
    credits, 
  };
};