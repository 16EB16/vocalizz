import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";

interface CancelPayload {
  modelId: string;
  userId: string;
}

const cancelStuckModel = async ({ modelId, userId }: CancelPayload) => {
  const { data, error: fnError } = await supabase.functions.invoke('cancel-stuck-training', {
    body: { model_id: modelId, user_id: userId },
  });

  if (fnError) {
    console.error("Edge Function Invocation Error (cancel-stuck-training):", fnError);
    throw new Error(`Erreur de connexion au service d'annulation: ${fnError.message}`);
  }
  
  if (data && data.error) {
    console.error("Edge Function returned error:", data.error);
    throw new Error(data.error);
  }
};

export const useCancelStuckModel = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelStuckModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voiceModels"] });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      toast({
        title: "Entraînement annulé",
        description: "Le modèle bloqué a été marqué comme échoué et les ressources ont été libérées.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur d'annulation",
        description: error.message || "Impossible d'annuler le modèle bloqué.",
      });
    },
  });
};