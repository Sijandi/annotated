"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

// Claim-flip flow. First question: "Is this your content?"
//  - "I want it removed"   → dispute path (claims, claim_type='dispute')
//  - "It's mine — verify"  → verify path (claims, claim_type='verify') with
//    optional ENDORSE (endorsements row) and/or licensing opt-in
//    (license_interests row, role='creator').
// All inserts are anonymous-allowed by RLS; uses the anon client.
type Step = "intent" | "dispute" | "verify" | "done";

export function ClaimForm({ annotationId }: { annotationId: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("intent");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [endorse, setEndorse] = useState(true);
  const [endorseMessage, setEndorseMessage] = useState("");
  const [licensing, setLicensing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [doneText, setDoneText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setStep("intent");
    setError(null);
  };

  const handleDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: insertErr } = await supabase.from("claims").insert({
      annotation_id: annotationId,
      claimant_name: name || null,
      claimant_email: email,
      reason,
      claim_type: "dispute",
    });

    setSubmitting(false);
    if (insertErr) {
      setError("Failed to submit claim. Please try again.");
    } else {
      setDoneText("We'll review your claim and respond to the email provided.");
      setStep("done");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: claimErr } = await supabase.from("claims").insert({
      annotation_id: annotationId,
      claimant_name: name || null,
      claimant_email: email,
      reason: [
        "Ownership verification request.",
        endorse ? "Wants to endorse this clip." : null,
        licensing ? "Open to licensing." : null,
      ]
        .filter(Boolean)
        .join(" "),
      claim_type: "verify",
    });

    if (claimErr) {
      setSubmitting(false);
      setError("Failed to submit. Please try again.");
      return;
    }

    if (endorse) {
      const { error: endorseErr } = await supabase.from("endorsements").insert({
        annotation_id: annotationId,
        claimant_email: email,
        display_name: name || null,
        message: endorseMessage || null,
      });
      // 23505: an endorsement already exists for this annotation — the
      // verification claim still went through, so don't fail the flow.
      if (endorseErr && endorseErr.code !== "23505") {
        setSubmitting(false);
        setError("Failed to record your endorsement. Please try again.");
        return;
      }
    }

    if (licensing) {
      const { error: licenseErr } = await supabase
        .from("license_interests")
        .insert({
          annotation_id: annotationId,
          contact_email: email,
          role: "creator",
          message: null,
        });
      if (licenseErr) {
        setSubmitting(false);
        setError("Failed to record licensing interest. Please try again.");
        return;
      }
    }

    setSubmitting(false);
    setDoneText(
      endorse
        ? "Thanks — your endorsement is live, and we'll verify ownership at the email provided."
        : "Thanks — we'll verify ownership at the email provided."
    );
    setStep("done");
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
          <h2 className="text-lg font-semibold">
            {step === "intent" && "Is this your content?"}
            {step === "dispute" && "Request Removal"}
            {step === "verify" && "Verify Ownership"}
            {step === "done" && "Submitted"}
          </h2>
          <button
            onClick={close}
            className="text-zinc-500 hover:text-zinc-300 text-xl"
          >
            ×
          </button>
        </div>

        {step === "intent" && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              If you&apos;re the creator or rights holder of the source content,
              tell us how you&apos;d like to handle this clip.
            </p>
            <button
              onClick={() => setStep("verify")}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 hover:border-zinc-500 p-4 text-left transition"
            >
              <p className="text-sm font-medium text-zinc-100">
                It&apos;s mine — verify
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Endorse the clip, or open a licensing conversation.
              </p>
            </button>
            <button
              onClick={() => setStep("dispute")}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-600 p-4 text-left transition"
            >
              <p className="text-sm font-medium text-zinc-300">
                I want it removed
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                File a copyright or rights dispute.
              </p>
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-6 space-y-2">
            <p className="text-zinc-200">Submitted.</p>
            <p className="text-sm text-zinc-500">{doneText}</p>
            <button
              onClick={close}
              className="mt-4 text-sm text-zinc-400 hover:text-zinc-200 transition"
            >
              Close
            </button>
          </div>
        )}

        {step === "dispute" && (
          <form onSubmit={handleDispute} className="space-y-4">
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

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !email || !reason}
              className="w-full rounded-lg bg-zinc-100 text-zinc-900 px-4 py-2.5 text-sm font-medium hover:bg-white transition disabled:opacity-40"
            >
              {submitting ? "Submitting..." : "Submit Claim"}
            </button>
          </form>
        )}

        {step === "verify" && (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm text-zinc-400">
              Great — tell us who you are and we&apos;ll verify ownership at
              your email.
            </p>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Your Name (shown publicly if you endorse)
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

            <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={endorse}
                onChange={(e) => setEndorse(e.target.checked)}
                className="mt-0.5 accent-zinc-100"
              />
              <span>
                <span className="block text-sm text-zinc-200">
                  Endorse this clip
                </span>
                <span className="block text-xs text-zinc-500 mt-0.5">
                  Shows &ldquo;Endorsed by you&rdquo; on the clip — the
                  strongest signal a clip can carry.
                </span>
              </span>
            </label>

            {endorse && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  A note to go with your endorsement (optional)
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={endorseMessage}
                  onChange={(e) => setEndorseMessage(e.target.value)}
                  placeholder="Glad this moment landed..."
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
                />
              </div>
            )}

            <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={licensing}
                onChange={(e) => setLicensing(e.target.checked)}
                className="mt-0.5 accent-zinc-100"
              />
              <span>
                <span className="block text-sm text-zinc-200">
                  Open to licensing
                </span>
                <span className="block text-xs text-zinc-500 mt-0.5">
                  Let interested parties reach you about licensed use of this
                  content.
                </span>
              </span>
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !email || (!endorse && !licensing)}
              className="w-full rounded-lg bg-zinc-100 text-zinc-900 px-4 py-2.5 text-sm font-medium hover:bg-white transition disabled:opacity-40"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            {!endorse && !licensing && (
              <p className="text-xs text-zinc-600 text-center">
                Pick at least one — endorse, licensing, or both.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
