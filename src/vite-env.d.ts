/// <reference types="vite/client" />

declare global {
  // Deno environment types
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
  };

  // Remote module declarations for Supabase Edge Functions
  // This resolves TS2307 and TS2688 errors in the function files.
  module "https://deno.land/std@0.190.0/http/server.ts" {
    export function serve(handler: (req: Request) => Response | Promise<Response>): void;
  }
  
  module "https://esm.sh/@supabase/supabase-js@2.45.0" {
    import { SupabaseClient } from '@supabase/supabase-js';
    export function createClient<T>(supabaseUrl: string, supabaseKey: string, options?: any): SupabaseClient<T>;
  }

  module "https://esm.sh/stripe@16.5.0?target=deno" {
    import Stripe from 'stripe';
    export default Stripe;
  }
}