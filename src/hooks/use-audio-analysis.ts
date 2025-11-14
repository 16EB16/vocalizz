import { useMemo } from "react";

const MIN_DURATION_SECONDS = 10 * 60; // 10 minutes

interface AnalysisResult {
  qualityScore: number;
  feedback: string;
  isMinDurationMet: boolean;
  isLowQuality: boolean;
}

/**
 * Simulates AI analysis of source audio material based on total duration.
 * In a real application, this would be replaced by a backend API call.
 * @param totalDuration The total duration of uploaded audio files in seconds.
 * @returns AnalysisResult object.
 */
export const useAudioAnalysis = (totalDuration: number): AnalysisResult => {
  const analysis = useMemo(() => {
    const isMinDurationMet = totalDuration >= MIN_DURATION_SECONDS;
    
    // Score de qualité simulé (basé sur la durée)
    // Max score is 100. We give a base score of 50 and add points based on duration up to 2x min duration.
    let qualityScore = Math.min(100, Math.floor((totalDuration / (MIN_DURATION_SECONDS * 2)) * 50) + 50);
    
    let feedback = "Analyse IA terminée. Qualité du matériel source excellente.";
    let issues = [];

    if (totalDuration < MIN_DURATION_SECONDS) {
      qualityScore = Math.min(qualityScore, 40);
      issues.push("Durée insuffisante. L'entraînement pourrait être de faible qualité.");
    } else if (qualityScore < 70) {
      issues.push("Bruit de fond et silences détectés (estimation: 15%).");
    }

    if (issues.length > 0) {
      feedback = issues.join(' ');
    }
    
    const isLowQuality = qualityScore < 70;

    return { qualityScore, feedback, isMinDurationMet, isLowQuality };
  }, [totalDuration]);

  return analysis;
};