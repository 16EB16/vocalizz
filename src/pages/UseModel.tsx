import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, Mic, ArrowLeft, Upload, DollarSign, AlertTriangle } from "lucide-react";
import { useVoiceModels } from "@/hooks/use-voice-models";
import { useUserStatus } from "@/hooks/use-user-status";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client"; // Import supabase client
import { Label } from "@/components/ui/label"; // Import Label component
import { Input } from "@/components/ui/input"; // Import Input component

// Constants for V2V cost (Example: 1 credit per V2V conversion)
const V2V_COST_PER_CONVERSION = 1; 

const UseModel = () => {
    const { modelId } = useParams<{ modelId: string }>();
    const navigate = useNavigate();
    const { userId, credits, isLoading: isStatusLoading } = useUserStatus();
    const { data: models, isLoading: isModelsLoading } = useVoiceModels(userId);
    const { toast } = useToast();
    
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [isConverting, setIsConverting] = useState(false);
    const [convertedAudioUrl, setConvertedAudioUrl] = useState<string | null>(null);

    const model = useMemo(() => {
        return models?.find(m => m.id === modelId);
    }, [models, modelId]);
    
    const hasEnoughCredits = credits >= V2V_COST_PER_CONVERSION;

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
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && (file.type === "audio/mp3" || file.type === "audio/wav" || file.type === "audio/mpeg")) {
            setSourceFile(file);
            setConvertedAudioUrl(null); // Reset output
        } else if (file) {
            toast({
                variant: "destructive",
                title: "Fichier invalide",
                description: "Seuls les fichiers MP3 et WAV sont acceptés comme source.",
            });
        }
        e.target.value = '';
    };

    const handleConversion = async () => {
        if (!sourceFile || !userId) return;
        
        setIsConverting(true);
        setConvertedAudioUrl(null);

        try {
            // 1. Upload Source File (V2V source files need a temporary bucket)
            const sourceFileName = cn(model.id, sourceFile.name);
            const sourcePath = `${userId}/v2v-source/${sourceFileName}`;
            
            const { error: uploadError } = await supabase.storage
                .from('v2v-source') // Assuming a new temporary bucket for V2V inputs
                .upload(sourcePath, sourceFile, { upsert: true });

            if (uploadError) throw new Error(`Échec de l'upload de la source: ${uploadError.message}`);

            // 2. Call Edge Function for V2V conversion (This function needs to be created later)
            // NOTE: This is a placeholder for the actual V2V Edge Function call
            toast({ title: "Conversion en cours", description: "Lancement de la conversion Voice-to-Voice..." });
            
            // Simulate API call and credit deduction
            await new Promise(resolve => setTimeout(resolve, 3000)); 
            
            // Simulate successful response with a placeholder URL
            const simulatedUrl = "https://example.com/converted_audio.mp3"; 
            
            // In a real scenario, the Edge Function would handle:
            // - Credit deduction (V2V_COST_PER_CONVERSION)
            // - Calling Replicate/AI service with RVC model ID (model.id) and source audio path
            // - Storing the output audio in a bucket (e.g., 'v2v-outputs')
            // - Returning a signed URL

            setConvertedAudioUrl(simulatedUrl);
            
            // Force refresh credits (simulated)
            supabase.auth.refreshSession(); 
            
            toast({
                title: "Conversion terminée",
                description: `Audio généré avec succès. ${V2V_COST_PER_CONVERSION} crédit(s) utilisé(s).`,
            });

        } catch (error: any) {
            console.error("V2V Error:", error);
            toast({
                variant: "destructive",
                title: "Erreur de conversion",
                description: error.message || "Impossible de convertir l'audio.",
            });
        } finally {
            setIsConverting(false);
        }
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

            {/* --- STEP 1: Upload Source Audio --- */}
            <Card>
                <CardHeader>
                    <CardTitle>1. Fichier audio source</CardTitle>
                    <CardDescription>
                        Téléchargez la piste audio dont vous souhaitez cloner la voix (MP3 ou WAV).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div 
                        className={cn(
                            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                            "border-border hover:border-primary/50"
                        )}
                    >
                        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <Label htmlFor="source-file-upload" className="cursor-pointer">
                            <span className="text-primary hover:underline">Cliquez pour parcourir</span>
                            <span className="text-muted-foreground"> ou glissez-déposez votre fichier</span>
                        </Label>
                        <Input
                            id="source-file-upload"
                            type="file"
                            accept="audio/mp3,audio/wav,audio/mpeg"
                            className="hidden"
                            onChange={handleFileChange}
                            disabled={isConverting}
                        />
                        <p className="text-sm text-muted-foreground mt-2">
                            {sourceFile ? `Fichier sélectionné: ${sourceFile.name}` : "MP3 ou WAV uniquement."}
                        </p>
                    </div>
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
            
            {/* --- Output Player (Placeholder) --- */}
            {convertedAudioUrl && (
                <Card className="bg-green-500/10 border-green-500/50">
                    <CardContent className="p-6 flex items-center justify-between">
                        <p className="font-medium text-green-700">Conversion terminée. Écoutez ou téléchargez le résultat.</p>
                        <Button variant="secondary" asChild>
                            <a href={convertedAudioUrl} download={`vocalizz_${model.name}_conversion.mp3`}>Télécharger l'audio</a>
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default UseModel;