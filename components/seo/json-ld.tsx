import { serializeJsonLd } from "@/lib/seo/serialize-json-ld";

type JsonLdProps = {
  data: Record<string, unknown> | Record<string, unknown>[];
};

/** Server-safe JSON-LD script for search engines. */
function JsonLd({ data }: JsonLdProps) {
  // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
  // Content is JSON.stringify'd with `<` escaped via serializeJsonLd (not raw HTML/user markup).
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
  );
}

export { JsonLd };
export { serializeJsonLd } from "@/lib/seo/serialize-json-ld";
