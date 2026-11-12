import Image from "next/image";

const PARTNERS = [
  {
    name: "Pilot100",
    src: "/partners/pilot100-logo.svg",
    href: "https://pilot100atpl.com",
    width: 146,
    height: 32,
  },
  {
    name: "Tamara",
    src: "/partners/tamara-logo.svg",
    href: "https://tamara.co",
    width: 97,
    height: 19,
  },
  {
    name: "Taly",
    src: "/partners/taly-logo.svg",
    href: "https://taly.io",
    width: 106,
    height: 48,
  },
  {
    name: "EASA",
    src: "/partners/easa-logo.png",
    href: "https://www.easa.europa.eu",
    width: 220,
    height: 94,
  },
] as const;

type PartnerStripProps = {
  /** Larger homepage / marketing treatment. */
  size?: "default" | "large";
};

function PartnerStrip({ size = "default" }: PartnerStripProps) {
  const large = size === "large";

  return (
    <section
      className={large ? "partner-strip partner-strip-large" : "partner-strip"}
      aria-label="Partnerships"
      id={large ? "partnerships" : undefined}
    >
      <div className={large ? "partner-strip-inner container-app" : undefined}>
        <p className="partner-strip-kicker">Partnerships</p>
        {large ? (
          <>
            <h2 className="partner-strip-title">Trusted training and payment partners</h2>
            <p className="partner-strip-lead">
              Aviator Pass works with established aviation and finance partners so students can
              study with proven tools and flexible payment options.
            </p>
          </>
        ) : null}
        <ul className="partner-strip-list">
          {PARTNERS.map((partner) => {
            const logo = (
              <Image
                src={partner.src}
                alt={partner.name}
                width={partner.width}
                height={partner.height}
                unoptimized
                className="partner-strip-logo"
              />
            );

            return (
              <li key={partner.name} className="partner-strip-item">
                <a
                  href={partner.href}
                  className="partner-strip-link"
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${partner.name} (opens in a new tab)`}
                >
                  {logo}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export { PartnerStrip };
