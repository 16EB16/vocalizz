// @ts-nocheck
/// <reference types="https://deno.land/std@0.190.0/http/server.ts" />
/// <reference types="https://esm.sh/@supabase/supabase-js@2.45.0" />

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  // const signature = req.headers.get('stripe-signature');
  // try {
  //   event = stripe.webhooks.constructEvent(
  //     await req.text(),
  //     signature!,
  //     Deno.env.get("STRIPE_WEBHOOK_SECRET")!
  //   );
  // } catch (err) {
  //   console.error(`Webhook signature verification failed: ${err.message}`);
  //   return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), { status: 400, headers: corsHeaders });
  // }

  try {
    const event = await req.json();
    const data = event.data.object;
    
    let customerId: string | undefined;
    let userId: string | undefined;
    let newRole: 'standard' | 'premium';
    let updatePayload: { role: 'standard' | 'premium', stripe_customer_id?: string } = { role: 'standard' };

    switch (event.type) {
      case 'checkout.session.completed':
        // Fired when a new subscription is created via Checkout
        customerId = data.customer as string;
        userId = data.metadata?.user_id as string; // Get user ID from session metadata
        newRole = 'premium';
        
        if (!userId) {
            console.error("Missing user_id in checkout session metadata.");
            return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        updatePayload = { role: newRole, stripe_customer_id: customerId };
        
        // Update profile directly using userId
        const { error: updateCheckoutError } = await supabaseAdmin
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId);

        if (updateCheckoutError) {
            console.error("Error updating user role/customer ID on checkout completion:", updateCheckoutError);
            throw new Error("Database update failed on checkout.");
        }
        
        return new Response(JSON.stringify({ received: true, updated_user: userId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });

      case 'customer.subscription.updated':
        // Fired when a subscription is renewed, upgraded, or downgraded
        customerId = data.customer as string;
        if (data.status === 'active') {
            newRole = 'premium';
        } else {
            // Handle cases like 'past_due', 'unpaid', etc.
            newRole = 'standard';
        }
        updatePayload = { role: newRole };
        break;

      case 'customer.subscription.deleted':
        // Fired when a subscription is canceled
        customerId = data.customer as string;
        newRole = 'standard';
        updatePayload = { role: newRole };
        break;

      default:
        // Ignore other events
        return new Response(JSON.stringify({ received: true, ignored: event.type }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
    }

    if (customerId) {
      // Find the user profile associated with this Stripe customer ID
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (profileError || !profile) {
        console.error(`Profile not found for customer ID: ${customerId}`);
        return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Update the user's role
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(updatePayload)
        .eq('id', profile.id);

      if (updateError) {
        console.error("Error updating user role:", updateError);
        throw new Error("Database update failed.");
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Stripe Webhook Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});