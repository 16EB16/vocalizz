import { Button } from "@/components/ui/button";
import { Zap, Loader2 } from "lucide-react";
import { useStripePortal } from "@/hooks/use-stripe-portal";

interface BillingPortalButtonProps {
  isPremium: boolean;
}

const BillingPortalButton = ({ isPremium }: BillingPortalButtonProps) => {
  const { redirectToStripe, isLoading } = useStripePortal(isPremium);

  return (
    <Button 
      variant="secondary" 
      className="gap-2 bg-gradient-accent text-white hover:opacity-90" 
      onClick={redirectToStripe}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Zap className="w-4 h-4" />
      )}
      {isPremium ? "Gérer l'abonnement" : "Passer à Premium"}
    </Button>
  );
};

export default BillingPortalButton;