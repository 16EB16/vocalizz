import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, Mic, ArrowLeft, DollarSign, AlertTriangle } from "lucide-react";
import { useVoiceModels } from "@/hooks/use-voice-models";
import { useUserStatus } from "@/hooks/use-user-status";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import V2VSourceUpload from "@/components/V2VSourceUpload";
import { useV2VConversion } from "@/hooks/use-v2v-conversion";

// Constants for V2V cost
const V2V_COST_PER_CONVERSION = 1; 

const UseModel = () => {
    const { modelId } = useParams<{ modelId: string }>();
    const navigate = useNavigate();
    const { userId, credits, isLoading: isStatusLoading, isTestMode } = useUserStatus();
    const { data: models, isLoading: isModelsLoading } = useVoiceModels(userId);
    const { toast } = useToast();
    
    const { mutate: convertAudio, isPending: isConverting, data: conversionResult } = useV2VConversion();
    
    const [sourceFile, setSourceFile] = useState<File | null>(null);

    const model = useMemo(() => {
        return models?.find(m => m.id === modelId);
    }, [models, modelId]);
    
    // In test mode, credits are always sufficient
    const hasEnoughCredits = isTestMode || credits >= V2V_COST_PER_CONVERSION;
    const convertedAudioUrl = conversionResult?.url || null;

    if (isStatusLoading || isModelsLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <p className="text-foreground">Chargement du modèle...</p>
            </div>
        );
    }

    if (!model || model.status !== 'completed') {
        return (
            <div className="max-w-3xl mx-auto space-y-6">
                <h1 className="text-3xl font-bold text-foreground">Modèle Introuvable</h1>
                <Card className="border-destructive">
                    <CardContent className="p-6 text-destructive flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5" />
                        <p>Le modèle spécifié est introuvable ou n'est pas encore prêt à être utilisé.</p>
                    </CardContent>
                </Card>
                <Button onClick={() => navigate("/dashboard")} variant="outline" className="gap-2">
                    <ArrowLeft className="w-4 h-4" /> Retour au Studio
                </Button>
            </div>
        );
    }
    
    const handleConversion = () => {
        if (!sourceFile || !userId) return;
        
        convertAudio({ modelId: model.id, sourceFile, userId, isTestMode });
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <Button onClick={() => navigate("/dashboard")} variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Retour au Studio
            </Button>
            
            <div className="mb-4">
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                    <Volume2 className="w-7 h-7 text-primary" />
                    Utiliser le modèle: <span className="text-primary">{model.name}</span>
                </h1>
                <p className="text-muted-foreground">Convertissez une piste audio source en utilisant la voix de votre modèle IA.</p>
            </div>
            
            {isTestMode && (
                <div className="p-3 mb-6 bg-yellow-500/10 border border-yellow-500/50 text-yellow-700 rounded-lg font-medium">
                    ⚠️ MODE TEST ACTIF : Les crédits ne sont pas déduits.
                </div>
            )}

            {/* --- STEP 1: Upload Source Audio --- */}
            <Card>
                <CardHeader>
                    <CardTitle>1. Fichier audio source</CardTitle>
                    <CardDescription>
                        Téléchargez la piste audio dont vous souhaitez cloner la voix (MP3 ou WAV).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <V2VSourceUpload 
                        sourceFile={sourceFile}
                        setSourceFile={setSourceFile}
                        isConverting={isConverting}
                    />
                </CardContent>
            </Card>
            
            {/* --- STEP 2: Conversion & Cost --- */}
            <Card className={cn(
                "bg-card border-border",
                (!hasEnoughCredits || !sourceFile) && "border-destructive/50 bg-destructive/5"
            )}>
                <CardContent className="p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-primary" />
                            Coût de la Conversion
                        </h3>
                        <span className={cn(
                            "text-2xl font-extrabold",
                            hasEnoughCredits ? "text-primary" : "text-destructive"
                        )}>
                            {V2V_COST_PER_CONVERSION} Crédit(s)
                        </span>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Votre solde actuel:</span>
                        <span className="font-semibold">{credits} Crédit(s)</span>
                    </div>
                    
                    <Button 
                        type="button" 
                        className="w-full gap-2"
                        onClick={handleConversion}
                        disabled={isConverting || !sourceFile || !hasEnoughCredits}
                    >
                        {isConverting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Mic className="w-4 h-4" />
                        )}
                        {isConverting ? "Conversion en cours..." : "Lancer la conversion V2V"}
                    </Button>
                </CardContent>
            </Card>
            
            {/* --- Output Player --- */}
            {convertedAudioUrl && (
                <Card className="bg-green-500/10 border-green-500/50">
                    <CardContent className="p-6 space-y-4">
                        <p className="font-medium text-green-700">Conversion terminée. Écoutez ou téléchargez le résultat.</p>
                        <audio controls src={convertedAudioUrl} className="w-full rounded-lg">
                            Votre navigateur ne supporte pas l'élément audio.
                        </audio>
                        <Button variant="secondary" asChild className="w-full">
                            <a href={convertedAudioUrl} download={`vocalizz_${model.name}_conversion.mp3`}>Télécharger l'audio</a>
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default UseModel;