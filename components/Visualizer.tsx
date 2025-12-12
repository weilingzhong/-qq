import React, { useEffect, useRef } from 'react';
import { Particle } from '../types';
import { analyzeAudio } from '../utils/audioUtils';
import {
  COLOR_BASE,
  COLOR_MID_FREQ,
  COLOR_HIGH_FREQ,
  GRAVITY,
  FRICTION,
  BASE_PARTICLE_SIZE,
  SIZE_VARIATION,
  BEAT_THRESHOLD_INIT,
  BEAT_DECAY_RATE,
  MAX_PARTICLES_PER_FIREWORK,
  MIN_PARTICLES_PER_FIREWORK,
  ENERGY_MULTIPLIER,
  FADE_SPEED_BASE,
  FADE_SPEED_VAR
} from '../constants';

interface VisualizerProps {
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  // UI Refs for real-time updates (High performance, no re-renders)
  bassBarRef?: React.RefObject<HTMLDivElement | null>;
  midBarRef?: React.RefObject<HTMLDivElement | null>;
  trebleBarRef?: React.RefObject<HTMLDivElement | null>;
  bassTextRef?: React.RefObject<HTMLSpanElement | null>;
  midTextRef?: React.RefObject<HTMLSpanElement | null>;
  trebleTextRef?: React.RefObject<HTMLSpanElement | null>;
}

type FrequencyBand = 'bass' | 'mid' | 'treble';

// Helper to rotate a point in 3D
const rotate3D = (x: number, y: number, z: number, angleX: number, angleY: number) => {
  const cosY = Math.cos(angleY);
  const sinY = Math.sin(angleY);
  const x1 = x * cosY - z * sinY;
  const z1 = z * cosY + x * sinY;

  const cosX = Math.cos(angleX);
  const sinX = Math.sin(angleX);
  const y2 = y * cosX - z1 * sinX;
  const z2 = z1 * cosX + y * sinX;

  return { x: x1, y: y2, z: z2 };
};

// --- SNOWFLAKE GEOMETRY TYPES ---
interface Rib {
  pos: number;    // Position along the main arm (0 to 1)
  length: number; // Length of the rib
  angle: number;  // Angle relative to main arm (usually 60 deg)
  subRibs?: number; // Number of tiny spikes on this rib
}

interface SnowflakeBlueprint {
  armLength: number;
  centerPlateSize: number; // 0 if no plate
  ribs: Rib[];
  tipShape: 'point' | 'fork' | 'star';
}

const Visualizer: React.FC<VisualizerProps> = ({ 
  audioContext, 
  analyser, 
  isPlaying,
  bassBarRef,
  midBarRef,
  trebleBarRef,
  bassTextRef,
  midTextRef,
  trebleTextRef
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationIdRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  
  const avgBassRef = useRef<number>(0);
  const avgMidRef = useRef<number>(0);
  const avgTrebleRef = useRef<number>(0);
  const bassThresholdRef = useRef<number>(BEAT_THRESHOLD_INIT);
  const midThresholdRef = useRef<number>(BEAT_THRESHOLD_INIT);
  const trebleThresholdRef = useRef<number>(BEAT_THRESHOLD_INIT);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const lastSpawnTimeRef = useRef<number>(0); 

  const rotationRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

  const analyserRef = useRef(analyser);
  const isPlayingRef = useRef(isPlaying);
  const audioContextRef = useRef(audioContext);
  
  useEffect(() => { analyserRef.current = analyser; }, [analyser]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { audioContextRef.current = audioContext; }, [audioContext]);

  // --- Data Array Setup ---
  useEffect(() => {
    if (analyser) {
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, [analyser]);

  // --- Animation Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const addParticle = (x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string, lifeMult = 1.0, sizeMult = 1.0) => {
      if (particlesRef.current.length > 4000) return; 
      
      particlesRef.current.push({
        x, y, z,
        vx, vy, vz,
        alpha: 1,
        // Scale particle size based on the snowflake size so big snowflakes have chunky particles
        size: ((Math.random() * SIZE_VARIATION * 0.6) + BASE_PARTICLE_SIZE) * sizeMult, 
        color,
        life: 1.0 * lifeMult,
        decayRate: FADE_SPEED_BASE + (Math.random() * FADE_SPEED_VAR), 
        shimmerOffset: Math.random() * Math.PI * 2
      });
    };

    const spawnSnowflake = (type: FrequencyBand, intensity: number) => {
      lastSpawnTimeRef.current = Date.now(); 

      let color = COLOR_BASE;
      switch(type) {
        case 'bass': color = COLOR_BASE; break;
        case 'mid': color = COLOR_MID_FREQ; break;
        case 'treble': color = COLOR_HIGH_FREQ; break;
      }

      const spreadX = window.innerWidth * 0.7;
      const spreadY = window.innerHeight * 0.5;
      
      const startX = (Math.random() - 0.5) * spreadX;
      const startY = (Math.random() - 0.5) * spreadY;
      const startZ = (Math.random() - 0.5) * 300; 

      // --- SIZE VARIATION LOGIC ---
      // Randomly scale between 0.3x (tiny) and 2.5x (huge)
      // Intensity also slightly boosts size
      const randomScale = 0.3 + Math.random() * 2.2; 
      const scale = randomScale * (0.8 + intensity * 0.4);

      // Adjust speed: Bigger snowflakes expand slightly slower relative to their size for grandeur
      // but absolute speed is still higher because they cover more distance.
      const speedBase = ENERGY_MULTIPLIER * (0.3 + intensity * 0.5); 
      
      // --- 1. DESIGN THE SNOWFLAKE (BLUEPRINT) ---
      // We keep the blueprint logic normalized (around 1.0 size) and apply scale later
      const blueprint: SnowflakeBlueprint = {
        armLength: 1.0,
        centerPlateSize: Math.random() < 0.3 ? 0.15 + Math.random() * 0.1 : 0, 
        ribs: [],
        tipShape: Math.random() > 0.5 ? 'point' : (Math.random() > 0.5 ? 'fork' : 'star')
      };

      // Generate Ribs (Branches)
      const numRibs = Math.floor(Math.random() * 4) + 2; 
      for (let r = 0; r < numRibs; r++) {
        const pos = 0.2 + (r / numRibs) * 0.6; 
        const maxLen = (1 - pos) * 0.6; 
        const len = maxLen * (0.4 + Math.random() * 0.6);
        
        blueprint.ribs.push({
          pos,
          length: len,
          angle: Math.PI / 3, 
          subRibs: len > 0.3 ? Math.floor(Math.random() * 3) : 0 
        });
      }

      // --- 2. BUILD THE PARTICLES FROM BLUEPRINT ---
      const arms = 6;
      // Calculate particles: Big snowflakes get more particles to look full
      const particleBudgetBase = MIN_PARTICLES_PER_FIREWORK + (MAX_PARTICLES_PER_FIREWORK - MIN_PARTICLES_PER_FIREWORK) * intensity;
      const totalParticles = particleBudgetBase * Math.sqrt(scale); // Scale particle count by size
      
      const points: {x: number, y: number}[] = [];

      // Helper to add a line segment to points
      const addLine = (x1: number, y1: number, x2: number, y2: number, density: number) => {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const count = Math.max(3, Math.floor(dist * 100 * density)); 
        for(let i=0; i<=count; i++) {
          const t = i/count;
          const jitter = 0.015;
          points.push({
            x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter,
            y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter
          });
        }
      };

      // A. Build Center Plate
      if (blueprint.centerPlateSize > 0) {
        const s = blueprint.centerPlateSize;
        const plateAngle = Math.PI / 6; 
        addLine(
          s * Math.cos(plateAngle), s * Math.sin(plateAngle),
          s * Math.cos(-plateAngle), s * Math.sin(-plateAngle),
          2.0
        );
      }

      // B. Build Main Spine
      addLine(0, 0, blueprint.armLength, 0, 1.5);

      // C. Build Ribs
      blueprint.ribs.forEach(rib => {
        const rx = rib.pos + rib.length * Math.cos(rib.angle);
        const ry = rib.length * Math.sin(rib.angle);
        addLine(rib.pos, 0, rx, ry, 1.2);
        
        if (rib.subRibs && rib.subRibs > 0) {
           for(let sr=1; sr<=rib.subRibs; sr++) {
              const t = sr / (rib.subRibs + 1);
              const sx = rib.pos + (rx - rib.pos) * t;
              const sy = 0 + (ry - 0) * t;
              const subLen = rib.length * 0.3;
              addLine(sx, sy, sx + subLen, sy, 1.0);
           }
        }

        const lx = rib.pos + rib.length * Math.cos(-rib.angle);
        const ly = rib.length * Math.sin(-rib.angle);
        addLine(rib.pos, 0, lx, ly, 1.2);

        if (rib.subRibs && rib.subRibs > 0) {
           for(let sr=1; sr<=rib.subRibs; sr++) {
              const t = sr / (rib.subRibs + 1);
              const sx = rib.pos + (lx - rib.pos) * t;
              const sy = 0 + (ly - 0) * t;
              const subLen = rib.length * 0.3;
              addLine(sx, sy, sx + subLen, sy, 1.0);
           }
        }
      });

      // D. Build Tip
      if (blueprint.tipShape === 'fork') {
        const tipLen = 0.15;
        const tipAngle = Math.PI / 4;
        addLine(blueprint.armLength, 0, blueprint.armLength + tipLen * Math.cos(tipAngle), tipLen * Math.sin(tipAngle), 1.5);
        addLine(blueprint.armLength, 0, blueprint.armLength + tipLen * Math.cos(-tipAngle), tipLen * Math.sin(-tipAngle), 1.5);
      }

      // --- 3. INSTANTIATE & ROTATE ---
      const totalPointsNeeded = points.length * arms;
      const skipRatio = totalPointsNeeded > totalParticles ? 1 - (totalParticles / totalPointsNeeded) : 0;

      for (let i = 0; i < arms; i++) {
        const armRotation = (i / arms) * Math.PI * 2;
        const cosA = Math.cos(armRotation);
        const sinA = Math.sin(armRotation);

        for (const pt of points) {
          if (skipRatio > 0 && Math.random() < skipRatio) continue;

          // Apply Rotation AND Scale here
          // This ensures the shape geometry is scaled up/down
          const fx = (pt.x * cosA - pt.y * sinA) * scale;
          const fy = (pt.x * sinA + pt.y * cosA) * scale;
          const fz = 0; 

          const vx = fx * speedBase;
          const vy = fy * speedBase;
          const vz = fz * speedBase; 

          // Pass scale to addParticle to adjust particle size as well
          addParticle(startX, startY, startZ, vx, vy, vz, color, 1.0, scale);
        }
      }
    };

    const render = () => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#020617'; 
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      
      let globalEnergy = 0;

      const currentAnalyser = analyserRef.current;
      const currentIsPlaying = isPlayingRef.current;
      const currentCtx = audioContextRef.current;

      if (currentAnalyser && dataArrayRef.current && currentIsPlaying && currentCtx?.state === 'running') {
        const analysis = analyzeAudio(currentAnalyser, dataArrayRef.current);
        globalEnergy = analysis.energy;
        
        if (bassBarRef?.current) bassBarRef.current.style.width = `${Math.min(100, (analysis.bassEnergy / 255) * 100)}%`;
        if (midBarRef?.current) midBarRef.current.style.width = `${Math.min(100, (analysis.midEnergy / 255) * 100)}%`;
        if (trebleBarRef?.current) trebleBarRef.current.style.width = `${Math.min(100, (analysis.trebleEnergy / 255) * 100)}%`;
        
        if (bassTextRef?.current) bassTextRef.current.innerText = Math.floor(analysis.bassEnergy).toString();
        if (midTextRef?.current) midTextRef.current.innerText = Math.floor(analysis.midEnergy).toString();
        if (trebleTextRef?.current) trebleTextRef.current.innerText = Math.floor(analysis.trebleEnergy).toString();
        
        const now = Date.now();
        const timeSinceLast = now - lastSpawnTimeRef.current;
        let spawned = false;

        if (analysis.bassEnergy > avgBassRef.current * bassThresholdRef.current && analysis.bassEnergy > 25) {
          spawnSnowflake('bass', Math.min(analysis.bassEnergy / 255, 1));
          bassThresholdRef.current = BEAT_THRESHOLD_INIT * 1.5;
          spawned = true;
        } else {
          bassThresholdRef.current = Math.max(BEAT_THRESHOLD_INIT, bassThresholdRef.current * BEAT_DECAY_RATE);
        }

        if (!spawned && analysis.midEnergy > avgMidRef.current * midThresholdRef.current && analysis.midEnergy > 20) {
          spawnSnowflake('mid', Math.min(analysis.midEnergy / 255, 1));
          midThresholdRef.current = BEAT_THRESHOLD_INIT * 1.5;
          spawned = true;
        } else {
          midThresholdRef.current = Math.max(BEAT_THRESHOLD_INIT, midThresholdRef.current * BEAT_DECAY_RATE);
        }

        if (!spawned && analysis.trebleEnergy > avgTrebleRef.current * trebleThresholdRef.current && analysis.trebleEnergy > 15) {
          spawnSnowflake('treble', Math.min(analysis.trebleEnergy / 255, 1));
          trebleThresholdRef.current = BEAT_THRESHOLD_INIT * 1.4;
          spawned = true;
        } else {
          trebleThresholdRef.current = Math.max(BEAT_THRESHOLD_INIT, trebleThresholdRef.current * BEAT_DECAY_RATE);
        }

        if (!spawned && timeSinceLast > 600 && globalEnergy > 10) {
           if (analysis.bassEnergy > analysis.midEnergy && analysis.bassEnergy > analysis.trebleEnergy) {
               spawnSnowflake('bass', 0.4); 
           } else if (analysis.midEnergy > analysis.trebleEnergy) {
               spawnSnowflake('mid', 0.4);
           } else {
               spawnSnowflake('treble', 0.4);
           }
        }

        avgBassRef.current = avgBassRef.current * 0.92 + analysis.bassEnergy * 0.08;
        avgMidRef.current = avgMidRef.current * 0.92 + analysis.midEnergy * 0.08;
        avgTrebleRef.current = avgTrebleRef.current * 0.92 + analysis.trebleEnergy * 0.08;
      } else {
         if (bassBarRef?.current) bassBarRef.current.style.width = '0%';
         if (midBarRef?.current) midBarRef.current.style.width = '0%';
         if (trebleBarRef?.current) trebleBarRef.current.style.width = '0%';
         if (bassTextRef?.current) bassTextRef.current.innerText = '0';
         if (midTextRef?.current) midTextRef.current.innerText = '0';
         if (trebleTextRef?.current) trebleTextRef.current.innerText = '0';
      }

      ctx.globalCompositeOperation = 'lighter';
      
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const fov = 800; 

      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.vy += GRAVITY; 
        p.vx *= FRICTION;
        p.vy *= FRICTION;
        p.vz *= FRICTION;

        const dynamicDecay = globalEnergy > 0 
            ? p.decayRate + (globalEnergy / 255) * FADE_SPEED_VAR 
            : p.decayRate;
        p.life -= dynamicDecay;
        p.alpha = p.life;

        if (p.life > 0) {
          const rotated = rotate3D(p.x, p.y, p.z, rotationRef.current.x, rotationRef.current.y);
          const depth = rotated.z + fov; 
          
          if (depth > 0) {
            const scale = fov / depth;
            const x2d = rotated.x * scale + centerX;
            const y2d = rotated.y * scale + centerY;
            
            const size2d = Math.max(0.1, p.size * scale);
            const opacity = p.alpha * Math.min(1, scale); 

            const shimmer = Math.cos(Date.now() * 0.02 + p.shimmerOffset * 10); 
            const finalOpacity = opacity * (0.6 + shimmer * 0.4);

            ctx.fillStyle = `rgba(${p.color}, ${finalOpacity})`;
            ctx.beginPath();
            ctx.arc(x2d, y2d, size2d, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          particlesRef.current.splice(i, 1);
        }
      }

      animationIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
    />
  );
};

export default Visualizer;