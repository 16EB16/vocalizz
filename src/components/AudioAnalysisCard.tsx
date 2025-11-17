import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Zap, AlertTriangle, CheckCircle, Sparkles, Loader2, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserStatus } from "@/hooks/use-user-status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useAudioAnalysis } from "@/hooks/use-audio-analysis"; // Import the new hook
import { COST_CLEANING_OPTION } from "@/lib/credit-utils"; // Import cost constant
import { Badge } from "@/components/ui/badge"; // <-- FIX: Import Badge

interface AudioAnalysisCardProps {
  totalDuration: number;
  minDurationSeconds: number;
  isCalculating: boolean;
  onCleaningOptionChange: (value: 'none' | 'premium') => void;
  cleaningOption: 'none' | 'premium';
}

const AudioAnalysisCard = ({ 
  totalDuration, 
  minDurationSeconds, 
  isCalculating,
  onCleaningOptionChange,
  cleaningOption
}: AudioAnalysisCardProps) => {
  const { isPremium, role } = useUserStatus();
  
  // Use the new hook for analysis logic
  const { qualityScore, feedback, isLowQuality } = useAudioAnalysis(totalDuration);

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
          Analyse de la qualité des pistes
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
              <Label htmlFor="cleaning-none" className="font-normal flex-1 flex items-center justify-between cursor-pointer">
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
                        <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 gap-1">
                            <DollarSign className="w-3 h-3" />
                            +{COST_CLEANING_OPTION} Crédits
                        </Badge>
                        <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500/20" />
                    </div>
                  </Label>
                </div>
              </TooltipTrigger>
              {!isPremium && (
                <TooltipContent className="bg-yellow-600 text-white border-yellow-700">
                  <p>Réservé aux membres Pro ou Studio pour une qualité de modèle maximale.</p>
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