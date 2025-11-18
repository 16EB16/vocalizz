import { useState, useCallback } from 'react';

interface DragAndDropHandlers {
  isDragging: boolean;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>, onDrop: (files: File[]) => void) => void;
}

/**
 * Hook to manage the state and handlers for a drag and drop zone.
 * @returns DragAndDropHandlers
 */
export const useDragAndDrop = (): DragAndDropHandlers => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, onDrop: (files: File[]) => void) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      onDrop(droppedFiles);
    }
  }, []);

  return {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
};