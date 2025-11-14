// @ts-nocheck
/// <reference types="https://deno.land/std@0.190.0/http/server.ts" />
/// <reference types="https://esm.sh/@supabase/supabase-js@2.45.0" />

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Assuming Replicate is used for RVC training
const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
// Using a common RVC model placeholder. NOTE: The user MUST replace this with their actual Replicate model version.
const RVC_MODEL_VERSION = "rvc-model/rvc-training:latest"; 

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let modelId: string | undefined;
  let userId: string | undefined;
  
  // Initialize Supabase Admin client (used for server-side updates)
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", // Use service role key for server-side updates
    {
      auth: { persistSession: false },
    }
  );

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
    
    // Use Supabase Admin client to verify the JWT and get user data
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    
    // Set the verified user ID
    userId = user.id;

    // 2. Parse request body and validate parameters
    const { model_id, user_id: body_user_id, storage_path, epochs, cleaning_option } = await req.json();
    modelId = model_id; // Store model_id for potential error handling

    // Security check: Ensure the user ID in the body matches the authenticated user ID
    if (body_user_id !== userId) {
        return new Response(JSON.stringify({ error: "Forbidden: User ID mismatch." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (!model_id || !storage_path || !epochs) {
      return new Response(JSON.stringify({ error: "Missing required parameters (model_id, storage_path, epochs)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Check AI Service Key
    if (!REPLICATE_API_KEY) {
        console.error("REPLICATE_API_KEY is not set.");
        // Throw a specific error that will be caught below and logged in the DB
        throw new Error("Configuration error: La clé API du service IA (Replicate) est manquante. Veuillez la configurer.");
    }

    // Determine if cleaning should be applied
    const applyCleaning = cleaning_option === 'premium';

    // 4. Call Replicate API to start training
    const audioDataPath = `s3://audio-files/${storage_path}`; 

    const replicateResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${REPLICATE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: RVC_MODEL_VERSION,
        input: {
          audio_data_path: audioDataPath,
          epochs: epochs,
          model_name: model_id,
          // Pass cleaning flag to the AI service
          apply_cleaning: applyCleaning, 
          // Webhook URL to update Supabase when training is complete/failed
          webhook: `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-ai-status`, 
          webhook_events_filter: ["completed", "failed"],
        },
      }),
    });

    if (!replicateResponse.ok) {
      // CRITICAL IMPROVEMENT: Read the error body from Replicate
      let errorDetails = `Status ${replicateResponse.status}`;
      try {
        const errorBody = await replicateResponse.json();
        errorDetails += `: ${JSON.stringify(errorBody)}`;
      } catch (e) {
        // If JSON parsing fails, use text
        errorDetails += `: ${await replicateResponse.text()}`;
      }
      
      console.error("Replicate API Error:", errorDetails);
      // Throw a detailed error message that will be recorded in the DB
      throw new Error(`Échec de l'appel à l'API IA. Détails: ${errorDetails}`);
    }

    const prediction = await replicateResponse.json();
    
    // 5. Update Supabase model status to 'processing'
    const { error: updateError } = await supabaseAdmin
      .from("voice_models")
      .update({ 
        status: "processing",
        external_job_id: prediction.id 
      })
      .eq("id", model_id);

    if (updateError) {
      console.error("Supabase Update Error (processing):", updateError);
      // We still return success here as the AI job was successfully triggered externally.
    }

    return new Response(JSON.stringify({ success: true, job_id: prediction.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("AI Trigger Error:", error.message);
    
    // If an error occurred, mark the model as failed in the DB and reset user training status
    if (modelId && userId) {
        const errorMessage = error.message || "Internal Server Error";
        
        // Update model status
        const { error: failError } = await supabaseAdmin
            .from("voice_models")
            .update({ status: "failed", error_message: errorMessage }) // Record the error message
            .eq("id", modelId);
        
        if (failError) {
            console.error("Failed to mark model as failed:", failError);
        }
        
        // Reset user training status
        await supabaseAdmin
            .from('profiles')
            .update({ is_in_training: false })
            .eq('id', userId);
    }

    // Return a 500 response with the error message for the frontend to display
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});