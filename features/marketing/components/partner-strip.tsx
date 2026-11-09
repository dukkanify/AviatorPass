import Image from "next/image";

const PARTNERS = [
  { name: "Pilot100", src: "/partners/pilot100.svg", href: "https://pilot100.com" },
  { name: "Tamara", src: "/partners/tamara.svg", href: "https://tamara.co" },
  { name: "Taly", src: "/partners/taly.svg", href: "https://taly.io" },
  {
    name: "EASA",
    src: "/partners/easa-logo.png",
    href: "https://www.easa.europa.eu",
    width: 220,
    height: 94,
  },
  { name: "Future partner", src: "/partners/future-partner.svg", href: null },
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
            const width = "width" in partner ? partner.width : 220;
            const height = "height" in partner ? partner.height : 72;
            const logo = (
              <Image
                src={partner.src}
                alt={partner.href ? partner.name : `${partner.name}, reserved`}
                width={width}
                height={height}
                unoptimized
                className="partner-strip-logo"
              />
            );

            return (
              <li key={partner.name} className="partner-strip-item">
                {partner.href ? (
                  <a
                    href={partner.href}
                    className="partner-strip-link"
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${partner.name} (opens in a new tab)`}
                  >
                    {logo}
                  </a>
                ) : (
                  <span className="partner-strip-link partner-strip-link-static">{logo}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export { PartnerStrip };
