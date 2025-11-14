// @ts-nocheck
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 1. Initialize Supabase client with Service Role Key to bypass RLS
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    {
      auth: { persistSession: false },
    }
  );

  try {
    const payload = await req.json();
    
    // 2. Validate payload
    const externalJobId = payload.id;
    const status = payload.status; // e.g., 'succeeded', 'failed', 'canceled'
    // const output = payload.output; // e.g., URLs to the final RVC files

    if (!externalJobId || !status) {
      return new Response(JSON.stringify({ error: "Invalid webhook payload." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let newStatus = status;
    if (status === 'succeeded') {
        newStatus = 'completed';
    } else if (status === 'canceled') {
        newStatus = 'failed'; // Treat cancellation as failure for model creation
    }

    // 3. Fetch model details before updating status
    const { data: model, error: fetchError } = await supabaseAdmin
        .from("voice_models")
        .select("id, user_id, name")
        .eq("external_job_id", externalJobId)
        .single();

    if (fetchError || !model) {
        console.error("Model not found for external job ID:", externalJobId);
        // If the model is not found, it might have been deleted by the user. We return 200 to stop retries.
        return new Response(JSON.stringify({ success: true, message: "Model not found, likely deleted by user." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // 4. Update the voice_models table status
    const { error: updateError } = await supabaseAdmin
      .from("voice_models")
      .update({ 
        status: newStatus,
        // In a real app, you would store output URLs here:
        // final_model_url: output.pth_file,
        // final_index_url: output.index_file,
      })
      .eq("id", model.id);

    if (updateError) {
      console.error("Supabase Webhook Update Error:", updateError);
      // We continue to the next step even if model update failed, as resetting user status is critical.
    }

    // 5. Reset user's is_in_training status
    const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ is_in_training: false })
        .eq('id', model.user_id);

    if (profileUpdateError) {
        console.error("Error resetting user training status:", profileUpdateError);
        // Log error but continue
    }


    // 6. CRUCIAL: Delete source audio files if training succeeded
    if (newStatus === 'completed') {
        const sanitizedModelName = sanitizeModelName(model.name);
        const storagePathPrefix = `${model.user_id}/${sanitizedModelName}/`;
        const bucketName = 'audio-files';

        // List all files in the model's directory
        const { data: listData, error: listError } = await supabaseAdmin.storage
            .from(bucketName)
            .list(storagePathPrefix, { limit: 100, offset: 0 });

        if (listError) {
            console.error("Error listing files for cleanup:", listError);
            // Log error but continue, as the main job succeeded
        } else if (listData.length > 0) {
            const filesToDelete = listData
                .filter(file => file.name !== '.emptyFolderPlaceholder')
                .map(file => `${storagePathPrefix}${file.name}`);
            
            if (filesToDelete.length > 0) {
                const { error: deleteError } = await supabaseAdmin.storage
                    .from(bucketName)
                    .remove(filesToDelete);

                if (deleteError) {
                    console.error("Error deleting source files after completion:", deleteError);
                    // Log error but continue
                } else {
                    console.log(`Successfully deleted ${filesToDelete.length} source files for model ${model.id}.`);
                }
            }
        }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Webhook processing error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});