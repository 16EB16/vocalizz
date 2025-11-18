import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserStatus } from "@/hooks/use-user-status";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Volume2, DollarSign, AlertTriangle, Play, Pause, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useNavigate } from "react-router-dom";
import { useElevenLabsVoices } from "@/hooks/use-elevenlabs-voices"; // NEW IMPORT

// --- CONFIGURATION T2V ---
const MAX_CHARACTERS = 5000;
const CHARACTERS_PER_CREDIT = 1000;

const formSchema = z.object({
    text: z.string().min(1, "Le texte est requis.").max(MAX_CHARACTERS, `Le texte ne doit pas dépasser ${MAX_CHARACTERS} caractères.`),
    voiceId: z.string().min(1, "Veuillez sélectionner une voix."),
});

type SynthesizeFormValues = z.infer<typeof formSchema>;

const Synthesize = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { userId, credits, isLoading: isStatusLoading } = useUserStatus();
    const { voices, isLoading: isVoicesLoading, isError: isVoicesError } = useElevenLabsVoices(); // NEW HOOK USAGE
    
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    // Determine initial voice ID based on fetched voices
    const initialVoiceId = voices.length > 0 ? voices[0].id : "";

    const form = useForm<SynthesizeFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            text: "",
            voiceId: initialVoiceId, // Use dynamic initial value
        },
    });
    
    // Update default value if voices load after form initialization
    useEffect(() => {
        if (voices.length > 0 && form.getValues("voiceId") === "") {
            form.setValue("voiceId", voices[0].id);
        }
    }, [voices, form]);
    
    const textWatch = form.watch("text");
    const selectedVoiceId = form.watch("voiceId");
    
    const requiredCredits = useMemo(() => {
        return Math.ceil(textWatch.length / CHARACTERS_PER_CREDIT);
    }, [textWatch]);
    
    const hasEnoughCredits = credits >= requiredCredits;
    
    const selectedVoice = voices.find(v => v.id === selectedVoiceId); // Use fetched voices

    // --- Audio Playback Management ---
    const handlePlayPause = () => {
        if (!audioUrl) return;

        if (!audio) {
            const newAudio = new Audio(audioUrl);
            newAudio.onplay = () => setIsPlaying(true);
            newAudio.onended = () => setIsPlaying(false);
            newAudio.onpause = () => setIsPlaying(false);
            setAudio(newAudio);
            newAudio.play();
        } else if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
    };

    // Cleanup audio element on unmount
    useEffect(() => {
        return () => {
            if (audio) {
                audio.pause();
                setAudio(null);
            }
        };
    }, [audio]);
    
    // Reset audio state when URL changes
    useEffect(() => {
        if (audioUrl) {
            if (audio) audio.pause();
            setAudio(null);
            setIsPlaying(false);
        }
    }, [audioUrl]);
    // --- End Audio Playback Management ---


    const synthesizeMutation = useMutation({
        mutationFn: async (values: SynthesizeFormValues) => {
            if (!userId) throw new Error("Utilisateur non authentifié.");
            
            const voice = voices.find(v => v.id === values.voiceId); // Use fetched voices
            if (!voice) throw new Error("Voix sélectionnée invalide.");

            const { data: apiResponse, error: apiError } = await supabase.functions.invoke('synthesize-t2v', {
                body: {
                    text: values.text,
                    voice_id: values.voiceId,
                    model_id: voice.modelId, // Use dynamic modelId
                },
            });

            if (apiError || (apiResponse && apiResponse.error)) {
                let detailedErrorMessage = apiError?.message || apiResponse?.error || "Erreur inconnue lors de la synthèse vocale.";
                
                // Handle specific credit error from Edge Function
                if (detailedErrorMessage.includes('Insufficient credits')) {
                    throw new Error("Crédits insuffisants. Veuillez recharger votre solde.");
                }
                
                throw new Error(`Échec de la synthèse: ${detailedErrorMessage}`);
            }
            
            return apiResponse as { url: string, credits_used?: number, cached?: boolean };
        },
        onSuccess: (data) => {
            setAudioUrl(data.url);
            
            const message = data.cached 
                ? "Lecture depuis le cache. Aucun crédit utilisé."
                : `Synthèse réussie. ${data.credits_used} crédit(s) utilisé(s).`;
                
            toast({
                title: "Synthèse terminée",
                description: message,
            });
            
            // Force update of user profile to reflect credit deduction
            supabase.auth.refreshSession(); 
        },
        onError: (error: any) => {
            toast({
                variant: "destructive",
                title: "Erreur de Synthèse",
                description: error.message || "Impossible de générer l'audio.",
            });
        },
    });

    const onSubmit = (values: SynthesizeFormValues) => {
        if (!hasEnoughCredits) {
            toast({
                variant: "destructive",
                title: "Crédits insuffisants",
                description: `Vous avez besoin de ${requiredCredits} crédits pour ce texte.`,
            });
            return;
        }
        synthesizeMutation.mutate(values);
    };

    if (isStatusLoading || isVoicesLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <p className="text-foreground">Chargement des voix disponibles...</p>
            </div>
        );
    }
    
    if (isVoicesError || voices.length === 0) {
        return (
            <div className="max-w-4xl mx-auto space-y-8">
                <h1 className="text-3xl font-bold text-foreground">Synthèse Vocale</h1>
                <Card className="border-destructive">
                    <CardContent className="p-6 text-destructive flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5" />
                        <p>Erreur critique: Impossible de charger la liste des voix ElevenLabs. Veuillez vérifier la clé API ou réessayer plus tard.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="mb-4">
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                    <Volume2 className="w-7 h-7 text-primary" />
                    Synthèse Vocale (Text-to-Voice)
                </h1>
                <p className="text-muted-foreground">Générez de l'audio à partir de texte en utilisant les voix ElevenLabs.</p>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    
                    {/* --- Input Text --- */}
                    <Card>
                        <CardHeader>
                            <CardTitle>1. Entrez votre texte</CardTitle>
                            <CardDescription>
                                Le texte sera converti en parole. Maximum {MAX_CHARACTERS} caractères.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FormField
                                control={form.control}
                                name="text"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Écrivez votre script ici..."
                                                rows={8}
                                                maxLength={MAX_CHARACTERS}
                                                disabled={synthesizeMutation.isPending}
                                                {...field}
                                            />
                                        </FormControl>
                                        <div className="flex justify-between text-sm text-muted-foreground">
                                            <FormMessage />
                                            <span>{textWatch.length} / {MAX_CHARACTERS} caractères</span>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>
                    
                    {/* --- Voice Selection --- */}
                    <Card>
                        <CardHeader>
                            <CardTitle>2. Choisissez la voix</CardTitle>
                            <CardDescription>
                                Sélectionnez une voix pré-entraînée ElevenLabs.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FormField
                                control={form.control}
                                name="voiceId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Voix</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={synthesizeMutation.isPending}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Sélectionner une voix..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {voices.map(voice => (
                                                    <SelectItem key={voice.id} value={voice.id}>
                                                        {voice.name} ({voice.labels.gender}, {voice.labels.accent})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    {/* --- Cost & Submit --- */}
                    <Card className={cn(
                        "bg-card border-border",
                        !hasEnoughCredits && "border-destructive/50 bg-destructive/5"
                    )}>
                        <CardContent className="p-6 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <DollarSign className="w-5 h-5 text-primary" />
                                    Coût de la Synthèse
                                </h3>
                                <span className={cn(
                                    "text-2xl font-extrabold",
                                    hasEnoughCredits ? "text-primary" : "text-destructive"
                                )}>
                                    {requiredCredits} Crédit(s)
                                </span>
                            </div>
                            
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Votre solde actuel:</span>
                                <span className="font-semibold">{credits} Crédit(s)</span>
                            </div>
                            
                            {!hasEnoughCredits && (
                                <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-sm text-destructive flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        <span>Crédits insuffisants.</span>
                                    </div>
                                    <Button variant="destructive" size="sm" onClick={() => navigate("/settings#credit-packs")}>
                                        Acheter des crédits
                                        <ArrowRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </div>
                            )}
                            
                            <Button 
                                type="submit" 
                                className="w-full gap-2"
                                disabled={synthesizeMutation.isPending || !hasEnoughCredits || textWatch.length === 0}
                            >
                                {synthesizeMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Volume2 className="w-4 h-4" />
                                )}
                                {synthesizeMutation.isPending ? "Génération en cours..." : "Générer l'audio"}
                            </Button>
                        </CardContent>
                    </Card>
                </form>
            </Form>
            
            {/* --- Output Player --- */}
            {audioUrl && (
                <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button 
                                type="button" 
                                size="icon" 
                                onClick={handlePlayPause}
                                className="bg-primary hover:bg-primary/90"
                            >
                                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                            </Button>
                            <p className="font-medium text-primary">Audio généré prêt à l'écoute.</p>
                        </div>
                        <Button variant="outline" asChild>
                            <a href={audioUrl} download="vocalizz_audio.mp3">Télécharger</a>
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default Synthesize;