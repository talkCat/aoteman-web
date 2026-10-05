// This file is protected and cannot be modified.
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.DATABASE_URL || "",
  process.env.DATABASE_SERVICE_ROLE_KEY || ""
);