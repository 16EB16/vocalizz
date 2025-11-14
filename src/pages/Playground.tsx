import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mic, Type, Play, Loader2, Upload, ThumbsUp, ThumbsDown, PlusCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVoiceModels } from "@/hooks/use-voice-models";
import { useUserStatus } from "@/hooks/use-user-status";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useModelFeedback } from "@/hooks/use-model-feedback";
import { useSearchParams, useNavigate } from "react-router-dom";

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
  const [audioGenerated, setAudioGenerated] = useState(false); // State to show feedback buttons

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
    
    // --- Simulation de l'appel API TTS ---
    setTimeout(() => {
      setIsGenerating(false);
      setAudioGenerated(true);
      toast({ title: "Synthèse vocale terminée", description: `Le modèle "${selectedModel?.name}" a généré l'audio.` });
      // In a real app, you would play the audio file returned by the API here.
    }, 2000);
    // --- Fin Simulation ---
  };

  const handleVoiceToVoice = () => {
    if (!selectedModelId) {
      toast({ variant: "destructive", title: "Erreur", description: "Veuillez sélectionner un modèle vocal." });
      return;
    }
    toast({ title: "Fonctionnalité en cours", description: "Le Voice-to-Voice sera bientôt disponible." });
  };

  const handleFeedback = (rating: 1 | 5) => {
    if (!selectedModelId) return;
    feedbackMutation.mutate({ modelId: selectedModelId, rating });
    setAudioGenerated(false); // Hide feedback buttons after submission
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
            onValueChange={setSelectedModelId} 
            value={selectedModelId}
            disabled={isModelsLoading || readyModels.length === 0}
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
          <TabsTrigger value="tts" className="gap-2"><Type className="w-4 h-4" /> Text-to-Speech</TabsTrigger>
          <TabsTrigger value="vtv" className="gap-2"><Mic className="w-4 h-4" /> Voice-to-Voice</TabsTrigger>
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
              
              {/* Placeholder for Audio Player */}
              <div className="mt-4 p-4 border rounded-lg bg-muted/50 text-muted-foreground text-sm">
                Lecteur audio (Résultat de la synthèse)
              </div>

              {/* Feedback Section */}
              {audioGenerated && selectedModelId && (
                <div className="flex items-center justify-center gap-4 pt-4 border-t mt-4">
                    <span className="text-sm text-muted-foreground">Qualité du rendu ?</span>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleFeedback(5)}
                        disabled={feedbackMutation.isPending}
                    >
                        <ThumbsUp className="w-5 h-5 text-green-500" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleFeedback(1)}
                        disabled={feedbackMutation.isPending}
                    >
                        <ThumbsDown className="w-5 h-5 text-red-500" />
                    </Button>
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
                <p>Uploadez une piste vocale à convertir (MP3/WAV)</p>
                <Button variant="outline" className="mt-4" onClick={handleVoiceToVoice} disabled={!selectedModelId}>
                    Sélectionner un fichier
                </Button>
              </div>
              
              <Button 
                onClick={handleVoiceToVoice} 
                disabled={!selectedModelId}
                className="w-full gap-2"
              >
                Convertir la voix
              </Button>
              
              {/* Placeholder for Audio Player */}
              <div className="mt-4 p-4 border rounded-lg bg-muted/50 text-muted-foreground text-sm">
                Lecteur audio (Résultat de la conversion)
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Playground;