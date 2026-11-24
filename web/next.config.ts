import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // PGlite — WASM-база с файлами рядом: Next не должен её склеивать в бандл
  serverExternalPackages: ['@electric-sql/pglite'],
  partialPrefetching: true,
  // заголовки безопасности: страницу нельзя встроить в чужую, камера только у нас
  headers: async () => [{
    source: '/:path*',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
    ],
  }, {
    source: '/sw.js',
    headers: [{ key: 'Cache-Control', value: 'no-cache' }],
  }],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
