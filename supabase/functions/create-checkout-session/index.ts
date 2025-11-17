// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- CONFIGURATION DES PRIX (Utilisation des IDs de Produit fournis comme IDs de Prix) ---
const PRICE_ID_PRO = "prod_TRHMJTr0niy6sB"; 
const PRICE_ID_STUDIO = "prod_TRHOTQn3cmA3BQ"; 
const PRICE_ID_PACK_10 = "prod_TRHQ9KiesC5ZEl";
const PRICE_ID_PACK_50 = "prod_TRHSQFBfyRBoTa";
// --------------------------------------------------------------------

// Initialize Stripe client using the secret key from environment variables
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const { returnUrl, priceId: inputPriceId, mode } = await req.json(); 
    
    if (!inputPriceId || !mode) {
        return new Response(JSON.stringify({ error: "Missing priceId or mode in request body." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    
    let finalPriceId = inputPriceId;

    // CRITICAL FIX: If the input is a Product ID (prod_...), fetch the default Price ID.
    if (inputPriceId.startsWith('prod_')) {
        console.log(`Input is a Product ID (${inputPriceId}). Fetching default price.`);
        
        const product = await stripe.products.retrieve(inputPriceId, {
            expand: ['default_price'],
        });

        if (product.default_price && typeof product.default_price !== 'string') {
            finalPriceId = product.default_price.id;
            console.log(`Found default Price ID: ${finalPriceId}`);
        } else {
            throw new Error(`No default price found for product ID: ${inputPriceId}.`);
        }
    }


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

    // 2. Fetch or create Stripe Customer ID
    const { data: profileData, error: profileError } = await supabaseClient
      .from("profiles")
      .select("stripe_customer_id, first_name, last_name")
      .eq("id", user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') throw profileError; 

    let customerId = profileData?.stripe_customer_id;

    if (!customerId) {
      // Create new Stripe customer
      const customerName = [profileData?.first_name, profileData?.last_name].filter(Boolean).join(' ') || user.email;
      
      const customer = await stripe.customers.create({
        email: user.email,
        name: customerName,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Update Supabase profile with new customer ID (using the authenticated client)
      const { error: updateError } = await supabaseClient
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
        
      if (updateError) {
        console.error("Error updating profile with customer ID:", updateError);
      }
    }
    
    // 3. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      billing_address_collection: "auto",
      customer: customerId,
      line_items: [
        {
          price: finalPriceId, // Use the resolved Price ID
          quantity: 1,
        },
      ],
      mode: mode, // 'subscription' or 'payment' (for packs)
      success_url: `${returnUrl}?success=true`,
      cancel_url: `${returnUrl}?canceled=true`,
      // Pass user ID to webhook via metadata for reliable profile update
      metadata: {
        user_id: user.id,
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
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