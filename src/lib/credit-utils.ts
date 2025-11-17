// Constants for POCH values (already defined in CreateModel, but centralized here for cost logic)
export const POCH_STANDARD = 500;
export const POCH_PREMIUM = 2000;

// Credit costs
export const COST_STANDARD_TRAINING = 1;
export const COST_PREMIUM_TRAINING = 5;
export const COST_CLEANING_OPTION = 2;

/**
 * Calculates the total credit cost for a training job based on selected options.
 * @param pochValue The selected POCH value (500 or 2000).
 * @param cleaningOption 'none' or 'premium'.
 * @returns The total credit cost.
 */
export const calculateCreditCost = (pochValue: number, cleaningOption: 'none' | 'premium'): number => {
  let baseCost = 0;

  if (pochValue === POCH_PREMIUM) {
    baseCost = COST_PREMIUM_TRAINING;
  } else {
    baseCost = COST_STANDARD_TRAINING;
  }

  if (cleaningOption === 'premium') {
    baseCost += COST_CLEANING_OPTION;
  }

  return baseCost;
};