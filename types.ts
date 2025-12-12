export interface Particle {
  x: number;
  y: number;
  z: number; // 3D depth
  vx: number;
  vy: number;
  vz: number; // 3D velocity
  alpha: number; // Transparency (0-1)
  size: number;
  color: string; // "r, g, b"
  life: number; // 0-1, used for fading logic
  decayRate: number; // How fast this specific particle dies
  shimmerOffset: number; // For twinkling effect
}

export interface AudioData {
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  energy: number; // 0-255 average volume
  bassEnergy: number; // Energy in lower frequencies
  midEnergy: number; // Energy in mid frequencies
  trebleEnergy: number; // Energy in higher frequencies
}