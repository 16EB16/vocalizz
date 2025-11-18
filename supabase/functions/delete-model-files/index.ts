// @ts-nocheck
/// <reference types="https://deno.land/std@0.190.0/http/server.ts" />
/// <reference types="https://unpkg.com/@supabase/supabase-js@2.43.0/dist/module/index.js" />

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://unpkg.com/@supabase/supabase-js@2.43.0/dist/module/index.js";

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

// Use the Service Role Key for file deletion (requires elevated privileges)
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  {
    auth: { persistSession: false },
  }
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { model_id, user_id, model_name } = await req.json();

    if (!model_id || !user_id || !model_name) {
      return new Response(JSON.stringify({ error: "Missing required parameters (model_id, user_id, model_name)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Construct the storage path prefix (must match the path used during upload)
    const sanitizedModelName = sanitizeModelName(model_name);
      
    const storagePathPrefix = `${user_id}/${sanitizedModelName}/`;
    const bucketName = 'audio-files';

    // 2. List all files in the model's directory
    const { data: listData, error: listError } = await supabaseAdmin.storage
      .from(bucketName)
      .list(storagePathPrefix, {
        limit: 100, // Assuming max 100 files per model
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (listError) {
      console.error("Error listing files:", listError);
      throw new Error("Failed to list files for deletion.");
    }

    if (listData.length === 0) {
        // No files found, proceed to success
        return new Response(JSON.stringify({ success: true, message: "No files found to delete." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }

    // 3. Extract file paths relative to the bucket root
    // We must ensure we only delete files, not directories, by checking if the name is not empty/a placeholder
    const filesToDelete = listData
        .filter(file => file.name !== '.emptyFolderPlaceholder') // Ignore placeholder files if any
        .map(file => `${storagePathPrefix}${file.name}`);

    if (filesToDelete.length === 0) {
        return new Response(JSON.stringify({ success: true, message: "No actual files found to delete." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }

    // 4. Delete the files
    const { error: deleteError } = await supabaseAdmin.storage
      .from(bucketName)
      .remove(filesToDelete);

    if (deleteError) {
      console.error("Error deleting files:", deleteError);
      throw new Error("Failed to delete files from storage.");
    }

    return new Response(JSON.stringify({ success: true, deleted_count: filesToDelete.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Delete Model Files Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});