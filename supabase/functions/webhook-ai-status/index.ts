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

    if (!externalJobId || !status) {
      return new Response(JSON.stringify({ error: "Invalid webhook payload." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let newStatus = status;
    if (status === 'succeeded') {
        newStatus = 'completed';
    } else if (status === 'canceled' || status === 'failed') {
        newStatus = 'failed'; 
    } else {
        // Ignore other statuses like 'starting', 'processing'
        return new Response(JSON.stringify({ success: true, ignored: status }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // 3. Fetch model details (need user_id, name, and cost_in_credits)
    const { data: model, error: fetchError } = await supabaseAdmin
        .from("voice_models")
        .select("id, user_id, name, cost_in_credits")
        .eq("external_job_id", externalJobId)
        .single();

    if (fetchError || !model) {
        console.error("Model not found for external job ID:", externalJobId);
        return new Response(JSON.stringify({ success: true, message: "Model not found, likely deleted by user." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    
    const { user_id, cost_in_credits } = model;

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
    }

    // 5. Reset user's active_trainings status AND handle refund if failed
    let refundMessage = "";
    
    // Always decrement active_trainings when a job finishes (completed or failed)
    const profileUpdatePayload: { active_trainings: any, credits?: any } = {
        active_trainings: supabaseAdmin.raw('active_trainings - 1')
    };

    if (newStatus === 'failed') {
        // Refund credits
        profileUpdatePayload.credits = supabaseAdmin.raw('credits + ??', cost_in_credits);
        refundMessage = ` (${cost_in_credits} crédits remboursés)`;
    }
    
    const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdatePayload)
        .eq('id', user_id);

    if (profileUpdateError) {
        console.error("Error updating user profile status/credits:", profileUpdateError);
        if (newStatus === 'failed') {
            refundMessage = " (Remboursement/Décrémentation échoué)";
        }
    }


    // 6. CRUCIAL: Delete source audio files if training succeeded OR failed
    if (newStatus === 'completed' || newStatus === 'failed') {
        const sanitizedModelName = sanitizeModelName(model.name);
        const storagePathPrefix = `${user_id}/${sanitizedModelName}/`;
        const bucketName = 'audio-files';

        // List all files in the model's directory
        const { data: listData, error: listError } = await supabaseAdmin.storage
            .from(bucketName)
            .list(storagePathPrefix, { limit: 100, offset: 0 });

        if (listError) {
            console.error("Error listing files for cleanup:", listError);
        } else if (listData.length > 0) {
            const filesToDelete = listData
                .filter(file => file.name !== '.emptyFolderPlaceholder')
                .map(file => `${storagePathPrefix}${file.name}`);
            
            if (filesToDelete.length > 0) {
                const { error: deleteError } = await supabaseAdmin.storage
                    .from(bucketName)
                    .remove(filesToDelete);

                if (deleteError) {
                    console.error("Error deleting source files after completion/failure:", deleteError);
                } else {
                    console.log(`Successfully deleted ${filesToDelete.length} source files for model ${model.id}.`);
                }
            }
        }
    }

    return new Response(JSON.stringify({ success: true, message: `Status updated to ${newStatus}${refundMessage}` }), {
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