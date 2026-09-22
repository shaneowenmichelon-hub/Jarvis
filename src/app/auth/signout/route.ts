import { NextResponse } from "next/server";

import { siteUrl } from "@/lib/env";
import { supabaseAuth } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const supabase = await supabaseAuth();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${siteUrl()}/login`, { status: 303 });
}
