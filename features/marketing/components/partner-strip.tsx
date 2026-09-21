import Image from "next/image";

const PARTNERS = [
  { name: "Pilot100", src: "/partners/pilot100.svg", href: "https://pilot100.com" },
  { name: "Tamara", src: "/partners/tamara.svg", href: "https://tamara.co" },
  { name: "EASA", src: "/partners/easa-badge.svg", href: "https://www.easa.europa.eu" },
  { name: "Future partner", src: "/partners/future-partner.svg", href: null },
] as const;

function PartnerStrip() {
  return (
    <section className="partner-strip" aria-label="Partnerships">
      <p className="partner-strip-kicker">Partnerships</p>
      <ul className="partner-strip-list">
        {PARTNERS.map((partner) => (
          <li key={partner.name} className="partner-strip-item">
            {partner.href ? (
              <a
                href={partner.href}
                className="partner-strip-link"
                target="_blank"
                rel="noreferrer"
                aria-label={`${partner.name} (opens in a new tab)`}
              >
                <Image
                  src={partner.src}
                  alt={partner.name}
                  width={160}
                  height={40}
                  unoptimized
                  className="partner-strip-logo"
                />
              </a>
            ) : (
              <span className="partner-strip-link partner-strip-link-static">
                <Image
                  src={partner.src}
                  alt={`${partner.name} — reserved`}
                  width={160}
                  height={40}
                  unoptimized
                  className="partner-strip-logo"
                />
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export { PartnerStrip };
