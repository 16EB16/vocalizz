// @ts-nocheck
/// <reference types="https://deno.land/std@0.190.0/http/server.ts" />
/// <reference types="https://esm.sh/@supabase/supabase-js@2.43.0?target=deno" />

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Assuming Replicate is used for RVC training
const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
// Using a known, public RVC model version for demonstration/testing purposes.
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
  let modelName: string | undefined; 
  let cost_in_credits: number | undefined;
  let isTestMode = false; // Default to false
  
  // Initialize Supabase Admin client (used for server-side updates and RPC calls)
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", 
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
    const { 
        user_id: body_user_id, 
        storage_path, 
        epochs, 
        cleaning_option,
        // New fields for DB insertion and credit deduction
        model_name,
        quality,
        poch_value,
        file_count,
        audio_duration_seconds,
        score_qualite_source,
        is_premium_model,
        cost_in_credits: body_cost_in_credits,
        is_test_mode // NEW: Read test mode flag
    } = body;
    
    modelName = model_name;
    cost_in_credits = body_cost_in_credits;
    isTestMode = is_test_mode || false; // Ensure it's a boolean

    // Security check: Ensure the user ID in the body matches the authenticated user ID
    if (body_user_id !== userId) {
        return new Response(JSON.stringify({ error: "Forbidden: User ID mismatch." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (!storage_path || !epochs || !modelName || cost_in_credits === undefined) {
      return new Response(JSON.stringify({ error: "Missing required parameters for training launch." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // 3. CRITICAL: Deduct credits and create model entry using RPC
    if (isTestMode) {
        console.log(`[AI Trigger] MODE TEST: Skipping credit deduction and limit check.`);
        
        // Manually create the model entry without RPC (since RPC handles deduction/limit check)
        const { data: newModel, error: insertError } = await supabaseAdmin
            .from('voice_models')
            .insert({
                user_id: userId,
                name: model_name,
                quality: quality,
                poch_value: poch_value,
                status: 'preprocessing',
                file_count: file_count,
                audio_duration_seconds: audio_duration_seconds,
                score_qualite_source: score_qualite_source,
                cleaning_applied: cleaning_option === 'premium',
                is_premium_model: is_premium_model,
                cost_in_credits: 0, // Cost is 0 in test mode
            })
            .select('id')
            .single();
            
        if (insertError) {
            console.error("Test Mode DB Insert Error:", insertError);
            throw new Error(`Erreur de création de modèle en mode test: ${insertError.message}`);
        }
        modelId = newModel.id;
        
        // Manually increment active_trainings (since RPC handles this normally)
        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ active_trainings: supabaseAdmin.raw('active_trainings + 1') })
            .eq('id', userId);
            
        if (updateError) {
            console.error("Test Mode Profile Update Error:", updateError);
        }
        
    } else {
        console.log(`[AI Trigger] Étape 1/5: Appel RPC pour déduire ${cost_in_credits} crédits et créer l'entrée DB.`);
        const { data: new_model_id, error: rpcError } = await supabaseAdmin.rpc('deduct_credits_and_create_model', {
            p_user_id: userId,
            p_cost_in_credits: cost_in_credits,
            p_model_name: model_name,
            p_quality: quality,
            p_poch_value: poch_value,
            p_file_count: file_count,
            p_audio_duration_seconds: audio_duration_seconds,
            p_score_qualite_source: score_qualite_source,
            p_cleaning_applied: cleaning_option === 'premium',
            p_is_premium_model: is_premium_model
        });

        if (rpcError) {
            // Check for the specific credit error message from the RPC function
            if (rpcError.message.includes('Insufficient credits') || rpcError.message.includes('Training limit reached')) {
                // 402 for credits, 403 for limit reached (handled by frontend error display)
                const status = rpcError.message.includes('Insufficient credits') ? 402 : 403; 
                return new Response(JSON.stringify({ error: rpcError.message }), {
                    status: status, 
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            console.error("RPC Error (deduct_credits_and_create_model):", rpcError);
            throw new Error(`Erreur de transaction de crédits: ${rpcError.message}`);
        }
        
        modelId = new_model_id; // Store the newly created model ID
    }
    
    console.log(`[AI Trigger] DB entry created. Model ID: ${modelId}`);


    // 4. Check AI Service Key
    if (!REPLICATE_API_KEY) {
        throw new Error("Clé API IA manquante. Veuillez configurer la variable d'environnement REPLICATE_API_KEY.");
    }

    // Determine if cleaning should be applied
    const applyCleaning = cleaning_option === 'premium';

    // 5. Call Replicate API to start training
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
          model_name: modelId, // Use the new model ID as the external job identifier
          // Pass cleaning flag to the AI service
          apply_cleaning: applyCleaning, 
          // Webhook URL to update Supabase when training is complete/failed
          webhook: `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-ai-status`, 
          webhook_events_filter: ["completed", "failed"],
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
      
      console.error("Replicate API Error:", errorDetails);
      throw new Error(`Échec de l'appel à l'API IA. Détails: ${errorDetails}`);
    }

    const prediction = await replicateResponse.json();
    
    // 6. Update Supabase model status to 'processing' and link external job ID
    console.log(`[AI Trigger] Replicate job started. External ID: ${prediction.id}. Updating DB status.`);
    const { error: updateError } = await supabaseAdmin
      .from("voice_models")
      .update({ 
        status: "processing",
        external_job_id: prediction.id 
      })
      .eq("id", modelId);

    if (updateError) {
      console.error("Supabase Update Error (processing):", updateError);
      // We still return success here as the AI job was successfully triggered externally.
    }

    return new Response(JSON.stringify({ success: true, job_id: prediction.id, model_id: modelId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("AI Trigger Error:", error.message);
    
    // If an error occurred AFTER the DB entry was created (modelId exists), 
    // we must mark the model as failed, reset active_trainings, and refund credits (if not test mode).
    if (modelId && userId && cost_in_credits !== undefined) {
        const errorMessage = error.message || "Internal Server Error";
        
        // 7. Refund credits and mark as failed
        console.log(`[AI Trigger] Tentative de gestion de l'échec du modèle ${modelId}.`);
        
        // Update model status
        const { error: failError } = await supabaseAdmin
            .from("voice_models")
            .update({ status: "failed", error_message: errorMessage }) 
            .eq("id", modelId);
        
        if (failError) {
            console.error("Failed to mark model as failed:", failError);
        }
        
        // Reset user training status (decrement active_trainings)
        const profileUpdatePayload: { active_trainings: any, credits?: any } = {
            active_trainings: supabaseAdmin.raw('active_trainings - 1')
        };
        
        // Refund credits ONLY if not in test mode
        if (!isTestMode) {
            profileUpdatePayload.credits = supabaseAdmin.raw('credits + ??', cost_in_credits); // Safely increment credits
            console.log(`[AI Trigger] Remboursement de ${cost_in_credits} crédits.`);
        } else {
            console.log(`[AI Trigger] MODE TEST: Remboursement de crédits ignoré.`);
        }
        
        const { error: refundError } = await supabaseAdmin
            .from('profiles')
            .update(profileUpdatePayload)
            .eq('id', userId);
            
        if (refundError) {
            console.error("CRITICAL: Failed to refund credits/decrement active_trainings:", refundError);
        }
            
        // CRITICAL CLEANUP: Delete the source files
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