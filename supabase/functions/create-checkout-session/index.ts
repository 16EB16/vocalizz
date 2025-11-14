// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Initialize Stripe client using the secret key from environment variables
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

// Price ID for the Premium subscription (derived from the provided product details)
const PREMIUM_PRICE_ID = "price_1STLoxBP8Akgd3ZkiVykNJ3J";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const { returnUrl } = await req.json();
    
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

    if (profileError && profileError.code !== 'PGRST116') throw profileError; // PGRST116 = no rows found

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

      // Update Supabase profile with new customer ID
      const { error: updateError } = await supabaseClient
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
        
      if (updateError) {
        console.error("Error updating profile with customer ID:", updateError);
        // Log error but proceed, as the customer is created in Stripe.
      }
    }
    
    // 3. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      billing_address_collection: "auto",
      customer: customerId,
      line_items: [
        {
          price: PREMIUM_PRICE_ID, // Use the hardcoded Price ID
          quantity: 1,
        },
      ],
      mode: "subscription",
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