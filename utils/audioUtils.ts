import { AudioData } from '../types';

export const analyzeAudio = (analyser: AnalyserNode, dataArray: Uint8Array): AudioData => {
  analyser.getByteFrequencyData(dataArray);

  const length = dataArray.length;
  let totalEnergy = 0;
  let bassEnergy = 0;
  let midEnergy = 0;
  let trebleEnergy = 0;

  // Split spectrum into 3 bands
  // Adjusting bins to map better to musical perception (Logarithmic-ish)
  const bassEnd = Math.floor(length * 0.06); // Bottom 6% (Deep Bass)
  const midEnd = Math.floor(length * 0.40);  // 6% to 40% (Mids)
  // Treble is 40% to 100%

  for (let i = 0; i < length; i++) {
    const val = dataArray[i];
    totalEnergy += val;
    
    if (i < bassEnd) {
      bassEnergy += val;
    } else if (i < midEnd) {
      midEnergy += val;
    } else {
      trebleEnergy += val;
    }
  }

  return {
    frequencyData: dataArray,
    timeDomainData: new Uint8Array(analyser.fftSize), 
    energy: totalEnergy / length,
    bassEnergy: bassEnergy / (bassEnd || 1),
    midEnergy: midEnergy / ((midEnd - bassEnd) || 1),
    trebleEnergy: trebleEnergy / ((length - midEnd) || 1),
  };
};

/**
 * Simple beat detection based on energy history.
 * Returns true if current energy > local average * threshold
 */
export const detectBeat = (energy: number, averageEnergy: number, threshold: number) => {
  return energy > averageEnergy * threshold;
};