"use client";

import * as React from "react";
import Link from "@/components/ui/app-link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { routes } from "@/constants/routes";
import { NAV_ITEMS, type MarketingNavItem } from "@/constants/navigation";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/brand-logo";

function navPathname(href: string): string {
  return href.replace(/[?#].*$/, "") || "/";
}

function itemIsActive(pathname: string, item: MarketingNavItem): boolean {
  const itemPath = navPathname(item.href);
  if (item.children?.length) {
    return item.children.some((child) => {
      const childPath = navPathname(child.href);
      return pathname === childPath || pathname.startsWith(`${childPath}/`);
    });
  }
  if (itemPath === "/") return pathname === "/";
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

function Header() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [coursesOpen, setCoursesOpen] = React.useState(false);
  const isHome = pathname === "/";
  const onAtplCourse = pathname === routes.atpl;
  const enrolHref = onAtplCourse ? routes.checkout : routes.onlineCourses;
  const enrolLabel = onAtplCourse ? "Enrol now" : "Explore courses";
  const solid = !(isHome && !scrolled && !open);

  React.useEffect(() => {
    setOpen(false);
    setCoursesOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "site-header sticky top-0 z-40 text-white transition-[background-color,border-color,backdrop-filter,box-shadow,padding] duration-300",
        "pt-[env(safe-area-inset-top,0px)]",
        solid
          ? "border-b border-white/10 bg-[var(--surface-ink)]/80 shadow-[0_1px_0_0_rgba(204,160,76,0.14)] backdrop-blur-2xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="container-app relative flex h-[4.25rem] items-center justify-between gap-2 sm:h-[4.85rem] sm:gap-3">
        <div className="relative z-10 min-w-0 shrink">
          <BrandLogo
            variant="dark"
            href={routes.home}
            priority
            className="[&_img]:h-8 [&_img]:max-w-[min(168px,46vw)] sm:[&_img]:h-11 sm:[&_img]:max-w-[300px] md:[&_img]:h-12 md:[&_img]:max-w-[360px]"
          />
        </div>

        <nav
          className="site-header-nav absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 lg:flex"
          aria-label="Primary"
        >
          {NAV_ITEMS.map((item) => {
            const active = itemIsActive(pathname, item);
            if (item.children?.length) {
              return (
                <div
                  key={item.href}
                  className="relative"
                  onMouseEnter={() => setCoursesOpen(true)}
                  onMouseLeave={() => setCoursesOpen(false)}
                >
                  <Link
                    href={item.href}
                    className={cn(
                      "site-header-link relative inline-flex items-center gap-1 px-3 py-2 text-[11px] font-semibold tracking-[0.16em] uppercase transition-colors duration-200",
                      active ? "text-white" : "text-white/48 hover:text-white",
                    )}
                    data-active={active || undefined}
                    aria-expanded={coursesOpen}
                    aria-haspopup="true"
                  >
                    {item.label}
                    <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
                  </Link>
                  <div
                    className={cn(
                      "site-header-dropdown",
                      coursesOpen
                        ? "pointer-events-auto opacity-100"
                        : "pointer-events-none opacity-0",
                    )}
                    role="menu"
                    aria-label="Online Courses"
                  >
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="site-header-dropdown-link"
                        role="menuitem"
                      >
                        <span>{child.label}</span>
                        {child.hint ? (
                          <span className="site-header-dropdown-hint">{child.hint}</span>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "site-header-link relative px-3.5 py-2 text-[11px] font-semibold tracking-[0.16em] uppercase transition-colors duration-200",
                  active ? "text-white" : "text-white/48 hover:text-white",
                )}
                data-active={active || undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="relative z-10 hidden items-center gap-1.5 lg:flex">
          <Button
            variant="ghost"
            className="h-10 rounded-xl px-3.5 text-white/70 hover:bg-white/10 hover:text-white"
            asChild
          >
            <Link href={routes.login}>Log in</Link>
          </Button>
          <Button
            variant="accent"
            className="hero-cta-primary h-10 rounded-xl px-4 shadow-[0_12px_28px_-16px_rgba(204,160,76,0.85)]"
            asChild
          >
            <Link href={enrolHref}>
              {enrolLabel}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="touch-target relative z-10 shrink-0 rounded-xl text-white hover:bg-white/10 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {open ? (
        <div
          id="mobile-nav"
          className="animate-in-fade max-h-[min(78dvh,36rem)] overflow-y-auto border-t border-white/10 bg-[var(--surface-ink)]/96 backdrop-blur-2xl lg:hidden"
        >
          <nav
            className="container-app flex flex-col gap-1 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            aria-label="Mobile"
          >
            {NAV_ITEMS.map((item) => {
              const active = itemIsActive(pathname, item);
              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "touch-target flex items-center rounded-xl px-3 py-3 text-sm font-medium transition",
                      active
                        ? "bg-white/10 text-white shadow-[inset_3px_0_0_0_var(--accent)]"
                        : "text-white/75 hover:bg-white/8 hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                  {item.children?.length ? (
                    <div className="mb-2 ml-3 flex flex-col border-l border-white/10 pl-3">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className="touch-target rounded-lg px-2 py-2.5 text-sm text-white/70 hover:bg-white/8 hover:text-white"
                        >
                          {child.label}
                          {child.hint ? (
                            <span className="mt-0.5 block text-[11px] uppercase tracking-[0.12em] text-accent/80">
                              {child.hint}
                            </span>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
              <Button
                variant="outline"
                className="h-12 border-white/20 bg-transparent text-white hover:bg-white/10"
                asChild
              >
                <Link href={routes.login}>Log in</Link>
              </Button>
              <Button variant="accent" className="hero-cta-primary h-12" asChild>
                <Link href={enrolHref}>
                  {enrolLabel}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export { Header };
