import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Shield, Sparkles, ArrowRight } from "lucide-react";

const LOGO_URL = "https://i.ibb.co/Q7169P5W/Logo-Vocalizz.png";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <nav className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {/* New Logo Placeholder */}
            <img src={LOGO_URL} alt="Vocalizz Logo" className="h-10 w-auto" />
          </div>
          <div className="flex gap-3 items-center">
            {/* Removed redundant 'Connexion' button */}
            <Button onClick={() => navigate("/auth")}>
              S'identifier
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-medium">Technologie RVC avancée</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Créez des modèles de voix IA{" "}
            <span className="bg-gradient-accent bg-clip-text text-transparent">
              professionnels
            </span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Transformez vos enregistrements audio en modèles de voix IA de haute qualité. 
            Simple, rapide et sans configuration technique.
          </p>
          
          <div className="flex gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/auth")} className="gap-2 shadow-glow">
              Créer mon premier modèle
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline">
              En savoir plus
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          <Card className="bg-card border-border hover:border-primary/50 transition-all">
            <CardContent className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Rapide et simple</h3>
              <p className="text-muted-foreground">
                Uploadez vos fichiers audio et laissez l'IA faire le reste. 
                Résultats en quelques minutes.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border hover:border-primary/50 transition-all">
            <CardContent className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-secondary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Sécurisé et privé</h3>
              <p className="text-muted-foreground">
                Vos données audio sont protégées et ne sont jamais partagées. 
                Conformité RGPD garantie.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border hover:border-primary/50 transition-all">
            <CardContent className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Qualité professionnelle</h3>
              <p className="text-muted-foreground">
                Modèles vocaux haute fidélité utilisant la technologie RVC 
                de pointe.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border max-w-4xl mx-auto">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Comment ça marche ?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
              <div>
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold">
                  1
                </div>
                <h3 className="font-semibold mb-2">Uploadez</h3>
                <p className="text-sm text-muted-foreground">
                  Ajoutez vos fichiers audio MP3 ou WAV (jusqu'à 2h)
                </p>
              </div>
              <div>
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold">
                  2
                </div>
                <h3 className="font-semibold mb-2">Configurez</h3>
                <p className="text-sm text-muted-foreground">
                  Choisissez le nom et la qualité de votre modèle
                </p>
              </div>
              <div>
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold">
                  3
                </div>
                <h3 className="font-semibold mb-2">Téléchargez</h3>
                <p className="text-sm text-muted-foreground">
                  Récupérez votre modèle IA prêt à l'emploi
                </p>
              </div>
            </div>
            <Button size="lg" className="mt-8 gap-2" onClick={() => navigate("/auth")}>
              S'identifier
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </main>

      <footer className="container mx-auto px-4 py-8 mt-20 border-t border-border/50">
        <div className="text-center text-muted-foreground">
          <p>© 2024 Vocalizz. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;