import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";

interface ManualStatusPayload {
  modelId: string;
  status: 'completed' | 'failed';
  errorMessage?: string;
}

const updateManualStatus = async ({ modelId, status, errorMessage }: ManualStatusPayload) => {
  const { data, error: fnError } = await supabase.functions.invoke('manual-status-update', {
    body: { 
        model_id: modelId, 
        new_status: status, 
        error_message: errorMessage 
    },
  });

  if (fnError) {
    console.error("Edge Function Invocation Error (manual-status-update):", fnError);
    throw new Error(`Erreur de connexion au service de statut manuel: ${fnError.message}`);
  }
  
  if (data && data.error) {
    console.error("Edge Function returned error:", data.error);
    throw new Error(data.error);
  }
};

export const useManualModelStatus = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateManualStatus,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["voiceModels"] });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      
      const message = variables.status === 'completed' 
        ? "Le modèle a été marqué comme PRÊT (Completed)."
        : "Le modèle a été marqué comme ÉCHOUÉ (Failed).";

      toast({
        title: "Statut mis à jour manuellement",
        description: message,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur de mise à jour manuelle",
        description: error.message || "Impossible de mettre à jour le statut du modèle.",
      });
    },
  });
};