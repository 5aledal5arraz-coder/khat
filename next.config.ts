import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
    resolveAlias: {
      tailwindcss: require.resolve("tailwindcss"),
    },
  },
  experimental: {
    serverActions: {
      // Required for Studio audio uploads (large podcast files)
      bodySizeLimit: "200mb",
    },
    // The Studio audio upload is a Route Handler (POST /api/admin/studio/upload),
    // NOT a Server Action — it goes through the proxy, whose body limit defaults to
    // 10MB and silently truncates the request (→ "Failed to parse body as FormData").
    // Raise it to match validateAudioFile's 500MB cap so real 2h+ episode files upload.
    proxyClientMaxBodySize: "500mb",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/vi/**",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
    ],
  },
  // Runtime uploads land in public/ AFTER `next start` has indexed it, so Next
  // never serves them and the request falls through to a page route — sixteen
  // guest photos rendered as HTML on 2026-08-08 before anyone noticed. This
  // sends those requests to a handler that reads the disk per request; the full
  // account is in app/api/media/[dir]/[file]/route.ts.
  //
  // `afterFiles` on purpose: the boot index is checked FIRST, so every file
  // present at startup is still served statically and only genuinely-unknown
  // files reach the handler. It is also checked BEFORE dynamic routes, which is
  // what stops /guests/<hash>.jpg from being read as /guests/[slug] again.
  //
  // The extension is what separates the two: a guest page is /guests/<slug>
  // with no dot, and never matches.
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        {
          source:
            "/:dir(guests|content|home|partners|team|teasers)/:file(.+\\.(?:jpg|jpeg|png|webp|gif|avif))",
          destination: "/api/media/:dir/:file",
        },
      ],
      fallback: [],
    }
  },

  // Wave 3 — legacy Khat Map route shell deleted. These server-side
  // redirects keep email / chat / docs / bookmarks resolving to the
  // canonical Khat Brain destinations. They no longer depend on any
  // file under app/admin/khat-map (the folder no longer exists).
  // Permanent: false — flip to true once external links are confirmed
  // updated.
  async redirects() {
    return [
      // Sponsor → Partner rebrand. The page now lives at /partner; keep the old
      // /sponsor URL resolving for any existing links.
      {
        source: "/sponsor",
        destination: "/partner",
        permanent: false,
      },
      {
        source: "/admin/khat-map",
        destination: "/admin/khat-brain/seasons",
        permanent: false,
      },
      {
        source: "/admin/khat-map/v2",
        destination: "/admin/khat-brain/seasons/new",
        permanent: false,
      },
      {
        source: "/admin/khat-map/v2/:seasonId",
        destination: "/admin/khat-brain/seasons/:seasonId",
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
