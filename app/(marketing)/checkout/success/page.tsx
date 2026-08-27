import { redirect } from "next/navigation";

import { routes } from "@/constants/routes";

type SuccessSearch = {
  session_id?: string;
  sessionId?: string;
  orderId?: string;
};

type PageProps = {
  searchParams?: Promise<SuccessSearch>;
};

async function readSearch(searchParams: PageProps["searchParams"]): Promise<SuccessSearch> {
  return (await searchParams) ?? {};
}

export default async function CheckoutSuccessPage({ searchParams }: PageProps) {
  const params = await readSearch(searchParams);
  const qs = new URLSearchParams();
  const sessionId = params.session_id ?? params.sessionId;
  if (sessionId) qs.set("session_id", sessionId);
  if (params.orderId) qs.set("orderId", params.orderId);
  const suffix = qs.toString();
  redirect(suffix ? `${routes.welcome}?${suffix}` : routes.welcome);
}
