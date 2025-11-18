// @ts-nocheck
/// <reference types="https://deno.land/std@0.190.0/http/server.ts" />
/// <reference types="https://esm.sh/@supabase/supabase-js@2.43.0?target=deno" />

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0?target=deno";
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

const SUBSCRIPTION_CREDITS = {
    [PRICE_ID_PRO]: { role: 'pro', credits: 20 },
    [PRICE_ID_STUDIO]: { role: 'studio', credits: 100 },
};

const PACK_CREDITS = {
    [PRICE_ID_PACK_10]: 10,
    [PRICE_ID_PACK_50]: 50,
};
// --------------------------------------------------------------------


// Initialize Stripe client (used here mainly for signature verification in a real app)
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

// Use the Service Role Key for database updates
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

  // NOTE: In a production environment, you MUST verify the Stripe signature here.

  try {
    const event = await req.json();
    const data = event.data.object;
    
    let customerId: string | undefined;
    let userId: string | undefined;
    let updatePayload: { role?: 'free' | 'pro' | 'studio', stripe_customer_id?: string, credits?: any } = {};
    let priceId: string | undefined;

    switch (event.type) {
      case 'checkout.session.completed':
        customerId = data.customer as string;
        userId = data.metadata?.user_id as string; 
        // CRITICAL: Get the price ID from the line items for both subscription and payment modes
        priceId = data.line_items?.data?.[0]?.price?.id || data.price?.id; 

        if (!userId) {
            console.error("Missing user_id in checkout session metadata.");
            return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        // --- Handle Subscription Purchase (First time) ---
        if (SUBSCRIPTION_CREDITS[priceId]) {
            const { role, credits } = SUBSCRIPTION_CREDITS[priceId];
            
            updatePayload = { 
                role: role, 
                stripe_customer_id: customerId,
                // Add initial credits to the existing balance (default 5 free credits)
                credits: supabaseAdmin.raw('credits + ??', credits) 
            };
            
            console.log(`Subscription completed for user ${userId}. Setting role to ${role} and adding ${credits} credits.`);

        // --- Handle Credit Pack Purchase (One-time payment) ---
        } else if (PACK_CREDITS[priceId]) {
            const creditsToAdd = PACK_CREDITS[priceId];
            
            updatePayload = { 
                // Only update credits, keep existing role
                credits: supabaseAdmin.raw('credits + ??', creditsToAdd) 
            };
            
            console.log(`Credit pack purchased for user ${userId}. Adding ${creditsToAdd} credits.`);
        } else {
            console.warn(`Checkout session completed for unknown price ID: ${priceId}. Ignoring.`);
            return new Response(JSON.stringify({ received: true, ignored: "Unknown price ID" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            });
        }

        // Update profile directly using userId
        const { error: updateCheckoutError } = await supabaseAdmin
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId);

        if (updateCheckoutError) {
            console.error("Error updating user profile on checkout completion:", updateCheckoutError);
            throw new Error("Database update failed on checkout.");
        }
        
        return new Response(JSON.stringify({ received: true, updated_user: userId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });

      case 'invoice.payment_succeeded':
        // Fired on successful renewal payment for subscriptions
        customerId = data.customer as string;
        // Get price ID from the invoice line items
        priceId = data.lines?.data?.[0]?.price?.id;

        if (SUBSCRIPTION_CREDITS[priceId]) {
            const { credits } = SUBSCRIPTION_CREDITS[priceId];
            
            // Find user by customer ID
            const { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('id, role')
                .eq('stripe_customer_id', customerId)
                .single();

            if (profileError || !profile) {
                console.error(`Profile not found for customer ID: ${customerId} on renewal.`);
                return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            
            // Add monthly credits
            updatePayload = { 
                credits: supabaseAdmin.raw('credits + ??', credits) 
            };
            
            const { error: updateRenewalError } = await supabaseAdmin
                .from('profiles')
                .update(updatePayload)
                .eq('id', profile.id);

            if (updateRenewalError) {
                console.error("Error updating user credits on renewal:", updateRenewalError);
                throw new Error("Database update failed on renewal.");
            }
            
            console.log(`Subscription renewed for user ${profile.id}. Added ${credits} credits.`);
        }
        
        return new Response(JSON.stringify({ received: true, event: event.type }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });


      case 'customer.subscription.deleted':
        // Fired when a subscription is canceled
        customerId = data.customer as string;
        
        // Find the user profile associated with this Stripe customer ID
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single();

        if (profileError || !profile) {
            console.error(`Profile not found for customer ID: ${customerId} on cancellation.`);
            return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Downgrade the user's role to 'free'
        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ role: 'free' })
            .eq('id', profile.id);

        if (updateError) {
            console.error("Error downgrading user role:", updateError);
            throw new Error("Database update failed on cancellation.");
        }
        
        console.log(`Subscription deleted for user ${profile.id}. Role downgraded to free.`);
        
        return new Response(JSON.stringify({ received: true, event: event.type }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });

      default:
        // Ignore other events
        return new Response(JSON.stringify({ received: true, ignored: event.type }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
    }

  } catch (error) {
    console.error("Stripe Webhook Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});