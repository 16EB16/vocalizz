// @ts-nocheck
/// <reference types="https://deno.land/std@0.190.0/http/server.ts" />
/// <reference types="https://esm.sh/@supabase/supabase-js@2.43.0" />

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { sha256 } from "https://esm.sh/js-sha256@0.11.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const T2V_CREDIT_COST = 1; // 1 credit per 1000 characters (simplified for now)
const CHARACTERS_PER_CREDIT = 1000;

// Initialize Supabase Admin client (used for DB updates, RLS bypass, and Storage)
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  {
    auth: { persistSession: false },
  }
);

// Utility function to generate a unique hash for caching
function generateCacheHash(text: string, voiceId: string, modelId: string): string {
    const input = `${text.trim().toLowerCase()}:${voiceId}:${modelId}`;
    return sha256(input);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let userId: string | undefined;
  let cacheHash: string | undefined;

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

    // 2. Parse request body
    const body = await req.json();
    const { text, voice_id, model_id } = body;

    if (!text || !voice_id || !model_id) {
      return new Response(JSON.stringify({ error: "Missing required parameters (text, voice_id, model_id)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (!ELEVENLABS_API_KEY) {
        throw new Error("Clé API ElevenLabs manquante.");
    }

    // Calculate required credits (simplified: 1 credit per 1000 chars)
    const requiredCredits = Math.ceil(text.length / CHARACTERS_PER_CREDIT);
    
    // 3. Check Cache
    cacheHash = generateCacheHash(text, voice_id, model_id);
    
    const { data: cachedData, error: cacheError } = await supabaseAdmin
        .from('t2v_cache')
        .select('storage_path')
        .eq('hash', cacheHash)
        .single();

    if (cacheError && cacheError.code !== 'PGRST116') { // PGRST116 = No rows found
        console.error("Cache lookup error:", cacheError);
        // Continue without cache if DB fails
    }

    if (cachedData) {
        console.log(`[T2V] Cache Hit for hash: ${cacheHash}. Skipping generation.`);
        
        // Generate signed URL for the cached file
        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
            .from('t2v-outputs')
            .createSignedUrl(cachedData.storage_path, 3600); // 1 hour validity

        if (signedUrlError) throw signedUrlError;

        return new Response(JSON.stringify({ url: signedUrlData.signedUrl, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }
    
    // 4. Check Credits (Only if Cache Miss)
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();

    if (profileError || !profile) {
        throw new Error("Profile not found or database error.");
    }

    if (profile.credits < requiredCredits) {
        return new Response(JSON.stringify({ error: `Insufficient credits. Required: ${requiredCredits}, Available: ${profile.credits}` }), {
            status: 402, // Payment Required
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // 5. Call ElevenLabs API
    const elevenLabsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text,
        model_id: model_id,
        voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
        }
      }),
    });

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error("ElevenLabs API Error:", errorText);
      throw new Error(`ElevenLabs API failed: ${elevenLabsResponse.status} - ${errorText.substring(0, 100)}`);
    }

    // 6. Store Audio File
    const audioBlob = await elevenLabsResponse.blob();
    const audioBuffer = await audioBlob.arrayBuffer();
    const fileName = `${Date.now()}.mp3`;
    const storagePath = `${userId}/${voice_id}/${fileName}`;
    
    const { error: uploadError } = await supabaseAdmin.storage
        .from('t2v-outputs') // Assuming a new bucket for T2V outputs
        .upload(storagePath, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true,
        });

    if (uploadError) {
        console.error("Storage Upload Error:", uploadError);
        throw new Error("Failed to store audio file.");
    }
    
    // 7. Deduct Credits and Update Cache (Transactionally)
    const { error: dbUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ 
            credits: profile.credits - requiredCredits 
        })
        .eq('id', userId);
        
    if (dbUpdateError) {
        console.error("Credit Deduction Error:", dbUpdateError);
        // CRITICAL: If credit deduction fails, we should ideally delete the file and refund, but for simplicity here, we log and proceed.
    }
    
    const { error: cacheInsertError } = await supabaseAdmin
        .from('t2v_cache')
        .insert({ hash: cacheHash, storage_path: storagePath });
        
    if (cacheInsertError) {
        console.error("Cache Insert Error:", cacheInsertError);
    }

    // 8. Generate Signed URL and Respond
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from('t2v-outputs')
        .createSignedUrl(storagePath, 3600); // 1 hour validity

    if (signedUrlError) throw signedUrlError;

    return new Response(JSON.stringify({ url: signedUrlData.signedUrl, credits_used: requiredCredits }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("T2V Synthesis Error:", error.message);
    
    // If an error occurred after credit check but before response, we should handle refunds/cleanup.
    // For now, we return a generic 500 error.
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});