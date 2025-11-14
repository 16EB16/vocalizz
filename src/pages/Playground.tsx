import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mic, Type, Play, Loader2, Upload, ThumbsUp, ThumbsDown, PlusCircle, Volume2, FileText, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useVoiceModels } from "@/hooks/use-voice-models";
import { useUserStatus } from "@/hooks/use-user-status";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useModelFeedback } from "@/hooks/use-model-feedback";
import { useSearchParams, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const Playground = () => {
  const { userId } = useUserStatus();
  const { data: models, isLoading: isModelsLoading } = useVoiceModels(userId);
  const { toast } = useToast();
  const feedbackMutation = useModelFeedback();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlModelId = searchParams.get('modelId');

  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined);
  const [textInput, setTextInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioGenerated, setAudioGenerated] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null); // New state for VTV file
  const audioRef = useRef<HTMLAudioElement>(null);

  const readyModels = models?.filter(m => m.status === 'completed') || [];
  const selectedModel = readyModels.find(m => m.id === selectedModelId);

  // Effect to handle URL parameter for model selection
  useEffect(() => {
    if (urlModelId && readyModels.length > 0 && !selectedModelId) {
      const modelToSelect = readyModels.find(m => m.id === urlModelId);
      if (modelToSelect) {
        setSelectedModelId(urlModelId);
      }
    }
  }, [urlModelId, readyModels, selectedModelId]);

  // Reset audio state when model changes
  const handleModelChange = (id: string) => {
    setSelectedModelId(id);
    setAudioGenerated(false);
    setAudioUrl(null);
    if (audioRef.current) {
        audioRef.current.pause();
    }
  };

  const handleGenerateSpeech = () => {
    if (!selectedModelId) {
      toast({ variant: "destructive", title: "Erreur", description: "Veuillez sélectionner un modèle vocal." });
      return;
    }
    if (!textInput.trim()) {
      toast({ variant: "destructive", title: "Erreur", description: "Veuillez entrer du texte à synthétiser." });
      return;
    }

    setIsGenerating(true);
    setAudioGenerated(false);
    setAudioUrl(null);
    
    // --- Simulation de l'appel API TTS ---
    setTimeout(() => {
      setIsGenerating(false);
      setAudioGenerated(true);
      // Placeholder URL for generated audio
      setAudioUrl("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"); 
      toast({ title: "Synthèse vocale terminée", description: `Le modèle "${selectedModel?.name}" a généré l'audio.` });
    }, 2000);
    // --- Fin Simulation ---
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.type === "audio/mp3" || file.type === "audio/wav" || file.type === "audio/mpeg") {
            setReferenceFile(file);
            setAudioGenerated(false);
            setAudioUrl(null);
        } else {
            toast({ variant: "destructive", title: "Fichier invalide", description: "Seuls les fichiers MP3 et WAV sont acceptés pour la conversion." });
            setReferenceFile(null);
        }
    }
    e.target.value = ''; // Reset input
  };

  const handleVoiceToVoice = () => {
    if (!selectedModelId) {
      toast({ variant: "destructive", title: "Erreur", description: "Veuillez sélectionner un modèle vocal." });
      return;
    }
    if (!referenceFile) {
        toast({ variant: "destructive", title: "Erreur", description: "Veuillez uploader un fichier audio de référence." });
        return;
    }

    setIsGenerating(true);
    setAudioGenerated(false);
    setAudioUrl(null);

    // --- Simulation de l'appel API VTV ---
    setTimeout(() => {
        setIsGenerating(false);
        setAudioGenerated(true);
        // Placeholder URL for generated audio
        setAudioUrl("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"); 
        toast({ title: "Conversion vocale terminée", description: `Le modèle "${selectedModel?.name}" a converti l'audio.` });
    }, 3000);
    // --- Fin Simulation ---
  };

  const handleFeedback = (rating: 1 | 5) => {
    if (!selectedModelId) return;
    feedbackMutation.mutate({ modelId: selectedModelId, rating });
    setAudioGenerated(false); // Hide feedback buttons after submission
  };

  const renderAudioPlayer = () => {
    if (!audioUrl) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <Volume2 className="w-5 h-5 text-primary" />
                <p className="font-medium text-foreground">Résultat de la synthèse/conversion</p>
            </div>
            <audio ref={audioRef} controls src={audioUrl} className="w-full rounded-lg bg-muted p-2">
                Votre navigateur ne supporte pas l'élément audio.
            </audio>
        </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Playground (Zone de Test)</h1>
      <p className="text-muted-foreground">Testez vos modèles de voix IA en temps réel.</p>

      <Card>
        <CardHeader>
          <CardTitle>Sélectionner un modèle</CardTitle>
        </CardHeader>
        <CardContent>
          <Select 
            onValueChange={handleModelChange} 
            value={selectedModelId}
            disabled={isModelsLoading || readyModels.length === 0 || isGenerating}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={isModelsLoading ? "Chargement des modèles..." : (readyModels.length === 0 ? "Aucun modèle prêt" : "Sélectionnez un modèle prêt")} />
            </SelectTrigger>
            <SelectContent>
              {readyModels.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">Aucun modèle prêt.</div>
              ) : (
                readyModels.map(model => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name} ({model.poch_value} POCH)
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {selectedModel && (
            <p className="text-sm text-muted-foreground mt-2">
              Modèle sélectionné : {selectedModel.name} ({selectedModel.poch_value} POCH)
            </p>
          )}
          {readyModels.length === 0 && !isModelsLoading && (
            <div className="mt-4 p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-3">
                    Vous n'avez pas encore de modèle prêt à être testé.
                </p>
                <Button onClick={() => navigate("/create")} className="gap-2">
                    <PlusCircle className="w-4 h-4" />
                    Créer un modèle maintenant
                </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="tts" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tts" className="gap-2" disabled={isGenerating}><Type className="w-4 h-4" /> Text-to-Speech</TabsTrigger>
          <TabsTrigger value="vtv" className="gap-2" disabled={isGenerating}><Mic className="w-4 h-4" /> Voice-to-Voice</TabsTrigger>
        </TabsList>

        {/* --- Text-to-Speech Tab --- */}
        <TabsContent value="tts">
          <Card>
            <CardHeader>
              <CardTitle>Synthèse vocale</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea 
                placeholder="Entrez le texte à synthétiser (max 200 caractères)" 
                rows={4}
                maxLength={200}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={isGenerating || !selectedModelId}
              />
              <Button 
                onClick={handleGenerateSpeech} 
                disabled={isGenerating || !selectedModelId || !textInput.trim()}
                className="w-full gap-2"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {isGenerating ? "Génération en cours..." : "Générer l'audio"}
              </Button>
              
              {/* Audio Player */}
              <div className={cn(
                "mt-4 p-4 border rounded-lg bg-muted/50 text-muted-foreground text-sm transition-opacity duration-300",
                audioUrl ? "opacity-100" : "opacity-0 h-0 p-0 border-none"
              )}>
                {renderAudioPlayer()}
              </div>

              {/* Feedback Section */}
              {audioGenerated && selectedModelId && (
                <div className="flex items-center justify-center gap-4 pt-4 border-t mt-4">
                    <span className="text-sm text-muted-foreground">Qualité du rendu ?</span>
                    <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleFeedback(5)}
                                disabled={feedbackMutation.isPending}
                            >
                                <ThumbsUp className="w-5 h-5 text-green-500" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            J'aime (5/5)
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleFeedback(1)}
                                disabled={feedbackMutation.isPending}
                            >
                                <ThumbsDown className="w-5 h-5 text-red-500" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            Je n'aime pas (1/5)
                        </TooltipContent>
                    </Tooltip>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Voice-to-Voice Tab --- */}
        <TabsContent value="vtv">
          <Card>
            <CardHeader>
              <CardTitle>Conversion vocale (Voice-to-Voice)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                <Upload className="w-12 h-12 mx-auto mb-4" />
                <p className="mb-4">Uploadez une piste vocale à convertir (MP3/WAV)</p>
                
                <label htmlFor="vtv-file-upload" className="cursor-pointer">
                    <Button variant="outline" className="mt-4" disabled={isGenerating || !selectedModelId}>
                        Sélectionner un fichier
                    </Button>
                    <Input
                        id="vtv-file-upload"
                        type="file"
                        accept="audio/mp3,audio/wav,audio/mpeg"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </label>
                
                {referenceFile && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-foreground">
                        <FileText className="w-4 h-4" />
                        <span className="truncate max-w-[200px]">{referenceFile.name}</span>
                        <Button variant="ghost" size="icon" onClick={() => setReferenceFile(null)}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                )}
              </div>
              
              <Button 
                onClick={handleVoiceToVoice} 
                disabled={isGenerating || !selectedModelId || !referenceFile}
                className="w-full gap-2"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {isGenerating ? "Conversion en cours..." : "Convertir la voix"}
              </Button>
              
              {/* Audio Player */}
              <div className={cn(
                "mt-4 p-4 border rounded-lg bg-muted/50 text-muted-foreground text-sm transition-opacity duration-300",
                audioUrl ? "opacity-100" : "opacity-0 h-0 p-0 border-none"
              )}>
                {renderAudioPlayer()}
              </div>

              {/* Feedback Section */}
              {audioGenerated && selectedModelId && (
                <div className="flex items-center justify-center gap-4 pt-4 border-t mt-4">
                    <span className="text-sm text-muted-foreground">Qualité du rendu ?</span>
                    <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleFeedback(5)}
                                disabled={feedbackMutation.isPending}
                            >
                                <ThumbsUp className="w-5 h-5 text-green-500" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            J'aime (5/5)
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleFeedback(1)}
                                disabled={feedbackMutation.isPending}
                            >
                                <ThumbsDown className="w-5 h-5 text-red-500" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            Je n'aime pas (1/5)
                        </TooltipContent>
                    </Tooltip>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Playground;