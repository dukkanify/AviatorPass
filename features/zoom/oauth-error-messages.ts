/**
 * Safe, user-facing Zoom OAuth failure copy (no secrets).
 * Keep in sync with classifyOAuthFailure reasons in oauth-service.
 */

export function zoomOAuthFailureUserMessage(reason: string | null | undefined): string {
  switch (reason) {
    case "denied":
      return "Zoom authorization was cancelled. Click Connect Zoom to try again.";
    case "missing_code":
    case "missing_state":
    case "invalid_state":
    case "state_expired":
      return "Zoom connection timed out or the session was lost. Click Connect Zoom and complete authorization in one flow.";
    case "token_exchange":
      return "Zoom rejected the connection credentials. Ask an admin to verify Instructor OAuth Client ID/Secret and redirect URL.";
    case "missing_user_scope":
      return "Zoom authorized, but the Marketplace app is missing the user:read:user scope. Enable it on General app 29, then Connect again.";
    case "already_linked":
      return "That Zoom account is already connected to another instructor.";
    case "profile":
      return "Zoom authorized, but we could not load your Zoom profile. Try Connect Zoom again.";
    default:
      return "Zoom connection failed. Try Connect Zoom again. If it persists, share the error reference with support.";
  }
}
