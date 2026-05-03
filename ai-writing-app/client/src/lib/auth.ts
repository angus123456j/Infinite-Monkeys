import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const id = data.user?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}

/**
 * A session is "registered" only if a real user (not Supabase anonymous) is signed in.
 * Anonymous sessions exist for the trial editor; they must NEVER unlock Drive,
 * Stripe checkout, or anything that requires an email.
 */
export function isRegisteredSession(session: Session | null | undefined): boolean {
  const user = session?.user;
  if (!user) return false;
  return user.is_anonymous !== true;
}

/**
 * If the current session is anonymous, sign it out so flows that require a
 * real account (signup, login, checkout) start from a clean slate.
 * No-op when there is no session, or when the session is already a real user.
 */
export async function clearAnonymousSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.is_anonymous === true) {
    await supabase.auth.signOut();
  }
}
