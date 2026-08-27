"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/providers/auth-provider";
import { BrandProvider } from "@/providers/brand-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ScrollToTop } from "@/components/navigation/scroll-to-top";

interface AppProvidersProps {
  children: React.ReactNode;
}

function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <BrandProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <ScrollToTop />
            {children}
            <Toaster position="top-right" richColors closeButton />
          </TooltipProvider>
        </AuthProvider>
      </BrandProvider>
    </ThemeProvider>
  );
}

export { AppProviders };
