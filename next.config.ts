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
