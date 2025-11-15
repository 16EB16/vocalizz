import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { estimateTrainingDurationMinutes } from "@/lib/model-utils"; // Import utility

// Use the generated type for voice models and add a UI specific property
export type VoiceModel = Tables<"voice_models"> & {
  progress: number;
};

// Function to map raw model data to UI model data (with calculated progress)
const mapToUiModel = (model: Tables<"voice_models">): VoiceModel => {
  let progress = 0;
  
  if (model.status === "completed") {
    progress = 100;
  } else if (model.status === "processing" || model.status === "preprocessing") {
    const createdAt = new Date(model.created_at).getTime();
    const now = Date.now();
    const timeElapsedSeconds = (now - createdAt) / 1000;
    
    const estimatedDurationMinutes = estimateTrainingDurationMinutes(model.poch_value);
    const estimatedDurationSeconds = estimatedDurationMinutes * 60;
    
    // Calculate progress based on time elapsed vs estimated total duration
    // Cap progress at 99% to avoid showing 100% before the webhook confirms completion
    progress = Math.min(99, Math.floor((timeElapsedSeconds / estimatedDurationSeconds) * 100));
    
    // Ensure progress doesn't drop below 0
    progress = Math.max(0, progress);
  }

  return {
    ...model,
    progress: progress,
  };
};

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
    // We need to refetch frequently to update the time-based progress calculation
    refetchInterval: 5000, // Refetch every 5 seconds to update progress
  });
};