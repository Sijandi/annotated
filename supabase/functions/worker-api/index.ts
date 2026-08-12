// worker-api: privileged bridge between the keyless transcode worker and Supabase.
// The worker holds NO Supabase credentials - it authenticates with a shared secret
// whose SHA-256 hash lives in the service-role-only worker_config table. All
// storage writes and status updates happen here, inside the platform trust boundary.
//
// Ops:
//   GET  ?op=pending            -> processing annotations ready for transcode
//   POST ?op=complete&id=&ext=  -> body = transcoded media; upload + publish
//   POST ?op=fail&id=           -> body = {"error": string}; mark failed
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorized(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-worker-secret");
  if (!secret) return false;
  const { data } = await supabase
    .from("worker_config")
    .select("value")
    .eq("key", "worker_secret_sha256")
    .single();
  if (!data?.value) return false;
  return (await sha256Hex(secret)) === data.value;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (!(await authorized(req))) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const op = url.searchParams.get("op");

  if (op === "pending" && req.method === "GET") {
    // 20s grace so the extension finishes uploading raw media + crop sidecar first.
    const cutoff = new Date(Date.now() - 20_000).toISOString();
    const { data, error } = await supabase
      .from("annotations")
      .select("id, source_type, media_url, clip_start_seconds, clip_end_seconds, slug, created_at")
      .eq("status", "processing")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(5);
    if (error) return json({ error: error.message }, 500);
    return json({ jobs: data });
  }

  if (op === "complete" && req.method === "POST") {
    const id = url.searchParams.get("id");
    const ext = url.searchParams.get("ext");
    if (!id || !ext || !(["mp4", "mp3"].includes(ext))) return json({ error: "bad params" }, 400);
    const contentType = ext === "mp4" ? "video/mp4" : "audio/mpeg";
    const body = new Uint8Array(await req.arrayBuffer());
    if (body.length === 0) return json({ error: "empty body" }, 400);

    const path = `${id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("clips")
      .upload(path, body, { contentType, upsert: true });
    if (upErr) return json({ error: `upload: ${upErr.message}` }, 500);

    const { data: pub } = supabase.storage.from("clips").getPublicUrl(path);
    const { error: dbErr } = await supabase
      .from("annotations")
      .update({ media_url: pub.publicUrl, status: "published", error_message: null })
      .eq("id", id)
      .eq("status", "processing");
    if (dbErr) return json({ error: `update: ${dbErr.message}` }, 500);
    return json({ published: id, media_url: pub.publicUrl });
  }

  if (op === "fail" && req.method === "POST") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "bad params" }, 400);
    const { error: msg } = await req.json().catch(() => ({ error: "unknown" }));
    const { error: dbErr } = await supabase
      .from("annotations")
      .update({ status: "failed", error_message: String(msg).slice(0, 500) })
      .eq("id", id)
      .eq("status", "processing");
    if (dbErr) return json({ error: dbErr.message }, 500);
    return json({ failed: id });
  }

  return json({ error: "unknown op" }, 400);
});
