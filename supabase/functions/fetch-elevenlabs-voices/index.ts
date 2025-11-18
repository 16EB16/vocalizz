// @ts-nocheck
/// <reference types="https://deno.land/std@0.190.0/http/server.ts" />

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!ELEVENLABS_API_KEY) {
        return new Response(JSON.stringify({ error: "ElevenLabs API Key is missing. Please configure the ELEVENLABS_API_KEY secret." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    
    // --- TEMPORARY CHECK: If the key is present, return success immediately ---
    // This confirms the environment variable is correctly loaded by the Edge Function runtime.
    // If you see "Key check successful" in the console, the key is loaded.
    // return new Response(JSON.stringify({ success: true, message: "Key check successful" }), {
    //     headers: { ...corsHeaders, "Content-Type": "application/json" },
    //     status: 200,
    // });
    // --- END TEMPORARY CHECK ---


    // Call ElevenLabs API to get all voices
    const elevenLabsResponse = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error("ElevenLabs API Error:", errorText);
      
      let errorMessage = `ElevenLabs API failed with status ${elevenLabsResponse.status}.`;
      try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.detail || errorMessage;
      } catch (e) {
          errorMessage = errorText.substring(0, 200);
      }
      
      throw new Error(`ElevenLabs API failed: ${errorMessage}`);
    }

    const data = await elevenLabsResponse.json();
    
    // Map voices to a simpler structure
    const voices = data.voices.map(voice => ({
        id: voice.voice_id,
        name: voice.name,
        modelId: voice.model_id,
        category: voice.category,
        labels: voice.labels,
    }));

    return new Response(JSON.stringify({ voices }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Fetch ElevenLabs Voices Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});