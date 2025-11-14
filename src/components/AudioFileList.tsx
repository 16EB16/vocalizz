import React from 'react';
import { X, HardDrive, Clock, FileText } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes, formatDurationString } from "@/lib/audio-utils";

// Extended File type to store duration
interface AudioFile extends File {
  duration: number; // Duration in seconds
}

interface AudioFileListProps {
  files: AudioFile[];
  totalSize: number;
  totalDuration: number;
  removeFile: (index: number) => void;
  maxTotalSizeMB: number;
}

const AudioFileList = ({ files, totalSize, totalDuration, removeFile, maxTotalSizeMB }: AudioFileListProps) => {
  const maxTotalSizeBytes = maxTotalSizeMB * 1024 * 1024;
  const isOverSizeLimit = totalSize > maxTotalSizeBytes;

  return (
    <div className="space-y-4">
      <div className={cn(
        "flex items-center justify-between p-3 rounded-lg border",
        isOverSizeLimit ? "bg-destructive/10 border-destructive" : "bg-muted/50 border-border"
      )}>
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Total: {files.length} fichier(s)</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className={cn("text-sm font-medium", isOverSizeLimit ? "text-destructive" : "text-foreground")}>
            {formatBytes(totalSize)} / {maxTotalSizeMB} MB
          </div>
          <div className="flex items-center text-sm font-medium text-foreground">
            <Clock className="w-4 h-4 mr-1 text-primary" />
            {formatDurationString(totalDuration)}
          </div>
        </div>
      </div>
      
      {files.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 truncate flex items-center gap-3">
                <FileText className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)} | {formatDurationString(file.duration)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(index)}
                className="shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AudioFileList;