import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";

interface CancelPayload {
  modelId: string;
  userId: string;
  isManualCancel: boolean; // Flag to differentiate between manual and stuck cancel messages
}

const cancelModel = async ({ modelId, userId }: CancelPayload) => {
  // This function now handles both manual and stuck cancellation via the same secure endpoint
  const { data, error: fnError } = await supabase.functions.invoke('cancel-training', {
    body: { model_id: modelId, user_id: userId },
  });

  if (fnError) {
    console.error("Edge Function Invocation Error (cancel-training):", fnError);
    throw new Error(`Erreur de connexion au service d'annulation: ${fnError.message}`);
  }
  
  if (data && data.error) {
    console.error("Edge Function returned error:", data.error);
    throw new Error(data.error);
  }
};

export const useCancelModel = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelModel,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["voiceModels"] });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      
      const message = variables.isManualCancel 
        ? "L'entraînement a été annulé. Les ressources sont libérées."
        : "Le modèle bloqué a été marqué comme échoué et les ressources ont été libérées.";

      toast({
        title: "Entraînement annulé",
        description: message,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur d'annulation",
        description: error.message || "Impossible d'annuler le modèle.",
      });
    },
  });
};