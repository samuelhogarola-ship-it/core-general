import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createConvertHandler } from "./handler.js";

// Validate the user and let PostgreSQL enforce tenant RLS in a single transaction.
// Never use SERVICE_ROLE here: it bypasses those policies.
serve(
  createConvertHandler((token: string) =>
    createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      },
    ),
  ),
);
