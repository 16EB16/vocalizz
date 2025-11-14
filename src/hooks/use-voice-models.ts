import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

// Use the generated type for voice models and add a UI specific property
export type VoiceModel = Tables<"voice_models"> & {
  progress: number;
};

// Function to map raw model data to UI model data (with simulated progress for 'processing' status)
const mapToUiModel = (model: Tables<"voice_models">): VoiceModel => ({
  ...model,
  // Simulate progress based on status if not provided by backend
  progress: model.status === "processing" ? Math.floor(Math.random() * 100) : (model.status === "completed" ? 100 : 0),
});

const fetchVoiceModels = async (userId: string): Promise<VoiceModel[]> => {
  const { data, error } = await supabase
    .from("voice_models")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Impossible de charger les modèles vocaux.");
  }

  return (data || []).map(mapToUiModel);
};

export const useVoiceModels = (userId: string | undefined) => {
  return useQuery({
    queryKey: ["voiceModels", userId],
    queryFn: () => fetchVoiceModels(userId!),
    enabled: !!userId, // Only run the query if userId is available
  });
};