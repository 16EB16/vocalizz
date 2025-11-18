import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useUserStatus } from "@/hooks/use-user-status";
import { Upload, X, Crown, Loader2, HardDrive, Clock, CheckCircle, AlertTriangle, Sparkles, Cpu, DollarSign, ArrowRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn, sanitizeFileName } from "@/lib/utils";
import { getAudioDuration, formatDurationString, formatBytes } from "@/lib/audio-utils";
import { Progress } from "@/components/ui/progress";
import AudioFileList from "@/components/AudioFileList";
import AudioAnalysisCard from "@/components/AudioAnalysisCard";
import { useQueryClient } from "@tanstack/react-query";
import { useAudioAnalysis } from "@/hooks/use-audio-analysis";
import { useCancelModel } from "@/hooks/use-cancel-model";
import { useVoiceModels } from "@/hooks/use-voice-models";
import { useDragAndDrop } from "@/hooks/use-drag-and-drop"; // Import the new hook
import { 
  POCH_STANDARD, 
  POCH_PREMIUM, 
  calculateCreditCost,
  COST_STANDARD_TRAINING,
  COST_PREMIUM_TRAINING
} from "@/lib/credit-utils"; // Import cost constants

// Constants for limits
const MAX_TOTAL_SIZE_MB = 120; // Max 120MB (approx. 2 hours of high-quality audio)
const MIN_DURATION_SECONDS = 10 * 60; // Minimum 10 minutes (600 seconds)

// Extended File type to store duration
interface AudioFile extends File {
  duration: number; // Duration in seconds
}

// Zod Schema for form validation
const formSchema = z.object({
  modelName: z.string().min(3, { message: "Le nom doit contenir au moins 3 caractères." }).max(50),
  qualityPoch: z.enum([String(POCH_STANDARD), String(POCH_PREMIUM)], {
    required_error: "Veuillez sélectionner une qualité d'entraînement.",
  }),
});

type ModelFormValues = z.infer<typeof formSchema>;

const CreateModel = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { 
    isPremium, 
    userId, 
    isLoading: isStatusLoading, 
    is_in_training, // True if active_trainings >= max_active_trainings
    active_trainings, // Current count
    max_active_trainings, // Max allowed count
    credits, 
    role 
  } = useUserStatus();
  const { data: models } = useVoiceModels(userId);
  
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalculatingDuration, setIsCalculatingDuration] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isNameChecking, setIsNameChecking] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [cleaningOption, setCleaningOption] = useState<'none' | 'premium'>('none');

  const { mutate: cancelModel, isPending: isCancelling } = useCancelModel();
  const { isDragging, handleDragOver, handleDragLeave, handleDrop } = useDragAndDrop(); // Use the new hook

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      modelName: "",
      qualityPoch: String(POCH_STANDARD),
    },
  });
  
  const modelNameWatch = form.watch("modelName");
  const qualityPochWatch = Number(form.watch("qualityPoch"));
  
  // Use the analysis hook
  const { qualityScore } = useAudioAnalysis(totalDuration);

  // --- CREDIT LOGIC ---
  const creditCost = useMemo(() => {
    return calculateCreditCost(qualityPochWatch, cleaningOption);
  }, [qualityPochWatch, cleaningOption]);
  
  const hasEnoughCredits = credits >= creditCost;
  // --- END CREDIT LOGIC ---

  const isOverSizeLimit = totalSize > MAX_TOTAL_SIZE_MB * 1024 * 1024;
  const isMinDurationMet = totalDuration >= MIN_DURATION_SECONDS;
  
  // Block submission if user is already training a model (limit reached)
  const isTrainingLimitReached = is_in_training; 
  
  const isNameValid = modelNameWatch.length >= 3 && !nameError && !isNameChecking;
  
  const canSubmit = files.length > 0 && !isOverSizeLimit && isMinDurationMet && !isSubmitting && !isCalculatingDuration && isNameValid && !isTrainingLimitReached && hasEnoughCredits;

  // Identify the model currently being processed (only needed for display in the blocked state)
  const processingModel = models?.find(m => m.status === 'processing' || m.status === 'preprocessing');


  // Update total size and duration whenever files change
  useEffect(() => {
    const size = files.reduce((acc, file) => acc + file.size, 0);
    const duration = files.reduce((acc, file) => acc + file.duration, 0);
    setTotalSize(size);
    setTotalDuration(duration);
  }, [files]);

  // Ensure Premium quality is not selected if user is standard (now 'free')
  useEffect(() => {
    // Only Pro/Studio can select Premium POCH
    if (role === 'free' && form.getValues("qualityPoch") === String(POCH_PREMIUM)) {
      form.setValue("qualityPoch", String(POCH_STANDARD));
    }
    // Only Pro/Studio can select Premium cleaning
    if (role === 'free' && cleaningOption === 'premium') {
        setCleaningOption('none');
    }
  }, [role, form, cleaningOption]);

  // Real-time model name validation
  useEffect(() => {
    const checkName = async () => {
      const name = modelNameWatch.trim();
      if (name.length < 3) {
        setNameError(null);
        return;
      }

      setIsNameChecking(true);
      setNameError(null);

      try {
        const { data: existingModels, error: checkError } = await supabase
          .from('voice_models')
          .select('id')
          .eq('user_id', userId)
          .eq('name', name);

        if (checkError) throw checkError;

        if (existingModels && existingModels.length > 0) {
          setNameError("Un modèle avec ce nom existe déjà. Veuillez choisir un nom unique.");
        }
      } catch (error) {
        console.error("Name check error:", error);
        setNameError("Erreur lors de la vérification du nom.");
      } finally {
        setIsNameChecking(false);
      }
    };

    const timeoutId = setTimeout(checkName, 500);
    return () => clearTimeout(timeoutId);
  }, [modelNameWatch, userId]);


  const validateAndAddFiles = useCallback(async (newFiles: File[]) => {
    const audioFiles = newFiles.filter(
      (file) => file.type === "audio/mp3" || file.type === "audio/wav" || file.type === "audio/mpeg"
    );

    if (audioFiles.length !== newFiles.length) {
      toast({
        variant: "destructive",
        title: "Fichiers invalides",
        description: "Seuls les fichiers MP3 et WAV sont acceptés.",
      });
    }
    
    if (audioFiles.length === 0) return;

    setIsCalculatingDuration(true);
    console.log(`[CreateModel] Démarrage du calcul de la durée pour ${audioFiles.length} nouveaux fichiers.`);
    
    try {
        // Calculate duration for each new file
        const filesWithDurationPromises = audioFiles.map(async (file) => {
            const duration = await getAudioDuration(file);
            
            // CRUCIAL FIX: Explicitly create a new File object with the duration property
            // We use the File constructor to ensure it retains all File/Blob properties (like name, size, type)
            const audioFileWithDuration = new File([file], file.name, { type: file.type }) as AudioFile;
            audioFileWithDuration.duration = duration;
            
            return audioFileWithDuration;
        });

        const filesWithDuration = await Promise.all(filesWithDurationPromises);

        const updatedFiles = [...files, ...filesWithDuration];
        const currentTotalSizeMB = updatedFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024);
        
        if (currentTotalSizeMB > MAX_TOTAL_SIZE_MB) {
          toast({
            variant: "destructive",
            title: "Limite dépassée",
            description: `La taille totale des fichiers ne peut pas dépasser ${MAX_TOTAL_SIZE_MB} MB (environ 2 heures).`,
          });
          return;
        }

        setFiles(updatedFiles);
        console.log(`[CreateModel] Calcul de la durée terminé. Durée totale actuelle: ${formatDurationString(updatedFiles.reduce((acc, f) => acc + f.duration, 0))}`);
    } catch (error) {
        console.error("Error processing audio files:", error);
        toast({
            variant: "destructive",
            title: "Erreur de traitement audio",
            description: "Impossible de lire les métadonnées d'un ou plusieurs fichiers. Assurez-vous qu'ils sont valides.",
        });
    } finally {
        setIsCalculatingDuration(false);
    }
  }, [files, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    validateAndAddFiles(selectedFiles);
    e.target.value = '';
  };
  
  const handleDropFiles = (droppedFiles: File[]) => {
    validateAndAddFiles(droppedFiles);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index) as AudioFile[]);
  };

  const getSubmitTooltipMessage = () => {
    if (isSubmitting) return "Opération en cours...";
    if (isTrainingLimitReached) return `Limite d'entraînement atteinte (${active_trainings}/${max_active_trainings}). Passez à Studio pour augmenter la limite.`;
    if (!isNameValid) return "Veuillez fournir un nom de modèle valide et unique.";
    if (files.length === 0) return "Veuillez ajouter des fichiers audio.";
    if (isOverSizeLimit) return `Taille maximale dépassée (${MAX_TOTAL_SIZE_MB} MB).`;
    if (!isMinDurationMet) return `Durée audio minimale non atteinte (${formatDurationString(MIN_DURATION_SECONDS)} requis).`;
    if (!hasEnoughCredits) return `Crédits insuffisants. Vous avez besoin de ${creditCost} crédits.`;
    return "Lancer l'entraînement de votre modèle IA.";
  };

  const onSubmit = async (values: ModelFormValues) => {
    console.log("[CreateModel] --- Démarrage de la soumission du modèle ---");
    console.log(`[CreateModel] User ID: ${userId}`);
    
    if (!userId) {
      toast({ variant: "destructive", title: "Erreur", description: "Vous devez être connecté." });
      setIsSubmitting(false);
      return;
    }

    if (!canSubmit) {
        // This should be caught by the tooltip, but we ensure a toast is shown if the button was somehow clicked
        toast({ variant: "destructive", title: "Validation manquante", description: getSubmitTooltipMessage() });
        setIsSubmitting(false);
        return;
    }
    
    const pochValue = Number(values.qualityPoch);
    const isPremiumModel = pochValue === POCH_PREMIUM;
    const finalCreditCost = creditCost; // Use the calculated cost
    const finalQualityScore = qualityScore; 

    setIsSubmitting(true);
    setUploadProgress(0);
    console.log(`[CreateModel] Démarrage du processus de création de modèle: ${values.modelName} (${pochValue} POCH). Coût: ${finalCreditCost} crédits.`);

    let modelId: string | undefined;

    try {
      // 1. Set user status to 'is_in_training' AND deduct credits
      console.log(`[CreateModel] Étape 1/5: Déduction de ${finalCreditCost} crédits et mise à jour du statut utilisateur.`);
      
      // Sanitize model name for folder path
      const sanitizedModelName = sanitizeFileName(values.modelName);
      const storagePathPrefix = `${userId}/${sanitizedModelName}`;

      // 2. Upload files to Supabase Storage
      console.log(`[CreateModel] Étape 2/5: Démarrage de l'upload de ${files.length} fichiers vers le chemin: ${storagePathPrefix}`);
      const totalFiles = files.length;
      let uploadedCount = 0;

      const uploadPromises = files.map(file => {
        if (!file.name) {
            console.error("File object is missing a name property:", file);
            throw new Error("Un des fichiers audio est invalide (nom manquant).");
        }
        
        const sanitizedFileName = sanitizeFileName(file.name);
        const filePath = `${storagePathPrefix}/${sanitizedFileName}`;
        
        return supabase.storage
          .from('audio-files')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true 
          })
          .then(res => {
            if (res.error) {
                console.error(`Supabase Storage Upload Error for ${file.name}:`, res.error);
                throw new Error(`Échec de l'upload du fichier ${file.name}: ${res.error.message}`);
            }
            uploadedCount++;
            setUploadProgress(Math.floor((uploadedCount / totalFiles) * 100));
            console.log(`[CreateModel] Fichier uploadé: ${file.name} (${uploadedCount}/${totalFiles})`);
            return res;
          });
      });

      await Promise.all(uploadPromises);
      
      setUploadProgress(100); // Upload complete
      console.log("[CreateModel] Étape 2/5: Upload terminé.");

      // 3. Trigger External AI API (CRITICAL STEP: Edge Function handles DB entry and credit deduction)
      console.log("[CreateModel] Étape 3/5: Appel de la fonction Edge 'trigger-ai-training' (inclut la déduction de crédits).");
      const { data: apiResponse, error: apiError } = await supabase.functions.invoke('trigger-ai-training', {
        body: {
          // Pass all necessary data, including cost and model details
          user_id: userId,
          model_name: values.modelName, // Pass name for DB entry
          quality: isPremiumModel ? "premium" : "standard", // Pass quality for DB entry
          poch_value: pochValue, // Pass poch for DB entry
          file_count: files.length, // Pass file count for DB entry
          audio_duration_seconds: Math.round(totalDuration), // Pass duration for DB entry
          score_qualite_source: finalQualityScore, // Pass score for DB entry
          is_premium_model: isPremiumModel, // Pass flag for DB entry
          cost_in_credits: finalCreditCost, // CRITICAL: Pass cost
          
          // Data needed for AI service
          storage_path: `${storagePathPrefix}/`, 
          epochs: pochValue,
          cleaning_option: cleaningOption, 
        },
      });

      // Check for application-level errors returned by the Edge Function
      if (apiError || (apiResponse && apiResponse.error)) {
        // If the error is 402 (Payment Required) or 403 (Limit Reached), the Edge Function should return a specific message
        let detailedErrorMessage = apiError?.message || apiResponse?.error || "Erreur inconnue lors du lancement de l'IA.";
        
        throw new Error(`Erreur de lancement IA: ${detailedErrorMessage}`);
      }
      
      // If successful, the Edge Function returned the model_id
      modelId = apiResponse?.model_id;
      console.log(`[CreateModel] Étape 4/5: Entraînement IA lancé avec succès. Job ID externe: ${apiResponse?.job_id}. Model ID: ${modelId}`);

      // 4. Invalidate queries to reflect new model and updated credit balance
      queryClient.invalidateQueries({ queryKey: ["voiceModels"] }); 
      queryClient.invalidateQueries({ queryKey: ["userProfile"] }); 

      toast({
        title: "Modèle créé !",
        description: `Vos ${finalCreditCost} crédits ont été utilisés. Le modèle est en cours de traitement.`,
      });

      navigate("/dashboard");
    } catch (error: any) {
      console.error("[CreateModel] Erreur critique lors de la création:", error);
      
      const displayMessage = error.message || "Une erreur est survenue lors de la création du modèle.";

      toast({
        variant: "destructive",
        title: "Erreur",
        description: displayMessage,
      });
      
      // Invalidate the profile just in case the status was set.
      queryClient.invalidateQueries({ queryKey: ["userProfile"] }); 

    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
      console.log("[CreateModel] --- Fin de la soumission du modèle ---");
    }
  };

  if (isStatusLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <p className="text-foreground">Vérification du statut...</p>
      </div>
    );
  }

  if (isTrainingLimitReached) {
    // Identify the model currently being processed (only needed for display in the blocked state)
    const activeModels = models?.filter(m => m.status === 'processing' || m.status === 'preprocessing') || [];
    
    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold text-foreground">Créer un modèle</h1>
            <Card className="bg-card border-border border-destructive/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                        <Cpu className="w-5 h-5" />
                        Limite d'entraînement atteinte
                    </CardTitle>
                    <CardDescription>
                        Vous avez atteint votre limite de {max_active_trainings} entraînement(s) simultané(s).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="mb-4 text-muted-foreground">
                        Votre plan actuel ({role === 'free' ? 'Découverte' : role === 'pro' ? 'Pro' : 'Studio'}) vous permet de lancer {max_active_trainings} job(s) à la fois. Vous avez actuellement {active_trainings} job(s) en cours.
                    </p>
                    {activeModels.length > 0 && (
                        <div className="mb-4 p-3 bg-muted rounded-lg">
                            <p className="font-semibold mb-1">Modèles actifs:</p>
                            <ul className="list-disc list-inside text-sm text-muted-foreground">
                                {activeModels.map(m => <li key={m.id}>{m.name} ({m.status})</li>)}
                            </ul>
                        </div>
                    )}
                    <div className="flex gap-3">
                        <Button onClick={() => navigate("/dashboard")}>
                            Retour au Studio
                        </Button>
                        {role !== 'studio' && (
                            <Button variant="secondary" onClick={() => navigate("/settings")}>
                                Passer à Studio (x3 simultanés)
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Créer un modèle</h1>
        <p className="text-muted-foreground">Générez votre modèle de voix IA</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          {/* --- STEP 1: Audio Files --- */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>1. Fichiers audio</CardTitle>
              <CardDescription>
                Téléchargez vos fichiers audio (MP3 ou WAV, max {MAX_TOTAL_SIZE_MB} MB)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, handleDropFiles)}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-primary hover:underline">Cliquez pour parcourir</span>
                  <span className="text-muted-foreground"> ou glissez-déposez vos fichiers</span>
                </Label>
                <Input
                  id="file-upload"
                  type="file"
                  multiple
                  accept="audio/mp3,audio/wav,audio/mpeg"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  MP3 ou WAV uniquement.
                </p>
              </div>

              {/* Minimum Requirements Checklist */}
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-semibold">Exigences minimales:</h3>
                <div className={cn("flex items-center gap-2 text-sm", isMinDurationMet ? "text-green-600" : "text-red-600")}>
                    {isMinDurationMet ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    Durée totale: {formatDurationString(totalDuration)} (Minimum {formatDurationString(MIN_DURATION_SECONDS)})
                </div>
                <div className={cn("flex items-center gap-2 text-sm", !isOverSizeLimit ? "text-green-600" : "text-red-600")}>
                    {!isOverSizeLimit ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    Taille maximale: {formatBytes(totalSize)} (Max {MAX_TOTAL_SIZE_MB} MB)
                </div>
              </div>

              {isCalculatingDuration && (
                <div className="flex items-center justify-center p-3 bg-muted rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <p className="text-sm text-muted-foreground">Calcul de la durée des fichiers...</p>
                </div>
              )}
              
              {files.length > 0 && (
                <AudioFileList 
                    files={files as AudioFile[]} 
                    totalSize={totalSize} 
                    totalDuration={totalDuration} 
                    removeFile={removeFile} 
                    maxTotalSizeMB={MAX_TOTAL_SIZE_MB}
                />
              )}
            </CardContent>
          </Card>

          {/* --- STEP 2: Analysis & Preparation (Conditional) --- */}
          {files.length > 0 && !isCalculatingDuration && (
            <AudioAnalysisCard 
                totalDuration={totalDuration}
                minDurationSeconds={MIN_DURATION_SECONDS}
                isCalculating={isCalculatingDuration}
                onCleaningOptionChange={setCleaningOption}
                cleaningOption={cleaningOption}
            />
          )}

          {/* --- STEP 3: Configuration & Launch --- */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>3. Configuration & Lancement</CardTitle>
              <CardDescription>
                Nommez votre modèle et choisissez la qualité d'entraînement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="modelName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="model-name">Nom du modèle</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          id="model-name"
                          placeholder="Ex: Voix Lead - Album 2"
                          required
                          {...field}
                          disabled={isNameChecking || isSubmitting}
                        />
                        {isNameChecking && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
                        )}
                      </div>
                    </FormControl>
                    <FormMessage>{nameError}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="qualityPoch"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Sélection de la Qualité (POCH)</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) => {
                          if (Number(value) === POCH_PREMIUM && role === 'free') {
                            toast({ 
                                variant: "destructive", 
                                title: "Accès refusé", 
                                description: `La qualité Premium (${POCH_PREMIUM} POCH) est réservée aux membres Pro ou Studio.` 
                            });
                            return;
                          }
                          field.onChange(value);
                        }}
                        value={field.value}
                        className="flex flex-col space-y-2"
                      >
                        {/* Standard Option (Always available) */}
                        <FormItem className="flex items-center space-x-3 space-y-0 p-3 border rounded-lg">
                          <FormControl>
                            <RadioGroupItem value={String(POCH_STANDARD)} />
                          </FormControl>
                          <FormLabel className="font-normal flex-1 flex items-center justify-between cursor-pointer">
                            Standard ({POCH_STANDARD} POCH)
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Entraînement rapide</span>
                                <span className="font-semibold text-primary ml-2">{COST_STANDARD_TRAINING} Crédit</span>
                            </div>
                          </FormLabel>
                        </FormItem>

                        {/* Premium Option (Conditional) */}
                        <Tooltip delayDuration={100}>
                          <TooltipTrigger asChild>
                            <div className={cn(
                              "p-3 border rounded-lg transition-colors",
                              role === 'free' && "opacity-50 cursor-not-allowed bg-muted/50",
                              role !== 'free' && field.value === String(POCH_PREMIUM) && "border-primary"
                            )}>
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <RadioGroupItem 
                                    value={String(POCH_PREMIUM)} 
                                    disabled={role === 'free'}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal flex-1 flex items-center justify-between cursor-pointer">
                                  Pro ({POCH_PREMIUM} POCH)
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Haute Fidélité</span>
                                    <span className="font-semibold text-primary ml-2">{COST_PREMIUM_TRAINING} Crédits</span>
                                    <Crown className="w-4 h-4 text-yellow-500 fill-yellow-500/20 ml-2" />
                                  </div>
                                </FormLabel>
                              </FormItem>
                            </div>
                          </TooltipTrigger>
                          {role === 'free' && (
                            <TooltipContent className="bg-yellow-600 text-white border-yellow-700">
                              <p>Réservé aux membres Pro ou Studio pour un rendu Haute Fidélité.</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          
          {/* --- FINAL COST & SUBMIT --- */}
          <Card className={cn(
            "bg-card border-border",
            (!hasEnoughCredits || isTrainingLimitReached) && "border-destructive/50 bg-destructive/5"
          )}>
            <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-primary" />
                        Coût Total de l'Entraînement
                    </h3>
                    <span className={cn(
                        "text-2xl font-extrabold",
                        hasEnoughCredits ? "text-primary" : "text-destructive"
                    )}>
                        {creditCost} Crédit(s)
                    </span>
                </div>
                
                <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Votre solde actuel:</span>
                    <span className="font-semibold">{credits} Crédit(s)</span>
                </div>
                
                {isTrainingLimitReached && (
                    <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-sm text-destructive flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Limite d'entraînement atteinte ({active_trainings}/{max_active_trainings}).</span>
                        </div>
                        {role !== 'studio' && (
                            <Button variant="destructive" size="sm" onClick={() => navigate("/settings")}>
                                Passer à Studio
                            </Button>
                        )}
                    </div>
                )}
                
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
            </CardContent>
          </Card>

          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
                <div className="flex gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate("/dashboard")}
                      className="flex-1"
                      disabled={isSubmitting}
                    >
                      Annuler
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={!canSubmit}
                      className="flex-1 gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {uploadProgress !== null && uploadProgress < 100 ? "Téléchargement..." : "Lancement de l'entraînement..."}
                        </>
                      ) : (
                        `Lancer l'entraînement (${creditCost} Crédit${creditCost > 1 ? 's' : ''})`
                      )}
                    </Button>
                </div>
            </TooltipTrigger>
            {!canSubmit && (
                <TooltipContent className="bg-destructive text-white border-destructive">
                    {getSubmitTooltipMessage()}
                </TooltipContent>
            )}
          </Tooltip>
          
          {/* Upload Progress Indicator */}
          {isSubmitting && uploadProgress !== null && uploadProgress < 100 && (
            <div className="space-y-2 p-3 bg-primary/5 border border-primary/20 rounded-lg mt-4">
                <div className="flex justify-between text-sm font-medium text-primary">
                    <span>Téléchargement en cours...</span>
                    <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" indicatorClassName="bg-primary" />
            </div>
          )}
        </form>
      </Form>
    </div>
  );
};

export default CreateModel;