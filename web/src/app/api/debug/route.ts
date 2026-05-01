import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Missing env vars", url: !!url, key: !!key });
  }

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("annotations")
      .select("id, slug, status")
      .limit(1)
      .single();

    return NextResponse.json({ data, error: error?.message ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
