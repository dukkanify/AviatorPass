# Zoom Marketplace — App Beta “Insufficient Evidence” — Evidence Index

**App:** AviatorPass for Zoom (User-managed OAuth, Client ID suffix `Z0xA`)  
**Date:** 28 October 2026 (Asia/Dubai)  
**Submit:** Do not submit without owner approval

## Mapping to typical Beta security evidence requests

| Evidence item | Status | Path / URL |
| --- | --- | --- |
| SSDLC description | Complete (verified practices) | `docs/security/SSDLC_EVIDENCE.md` |
| SAST original report | Complete | `/opt/cursor/artifacts/security-beta/semgrep-sast-before.json` (+ `.txt`) |
| SAST after remediation | Complete | `/opt/cursor/artifacts/security-beta/semgrep-sast-after.json` |
| SAST tool/version | Complete | Semgrep **1.182.1** (`semgrep-version.txt`) |
| DAST original report | Complete (localhost controlled) | `/opt/cursor/artifacts/security-beta/zap-dast-report.xml` |
| DAST tool/version | Complete | OWASP ZAP **2.16.1** (`zap-version.txt`, `zap-dast-summary.txt`) |
| TLS 1.2+ verification | Complete | `/opt/cursor/artifacts/security-beta/tls-verification.txt` |
| Privacy Policy URL | Complete | https://www.aviatorpass.com/legal/privacy (Zoom section in repo; deploy required for live copy) |
| Security Policy | Complete | `docs/security/SECURITY_POLICY.md` |
| Incident Management & Response | Complete | `docs/security/INCIDENT_MANAGEMENT_AND_RESPONSE.md` |
| Vulnerability Management | Complete | `docs/security/VULNERABILITY_MANAGEMENT.md` |
| Independent pen-test certificate | **Missing** | Not available — do not invent |
| Formal Bug Bounty attestation | **Missing** | Not operated as a public bounty program |

## Residual technical gaps (honest)

- Semgrep WARNING remains on JSON-LD `dangerouslySetInnerHTML` (mitigated via `serializeJsonLd` escape).
- `npm audit` still reports dependency highs (Next critical cleared via 15.5.28; remaining highs largely transitive / major-upgrade deferred).
- ZAP Medium: CSP enforcing header not set (CSP Report-Only is intentional per `docs/SECURITY.md`).
- ZAP Medium: Cross-Domain Misconfiguration (CORS) — review backlog; not exploited in this controlled scan.
- Live Privacy Policy on production must include the new Zoom section after deploy of this branch.

## Zoom stack smoke after remediation (non-intrusive)

`/opt/cursor/artifacts/security-beta/zoom-stack-smoke.json` — Meeting SDK `VGTQ` pair valid; Instructor OAuth `Z0xA` present; CEO hostZak ready.
