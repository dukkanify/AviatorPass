"use client";

import * as React from "react";
import Link from "@/components/ui/app-link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ACTION_LABELS } from "@/constants/programme-terms";
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
  const [mobileCoursesOpen, setMobileCoursesOpen] = React.useState(false);
  const isHome = pathname === "/";
  const onAtplCourse = pathname === routes.atpl;
  const enrolHref = onAtplCourse ? routes.checkout : routes.onlineCourses;
  const enrolLabel = onAtplCourse ? ACTION_LABELS.enrolNow : ACTION_LABELS.browseCourses;
  const solid = !(isHome && !scrolled && !open);

  React.useEffect(() => {
    setOpen(false);
    setCoursesOpen(false);
    setMobileCoursesOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) setMobileCoursesOpen(false);
  }, [open]);

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
          className="animate-in-fade flex max-h-[calc(100dvh-4.25rem-env(safe-area-inset-top,0px))] flex-col border-t border-white/10 bg-[var(--surface-ink)]/96 backdrop-blur-2xl sm:max-h-[calc(100dvh-4.85rem-env(safe-area-inset-top,0px))] lg:hidden"
        >
          <nav
            className="container-app min-h-0 flex-1 overflow-y-auto overscroll-contain py-3"
            aria-label="Mobile"
          >
            <div className="flex flex-col gap-0.5">
              {NAV_ITEMS.map((item) => {
                const active = itemIsActive(pathname, item);
                const hasChildren = Boolean(item.children?.length);
                return (
                  <div key={item.href}>
                    {hasChildren ? (
                      <button
                        type="button"
                        className={cn(
                          "touch-target flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition",
                          active || mobileCoursesOpen
                            ? "bg-white/10 text-white shadow-[inset_3px_0_0_0_var(--accent)]"
                            : "text-white/75 hover:bg-white/8 hover:text-white",
                        )}
                        aria-expanded={mobileCoursesOpen}
                        onClick={() => setMobileCoursesOpen((v) => !v)}
                      >
                        <span>{item.label}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 opacity-70 transition-transform",
                            mobileCoursesOpen && "rotate-180",
                          )}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        className={cn(
                          "touch-target flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition",
                          active
                            ? "bg-white/10 text-white shadow-[inset_3px_0_0_0_var(--accent)]"
                            : "text-white/75 hover:bg-white/8 hover:text-white",
                        )}
                      >
                        {item.label}
                      </Link>
                    )}
                    {hasChildren && mobileCoursesOpen ? (
                      <div className="mb-1.5 ml-3 flex flex-col border-l border-white/10 pl-3">
                        <Link
                          href={item.href}
                          className="touch-target rounded-lg px-2 py-2 text-sm text-white/70 hover:bg-white/8 hover:text-white"
                        >
                          Browse all courses
                        </Link>
                        {item.children!.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="touch-target rounded-lg px-2 py-2 text-sm text-white/70 hover:bg-white/8 hover:text-white"
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
            </div>
          </nav>
          <div className="container-app shrink-0 border-t border-white/10 bg-[var(--surface-ink)]/98 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="h-11 border-white/20 bg-transparent text-white hover:bg-white/10"
                asChild
              >
                <Link href={routes.login}>Log in</Link>
              </Button>
              <Button variant="accent" className="hero-cta-primary h-11" asChild>
                <Link href={enrolHref}>
                  {enrolLabel}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export { Header };
