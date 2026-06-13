/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /** Smaller deployable for Docker / Node hosting: https://nextjs.org/docs/app/api-reference/next-config-js/output */
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["pg", "bcryptjs", "pdf-parse", "pdfjs-dist"],
    /** Trust X-Forwarded-Host/Proto from Caddy and server.prod when proxied. */
    trustHost: true,
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "nextjs.org",
        pathname: "/icons/**",
      },
    ],
  },

  async headers() {
    const base = [
      { key: "X-DNS-Prefetch-Control", value: "on" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(self), geolocation=()",
      },
    ];

    if (isProd) {
      base.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [{ source: "/:path*", headers: base }];
  },
};

export default nextConfig;
