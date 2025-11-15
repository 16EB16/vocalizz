import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useUserStatus } from "@/hooks/use-user-status";
import { useVoiceModels, VoiceModel } from "@/hooks/use-voice-models";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Trash2, Clock, Crown, Zap, Loader2, AlertTriangle, Cpu, Mic, Ban, Sparkles, X } from "lucide-react";
import BillingPortalButton from "@/components/BillingPortalButton";
import { formatDurationString } from "@/lib/audio-utils";
import ModelCardSkeleton from "@/components/ModelCardSkeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useCancelModel } from "@/hooks/use-cancel-model"; // Use the renamed hook

const MAX_FREE_MODELS = 5;

// --- TIMEOUT CONSTANTS (in seconds) ---
const TIMEOUT_STANDARD_SECONDS = 30 * 60; // 30 minutes
const TIMEOUT_PREMIUM_SECONDS = 2 * 3600; // 2 hours (120 minutes)
// ---------------------------------------

// Utility function to format seconds into H:M:S
const formatTimeElapsed = (totalSeconds: number): string => {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const pad = (num: number) => num.toString().padStart(2, '0');

  return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
};

// Function to estimate total training time based on POCH (in minutes)
const estimateTrainingDurationMinutes = (poch: number): number => {
    // Standard (500 POCH): ~15 minutes
    // Premium (2000 POCH): ~60 minutes
    if (poch === 2000) return 60;
    if (poch === 500) return 15;
    return 30; // Default fallback
};


const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPremium, userId, isLoading: isUserStatusLoading, is_in_training } = useUserStatus();
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Use the generic cancel hook
  const { mutate: cancelModel, isPending: isCancelling } = useCancelModel(); 

  // Update current time every second for the elapsed timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Data Fetching using TanStack Query
  const { data: models, isLoading: isModelsLoading, isError } = useVoiceModels(userId);
  const modelList = models || [];
  const canCreateNewModel = isPremium || modelList.length < MAX_FREE_MODELS;
  
  // Identify the model currently being processed
  const processingModel = modelList.find(m => m.status === 'processing' || m.status === 'preprocessing');


  // 2. Data Mutation (Deletion)
  const deleteModelMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string, name: string }) => {
      if (!userId) throw new Error("Utilisateur non authentifié.");

      // A. Delete DB entry first
      const { error: dbError } = await supabase.from("voice_models").delete().eq("id", id);
      if (dbError) throw new Error("Impossible de supprimer le modèle de la base de données.");

      // B. Call Edge Function to delete files from storage
      const { data: fileDeleteResponse, error: fnError } = await supabase.functions.invoke('delete-model-files', {
        body: { model_id: id, user_id: userId, model_name: name },
      });

      if (fnError) {
        console.error("Edge Function Error (delete-model-files):", fnError);
        // We log the error but don't throw, as the DB entry is already gone.
        // The user should be notified that files might remain.
        throw new Error("Modèle supprimé, mais erreur lors de la suppression des fichiers de stockage.");
      }
      
      if (fileDeleteResponse && fileDeleteResponse.error) {
        throw new Error(`Modèle supprimé, mais erreur de nettoyage des fichiers: ${fileDeleteResponse.error}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voiceModels"] });
      // Also invalidate user profile in case the deleted model was the one blocking training
      queryClient.invalidateQueries({ queryKey: ["userProfile"] }); 
      toast({
        title: "Modèle supprimé",
        description: "Le modèle et ses fichiers ont été supprimés avec succès.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur de suppression",
        description: error.message,
      });
    },
  });

  const handleDeleteModel = (model: VoiceModel) => {
    deleteModelMutation.mutate({ id: model.id, name: model.name });
  };
  
  const handleCancelStuckModel = (modelId: string) => {
      if (userId) {
          // isManualCancel: false for stuck models
          cancelModel({ modelId, userId, isManualCancel: false }); 
      }
  };
  
  const handleManualCancel = (modelId: string) => {
      if (userId) {
          // isManualCancel: true for manual cancellation
          cancelModel({ modelId, userId, isManualCancel: true }); 
      }
  };

  // 4. Realtime Subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('voice_models_changes')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'voice_models',
          filter: `user_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["voiceModels", userId] });
          // Invalidate profile to catch is_in_training status changes
          queryClient.invalidateQueries({ queryKey: ["userProfile"] }); 
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);


  const handleCreateModelClick = () => {
    if (!canCreateNewModel) {
      toast({
        variant: "destructive",
        title: "Limite atteinte",
        description: `Les utilisateurs gratuits sont limités à ${MAX_FREE_MODELS} modèles créés. Passez à Premium pour créer plus.`,
      });
      return;
    }
    navigate("/create");
  };

  // --- REALISTIC DOWNLOAD FUNCTION ---
  const handleDownloadModel = async (model: VoiceModel) => {
    if (model.status !== 'completed' || !userId) return;

    toast({
      title: "Préparation du téléchargement",
      description: `Génération des liens sécurisés pour ${model.name}...`,
    });

    // Assuming the backend stores the final RVC files in a bucket named 'rvc-models'
    // under the path: user_id/model_id/
    const modelPath = `${userId}/${model.id}/`;
    const pthFileName = `${model.name}.pth`;
    const indexFileName = `${model.name}.index`;
    
    const downloadBucket = 'rvc-models'; // Assuming a separate bucket for final models

    try {
      // 1. Generate signed URL for .pth file
      const { data: pthData, error: pthError } = await supabase.storage
        .from(downloadBucket)
        .createSignedUrl(modelPath + pthFileName, 60); // Link valid for 60 seconds

      if (pthError) throw pthError;

      // 2. Generate signed URL for .index file
      const { data: indexData, error: indexError } = await supabase.storage
        .from(downloadBucket)
        .createSignedUrl(modelPath + indexFileName, 60); // Link valid for 60 seconds

      if (indexError) throw indexError;

      // 3. Trigger downloads (simulated for frontend environment)
      // We use a simple anchor tag trick to trigger the download
      const triggerDownload = (url: string, filename: string) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      triggerDownload(pthData.signedUrl, pthFileName);
      triggerDownload(indexData.signedUrl, indexFileName);

      toast({
        title: "Téléchargement lancé",
        description: "Vos fichiers RVC (.pth et .index) sont en cours de téléchargement.",
      });

    } catch (error: any) {
      console.error("Download error:", error);
      toast({
        variant: "destructive",
        title: "Erreur de téléchargement",
        description: error.message || "Impossible de générer les liens de téléchargement sécurisés. Vérifiez les permissions du bucket 'rvc-models'.",
      });
    }
  };
  // --- END REALISTIC DOWNLOAD FUNCTION ---

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500 hover:bg-green-500/80">Prêt</Badge>;
      case "processing":
      case "preprocessing":
        return <Badge className="bg-primary hover:bg-primary/80 flex items-center gap-1">
            <Cpu className="w-3 h-3" /> Entraînement
        </Badge>;
      case "failed":
        return <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Échoué
        </Badge>;
      default:
        return <Badge variant="secondary">En file d'attente</Badge>;
    }
  };
  
  const getQualityScoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score < 50) return "text-destructive";
    if (score < 75) return "text-yellow-600";
    return "text-green-600";
  };

  const renderModelCards = () => {
    if (isModelsLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ModelCardSkeleton />
          <ModelCardSkeleton />
          <ModelCardSkeleton />
        </div>
      );
    }

    if (isError) {
      return (
        <div className="text-center py-12">
          <p className="text-destructive font-semibold">Erreur lors du chargement des données.</p>
          <p className="text-muted-foreground">Veuillez réessayer plus tard.</p>
        </div>
      );
    }

    if (modelList.length === 0) {
      return (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <h3 className="text-xl font-semibold mb-2">Aucun modèle créé</h3>
            <p className="text-muted-foreground mb-6">
              Commencez par créer votre premier modèle de voix IA
            </p>
            <Button onClick={handleCreateModelClick} className="gap-2">
              <Plus className="w-4 h-4" />
              Créer mon premier modèle
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modelList.map((model) => {
            const isProcessing = model.status === "processing" || model.status === "preprocessing";
            
            let timeElapsed = 0;
            let estimatedDurationMinutes = 0;
            let estimatedDurationString = "";
            let timeRemainingString = "";
            let isStuck = false;
            let timeoutLimitSeconds = 0;

            if (isProcessing) {
                const createdAt = new Date(model.created_at).getTime();
                timeElapsed = Math.floor((currentTime - createdAt) / 1000);
                estimatedDurationMinutes = estimateTrainingDurationMinutes(model.poch_value);
                
                const estimatedTotalSeconds = estimatedDurationMinutes * 60;
                const timeRemainingSeconds = estimatedTotalSeconds - timeElapsed;
                
                estimatedDurationString = `${estimatedDurationMinutes} min`;
                timeRemainingString = formatTimeElapsed(timeRemainingSeconds);
                
                // --- NEW TIMEOUT LOGIC ---
                timeoutLimitSeconds = model.poch_value === 2000 ? TIMEOUT_PREMIUM_SECONDS : TIMEOUT_STANDARD_SECONDS;
                isStuck = timeElapsed > timeoutLimitSeconds;
                // --- END NEW TIMEOUT LOGIC ---
            }

            return (
              <Card 
                key={model.id} 
                className={`bg-card border-border transition-all ${
                  model.is_premium_model 
                    ? "border-2 border-yellow-500 shadow-lg shadow-yellow-300/30 hover:border-yellow-400" 
                    : "hover:border-primary/50"
                } ${
                    isProcessing ? "animate-pulse-slow border-primary/50" : ""
                }`}
              >
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <CardTitle className="text-xl flex items-center gap-2">
                      {model.name}
                      {model.is_premium_model && (
                        <Tooltip delayDuration={100}>
                          <TooltipTrigger>
                            <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500/20" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Modèle Haute Fidélité (Premium)
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </CardTitle>
                    {getStatusBadge(model.status)}
                  </div>
                  <CardDescription className="flex items-center justify-between">
                    <span>{model.poch_value} POCH</span>
                    <span className="text-xs text-muted-foreground">
                      {model.is_premium_model ? "Haute Qualité" : "Standard"}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isProcessing && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progression</span>
                        <span>{model.progress}%</span>
                      </div>
                      <Progress 
                        value={model.progress} 
                        className="h-2" 
                        indicatorClassName={model.is_premium_model ? "bg-yellow-500" : "bg-primary"}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground pt-1">
                        <span>Temps écoulé: {formatTimeElapsed(timeElapsed)}</span>
                        <span>Est. restante: {timeRemainingString}</span>
                      </div>
                      
                      {/* NEW: Stuck Model Warning */}
                      {isStuck && (
                        <div className="p-2 bg-destructive/10 border border-destructive rounded-lg text-sm text-destructive flex items-center justify-between gap-2 mt-3">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>Bloqué ? Temps max ({formatTimeElapsed(timeoutLimitSeconds)}) dépassé.</span>
                            </div>
                            <Button 
                                variant="destructive" 
                                size="sm" 
                                onClick={() => handleCancelStuckModel(model.id)}
                                disabled={isCancelling}
                            >
                                {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                            </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {model.status === "failed" && (
                    <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-sm text-destructive flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                            L'entraînement a échoué. 
                            {model.error_message ? ` Détails: ${model.error_message.substring(0, 100)}...` : " Veuillez vérifier vos fichiers audio et réessayer."}
                        </span>
                    </div>
                  )}
                  
                  {/* Source Quality Score */}
                  {model.score_qualite_source !== null && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mic className="w-4 h-4" />
                        <span>Qualité Source: 
                            <span className={cn("font-semibold ml-1", getQualityScoreColor(model.score_qualite_source))}>
                                {model.score_qualite_source}/100
                            </span>
                        </span>
                    </div>
                  )}

                  {/* Cleaning Applied Status */}
                  {model.cleaning_applied && (
                    <div className="flex items-center gap-2 text-sm text-yellow-600">
                        <Sparkles className="w-4 h-4" />
                        <span>Nettoyage IA Premium appliqué</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>
                      Créé le {new Date(model.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span>{model.file_count} fichier(s) audio</span>
                    <span className="ml-2">
                      ({model.audio_duration_seconds !== null ? formatDurationString(model.audio_duration_seconds) : "Durée inconnue"})
                    </span>
                  </div>
                  <div className="flex gap-2 pt-2">
                    {model.status === "completed" && (
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="flex-1 gap-2 bg-primary hover:bg-primary/90"
                        onClick={() => handleDownloadModel(model)}
                      >
                        <Download className="w-4 h-4" />
                        Télécharger le modèle
                      </Button>
                    )}
                    
                    {isProcessing && (
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1 gap-2 text-destructive border-destructive hover:bg-destructive/10"
                            onClick={() => handleManualCancel(model.id)}
                            disabled={isCancelling}
                        >
                            {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                            Annuler
                        </Button>
                    )}
                    
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(model.status !== "completed" && !isProcessing && "flex-1")}
                                disabled={deleteModelMutation.isPending}
                            >
                                {deleteModelMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Êtes-vous absolument sûr ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Cette action est irréversible. Cela supprimera définitivement le modèle vocal <span className="font-semibold text-foreground">"{model.name}"</span> de nos serveurs.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction 
                                    onClick={() => handleDeleteModel(model)} // Pass the whole model object
                                    className="bg-destructive hover:bg-destructive/90"
                                >
                                    Oui, Supprimer
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
        })}
      </div>
    );
  };

  if (isUserStatusLoading) {
    return (
      <div className="text-center py-12 flex justify-center items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <p className="text-muted-foreground">Vérification du statut utilisateur...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-foreground">Studio</h1>
        <div className="flex gap-2">
          <BillingPortalButton isPremium={isPremium} />
          <Button 
            onClick={handleCreateModelClick} 
            className="gap-2"
            disabled={!canCreateNewModel || is_in_training}
          >
            <Plus className="w-4 h-4" />
            Nouveau modèle
          </Button>
        </div>
      </div>
      
      {is_in_training && processingModel && (
        <div className="p-4 bg-primary/10 border border-primary/30 text-primary rounded-lg flex justify-between items-center gap-4">
            <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 animate-pulse" />
                <p className="text-sm font-medium">
                    Entraînement en cours : <span className="font-bold">{processingModel.name}</span> ({processingModel.poch_value} POCH). Vous ne pouvez lancer qu'un seul entraînement à la fois.
                </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate("/create")}>
                Voir le statut
            </Button>
        </div>
      )}

      {!isPremium && !is_in_training && (
        <div className="p-4 bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-lg flex justify-between items-center">
          <p className="text-sm font-medium">
            Vous êtes en version gratuite. Limite: {modelList.length}/{MAX_FREE_MODELS} modèles créés.
          </p>
          <BillingPortalButton isPremium={isPremium} />
        </div>
      )}

      {renderModelCards()}
    </div>
  );
};

export default Dashboard;