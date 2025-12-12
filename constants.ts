/**
 * VISUALIZATION CONFIGURATION
 * Tweak these values to customize the look and feel.
 */

// --- Colors ---
export const COLOR_BASE = '255, 255, 255'; // Pure White (RGB) - Bass
export const COLOR_MID_FREQ = '215, 245, 255'; // Very light cool white - Mids
export const COLOR_HIGH_FREQ = '165, 243, 252'; // Tailwind Cyan-200 - Treble

// --- Particle Physics ---
export const GRAVITY = 0.03; // Standard gravity for fireworks
export const FRICTION = 0.95; // Air resistance
export const BASE_PARTICLE_SIZE = 0.4; 
export const SIZE_VARIATION = 2.4; 

// --- Snowflake Shape Logic ---
export const SYMMETRY_ARMS = 6; 
export const BRANCH_ANGLE = Math.PI / 3; 

// --- Interaction / Audio Sensitivity ---
export const BEAT_THRESHOLD_INIT = 1.35; 
export const BEAT_DECAY_RATE = 0.98;

// Particle Counts
export const MAX_PARTICLES_PER_FIREWORK = 1200; 
export const MIN_PARTICLES_PER_FIREWORK = 300; 

export const ENERGY_MULTIPLIER = 4.5; 

// Fade settings - Faster fade so they disappear in the air
export const FADE_SPEED_BASE = 0.008; 
export const FADE_SPEED_VAR = 0.005;