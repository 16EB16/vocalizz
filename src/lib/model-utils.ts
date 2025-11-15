/**
 * Estimates the total training duration based on the POCH value (in minutes).
 * @param poch The POCH value (e.g., 500 for Standard, 2000 for Premium).
 * @returns Estimated duration in minutes.
 */
export const estimateTrainingDurationMinutes = (poch: number): number => {
    // Standard (500 POCH): ~15 minutes
    // Premium (2000 POCH): ~60 minutes
    if (poch === 2000) return 60;
    if (poch === 500) return 15;
    return 30; // Default fallback
};