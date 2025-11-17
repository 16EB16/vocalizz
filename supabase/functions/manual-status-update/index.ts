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
const sanitizeModelName = (name) => {
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

  // 1. Initialize Supabase Admin client (used for server-side updates and cleanup)
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    {
      auth: { persistSession: false },
    }
  );

  let authenticatedUserId;

  try {
    const body = await req.json();
    const { model_id, new_status, error_message } = body;

    if (!model_id || (new_status !== 'completed' && new_status !== 'failed')) {
      return new Response(JSON.stringify({ error: "Missing model_id or invalid status (must be 'completed' or 'failed')." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // --- AUTHENTICATION CHECK (Verify user ownership) ---
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
        return new Response(JSON.stringify({ error: "Forbidden: Invalid token." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    authenticatedUserId = user.id;
    // --- END AUTHENTICATION CHECK ---


    // 2. Fetch model details (and verify ownership)
    const { data: model, error: fetchError } = await supabaseAdmin
        .from("voice_models")
        .select("id, user_id, name")
        .eq("id", model_id)
        .eq("user_id", authenticatedUserId) // Ensure user owns the model
        .single();

    if (fetchError || !model) {
        console.error(`Model ${model_id} not found or unauthorized for user ${authenticatedUserId}.`);
        return new Response(JSON.stringify({ error: "Model not found or unauthorized." }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // 3. Update model status
    const updatePayload = { 
        status: new_status,
        error_message: new_status === 'failed' ? (error_message || "Statut mis à jour manuellement à 'failed'.") : null,
    };
    
    const { error: updateError } = await supabaseAdmin
      .from("voice_models")
      .update(updatePayload)
      .eq("id", model_id);

    if (updateError) {
      console.error("Supabase Update Error (manual status update):", updateError);
      throw new Error("Failed to update model status in DB.");
    }

    // 4. Reset user's is_in_training status
    const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ is_in_training: false })
        .eq('id', authenticatedUserId);

    if (profileUpdateError) {
        console.error("Error resetting user training status:", profileUpdateError);
        // Log error but continue
    }

    // 5. Delete source audio files
    await deleteSourceFiles(supabaseAdmin, authenticatedUserId, model.name);
    
    return new Response(JSON.stringify({ success: true, message: `Model status set to ${new_status}.` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Manual Status Update Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});