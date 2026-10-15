import { AnalyticsHubView } from "@/features/analytics";
import { ReportsDashboardView } from "@/features/certificates";

export default function CgiReportsPage() {
  return (
    <div className="space-y-10">
      <AnalyticsHubView
        roleLabel="CGI"
        defaultScope="live"
        allowedScopes={["learning", "course", "instructor", "live"]}
      />
      <div className="border-t pt-8">
        <ReportsDashboardView roleLabel="CGI" scope="admin" />
      </div>
    </div>
  );
}
