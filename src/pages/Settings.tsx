import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserStatus } from "@/hooks/use-user-status";
import BillingPortalButton from "@/components/BillingPortalButton";
import { Zap } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ProfileForm from "@/components/ProfileForm"; // Import the new form

const Settings = () => {
  const { isPremium } = useUserStatus();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const success = params.get('success');
    const canceled = params.get('canceled');

    if (success === 'true') {
      toast.success("Abonnement mis à jour !", {
        description: "Votre statut Premium est maintenant actif. Bienvenue dans la communauté Vocalizz Pro.",
      });
    } else if (canceled === 'true') {
      toast.info("Opération annulée", {
        description: "Vous avez annulé le processus de paiement ou de gestion de l'abonnement.",
      });
    }

    // Clean up URL parameters to prevent re-triggering notifications
    if (success || canceled) {
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">Paramètres du compte</h1>
      <p className="text-muted-foreground">Gérez vos préférences et votre abonnement.</p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Abonnement
          </CardTitle>
          <CardDescription>
            Statut actuel : <span className="font-semibold text-foreground">{isPremium ? "Premium" : "Gratuit"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {isPremium 
              ? "Vous bénéficiez de la création de modèles Haute Fidélité (2000 POCH) et d'une capacité illimitée."
              : "Passez à Premium pour débloquer la qualité maximale (2000 POCH) et supprimer la limite de 5 modèles."
            }
          </p>
          <BillingPortalButton isPremium={isPremium} />
        </CardContent>
      </Card>

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