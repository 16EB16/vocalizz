import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Zap, AlertTriangle, CheckCircle, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserStatus } from "@/hooks/use-user-status";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface AudioAnalysisCardProps {
  totalDuration: number;
  minDurationSeconds: number;
  isCalculating: boolean;
  onCleaningOptionChange: (value: 'none' | 'premium') => void;
  cleaningOption: 'none' | 'premium';
}

// Simulation de l'analyse IA
const simulateAnalysis = (totalDuration: number, minDuration: number) => {
  const isMinDurationMet = totalDuration >= minDuration;
  
  // Score de qualité simulé (basé sur la durée, mais pourrait être plus complexe)
  let qualityScore = Math.min(100, Math.floor((totalDuration / (minDuration * 2)) * 100) + 50);
  
  let feedback = "Analyse IA terminée. Qualité du matériel source excellente.";
  let issues = [];

  if (totalDuration < minDuration) {
    qualityScore = Math.min(qualityScore, 40);
    issues.push("Durée insuffisante. L'entraînement pourrait être de faible qualité.");
  } else if (qualityScore < 70) {
    issues.push("Bruit de fond et silences détectés (estimation: 15%).");
  }

  if (issues.length > 0) {
    feedback = issues.join(' ');
  }

  return { qualityScore, feedback, isMinDurationMet };
};

const AudioAnalysisCard = ({ 
  totalDuration, 
  minDurationSeconds, 
  isCalculating,
  onCleaningOptionChange,
  cleaningOption
}: AudioAnalysisCardProps) => {
  const { isPremium } = useUserStatus();
  
  const { qualityScore, feedback, isMinDurationMet } = simulateAnalysis(totalDuration, minDurationSeconds);
  const isLowQuality = qualityScore < 70;

  if (isCalculating) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <p>Analyse IA en cours...</p>
        </CardContent>
      </Card>
    );
  }

  if (totalDuration === 0) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          Analyse IA du Matériel Source
        </CardTitle>
        <CardDescription>
          Évaluation de la qualité de vos enregistrements avant l'entraînement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quality Score */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span>Score de Qualité du Matériel</span>
            <span className={cn(
              qualityScore < 50 ? "text-destructive" : qualityScore < 75 ? "text-yellow-600" : "text-green-600"
            )}>
              {qualityScore}/100
            </span>
          </div>
          <Progress 
            value={qualityScore} 
            className="h-2" 
            indicatorClassName={cn(
              qualityScore < 50 ? "bg-destructive" : qualityScore < 75 ? "bg-yellow-600" : "bg-green-600"
            )}
          />
          <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
            {isLowQuality ? <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /> : <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />}
            {feedback}
          </p>
        </div>

        {/* Premium Cleaning Option */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Préparation du Matériel</h3>
          <RadioGroup 
            value={cleaningOption} 
            onValueChange={onCleaningOptionChange}
            className="space-y-2"
          >
            {/* Option Standard */}
            <div className="flex items-center space-x-3 space-y-0 p-3 border rounded-lg">
              <RadioGroupItem value="none" id="cleaning-none" />
              <Label htmlFor="cleaning-none" className="font-normal flex-1 cursor-pointer">
                Procéder tel quel (Standard)
                <p className="text-xs text-muted-foreground">L'entraînement utilisera les fichiers bruts.</p>
              </Label>
            </div>

            {/* Option Premium Cleaning */}
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className={cn(
                  "p-3 border rounded-lg transition-colors flex items-center space-x-3 space-y-0",
                  !isPremium && "opacity-50 cursor-not-allowed bg-muted/50",
                  isPremium && cleaningOption === 'premium' && "border-primary"
                )}>
                  <RadioGroupItem 
                    value="premium" 
                    id="cleaning-premium" 
                    disabled={!isPremium}
                  />
                  <Label htmlFor="cleaning-premium" className="font-normal flex-1 flex items-center justify-between cursor-pointer">
                    Nettoyeur IA Premium
                    <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground hidden sm:inline">Supprime bruit de fond & réverbération</p>
                        <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500/20" />
                    </div>
                  </Label>
                </div>
              </TooltipTrigger>
              {!isPremium && (
                <TooltipContent className="bg-yellow-600 text-white border-yellow-700">
                  <p>Réservé aux membres Premium pour une qualité de modèle maximale.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
};

export default AudioAnalysisCard;