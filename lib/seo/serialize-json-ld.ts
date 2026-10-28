/**
 * Serialize JSON-LD for embedding in a script tag.
 * Escape `<` so untrusted strings cannot break out of </script>.
 */
export function serializeJsonLd(
  data: Record<string, unknown> | Record<string, unknown>[],
): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
