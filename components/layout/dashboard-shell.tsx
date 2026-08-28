"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/layout/mobile-sidebar-sheet";

interface DashboardShellProps {
  children: React.ReactNode;
}

function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="flex min-h-dvh bg-background">
      <div className="hidden lg:block">
        <Sidebar className="fixed inset-y-0 left-0 z-30" />
      </div>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-3 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md sm:px-4 lg:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="touch-target lg:hidden"
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(18rem,calc(100vw-2.5rem))] p-0 pb-[env(safe-area-inset-bottom,0px)]"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Sidebar className="border-0" />
            </SheetContent>
          </Sheet>
          <p className="font-display text-sm font-semibold text-primary lg:hidden">Dashboard</p>
        </header>
        <main className="min-w-0 flex-1 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export { DashboardShell };
