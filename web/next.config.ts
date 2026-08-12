import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Embeds must be frameable from any origin; explicitly allow all
        // ancestors (and never send X-Frame-Options on this route). Keep
        // embed pages out of search indexes — the canonical page is /a/[slug].
        source: "/embed/:slug*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default nextConfig;
