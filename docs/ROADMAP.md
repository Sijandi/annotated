# Annotated — Bounty Roadmap (3 rounds, winner Oct 1)

The thesis across rounds: **round 1 exceeds the spec, round 2 finds the business
in the spec, round 3 shows the company.** Annotated is the quotation layer for
the internet — moments-first discovery on the front, rights rails underneath,
and a professional curation workflow ("prescribed media") as the paying wedge.

## Round 1 — Exceed the spec (DONE, pending live validation)

- Real clip capture: tabCapture video + tab audio, crop-to-player, canvas fallback
- Exact duration clamp (90s marked = 90.0s delivered), 240p via ffmpeg pipeline
- Page metadata on every clip (og title/site/author/date), rendered on landing + feed
- Comments UI in the sidebar feed (follow already worked)
- Keyless worker architecture: worker-api edge function + self-healing poller
  (zero credentials on the transcode box, runs anywhere with ffmpeg)
- e2e harness: Playwright rig drives the real extension and generates clips

## Round 2 — The business in the spec

### Track A: Prescribed media (the professional wedge)
The paying user is an expert clipping the exact 90 seconds a specific client
needs, with professional commentary attached — coaches, PTs, teachers,
advisors. Loom's playbook: not "video," async video *for work*. Here: async
curation for work.

1. **Visibility** — `annotations.visibility` (public | unlisted). Unlisted =
   reachable by link, absent from feeds. RLS + feed queries updated.
2. **Collections** — `collections` + `collection_items` tables; "add to
   collection" in the sidebar; public/unlisted collection page on the web app
   (a reusable playlist: send every squat client the same "knee tracking"
   collection).
3. **Recipient experience** — landing/collection pages polished for a
   no-account recipient (clients install nothing); optional sender note
   ("from your coach") on shared links.

Demo narrative: Phil runs a real coaching practice — round-2 showcase is real
clips sent to real clients that week. Entrants show features; this shows a
working professional running his practice on the product.

### Track B: Rights rails (the claim-flip)
The spec's claim button, inverted from takedown funnel to supply-side
onboarding:

4. **Claim-flip** — claim page offers verify → then *takedown request,
   endorse, or license interest* (claims schema already has the status
   workflow; add endorsement surface on the annotation page: "endorsed by the
   creator").
5. **Embeddable clips** — iframe embed for landing pages (paste into
   Substack/Notion); every embed is distribution.

### Track C: Carry-over hardening
- Railway public worker deploy (webhook mode; poller stays as self-healing net)
- Pin extension ID via manifest `key` (kills the path-derived-ID auth breakage)
- Live capture validation matrix (grant, audio, Retina crop)
- Feed populated with real TWIST clips (e2e rig batch mode)

## Round 3 — Show the company

- Curator profiles: follower counts surfaced, clip portfolio, topic channels
- Moments-first feed: topic filters, trending by engagement velocity
- License-interest → actual transaction stub (creator sets a price, platform
  records intent — the take-rate story)
- The corpus pitch: human-curated, timestamped, source-linked moments as an
  API (provenance data for the AI-flooded web)

## Cut lines (explicitly not now)

- Team/seat features (B2B clip desk) — feature-company risk, revisit post-bounty
- Mobile anything
- Payments — round 3 shows the rails, not the checkout
