import React, { useEffect, useRef } from 'react';
import { Particle } from '../types';
import { analyzeAudio } from '../utils/audioUtils';
import { getGestureRecognizer } from '../utils/gestureService';
import { GestureRecognizer } from '@mediapipe/tasks-vision';
import {
  MAX_PARTICLES_PER_FIREWORK,
  MIN_PARTICLES_PER_FIREWORK,
  ENERGY_MULTIPLIER,
  BEAT_THRESHOLD_INIT,
  BEAT_DECAY_RATE,
  GRAVITY,
  FRICTION,
  FADE_SPEED_BASE,
  FADE_SPEED_VAR
} from '../constants';

interface VisualizerProps {
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  onGestureChange?: (gesture: string) => void;
  onCameraStatusChange?: (ready: boolean, status: string) => void;
}

type FrequencyBand = 'bass' | 'mid' | 'treble';

interface NeonParticle extends Particle {
  hue: number;
  vertices: { x: number; y: number }[];
  spinSpeed: number;
  angle: number;
}

interface Rib {
  pos: number;
  length: number;
  angle: number;
  subRibs?: number;
}

interface SnowflakeBlueprint {
  armLength: number;
  centerPlateSize: number;
  ribs: Rib[];
  tipShape: 'point' | 'fork' | 'star';
}

const PsychedelicVisualizer: React.FC<VisualizerProps> = ({ 
  audioContext, 
  analyser, 
  isPlaying,
  onGestureChange,
  onCameraStatusChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationIdRef = useRef<number>(0);
  const particlesRef = useRef<NeonParticle[]>([]);
  
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const isCameraReadyRef = useRef<boolean>(false);
  const lastDetectedGestureRef = useRef<string>('None');

  const avgBassRef = useRef<number>(0);
  const avgMidRef = useRef<number>(0);
  const avgTrebleRef = useRef<number>(0);
  const bassThresholdRef = useRef<number>(BEAT_THRESHOLD_INIT);
  const midThresholdRef = useRef<number>(BEAT_THRESHOLD_INIT);
  const trebleThresholdRef = useRef<number>(BEAT_THRESHOLD_INIT);
  const lastSpawnTimeRef = useRef<number>(0);

  const isFrozenRef = useRef<boolean>(false);
  const cameraOffsetRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const targetOffsetRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

  const analyserRef = useRef(analyser);
  const isPlayingRef = useRef(isPlaying);
  const audioContextRef = useRef(audioContext);
  
  useEffect(() => { analyserRef.current = analyser; }, [analyser]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { audioContextRef.current = audioContext; }, [audioContext]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;

    const startWebcam = async () => {
      try {
        if (onCameraStatusChange) onCameraStatusChange(false, 'Loading Neon AI...');

        const recognizer = await getGestureRecognizer();
        
        if (!isMounted) return;

        gestureRecognizerRef.current = recognizer;
        if (onCameraStatusChange) onCameraStatusChange(false, 'Starting Camera...');

        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        if (!isMounted) { stream.getTracks().forEach(t => t.stop()); return; }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
             if (isMounted) {
                 isCameraReadyRef.current = true;
                 if (onCameraStatusChange) onCameraStatusChange(true, 'Ready');
             }
          };
        }
      } catch (error) {
        if (isMounted && onCameraStatusChange) onCameraStatusChange(false, 'Camera Error');
      }
    };

    startWebcam();

    return () => {
      isMounted = false;
      if (stream) stream.getTracks().forEach(track => track.stop());
      gestureRecognizerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (analyser) {
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, [analyser]);

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

    const createShard = (size: number) => {
        const points = [];
        const sides = Math.floor(Math.random() * 3) + 3;
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            const r = size * (0.5 + Math.random() * 0.5);
            points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }
        return points;
    };

    const spawnNeonSnowflake = (type: FrequencyBand, intensity: number) => {
        if (particlesRef.current.length > 2000) return;
        lastSpawnTimeRef.current = Date.now();

        const spreadX = window.innerWidth * 0.7;
        const spreadY = window.innerHeight * 0.5;
        
        const startX = (Math.random() - 0.5) * spreadX;
        const startY = (Math.random() - 0.5) * spreadY;
        const startZ = (Math.random() - 0.5) * 400; 

        let baseHue = 0;
        switch(type) {
            case 'bass': baseHue = 280; break;
            case 'mid': baseHue = 180; break;
            case 'treble': baseHue = 320; break;
        }
        baseHue = (baseHue + Date.now() * 0.05) % 360;

        // --- SIZE VARIATION LOGIC ---
        // Range 0.3x to 2.5x
        const randomScale = 0.3 + Math.random() * 2.2; 
        const scale = randomScale * (0.8 + intensity * 0.4);

        const speedBase = ENERGY_MULTIPLIER * (0.5 + intensity * 0.5);
        
        // --- BLUEPRINT ---
        const blueprint: SnowflakeBlueprint = {
            armLength: 1.0,
            centerPlateSize: Math.random() < 0.3 ? 0.15 + Math.random() * 0.1 : 0,
            ribs: [],
            tipShape: Math.random() > 0.5 ? 'point' : 'fork'
        };

        const numRibs = Math.floor(Math.random() * 4) + 2;
        for (let r = 0; r < numRibs; r++) {
            const pos = 0.2 + (r / numRibs) * 0.6; 
            const maxLen = (1 - pos) * 0.6; 
            const len = maxLen * (0.4 + Math.random() * 0.6);
            blueprint.ribs.push({
                pos, length: len, angle: Math.PI / 3, subRibs: len > 0.3 ? Math.floor(Math.random() * 3) : 0
            });
        }

        const arms = 6;
        const particleBudgetBase = MIN_PARTICLES_PER_FIREWORK + (MAX_PARTICLES_PER_FIREWORK - MIN_PARTICLES_PER_FIREWORK) * intensity;
        const totalParticles = particleBudgetBase * Math.sqrt(scale);
        
        const points: {x: number, y: number}[] = [];

        const addLine = (x1: number, y1: number, x2: number, y2: number) => {
            const dist = Math.hypot(x2 - x1, y2 - y1);
            const count = Math.max(2, Math.floor(dist * 60)); 
            for(let i=0; i<=count; i++) {
                const t = i/count;
                points.push({
                    x: x1 + (x2 - x1) * t,
                    y: y1 + (y2 - y1) * t
                });
            }
        };

        if (blueprint.centerPlateSize > 0) {
             const s = blueprint.centerPlateSize;
             const plateAngle = Math.PI / 6;
             addLine(s * Math.cos(plateAngle), s * Math.sin(plateAngle), s * Math.cos(-plateAngle), s * Math.sin(-plateAngle));
        }

        addLine(0, 0, blueprint.armLength, 0);

        blueprint.ribs.forEach(rib => {
            const rx = rib.pos + rib.length * Math.cos(rib.angle);
            const ry = rib.length * Math.sin(rib.angle);
            addLine(rib.pos, 0, rx, ry);
            
            if (rib.subRibs) {
                for(let sr=1; sr<=rib.subRibs; sr++) {
                    const t = sr / (rib.subRibs + 1);
                    const sx = rib.pos + (rx - rib.pos) * t;
                    const sy = 0 + (ry - 0) * t;
                    addLine(sx, sy, sx + rib.length*0.3, sy);
                }
            }

            const lx = rib.pos + rib.length * Math.cos(-rib.angle);
            const ly = rib.length * Math.sin(-rib.angle);
            addLine(rib.pos, 0, lx, ly);

             if (rib.subRibs) {
                for(let sr=1; sr<=rib.subRibs; sr++) {
                    const t = sr / (rib.subRibs + 1);
                    const sx = rib.pos + (lx - rib.pos) * t;
                    const sy = 0 + (ly - 0) * t;
                    addLine(sx, sy, sx + rib.length*0.3, sy);
                }
            }
        });

        const totalPointsNeeded = points.length * arms;
        const skipRatio = totalPointsNeeded > totalParticles ? 1 - (totalParticles / totalPointsNeeded) : 0;

        for (let i = 0; i < arms; i++) {
            const armRotation = (i / arms) * Math.PI * 2;
            const cosA = Math.cos(armRotation);
            const sinA = Math.sin(armRotation);

            for (const pt of points) {
                if (skipRatio > 0 && Math.random() < skipRatio) continue;

                // Apply Scale here
                const fx = (pt.x * cosA - pt.y * sinA) * scale;
                const fy = (pt.x * sinA + pt.y * cosA) * scale;
                const fz = 0;

                const vx = fx * speedBase;
                const vy = fy * speedBase;
                const vz = fz * speedBase;
                
                const size = (Math.random() * 4 + 1) * scale; // Scale shard size

                particlesRef.current.push({
                    x: startX, y: startY, z: startZ,
                    vx, vy, vz,
                    alpha: 1,
                    size: size,
                    color: '', 
                    hue: (baseHue + Math.random() * 40 - 20) % 360,
                    life: 1.0,
                    decayRate: FADE_SPEED_BASE + (Math.random() * FADE_SPEED_VAR),
                    shimmerOffset: Math.random() * Math.PI * 2,
                    vertices: createShard(size),
                    spinSpeed: (Math.random() - 0.5) * 0.2,
                    angle: Math.random() * Math.PI * 2
                });
            }
        }
    };

    const detectGestures = () => {
        if (!gestureRecognizerRef.current || !videoRef.current || !isCameraReadyRef.current) return;
        const video = videoRef.current;
        if (video.currentTime === lastVideoTimeRef.current) return;
        
        lastVideoTimeRef.current = video.currentTime;
        try {
            const result = gestureRecognizerRef.current.recognizeForVideo(video, Date.now());

            let gesture = "None";
            if (result.gestures.length > 0) {
                gesture = result.gestures[0][0].categoryName;
                
                if (gesture === "Open_Palm") {
                    isFrozenRef.current = true;
                    const landmarks = result.landmarks[0];
                    if (landmarks && landmarks.length > 0) {
                        const hx = landmarks[9].x;
                        const hy = landmarks[9].y;
                        const maxOffset = 300;
                        targetOffsetRef.current = {
                            x: (0.5 - hx) * maxOffset * 2,
                            y: (0.5 - hy) * maxOffset * 2
                        };
                    }
                } else {
                    isFrozenRef.current = false;
                    targetOffsetRef.current = { x: 0, y: 0 };
                }
            } else {
                isFrozenRef.current = false;
                targetOffsetRef.current = { x: 0, y: 0 };
            }

            if (gesture !== lastDetectedGestureRef.current) {
                lastDetectedGestureRef.current = gesture;
                if (onGestureChange) onGestureChange(gesture);
            }
        } catch (e) {
            // ignore
        }
    };

    const render = () => {
        detectGestures();

        cameraOffsetRef.current.x += (targetOffsetRef.current.x - cameraOffsetRef.current.x) * 0.1;
        cameraOffsetRef.current.y += (targetOffsetRef.current.y - cameraOffsetRef.current.y) * 0.1;

        ctx.fillStyle = 'rgba(10, 5, 20, 0.2)'; 
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        let energy = 0;
        if (analyserRef.current && dataArrayRef.current && isPlayingRef.current && audioContextRef.current?.state === 'running') {
            const analysis = analyzeAudio(analyserRef.current, dataArrayRef.current);
            energy = analysis.energy;
            
            if (!isFrozenRef.current) {
                const now = Date.now();
                const timeSinceLast = now - lastSpawnTimeRef.current;
                let spawned = false;

                if (analysis.bassEnergy > avgBassRef.current * bassThresholdRef.current && analysis.bassEnergy > 25) {
                    spawnNeonSnowflake('bass', Math.min(analysis.bassEnergy / 255, 1));
                    bassThresholdRef.current = BEAT_THRESHOLD_INIT * 1.5;
                    spawned = true;
                } else {
                    bassThresholdRef.current = Math.max(BEAT_THRESHOLD_INIT, bassThresholdRef.current * BEAT_DECAY_RATE);
                }

                if (!spawned && analysis.midEnergy > avgMidRef.current * midThresholdRef.current && analysis.midEnergy > 20) {
                    spawnNeonSnowflake('mid', Math.min(analysis.midEnergy / 255, 1));
                    midThresholdRef.current = BEAT_THRESHOLD_INIT * 1.5;
                    spawned = true;
                } else {
                    midThresholdRef.current = Math.max(BEAT_THRESHOLD_INIT, midThresholdRef.current * BEAT_DECAY_RATE);
                }

                if (!spawned && analysis.trebleEnergy > avgTrebleRef.current * trebleThresholdRef.current && analysis.trebleEnergy > 15) {
                    spawnNeonSnowflake('treble', Math.min(analysis.trebleEnergy / 255, 1));
                    trebleThresholdRef.current = BEAT_THRESHOLD_INIT * 1.4;
                    spawned = true;
                } else {
                    trebleThresholdRef.current = Math.max(BEAT_THRESHOLD_INIT, trebleThresholdRef.current * BEAT_DECAY_RATE);
                }

                if (!spawned && timeSinceLast > 600 && energy > 10) {
                     if (analysis.bassEnergy > analysis.midEnergy && analysis.bassEnergy > analysis.trebleEnergy) {
                        spawnNeonSnowflake('bass', 0.4); 
                     } else if (analysis.midEnergy > analysis.trebleEnergy) {
                        spawnNeonSnowflake('mid', 0.4);
                     } else {
                        spawnNeonSnowflake('treble', 0.4);
                     }
                }

                avgBassRef.current = avgBassRef.current * 0.92 + analysis.bassEnergy * 0.08;
                avgMidRef.current = avgMidRef.current * 0.92 + analysis.midEnergy * 0.08;
                avgTrebleRef.current = avgTrebleRef.current * 0.92 + analysis.trebleEnergy * 0.08;
            }
        }

        ctx.save();
        ctx.translate(window.innerWidth / 2 + cameraOffsetRef.current.x, window.innerHeight / 2 + cameraOffsetRef.current.y);
        
        ctx.globalCompositeOperation = 'screen';

        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
            const p = particlesRef.current[i];

            if (!isFrozenRef.current) {
                p.x += p.vx;
                p.y += p.vy;
                p.z += p.vz;
                p.vy += GRAVITY; 
                p.vx *= FRICTION;
                p.vy *= FRICTION;
                p.vz *= FRICTION;
                p.angle += p.spinSpeed;
                
                const dynamicDecay = energy > 0 
                    ? p.decayRate + (energy / 255) * FADE_SPEED_VAR 
                    : p.decayRate;
                p.life -= dynamicDecay;
            }

            if (p.life > 0) {
                const scale = 800 / (800 + p.z); 
                const alpha = p.life * scale;
                
                if (scale > 0) {
                    ctx.save();
                    ctx.translate(p.x * scale, p.y * scale);
                    ctx.scale(scale, scale);
                    ctx.rotate(p.angle);
                    
                    const flicker = Math.random() > 0.9 ? 1.5 : 1;
                    ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${alpha})`;
                    ctx.shadowBlur = 10 * scale * flicker;
                    ctx.shadowColor = `hsla(${p.hue}, 100%, 50%, 1)`;

                    ctx.beginPath();
                    if (p.vertices.length > 0) {
                        ctx.moveTo(p.vertices[0].x, p.vertices[0].y);
                        for (let j = 1; j < p.vertices.length; j++) {
                            ctx.lineTo(p.vertices[j].x, p.vertices[j].y);
                        }
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
            } else {
                particlesRef.current.splice(i, 1);
            }
        }
        
        ctx.restore();
        animationIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
        window.removeEventListener('resize', resizeCanvas);
        cancelAnimationFrame(animationIdRef.current);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
      <video ref={videoRef} className="hidden" autoPlay playsInline muted />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950 via-[#1a0b2e] to-[#0f0518]" />
    </>
  );
};

export default PsychedelicVisualizer;