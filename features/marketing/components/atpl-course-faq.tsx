"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ATPL_FAQS } from "@/features/marketing/content/atpl-course-landing";

type FaqItem = { q: string; a: string };

type AtplCourseFaqProps = {
  items?: readonly FaqItem[];
};

function AtplCourseFaq({ items = ATPL_FAQS }: AtplCourseFaqProps) {
  return (
    <Accordion type="single" collapsible className="atpl-faq">
      {items.map((item, index) => (
        <AccordionItem key={item.q} value={`faq-${index}`} className="atpl-faq-item">
          <AccordionTrigger className="atpl-faq-trigger text-base font-semibold text-[var(--landing-ink-soft)] hover:no-underline">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-[0.95rem] leading-relaxed">{item.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export { AtplCourseFaq };
