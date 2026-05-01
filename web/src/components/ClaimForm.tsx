"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

export function ClaimForm({ annotationId }: { annotationId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: insertErr } = await supabase.from("claims").insert({
      annotation_id: annotationId,
      claimant_name: name || null,
      claimant_email: email,
      reason,
    });

    setSubmitting(false);
    if (insertErr) {
      setError("Failed to submit claim. Please try again.");
    } else {
      setDone(true);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 transition shadow-lg z-40"
      >
        File a Claim
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">File a Claim</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-zinc-500 hover:text-zinc-300 text-xl"
          >
            ×
          </button>
        </div>

        {done ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-zinc-200">Claim submitted.</p>
            <p className="text-sm text-zinc-500">
              We'll review your claim and respond to the email provided.
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
              If you believe this content infringes your copyright or other
              rights, submit a claim below.
            </p>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Your Name (optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Email *
              </label>
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
                Reason *
              </label>
              <textarea
                required
                rows={4}
                maxLength={5000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe your claim..."
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
              />
              <p className="text-xs text-zinc-600 text-right mt-1">
                {reason.length} / 5,000
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !email || !reason}
              className="w-full rounded-lg bg-zinc-100 text-zinc-900 px-4 py-2.5 text-sm font-medium hover:bg-white transition disabled:opacity-40"
            >
              {submitting ? "Submitting..." : "Submit Claim"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
