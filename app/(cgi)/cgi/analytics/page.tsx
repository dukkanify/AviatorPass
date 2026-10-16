import { AnalyticsHubView } from "@/features/analytics";

export default function CgiAnalyticsPage() {
  return (
    <AnalyticsHubView
      roleLabel="CGI"
      defaultScope="learning"
      allowedScopes={["learning", "course", "instructor", "live"]}
    />
  );
}
