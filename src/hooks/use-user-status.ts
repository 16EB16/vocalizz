import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useUserProfile } from "./use-user-profile";
import { useQueryClient } from "@tanstack/react-query";

type UserRole = Tables<'profiles'>['role'];

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

  const role: UserRole = profile?.role ?? "standard";
  const stripeCustomerId = profile?.stripe_customer_id ?? null;
  const isPremium = role === "premium";
  const isLoading = isAuthLoading || isProfileLoading;

  return { 
    userId,
    role, 
    isPremium, 
    isLoading, 
    stripeCustomerId 
  };
};