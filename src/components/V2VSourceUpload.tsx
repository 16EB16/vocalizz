import React, { useState, useCallback } from 'react';
import { Upload, AlertTriangle } from 'lucide-react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDragAndDrop } from "@/hooks/use-drag-and-drop"; // Import the new hook

interface V2VSourceUploadProps {
  sourceFile: File | null;
  setSourceFile: (file: File | null) => void;
  isConverting: boolean;
}

const V2VSourceUpload = ({ sourceFile, setSourceFile, isConverting }: V2VSourceUploadProps) => {
  const { toast } = useToast();
  const { isDragging, handleDragOver, handleDragLeave, handleDrop } = useDragAndDrop();

  const validateAndSetFile = useCallback((file: File) => {
    if (file.type === "audio/mp3" || file.type === "audio/wav" || file.type === "audio/mpeg") {
      setSourceFile(file);
    } else {
      toast({
        variant: "destructive",
        title: "Fichier invalide",
        description: "Seuls les fichiers MP3 et WAV sont acceptés comme source.",
      });
    }
  }, [setSourceFile, toast]);
  
  const handleDropFiles = (droppedFiles: File[]) => {
    if (droppedFiles.length === 1) {
        validateAndSetFile(droppedFiles[0]);
    } else if (droppedFiles.length > 1) {
        toast({
            variant: "destructive",
            title: "Trop de fichiers",
            description: "Veuillez sélectionner un seul fichier audio source.",
        });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
    e.target.value = '';
  };

  return (
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
        {sourceFile ? (
            <span className="flex items-center justify-center gap-1 font-medium text-foreground">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                Fichier sélectionné: {sourceFile.name}
            </span>
        ) : (
            "MP3 ou WAV uniquement. Un seul fichier à la fois."
        )}
      </p>
      {sourceFile && (
        <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setSourceFile(null)} 
            className="mt-2 text-destructive hover:bg-destructive/10"
            disabled={isConverting}
        >
            Retirer le fichier
        </Button>
      )}
    </div>
  );
};

export default V2VSourceUpload;