/** Pull a one-time code out of an email snippet, including spaces and extra words. */
export function otpDigitsFromText(text: string, length = 6): string {
  const source = text.normalize("NFKC");
  const runs = source.match(/\d+/g) ?? [];
  const exact = runs.find((run) => run.length === length);
  if (exact) return exact;
  const longer = runs.find((run) => run.length > length);
  if (longer) return longer.slice(0, length);
  return runs.join("").slice(0, length);
}
