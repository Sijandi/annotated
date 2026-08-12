"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

// Viewer-side licensing affordance: anyone interested in using this clip
// commercially can leave contact details. Writes license_interests with
// role='licensee' (anonymous insert allowed by RLS).
export function LicenseInterestButton({ annotationId }: { annotationId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: insertErr } = await supabase.from("license_interests").insert({
      annotation_id: annotationId,
      contact_email: email,
      role: "licensee",
      message: message || null,
    });

    setSubmitting(false);
    if (insertErr) {
      setError("Failed to submit. Please try again.");
    } else {
      setDone(true);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-600 hover:text-zinc-400 transition"
      >
        Want to use this clip? License it →
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">License this clip</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-zinc-500 hover:text-zinc-300 text-xl"
          >
            ×
          </button>
        </div>

        {done ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-zinc-200">Interest recorded.</p>
            <p className="text-sm text-zinc-500">
              We&apos;ll connect you with the rights holder at the email
              provided.
            </p>
            <button
              onClick={() => setOpen(false)}
              className="mt-4 text-sm text-zinc-400 hover:text-zinc-200 transition"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-zinc-400">
              Interested in using this clip commercially? Leave your contact
              and we&apos;ll broker an introduction to the rights holder.
            </p>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                What do you want to use it for? (optional)
              </label>
              <textarea
                rows={3}
                maxLength={1000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Intended use, format, audience..."
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !email}
              className="w-full rounded-lg bg-zinc-100 text-zinc-900 px-4 py-2.5 text-sm font-medium hover:bg-white transition disabled:opacity-40"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
