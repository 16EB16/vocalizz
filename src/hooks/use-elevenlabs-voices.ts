import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export interface ElevenLabsVoice {
  id: string;
  name: string;
  modelId: string;
  category: string;
  labels: Record<string, string>;
}

const fetchElevenLabsVoices = async (): Promise<ElevenLabsVoice[]> => {
  const { data, error } = await supabase.functions.invoke('fetch-elevenlabs-voices');

  if (error) {
    console.error("Error fetching ElevenLabs voices:", error);
    throw new Error("Impossible de charger les voix ElevenLabs.");
  }
  
  if (data && data.error) {
    throw new Error(data.error);
  }

  return (data?.voices || []) as ElevenLabsVoice[];
};

export const useElevenLabsVoices = () => {
  const { data: voices, isLoading, isError } = useQuery({
    queryKey: ["elevenLabsVoices"],
    queryFn: fetchElevenLabsVoices,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  // Filter and sort voices for French market relevance
  const filteredVoices = useMemo(() => {
    if (!voices) return [];
    
    // Prioritize voices that support multilingual models (v2) and are premade
    const relevantVoices = voices.filter(v => 
        v.modelId.includes('multilingual_v2') && v.category === 'premade'
    );
    
    // Sort: Put French voices first, then English/others
    relevantVoices.sort((a, b) => {
        const aIsFrench = a.labels.language?.toLowerCase().includes('french');
        const bIsFrench = b.labels.language?.toLowerCase().includes('french');
        
        if (aIsFrench && !bIsFrench) return -1;
        if (!aIsFrench && bIsFrench) return 1;
        return a.name.localeCompare(b.name);
    });

    return relevantVoices;
  }, [voices]);

  return {
    voices: filteredVoices,
    isLoading,
    isError,
  };
};