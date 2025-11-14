/**
 * Calculates the duration of a File object (audio/mp3, audio/wav) using the Web Audio API.
 * @param file The audio File object.
 * @returns A promise that resolves with the duration in seconds.
 */

// Extend Window interface for webkitAudioContext compatibility
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

export const getAudioDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!window.AudioContext && !window.webkitAudioContext) {
      // Fallback or error if AudioContext is not supported
      console.warn("AudioContext not supported. Cannot calculate duration.");
      return resolve(0); 
    }

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) {
        audioContext.close();
        return reject(new Error("Failed to read file buffer."));
      }

      audioContext.decodeAudioData(
        arrayBuffer,
        (audioBuffer) => {
          const duration = audioBuffer.duration;
          audioContext.close();
          resolve(duration);
        },
        (error) => {
          console.error("Error decoding audio data:", error);
          audioContext.close();
          reject(new Error("Invalid audio file format or decoding error."));
        }
      );
    };

    fileReader.onerror = (error) => {
      audioContext.close();
      reject(error);
    };

    fileReader.readAsArrayBuffer(file);
  });
};

/**
 * Formats duration in seconds to a human-readable string (e.g., 1h 30m 15s).
 * @param totalSeconds The total duration in seconds.
 * @returns Formatted string.
 */
export const formatDurationString = (totalSeconds: number): string => {
  if (totalSeconds === 0 || isNaN(totalSeconds)) return "0s";
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  let parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
};

/**
 * Formats bytes to a human-readable string (e.g., 1.2 MB).
 * @param bytes The number of bytes.
 * @param decimals The number of decimal places.
 * @returns Formatted string.
 */
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0 || isNaN(bytes) || bytes === null) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // Safety check for i
  if (i < 0 || i >= sizes.length) return '0 Bytes';

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};