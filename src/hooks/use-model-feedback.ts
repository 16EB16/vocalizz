import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";

interface FeedbackPayload {
  modelId: string;
  rating: 1 | 5; // 1 for thumbs down, 5 for thumbs up
}

const updateModelFeedback = async ({ modelId, rating }: FeedbackPayload) => {
  const { error } = await supabase
    .from('voice_models')
    .update({ feedback_rating: rating })
    .eq('id', modelId);

  if (error) {
    throw new Error(error.message);
  }
};

export const useModelFeedback = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateModelFeedback,
    onSuccess: (_, variables) => {
      // Invalidate the specific model query to reflect the new rating if needed
      queryClient.invalidateQueries({ queryKey: ["voiceModels"] });
      
      const message = variables.rating === 5 
        ? "Merci pour votre retour positif ! Nous continuons d'améliorer nos modèles."
        : "Merci pour votre retour. Nous allons analyser ce modèle pour améliorer la qualité.";

      toast({
        title: "Feedback enregistré",
        description: message,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur de feedback",
        description: error.message || "Impossible d'enregistrer votre évaluation.",
      });
    },
  });
};