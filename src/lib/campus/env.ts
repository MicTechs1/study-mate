import type { CampusRole } from "@/lib/campus/types";

export function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

export function supabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
}

export function supabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function isSupabaseAdminConfigured() {
  return Boolean(supabaseUrl() && supabaseServiceRoleKey());
}

export function isCampusDevStoreEnabled() {
  return (
    process.env.CAMPUS_DEV_STORE === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export const CAMPUS_DEV_USERS: Record<string, CampusRole[]> = {
  "user-owen": ["student"],
  "user-ama": ["student"],
  "user-lecturer": ["lecturer"],
  "user-advisor": ["advisor"],
  "user-admin": ["admin"],
};
