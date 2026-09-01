"use client";

import Link from "@/components/ui/app-link";
import { ArrowUpRight, Mail } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { brandingConfig } from "@/config/branding";
import { siteStatic } from "@/config/site-static";
import { routes } from "@/constants/routes";
import { AdBannerSlot } from "@/features/marketing/components/ad-banner-slot";
import { PartnerStrip } from "@/features/marketing/components/partner-strip";

const exploreLinks = [
  { href: routes.onlineCourses, label: "Online Courses" },
  { href: routes.atpl, label: "ATPL Course" },
  { href: "/#about", label: "About" },
  { href: "/#instructors", label: "Instructors" },
  { href: "/#contact", label: "Contact" },
] as const;

const accountLinks = [
  { href: routes.login, label: "Log in" },
  { href: routes.onlineCourses, label: "Explore Online Courses" },
  { href: routes.register, label: "Free student account" },
] as const;

function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer-glow" aria-hidden />
      <div className="container-app relative z-10">
        <div className="site-footer-top">
          <div className="site-footer-brand">
            <BrandLogo
              variant="dark"
              href={routes.home}
              className="[&_img]:h-10 [&_img]:max-w-[240px] sm:[&_img]:h-11 sm:[&_img]:max-w-[280px]"
            />
            <p className="site-footer-tagline">
              {brandingConfig.tagline}. Complete aviation education —{" "}
              {siteStatic.locations.join(" · ")}.
            </p>
            <Link href={routes.onlineCourses} className="site-footer-cta">
              Explore Online Courses
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="site-footer-cols">
            <div>
              <h3 className="site-footer-heading">Explore</h3>
              <ul className="site-footer-list">
                {exploreLinks.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="site-footer-link">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="site-footer-heading">Account</h3>
              <ul className="site-footer-list">
                {accountLinks.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="site-footer-link">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="site-footer-heading">Contact</h3>
              <ul className="site-footer-list site-footer-contact">
                <li>
                  <a
                    href={`mailto:${siteStatic.contactEmail}`}
                    className="site-footer-contact-link"
                    aria-label={`Website contact ${siteStatic.contactEmail}`}
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-accent/80" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-accent/90">
                        Website
                      </span>
                      <span className="break-all">{siteStatic.contactEmail}</span>
                    </span>
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:${siteStatic.supportEmail}`}
                    className="site-footer-contact-link"
                    aria-label={`Student support ${siteStatic.supportEmail}`}
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-accent/80" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-accent/90">
                        Student support
                      </span>
                      <span className="break-all">{siteStatic.supportEmail}</span>
                    </span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <PartnerStrip />
        <AdBannerSlot placement="footer" />

        <div className="site-footer-bottom">
          <p className="site-footer-copy">
            © {year} {siteStatic.name}
            <span className="site-footer-dot" aria-hidden />
            English only
          </p>
          <p className="site-footer-motto">
            <span>Train</span>
            <span className="site-footer-dot" aria-hidden />
            <span>Progress</span>
            <span className="site-footer-dot" aria-hidden />
            <span>Master</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

export { Footer };
