import { useState, useEffect, useCallback } from "react";
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
import { Upload, X, Crown, Loader2, HardDrive, Clock, CheckCircle, AlertTriangle, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { getAudioDuration, formatDurationString, formatBytes } from "@/lib/audio-utils";
import { Progress } from "@/components/ui/progress";
import AudioFileList from "@/components/AudioFileList";
import AudioAnalysisCard from "@/components/AudioAnalysisCard";
import { useQueryClient } from "@tanstack/react-query"; // Import QueryClient

// Constants for POCH values
const POCH_STANDARD = 500;
const POCH_PREMIUM = 2000; // Updated from 1000 to 2000 for consistency
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

// Utility function to sanitize file names for storage paths
const sanitizeFileName = (name: string) => {
  const safeName = String(name || 'untitled');
  const normalized = safeName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized
    .replace(/[^a-zA-Z0-9.]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};

// Simulation de l'analyse IA (doit être cohérente avec AudioAnalysisCard)
const simulateAnalysis = (totalDuration: number, minDuration: number) => {
  // Score de qualité simulé (basé sur la durée, mais pourrait être plus complexe)
  let qualityScore = Math.min(100, Math.floor((totalDuration / (minDuration * 2)) * 100) + 50);
  
  if (totalDuration < minDuration) {
    qualityScore = Math.min(qualityScore, 40);
  } else if (qualityScore < 70) {
    // Simulate noise detection
  }

  return qualityScore;
};


const CreateModel = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPremium, userId, isLoading: isStatusLoading, is_in_training } = useUserStatus(); // Read is_in_training
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isCalculatingDuration, setIsCalculatingDuration] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isNameChecking, setIsNameChecking] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [cleaningOption, setCleaningOption] = useState<'none' | 'premium'>('none'); // New state for cleaning

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      modelName: "",
      qualityPoch: String(POCH_STANDARD),
    },
  });

  const modelNameWatch = form.watch("modelName");
  const isOverSizeLimit = totalSize > MAX_TOTAL_SIZE_MB * 1024 * 1024;
  const isMinDurationMet = totalDuration >= MIN_DURATION_SECONDS;
  
  // Block submission if user is already training a model
  const isTrainingInProgress = is_in_training; 
  
  const canSubmit = files.length > 0 && !isOverSizeLimit && isMinDurationMet && !isSubmitting && !isCalculatingDuration && !nameError && modelNameWatch.length >= 3 && !isTrainingInProgress;

  // Update total size and duration whenever files change
  useEffect(() => {
    const size = files.reduce((acc, file) => acc + file.size, 0);
    const duration = files.reduce((acc, file) => acc + file.duration, 0);
    setTotalSize(size);
    setTotalDuration(duration);
  }, [files]);

  // Ensure Premium quality is not selected if user is standard
  useEffect(() => {
    if (!isPremium && form.getValues("qualityPoch") === String(POCH_PREMIUM)) {
      form.setValue("qualityPoch", String(POCH_STANDARD));
    }
    // Ensure Premium cleaning is not selected if user is standard
    if (!isPremium && cleaningOption === 'premium') {
        setCleaningOption('none');
    }
  }, [isPremium, form, cleaningOption]);

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
    
    try {
        // Calculate duration for each new file
        const filesWithDurationPromises = audioFiles.map(async (file) => {
            const duration = await getAudioDuration(file);
            return { ...file, duration } as AudioFile;
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

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      validateAndAddFiles(droppedFiles as File[]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index) as AudioFile[]);
  };

  const onSubmit = async (values: ModelFormValues) => {
    if (!userId) {
      toast({ variant: "destructive", title: "Erreur", description: "Vous devez être connecté." });
      return;
    }

    if (!canSubmit) {
        toast({ variant: "destructive", title: "Validation manquante", description: "Veuillez vérifier le nom du modèle et les exigences audio." });
        return;
    }
    
    const pochValue = Number(values.qualityPoch);
    const isPremiumModel = pochValue === POCH_PREMIUM;
    const qualityScore = simulateAnalysis(totalDuration, MIN_DURATION_SECONDS); // Get simulated score

    setIsSubmitting(true);
    setUploadProgress(0);

    let modelId: string | undefined;

    try {
      // 1. Set user status to 'is_in_training'
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ is_in_training: true })
        .eq('id', userId);

      if (profileUpdateError) throw new Error("Erreur lors de la mise à jour du statut d'entraînement.");
      
      // Invalidate profile query to update UI immediately
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });


      // 2. Name check is already done in useEffect, but we re-check quickly
      if (nameError) throw new Error(nameError);

      // Sanitize model name for folder path
      const sanitizedModelName = sanitizeFileName(values.modelName);
      const storagePathPrefix = `${userId}/${sanitizedModelName}`;

      // 3. Upload files to Supabase Storage
      const totalFiles = files.length;
      let uploadedCount = 0;

      const uploadPromises = files.map(file => {
        const sanitizedFileName = sanitizeFileName(file.name);
        const filePath = `${storagePathPrefix}/${sanitizedFileName}`;
        
        return supabase.storage
          .from('audio-files')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          })
          .then(res => {
            if (res.error) {
                // Log the specific storage error
                console.error(`Supabase Storage Upload Error for ${file.name}:`, res.error);
                throw new Error(`Échec de l'upload du fichier ${file.name}: ${res.error.message}`);
            }
            uploadedCount++;
            setUploadProgress(Math.floor((uploadedCount / totalFiles) * 100));
            return res;
          });
      });

      // Use Promise.allSettled to ensure all uploads are attempted, but we rely on the .then() above to throw on error
      // We use Promise.all here to fail fast if any upload fails.
      await Promise.all(uploadPromises);
      
      setUploadProgress(100); // Upload complete

      // 4. Create the voice model entry (Only after successful upload)
      const { data: modelData, error: modelError } = await supabase
        .from("voice_models")
        .insert({
          user_id: userId,
          name: values.modelName,
          quality: isPremiumModel ? "premium" : "standard",
          poch_value: pochValue,
          status: "preprocessing", // Set status to preprocessing initially
          file_count: files.length,
          is_premium_model: isPremiumModel,
          audio_duration_seconds: Math.round(totalDuration),
          // New fields based on analysis and cleaning choice
          score_qualite_source: qualityScore,
          cleaning_applied: cleaningOption === 'premium', // Track if cleaning was requested
        })
        .select('id')
        .single();

      if (modelError || !modelData) throw modelError || new Error("Erreur lors de la création du modèle en base de données.");
      modelId = modelData.id; // Store ID for potential cleanup

      // 5. Trigger External AI API (Crucial Step)
      const { data: apiResponse, error: apiError } = await supabase.functions.invoke('trigger-ai-training', {
        body: {
          model_id: modelId,
          user_id: userId,
          storage_path: `${storagePathPrefix}/`, 
          epochs: pochValue,
          // Pass cleaning option to the backend AI service
          cleaning_option: cleaningOption, 
        },
      });

      // Check for application-level errors returned by the Edge Function
      if (apiError || (apiResponse && apiResponse.error)) {
        const errorMessage = apiError?.message || apiResponse.error || "Erreur inconnue lors du lancement de l'IA.";
        
        // If AI trigger fails, update DB status to failed and record error message
        await supabase
            .from("voice_models")
            .update({ status: "failed", error_message: errorMessage })
            .eq("id", modelId);

        throw new Error(`Erreur de lancement IA: ${errorMessage}`);
      }

      toast({
        title: "Modèle créé !",
        description: `Vos fichiers sont uploadés. Le modèle (${pochValue} POCH) est en cours de traitement.`,
      });

      navigate("/dashboard");
    } catch (error: any) {
      console.error("Creation error:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la création du modèle.",
      });
      
      // IMPORTANT: If any step fails, reset is_in_training flag
      if (userId) {
        await supabase
          .from('profiles')
          .update({ is_in_training: false })
          .eq('id', userId);
        queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      }

    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
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

  if (isTrainingInProgress) {
    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold text-foreground">Créer un modèle</h1>
            <Card className="bg-card border-border border-primary/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Entraînement en cours
                    </CardTitle>
                    <CardDescription>
                        Vous avez déjà un modèle en cours de création.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="mb-4 text-muted-foreground">
                        Pour éviter de saturer les ressources GPU, vous ne pouvez entraîner qu'un seul modèle à la fois.
                        Veuillez attendre que votre modèle actuel soit terminé.
                    </p>
                    <Button onClick={() => navigate("/dashboard")}>
                        Retour au Studio
                    </Button>
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
                onDrop={handleDrop}
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
                          if (Number(value) === POCH_PREMIUM && !isPremium) {
                            toast({ 
                                variant: "destructive", 
                                title: "Accès refusé", 
                                description: `La qualité Premium (${POCH_PREMIUM} POCH) est réservée aux membres Premium.` 
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
                          <FormLabel className="font-normal flex-1 cursor-pointer">
                            Standard ({POCH_STANDARD} POCH)
                            <p className="text-xs text-muted-foreground">Qualité équilibrée, entraînement rapide.</p>
                          </FormLabel>
                        </FormItem>

                        {/* Premium Option (Conditional) */}
                        <Tooltip delayDuration={100}>
                          <TooltipTrigger asChild>
                            <div className={cn(
                              "p-3 border rounded-lg transition-colors",
                              !isPremium && "opacity-50 cursor-not-allowed bg-muted/50"
                            )}>
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <RadioGroupItem 
                                    value={String(POCH_PREMIUM)} 
                                    disabled={!isPremium}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal flex-1 flex items-center justify-between cursor-pointer">
                                  Pro ({POCH_PREMIUM} POCH)
                                  <Crown className="w-4 h-4 text-yellow-500 fill-yellow-500/20 ml-2" />
                                </FormLabel>
                              </FormItem>
                            </div>
                          </TooltipTrigger>
                          {!isPremium && (
                            <TooltipContent className="bg-yellow-600 text-white border-yellow-700">
                              <p>Réservé aux membres Premium pour un rendu Haute Fidélité.</p>
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
                `Lancer l'entraînement (${Number(form.watch('qualityPoch'))} POCH)`
              )}
            </Button>
          </div>
          
          {/* Upload Progress Indicator (Moved outside the form buttons for clarity) */}
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