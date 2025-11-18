// @ts-nocheck
/// <reference types="https://deno.land/std@0.190.0/http/server.ts" />
/// <reference types="https://esm.sh/@supabase/supabase-js@2.43.0?target=deno" />

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
// Assuming a specific RVC inference model version for V2V conversion
const RVC_INFERENCE_VERSION = "cjwbw/rvc-inference:42242315015729748101520000000000"; 
const V2V_COST_PER_CONVERSION = 1;

// Utility function to sanitize file name (MUST match frontend/create-model logic)
const sanitizeFileName = (name: string | undefined) => {
    const safeName = String(name || 'untitled_file');
    const normalized = safeName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalized
      .replace(/[^a-zA-Z0-9.]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize Supabase Admin client (used for server-side updates and RPC calls)
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", 
    {
      auth: { persistSession: false },
    }
  );
  
  let userId: string | undefined;
  let modelId: string | undefined;
  let sourcePath: string | undefined;
  let outputFileName: string | undefined;
  let isTestMode = false; // Default to false

  try {
    // 1. Authenticate user via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    
    userId = user.id;

    // 2. Parse request body and validate parameters
    const body = await req.json();
    modelId = body.model_id;
    sourcePath = body.source_path;
    outputFileName = body.output_file_name;
    isTestMode = body.is_test_mode || false; // NEW: Read test mode flag

    if (!modelId || !sourcePath || !outputFileName) {
      return new Response(JSON.stringify({ error: "Missing required parameters (model_id, source_path, output_file_name)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // 3. Deduct Credit (or skip in test mode)
    if (!isTestMode) {
        console.log(`[V2V] Attempting to deduct ${V2V_COST_PER_CONVERSION} credit for user ${userId}.`);
        
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('credits')
            .eq('id', userId)
            .single();

        if (profileError || !profile) {
            throw new Error("Profile not found.");
        }
        
        if (profile.credits < V2V_COST_PER_CONVERSION) {
            return new Response(JSON.stringify({ error: "Insufficient credits for V2V conversion." }), {
                status: 402, // Payment Required
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
        
        // Perform credit deduction
        const { error: deductionError } = await supabaseAdmin
            .from('profiles')
            .update({ credits: profile.credits - V2V_COST_PER_CONVERSION })
            .eq('id', userId);
            
        if (deductionError) {
            console.error("Credit deduction failed:", deductionError);
            throw new Error("Failed to deduct credits.");
        }
        console.log("[V2V] Credit deducted successfully.");
    } else {
        console.log("[V2V] MODE TEST: Skipping credit deduction.");
    }


    // 4. Call Replicate API for RVC Inference
    if (!REPLICATE_API_KEY) {
        throw new Error("Clé API IA manquante. Veuillez configurer la variable d'environnement REPLICATE_API_KEY.");
    }

    // Construct the path to the RVC model files (assuming they are stored in 'rvc-models' bucket)
    const rvcModelPath = `s3://rvc-models/${userId}/${modelId}/`;
    const sourceAudioPath = `s3://v2v-source/${sourcePath}`;
    
    console.log(`[V2V] Calling Replicate Inference. Model Path: ${rvcModelPath}, Source: ${sourceAudioPath}`);

    const replicateResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${REPLICATE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: RVC_INFERENCE_VERSION,
        input: {
          // Parameters specific to RVC inference
          model_path: rvcModelPath, 
          audio_input: sourceAudioPath,
          // Add other necessary RVC parameters here (e.g., pitch change, index rate)
        },
      }),
    });

    if (!replicateResponse.ok) {
      let errorDetails = `Status ${replicateResponse.status}`;
      try {
        const errorBody = await replicateResponse.json();
        errorDetails += `: ${JSON.stringify(errorBody)}`;
      } catch (e) {
        errorDetails += `: ${await replicateResponse.text()}`;
      }
      
      console.error("Replicate Inference API Error:", errorDetails);
      throw new Error(`Échec de l'appel à l'API IA pour la conversion. Détails: ${errorDetails}`);
    }

    const prediction = await replicateResponse.json();
    
    // 5. Poll Replicate for result (Simplified: In a real app, this would be a webhook)
    // For simplicity in this environment, we simulate a quick poll/wait.
    // In a real production environment, V2V should also use a webhook for long jobs.
    
    let status = prediction.status;
    let outputUrl = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    
    while (status !== 'succeeded' && status !== 'failed' && attempts < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
        const pollResponse = await fetch(prediction.urls.get, {
            headers: { "Authorization": `Token ${REPLICATE_API_KEY}` },
        });
        const pollData = await pollResponse.json();
        status = pollData.status;
        outputUrl = pollData.output;
        attempts++;
        console.log(`[V2V] Polling status: ${status} (Attempt ${attempts})`);
    }
    
    if (status !== 'succeeded' || !outputUrl) {
        throw new Error(`Conversion IA échouée ou timeout après ${attempts} tentatives. Statut final: ${status}`);
    }
    
    // 6. Download the result from Replicate and upload to Supabase Storage
    const audioResponse = await fetch(outputUrl);
    if (!audioResponse.ok) {
        throw new Error("Failed to download audio output from AI service.");
    }
    
    const audioBlob = await audioResponse.blob();
    const outputStoragePath = `${userId}/v2v-outputs/${modelId}_${outputFileName}`;
    
    const { error: storageError } = await supabaseAdmin.storage
        .from('v2v-outputs') // Assuming a bucket for V2V outputs
        .upload(outputStoragePath, audioBlob, { upsert: true });
        
    if (storageError) {
        console.error("Supabase Storage Upload Error (V2V output):", storageError);
        throw new Error("Failed to store converted audio.");
    }
    
    // 7. Generate signed URL for the client
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from('v2v-outputs')
        .createSignedUrl(outputStoragePath, 3600); // Link valid for 1 hour

    if (signedUrlError) {
        throw new Error("Failed to generate signed URL for output.");
    }
    
    // 8. Cleanup source file (optional but recommended)
    await supabaseAdmin.storage.from('v2v-source').remove([sourcePath]);
    console.log(`[V2V] Cleaned up source file: ${sourcePath}`);


    return new Response(JSON.stringify({ success: true, url: signedUrlData.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("V2V Conversion Error:", error.message);
    
    // CRITICAL: If an error occurred AFTER credit deduction, refund the credit (only if not in test mode).
    if (userId && modelId && error.message.includes("Failed to deduct credits") === false && !isTestMode) {
        console.log(`[V2V] Attempting to refund ${V2V_COST_PER_CONVERSION} credit due to failure.`);
        const { error: refundError } = await supabaseAdmin
            .from('profiles')
            .update({ credits: supabaseAdmin.raw('credits + ??', V2V_COST_PER_CONVERSION) })
            .eq('id', userId);
            
        if (refundError) {
            console.error("CRITICAL: Failed to refund credit:", refundError);
        }
    }

    // Return a 500 response with the error message for the frontend to display
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});