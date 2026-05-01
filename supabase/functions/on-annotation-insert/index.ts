// Supabase Edge Function: triggered by webhook on annotations table insert
// Calls the transcoding worker with the annotation data
//
// Setup:
// 1. supabase functions deploy on-annotation-insert
// 2. In Supabase dashboard, create a webhook on the annotations table
//    (Database → Webhooks → Create) that fires on INSERT and POSTs to this function
// 3. Set secrets:
//    supabase secrets set WORKER_URL=https://your-worker.up.railway.app
//    supabase secrets set WORKER_SECRET=<shared-secret>

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface AnnotationRecord {
  id: string;
  source_url: string;
  source_type: 'youtube' | 'article' | 'podcast';
  clip_start_seconds: number | null;
  clip_end_seconds: number | null;
  status: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: AnnotationRecord;
  schema: string;
}

const WORKER_URL = Deno.env.get('WORKER_URL')!;
const WORKER_SECRET = Deno.env.get('WORKER_SECRET')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Only handle new processing-state annotations with media (not text-only article clips)
  if (
    payload.type !== 'INSERT' ||
    payload.record.status !== 'processing' ||
    payload.record.source_type === 'article'
  ) {
    return new Response('Skipped', { status: 200 });
  }

  const { id, source_url, source_type, clip_start_seconds, clip_end_seconds } = payload.record;

  if (clip_start_seconds === null || clip_end_seconds === null) {
    return new Response('Missing clip bounds', { status: 400 });
  }

  // Fire-and-forget to worker; worker is responsible for updating the annotation row
  try {
    const response = await fetch(`${WORKER_URL}/transcode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WORKER_SECRET}`,
      },
      body: JSON.stringify({
        annotation_id: id,
        source_url,
        source_type,
        start: clip_start_seconds,
        end: clip_end_seconds,
      }),
    });

    if (!response.ok) {
      console.error('worker rejected:', response.status, await response.text());
      return new Response('Worker error', { status: 502 });
    }

    return new Response(JSON.stringify({ queued: id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('worker call failed:', err);
    return new Response('Worker unreachable', { status: 503 });
  }
});
