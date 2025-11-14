import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitizes a string (typically a file or model name) for use in storage paths.
 * Converts to lowercase, removes accents, and replaces non-alphanumeric characters with underscores.
 * @param name The input string.
 * @returns The sanitized string.
 */
export const sanitizeFileName = (name: string | undefined): string => {
  const safeName = String(name || 'untitled_file');
  const normalized = safeName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized
    .replace(/[^a-zA-Z0-9.]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};