import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import { sanitizeFileName } from "@/lib/utils";

interface V2VPayload {
  modelId: string;
  sourceFile: File;
  userId: string;
  isTestMode: boolean; // NEW
}

interface V2VResponse {
    url: string;
}

const V2V_COST_PER_CONVERSION = 1; 

const performV2VConversion = async ({ modelId, sourceFile, userId, isTestMode }: V2VPayload): Promise<V2VResponse> => {
  
  // 1. Upload Source File to temporary bucket
  const sanitizedFileName = sanitizeFileName(sourceFile.name);
  const sourcePath = `${userId}/v2v-source/${modelId}_${sanitizedFileName}`;
  
  const { error: uploadError } = await supabase.storage
      .from('v2v-source') 
      .upload(sourcePath, sourceFile, { upsert: true });

  if (uploadError) {
      console.error("Supabase Storage Upload Error (V2V source):", uploadError);
      throw new Error(`Échec de l'upload de la source: ${uploadError.message}`);
  }
  
  // 2. Call Edge Function for V2V conversion
  const outputFileName = `${sanitizeFileName(sourceFile.name)}_converted.mp3`;

  const { data: apiResponse, error: apiError } = await supabase.functions.invoke('synthesize-v2v', {
    body: {
      model_id: modelId,
      source_path: sourcePath, // Pass the path relative to the bucket root
      output_file_name: outputFileName,
      is_test_mode: isTestMode, // NEW: Pass test mode flag
    },
  });

  // 3. Handle errors from the Edge Function
  if (apiError) {
    console.error("Edge Function Invocation Error (synthesize-v2v):", apiError);
    throw new Error(`Erreur de connexion au service de conversion: ${apiError.message}`);
  }
  
  if (apiResponse && apiResponse.error) {
    console.error("Edge Function returned error:", apiResponse.error);
    throw new Error(apiResponse.error);
  }
  
  if (!apiResponse?.url) {
      throw new Error("URL de sortie audio non reçue.");
  }

  return { url: apiResponse.url };
};

export const useV2VConversion = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: performV2VConversion,
    onSuccess: (data, variables) => {
      // Invalidate user profile to reflect credit deduction (only if not in test mode)
      if (!variables.isTestMode) {
        queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      }
      
      toast({
        title: "Conversion terminée",
        description: `Audio généré avec succès. ${V2V_COST_PER_CONVERSION} crédit(s) utilisé(s)${variables.isTestMode ? ' (mode test)' : ''}.`,
      });
      
      return data;
    },
    onError: (error) => {
      // The Edge function handles credit refund if AI fails, but we need to handle the frontend error display
      let title = "Erreur de conversion";
      if (error.message.includes("Insufficient credits")) {
          title = "Crédits insuffisants";
      }
      
      toast({
        variant: "destructive",
        title: title,
        description: error.message || "Impossible de convertir l'audio.",
      });
    },
  });
};