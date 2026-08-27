import { LoadingState } from "@/components/shared/loading-state";

export default function CheckoutLoading() {
  return <LoadingState label="Opening Stripe Checkout..." />;
}
