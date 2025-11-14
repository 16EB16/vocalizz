import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

export const useStripePortal = (isPremium: boolean) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const redirectToStripe = async () => {
    setIsLoading(true);
    
    const returnUrl = window.location.origin + "/settings";

    try {
      let response;
      
      if (isPremium) {
        // 1. Redirect to Billing Portal (for Premium users)
        response = await supabase.functions.invoke('create-billing-portal-session', {
          body: { returnUrl },
        });
      } else {
        // 2. Redirect to Checkout (for Free users)
        response = await supabase.functions.invoke('create-checkout-session', {
          body: { returnUrl },
        });
      }

      const { data, error } = response;

      if (error) {
        // Handle network/invocation errors from Supabase client
        console.error("Supabase Function Invocation Error:", error);
        throw new Error(`Erreur de connexion au service de facturation: ${error.message}`);
      }
      
      // Handle application-level errors returned by the Edge Function (e.g., 401, 404, 500)
      if (data && data.error) {
        console.error("Edge Function returned error:", data.error);
        throw new Error(data.error);
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("URL de redirection Stripe non reçue.");
      }

    } catch (error: any) {
      console.error("Stripe Redirection Error:", error);
      toast({
        variant: "destructive",
        title: "Erreur de facturation",
        description: error.message || "Impossible de se connecter à Stripe. Veuillez réessayer.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { redirectToStripe, isLoading };
};