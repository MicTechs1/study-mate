import { type User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  CAMPUS_DEV_USERS,
  isCampusDevStoreEnabled,
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "./env";
import { createMemoryCampusStore, type DevCampusSeed } from "./memory-store";
import { getSupabaseAdmin } from "./supabase-admin";
import { createSupabaseCampusStore } from "./supabase-store";
import type { CampusStore } from "./store";
import type { CampusActor } from "./types";

const DEV_COOKIE = "studymate-campus-dev";

let memoryStore: ReturnType<typeof createMemoryCampusStore> | null = null;

export function getCampusStore(): CampusStore | null {
  if (isCampusDevStoreEnabled()) {
    memoryStore ??= createMemoryCampusStore();
    return memoryStore;
  }
  const admin = getSupabaseAdmin();
  if (admin) return createSupabaseCampusStore(admin);
  return null;
}

export function resetMemoryCampusStore(seed?: DevCampusSeed) {
  memoryStore = createMemoryCampusStore(seed);
  return memoryStore;
}

export async function resolveCampusActor(request: Request): Promise<CampusActor | null> {
  if (isCampusDevStoreEnabled()) {
    const header = request.headers.get("x-campus-dev-user")?.trim();
    const cookie = readCookie(request, DEV_COOKIE);
    const userId = header || cookie;
    if (!userId || !CAMPUS_DEV_USERS[userId]) return null;
    const store = getCampusStore();
    return store ? store.getActor(userId) : { userId, roles: CAMPUS_DEV_USERS[userId] };
  }

  if (!isSupabaseConfigured()) return null;

  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  if (token) {
    const admin = getSupabaseAdmin();
    if (admin) {
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data.user) return actorFromUser(data.user.id);
    }
  }

  const user = await getCookieUser();
  if (!user) return null;
  return actorFromUser(user.id);
}

async function getCookieUser(): Promise<User | null> {
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Route handlers may be read-only for cookies.
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

async function actorFromUser(userId: string): Promise<CampusActor | null> {
  const store = getCampusStore();
  if (!store) return { userId, roles: ["student"] };
  const actor = await store.getActor(userId);
  return actor ?? { userId, roles: ["student"] };
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return "";
  const parts = header.split(";");
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export { DEV_COOKIE };
