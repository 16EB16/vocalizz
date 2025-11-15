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
// Using a known, public RVC model version for demonstration/testing purposes.
// NOTE: This version should be replaced by the user's specific RVC training model if they have one.
const RVC_MODEL_VERSION = "cjwbw/rvc-training:42242315015729748101520000000000"; 

// Utility function to sanitize model name (MUST match frontend/create-model logic)
const sanitizeModelName = (name: string | undefined) => {
    const safeName = String(name || 'untitled_file');
    const normalized = safeName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalized
      .replace(/[^a-zA-Z0-9.]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
};

// Function to delete source files from storage using the Admin client
async function deleteSourceFiles(supabaseAdmin, userId, modelName) {
    const sanitizedModelName = sanitizeModelName(modelName);
    const storagePathPrefix = `${userId}/${sanitizedModelName}/`;
    const bucketName = 'audio-files';

    console.log(`[AI Trigger Cleanup] Attempting to delete files at: ${storagePathPrefix}`);

    try {
        const { data: listData, error: listError } = await supabaseAdmin.storage
            .from(bucketName)
            .list(storagePathPrefix, { limit: 100, offset: 0 });

        if (listError) {
            console.error("Cleanup Error: Failed to list files:", listError);
            return;
        }

        const filesToDelete = listData
            .filter(file => file.name !== '.emptyFolderPlaceholder')
            .map(file => `${storagePathPrefix}${file.name}`);

        if (filesToDelete.length > 0) {
            const { error: deleteError } = await supabaseAdmin.storage
                .from(bucketName)
                .remove(filesToDelete);

            if (deleteError) {
                console.error("Cleanup Error: Failed to delete files:", deleteError);
            } else {
                console.log(`Cleanup Success: Deleted ${filesToDelete.length} source files.`);
            }
        }
    } catch (e) {
        console.error("Cleanup Error: Exception during file deletion:", e.message);
    }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let modelId: string | undefined;
  let userId: string | undefined;
  let modelName: string | undefined; // Need to capture model name for cleanup
  
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
      console.error("Authentication Error: Missing Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized: Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Use Supabase Admin client to verify the JWT and get user data
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        console.error("Authentication Error: Invalid or expired token", authError);
        return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    
    // Set the verified user ID
    userId = user.id;

    // 2. Parse request body and validate parameters
    const body = await req.json();
    const { model_id, user_id: body_user_id, storage_path, epochs, cleaning_option } = body;
    modelId = model_id; // Store model_id for potential error handling

    // Fetch model name from DB using model_id (needed for cleanup if Replicate call fails)
    const { data: modelData, error: fetchModelError } = await supabaseAdmin
        .from("voice_models")
        .select("name")
        .eq("id", modelId)
        .single();

    if (fetchModelError || !modelData) {
        console.error("Error fetching model name for cleanup:", fetchModelError);
        // We can't proceed without the model name for cleanup, but we still try to reset user status later.
    } else {
        modelName = modelData.name;
    }

    console.log(`[AI Trigger] Received request for model ${modelId} by user ${userId}. Model Name: ${modelName}`);

    // Security check: Ensure the user ID in the body matches the authenticated user ID
    if (body_user_id !== userId) {
        console.error(`Forbidden: User ID mismatch. Auth ID: ${userId}, Body ID: ${body_user_id}`);
        return new Response(JSON.stringify({ error: "Forbidden: User ID mismatch." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (!model_id || !storage_path || !epochs) {
      console.error("Missing required parameters:", { model_id, storage_path, epochs });
      return new Response(JSON.stringify({ error: "Missing required parameters (model_id, storage_path, epochs)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Check AI Service Key
    if (!REPLICATE_API_KEY) {
        console.error("CRITICAL ERROR: REPLICATE_API_KEY is not set.");
        throw new Error("Configuration error: La clé API du service IA (Replicate) est manquante. Veuillez la configurer.");
    }

    // Determine if cleaning should be applied
    const applyCleaning = cleaning_option === 'premium';

    // 4. Call Replicate API to start training
    const audioDataPath = `s3://audio-files/${storage_path}`; 
    
    console.log(`[AI Trigger] Calling Replicate API. Path: ${audioDataPath}, Epochs: ${epochs}, Cleaning: ${applyCleaning}`);

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
    console.log(`[AI Trigger] Replicate job started. External ID: ${prediction.id}. Updating DB status.`);
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
            
        // CRITICAL CLEANUP: If we have the model name, delete the source files
        if (modelName) {
            await deleteSourceFiles(supabaseAdmin, userId, modelName);
        }
    }

    // Return a 500 response with the error message for the frontend to display
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});