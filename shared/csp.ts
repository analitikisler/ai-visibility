// The app's Content-Security-Policy, shared by the Node server (server/src/index.ts) and the build, which writes it to
// web/dist/_headers for Cloudflare's static assets. Scripts load only from this origin, plus the inline theme script in
// index.html by its SHA-256 (computed from the built file). Styles allow inline because React and the chart library set
// style attributes. Images allow data: and blob: (generated previews, downloads).

/** `scriptHashes`: base64 SHA-256 of each inline <script> in the served index.html. */
export function contentSecurityPolicy(scriptHashes: string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self'${scriptHashes.map((h) => ` 'sha256-${h}'`).join('')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/** The bodies of the inline <script> elements (no src) in an HTML document, exactly as written. */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
}
