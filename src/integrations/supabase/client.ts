// This file is protected and cannot be modified.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_DATABASE_URL || "",
  process.env.NEXT_PUBLIC_DATABASE_PUBLISHABLE_KEY || "",
  {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
