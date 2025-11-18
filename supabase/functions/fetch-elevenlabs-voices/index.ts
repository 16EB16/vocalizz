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
    // No authentication needed here, as this fetches public data via the service key
    if (!ELEVENLABS_API_KEY) {
        throw new Response(JSON.stringify({ error: "ElevenLabs API Key is missing." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

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
      throw new Error(`ElevenLabs API failed: ${elevenLabsResponse.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await elevenLabsResponse.json();
    
    // Map voices to a simpler structure
    const voices = data.voices.map(voice => ({
        id: voice.voice_id,
        name: voice.name,
        modelId: voice.model_id,
        category: voice.category, // e.g., 'premade', 'cloned'
        labels: voice.labels, // useful for filtering language/gender
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