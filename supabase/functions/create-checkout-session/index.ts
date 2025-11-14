// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// import Stripe from "https://esm.sh/stripe@16.5.0?target=deno"; // Commented out for testing

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Initialize Stripe client using the secret key from environment variables
// const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
//   apiVersion: "2024-06-20",
//   httpClient: Stripe.createFetchHttpClient(),
// });

// Price ID for the Premium subscription (derived from the provided product details)
// const PREMIUM_PRICE_ID = "price_1STLoxBP8Akgd3ZkiVykNJ3J";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    // CORS Preflight handled correctly
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    // const { returnUrl } = await req.json(); // Commented out for testing
    
    // 1. Authenticate user via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the authenticated client to fetch user data securely
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user || !user.email) {
      return new Response(JSON.stringify({ error: "User not found or email missing." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // TEMPORARY SUCCESS RESPONSE
    return new Response(JSON.stringify({ url: "https://example.com/success-test", user_id: user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});