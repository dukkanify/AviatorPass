/** Conservative User-Agent check so crawlers do not mint Stripe Checkout Sessions. */
export function isLikelyCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /bot|crawler|spider|slurp|preview|facebookexternalhit|linkedinbot|whatsapp|telegrambot|discordbot|embedly|quora|pinterest|skypeuripreview|google-inspectiontool|applebot|bingpreview/i.test(
    userAgent,
  );
}
