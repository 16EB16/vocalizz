// @ts-nocheck
/// <reference types="https://deno.land/std@0.190.0/http/server.ts" />
/// <reference types="https://esm.sh/@supabase/supabase-js@2.45.0" />

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  // Initialize Supabase Admin client
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    {
      auth: { persistSession: false },
    }
  );

  try {
    const body = await req.json();
    const { model_id, user_id } = body;

    if (!model_id || !user_id) {
      return new Response(JSON.stringify({ error: "Missing model_id or user_id." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch model details (need name for cleanup)
    const { data: model, error: fetchError } = await supabaseAdmin
        .from("voice_models")
        .select("name, external_job_id")
        .eq("id", model_id)
        .eq("user_id", user_id)
        .single();

    if (fetchError || !model) {
        console.error(`Model ${model_id} not found for user ${user_id}.`);
        return new Response(JSON.stringify({ error: "Model not found or unauthorized." }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // 2. Update model status to failed and record timeout error
    const errorMessage = "Entraînement annulé automatiquement: Dépassement du temps limite (Timeout).";
    
    const { error: updateError } = await supabaseAdmin
      .from("voice_models")
      .update({ 
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", model_id);

    if (updateError) {
      console.error("Supabase Update Error (stuck model):", updateError);
      throw new Error("Failed to update model status in DB.");
    }

    // 3. Reset user's is_in_training status
    const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ is_in_training: false })
        .eq('id', user_id);

    if (profileUpdateError) {
        console.error("Error resetting user training status:", profileUpdateError);
        // Log error but continue
    }

    // 4. Clean up source files
    await deleteSourceFiles(supabaseAdmin, user_id, model.name);
    
    // NOTE: In a real app, you would also call Replicate's API here to cancel the running job using model.external_job_id.

    return new Response(JSON.stringify({ success: true, message: "Model successfully marked as failed and cleaned up." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Cancel Stuck Training Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});