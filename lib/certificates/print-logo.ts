import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const OFFICIAL_LOCKUP = "public/brand/logo.png";

function mimeFor(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function publicBrandPath(url: string): string | null {
  const path = url.split("?")[0] ?? "";
  if (!path.startsWith("/brand/")) return null;
  const file = join(process.cwd(), "public", path);
  return existsSync(file) ? file : null;
}

/** Official horizontal lockup, inlined so print/PDF never clips or 404s `/brand/logo.png`. */
export function embedCertificateLogo(url?: string | null): string {
  const preferred = url ? publicBrandPath(url) : null;
  const fallback = join(process.cwd(), OFFICIAL_LOCKUP);
  const file =
    preferred && !preferred.endsWith("icon.png") && !preferred.endsWith("icon-light.png")
      ? preferred
      : fallback;
  const source = existsSync(file) ? file : fallback;
  const buf = readFileSync(source);
  return `data:${mimeFor(source)};base64,${buf.toString("base64")}`;
}
