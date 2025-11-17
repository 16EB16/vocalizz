import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserStatus } from "@/hooks/use-user-status";
import BillingPortalButton from "@/components/BillingPortalButton";
import { DollarSign, Crown, Package, Loader2, User, Cpu } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ProfileForm from "@/components/ProfileForm";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import PricingCard, { PlanItem, PackItem } from "@/components/PricingCard";

// --- CONFIGURATION DES PRIX (Utilisation des IDs de Produit fournis) ---
const FREE_PLAN: PlanItem = {
    id: "free",
    name: "Plan Découverte",
    price: "0€",
    mode: "subscription",
    role: "free",
    credits: 5, // Initial credits
    isRedirecting: false,
    onAction: () => {},
    type: 'plan', // FIX: Added missing type property
    features: [
        { text: "5 Crédits uniques", isIncluded: true },
        { text: "1 Entraînement simultané", isIncluded: true },
        { text: "Qualité Standard (500 POCH)", isIncluded: true },
        { text: "Nettoyage IA Premium", isIncluded: false },
        { text: "Support prioritaire", isIncluded: false },
    ]
};

const PLANS_DATA: Omit<PlanItem, 'isCurrent' | 'isRedirecting' | 'onAction'>[] = [
    { 
        id: "prod_TRHMJTr0niy6sB", 
        name: "Plan Pro", 
        credits: 20, 
        price: "15€", 
        mode: "subscription", 
        role: "pro",
        type: 'plan', // FIX: Added missing type property
        features: [
            { text: "20 Crédits mensuels", isIncluded: true },
            { text: "1 Entraînement simultané", isIncluded: true },
            { text: "Qualité Premium (2000 POCH)", isIncluded: true },
            { text: "Nettoyage IA Premium", isIncluded: true },
            { text: "Support prioritaire", isIncluded: false },
        ]
    },
    { 
        id: "prod_TRHOTQn3cmA3BQ", 
        name: "Plan Studio", 
        credits: 100, 
        price: "49€", 
        mode: "subscription", 
        role: "studio",
        isRecommended: true,
        type: 'plan', // FIX: Added missing type property
        features: [
            { text: "100 Crédits mensuels", isIncluded: true },
            { text: "3 Entraînements simultanés", isIncluded: true },
            { text: "Qualité Premium (2000 POCH)", isIncluded: true },
            { text: "Nettoyage IA Premium", isIncluded: true },
            { text: "Support prioritaire", isIncluded: true },
        ]
    },
];

const CREDIT_PACKS_DATA: Omit<PackItem, 'isRedirecting' | 'onAction'>[] = [
    { id: "prod_TRHQ9KiesC5ZEl", name: "Pack 10 Crédits", credits: 10, price: "10€", mode: "payment", type: 'pack' }, // FIX: Added missing type property
    { id: "prod_TRHSQFBfyRBoTa", name: "Pack 50 Crédits", credits: 50, price: "45€", mode: "payment", type: 'pack' }, // FIX: Added missing type property
];
// ------------------------------------------------------------------------------------------

const Settings = () => {
  const { isPremium, role, credits, userId, max_active_trainings } = useUserStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const success = params.get('success');
    const canceled = params.get('canceled');

    if (success === 'true') {
      toast.success("Transaction réussie !", {
        description: "Votre solde de crédits ou votre abonnement a été mis à jour.",
      });
    } else if (canceled === 'true') {
      toast.info("Opération annulée", {
        description: "Vous avez annulé le processus de paiement ou de gestion.",
      });
    }

    // Clean up URL parameters to prevent re-triggering notifications
    if (success || canceled) {
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);
  
  const handleStripeAction = async (priceId: string, mode: 'subscription' | 'payment') => {
    if (!userId) {
        toast.error("Erreur", { description: "Utilisateur non authentifié." });
        return;
    }
    
    setIsRedirecting(true);
    const returnUrl = window.location.origin + "/settings";

    try {
        // The Edge Function now handles resolving priceId if it's a Product ID (prod_...)
        const response = await supabase.functions.invoke('create-checkout-session', {
            body: { returnUrl, priceId, mode },
        });

        const { data, error } = response;

        if (error) {
            throw new Error(`Erreur de connexion au service de facturation: ${error.message}`);
        }
        
        if (data && data.error) {
            throw new Error(data.error);
        }

        if (data?.url) {
            window.location.href = data.url;
        } else {
            throw new Error("URL de redirection Stripe non reçue.");
        }

    } catch (error: any) {
        console.error("Stripe Redirection Error:", error);
        toast.error("Erreur de paiement", {
            description: error.message || "Impossible de se connecter à Stripe. Veuillez réessayer.",
        });
    } finally {
        setIsRedirecting(false);
    }
  };

  const plans: PlanItem[] = [
    FREE_PLAN,
    ...PLANS_DATA
  ].map(plan => ({
    ...plan,
    type: 'plan' as const,
    isCurrent: plan.role === role,
    isRedirecting: isRedirecting,
    onAction: handleStripeAction,
  }));
  
  const creditPacks: PackItem[] = CREDIT_PACKS_DATA.map(pack => ({
    ...pack,
    type: 'pack' as const,
    isRedirecting: isRedirecting,
    onAction: handleStripeAction,
  }));


  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      <h1 className="text-4xl font-extrabold text-foreground">Paramètres du compte</h1>
      
      {/* --- 1. Profile & Status Summary --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Informations Personnelles
            </CardTitle>
            <CardDescription>Mettez à jour vos informations de profil.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm />
          </CardContent>
        </Card>
        
        <div className="space-y-6">
            {/* Credit Balance */}
            <Card>
                <CardHeader className="p-4 pb-0">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-primary" />
                        Solde
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-3xl font-bold text-foreground">{credits}</span>
                        <span className="text-sm text-muted-foreground">Crédit(s)</span>
                    </div>
                    <Button 
                        onClick={() => document.getElementById('credit-packs')?.scrollIntoView({ behavior: 'smooth' })} 
                        variant="outline"
                        className="w-full mt-4 gap-2"
                    >
                        <Package className="w-4 h-4" />
                        Acheter des packs
                    </Button>
                </CardContent>
            </Card>
            
            {/* Training Limit */}
            <Card>
                <CardHeader className="p-4 pb-0">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-secondary" />
                        Entraînements Simultanés
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-3xl font-bold text-foreground">{max_active_trainings}</span>
                        <span className="text-sm text-muted-foreground">Max actifs</span>
                    </div>
                    {role !== 'studio' && (
                        <Button 
                            onClick={() => document.getElementById('subscriptions')?.scrollIntoView({ behavior: 'smooth' })} 
                            variant="secondary"
                            className="w-full mt-4 gap-2"
                        >
                            <Crown className="w-4 h-4 fill-yellow-500/20" />
                            Augmenter la limite
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
      </div>

      {/* --- 2. Subscription Plans --- */}
      <div className="space-y-6" id="subscriptions">
        <h2 className="text-3xl font-bold flex items-center gap-3">
            <Crown className="w-7 h-7 text-yellow-500 fill-yellow-500/20" />
            Plans d'Abonnement
        </h2>
        <p className="text-muted-foreground max-w-3xl">
            Choisissez un plan pour recevoir des crédits mensuels, débloquer la qualité Premium (2000 POCH) et le Nettoyage IA.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map(plan => (
                <PricingCard key={plan.id} item={plan} />
            ))}
        </div>
        
        {isPremium && (
            <div className="pt-4 text-center">
                <p className="text-sm text-muted-foreground mb-3">
                    Vous êtes actuellement abonné. Gérez votre facturation, changez de plan ou annulez votre abonnement via le portail Stripe.
                </p>
                <BillingPortalButton isPremium={isPremium} />
            </div>
        )}
      </div>
      
      {/* --- 3. Credit Packs (Pay-As-You-Go) --- */}
      <div className="space-y-6 pt-4" id="credit-packs">
        <h2 className="text-3xl font-bold flex items-center gap-3">
            <Package className="w-7 h-7 text-secondary" />
            Packs de Crédits (Recharge)
        </h2>
        <p className="text-muted-foreground max-w-3xl">
            Rechargez votre solde de crédits à tout moment. Ces crédits n'expirent jamais.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {creditPacks.map(pack => (
                <PricingCard key={pack.id} item={pack} />
            ))}
        </div>
      </div>
    </div>
  );
};

export default Settings;