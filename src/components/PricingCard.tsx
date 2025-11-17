import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Package, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react"; // Import useState

interface Feature {
  text: string;
  isIncluded: boolean;
}

interface BaseItem {
  id: string;
  name: string;
  price: string;
  mode: 'subscription' | 'payment';
  isCurrent?: boolean;
  isRecommended?: boolean;
  // isRedirecting removed from props
  onAction: (priceId: string, mode: 'subscription' | 'payment', startRedirect: () => void, stopRedirect: () => void) => void;
}

export interface PlanItem extends BaseItem {
  type: 'plan';
  role: 'free' | 'pro' | 'studio';
  credits: number;
  features: Feature[];
}

export interface PackItem extends BaseItem {
  type: 'pack';
  credits: number;
}

export type PricingItem = PlanItem | PackItem;

interface PricingCardProps {
  item: PricingItem;
}

const PricingCard = ({ item }: PricingCardProps) => {
  const [isRedirecting, setIsRedirecting] = useState(false); // Internal state
  
  const isSubscription = item.type === 'plan';
  const isCurrent = item.isCurrent;
  const isRecommended = item.isRecommended;

  const icon = isSubscription ? <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500/20" /> : <Package className="w-5 h-5 text-secondary" />;
  const actionLabel = isCurrent ? "Plan Actif" : isSubscription ? "S'abonner" : "Acheter";
  const buttonVariant = isCurrent ? "secondary" : isSubscription ? "default" : "outline";
  const buttonClassName = isSubscription ? "bg-gradient-primary text-white hover:opacity-90" : "";

  const startRedirect = () => setIsRedirecting(true);
  const stopRedirect = () => setIsRedirecting(false);

  return (
    <Card className={cn(
      "flex flex-col transition-all duration-300 h-full",
      isRecommended ? "border-2 border-primary shadow-lg shadow-primary/20" : "border-border hover:border-primary/50",
      isCurrent && "border-2 border-yellow-500 shadow-lg shadow-yellow-300/30"
    )}>
      <CardHeader className="pb-4">
        <div className="flex justify-between items-center">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            {icon}
            {item.name}
          </CardTitle>
          {isRecommended && (
            <Badge className="bg-accent hover:bg-accent/90 text-white">Populaire</Badge>
          )}
          {isCurrent && (
            <Badge className="bg-yellow-500 hover:bg-yellow-500/90 text-white">Actif</Badge>
          )}
        </div>
        <p className="text-4xl font-extrabold text-foreground pt-2">
          {item.price}
        </p>
        <p className="text-sm text-muted-foreground">
          {isSubscription ? "par mois" : "paiement unique"}
        </p>
      </CardHeader>
      
      <CardContent className="flex-1 space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold text-primary">
            <Zap className="w-5 h-5" />
            {item.credits} Crédits {isSubscription ? "mensuels" : "inclus"}
        </div>

        {isSubscription && (
          <ul className="space-y-2 text-sm">
            {(item as PlanItem).features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2">
                <Check className={cn("w-4 h-4", feature.isIncluded ? "text-green-500" : "text-muted-foreground")} />
                <span className={cn(!feature.isIncluded && "text-muted-foreground line-through")}>{feature.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CardFooter>
        <Button 
          className={cn("w-full gap-2", buttonClassName)}
          variant={buttonVariant}
          disabled={item.isCurrent || isRedirecting}
          onClick={() => item.onAction(item.id, item.mode, startRedirect, stopRedirect)}
        >
          {isRedirecting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            actionLabel
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default PricingCard;