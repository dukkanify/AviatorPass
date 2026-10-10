import "@/styles/landing.css";

/**
 * Auth screens use `.hero-aviation` from the marketing stylesheet.
 * That file stays out of globals so other routes do not download it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
