import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserStatus } from "@/hooks/use-user-status";
import BillingPortalButton from "@/components/BillingPortalButton";
import { Zap, DollarSign, Crown, Package, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ProfileForm from "@/components/ProfileForm";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// --- CONFIGURATION DES PRIX (Doit correspondre à webhook-stripe et create-checkout-session) ---
const PLANS = [
    { id: "price_1PRO_ID", name: "Plan Pro", credits: 20, price: "15€ / mois", mode: "subscription", role: "pro" },
    { id: "price_1STUDIO_ID", name: "Plan Studio", credits: 100, price: "49€ / mois", mode: "subscription", role: "studio" },
];

const CREDIT_PACKS = [
    { id: "price_1PACK10_ID", name: "Pack 10 Crédits", credits: 10, price: "10€", mode: "payment" },
    { id: "price_1PACK50_ID", name: "Pack 50 Crédits", credits: 50, price: "45€", mode: "payment" },
];
// ------------------------------------------------------------------------------------------

const Settings = () => {
  const { isPremium, role, credits, userId } = useUserStatus();
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
  
  const handleBuyCredits = async (priceId: string, mode: 'subscription' | 'payment') => {
    if (!userId) {
        toast.error("Erreur", { description: "Utilisateur non authentifié." });
        return;
    }
    
    setIsRedirecting(true);
    const returnUrl = window.location.origin + "/settings";

    try {
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

  const currentPlan = PLANS.find(p => p.role === role);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">Paramètres du compte</h1>
      <p className="text-muted-foreground">Gérez vos préférences, votre solde de crédits et votre abonnement.</p>

      {/* --- 1. Credit Balance --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Solde de Crédits
          </CardTitle>
          <CardDescription>
            Votre monnaie interne pour l'entraînement de modèles IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
            <span className="text-2xl font-bold text-foreground">{credits} Crédit(s)</span>
            <Button onClick={() => window.scrollTo({ top: 1000, behavior: 'smooth' })} className="gap-2">
                <Package className="w-4 h-4" />
                Acheter des packs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* --- 2. Subscription Status --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500/20" />
            Abonnement
          </CardTitle>
          <CardDescription>
            Statut actuel : <span className={cn("font-semibold", role !== 'free' ? "text-yellow-600" : "text-foreground")}>{currentPlan?.name || "Plan Découverte (Gratuit)"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {role === 'free' 
              ? `Vous bénéficiez de 5 crédits uniques. Passez à Pro ou Studio pour recevoir des crédits mensuels et débloquer les options Premium.`
              : `Vous recevez ${currentPlan?.credits} crédits chaque mois. Gérez votre abonnement via le portail Stripe.`
            }
          </p>
          <BillingPortalButton isPremium={isPremium} />
        </CardContent>
      </Card>
      
      {/* --- 3. Credit Packs (Pay-As-You-Go) --- */}
      <div className="space-y-4 pt-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-secondary" />
            Acheter des Packs de Crédits
        </h2>
        <p className="text-muted-foreground">
            Rechargez votre solde à tout moment, même sans abonnement.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CREDIT_PACKS.map(pack => (
                <Card key={pack.id} className="bg-card border-border hover:border-primary/50 transition-colors">
                    <CardHeader>
                        <CardTitle>{pack.name}</CardTitle>
                        <CardDescription>{pack.credits} Crédits</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-between items-center">
                        <span className="text-xl font-bold text-primary">{pack.price}</span>
                        <Button 
                            onClick={() => handleBuyCredits(pack.id, pack.mode as 'payment')}
                            disabled={isRedirecting}
                            className="gap-2"
                        >
                            {isRedirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Acheter"}
                        </Button>
                    </CardContent>
                </Card>
            ))}
        </div>
      </div>

      {/* --- 4. Profile Form --- */}
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Mettez à jour vos informations personnelles.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm />
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;