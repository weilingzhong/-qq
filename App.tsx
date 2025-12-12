import React, { useState, useRef, ChangeEvent } from 'react';
import { Upload, Play, Pause, Music, RotateCcw } from 'lucide-react';
import Visualizer from './components/Visualizer';

const App: React.FC = () => {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [sourceNode, setSourceNode] = useState<AudioBufferSourceNode | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>("");
  
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);

  // --- REFS FOR REAL-TIME UI UPDATES (No Re-renders) ---
  const bassBarRef = useRef<HTMLDivElement>(null);
  const midBarRef = useRef<HTMLDivElement>(null);
  const trebleBarRef = useRef<HTMLDivElement>(null);
  const bassTextRef = useRef<HTMLSpanElement>(null);
  const midTextRef = useRef<HTMLSpanElement>(null);
  const trebleTextRef = useRef<HTMLSpanElement>(null);

  const initAudio = () => {
    if (!audioContext) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const any = ctx.createAnalyser();
      any.fftSize = 2048; 
      setAudioContext(ctx);
      setAnalyser(any);
      return { ctx, any };
    }
    return { ctx: audioContext, any: analyser };
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setIsPlaying(false);
    if (sourceNode) {
        try { sourceNode.stop(); } catch(e) {}
    }

    setFileName(file.name);
    
    try {
      const { ctx } = initAudio();
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);
      startTimeRef.current = 0;
      pauseTimeRef.current = 0;
    } catch (err) {
      console.error(err);
      setError("Failed to process audio file.");
    }
  };

  const playAudio = () => {
    if (!audioContext || !analyser || !audioBuffer) return;
    if (audioContext.state === 'suspended') audioContext.resume();

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const offset = pauseTimeRef.current % audioBuffer.duration;
    source.start(0, offset);
    
    startTimeRef.current = audioContext.currentTime - offset;
    
    setSourceNode(source);
    setIsPlaying(true);

    source.onended = () => {
        if (audioContext.currentTime - startTimeRef.current >= audioBuffer.duration) {
            setIsPlaying(false);
            pauseTimeRef.current = 0;
        }
    };
  };

  const pauseAudio = () => {
    if (sourceNode && audioContext) {
      sourceNode.stop();
      pauseTimeRef.current = audioContext.currentTime - startTimeRef.current;
      setIsPlaying(false);
    }
  };

  const handleReplay = () => {
    if (sourceNode) {
        try { sourceNode.stop(); } catch(e) {}
    }
    pauseTimeRef.current = 0;
    startTimeRef.current = 0;
    setIsPlaying(false);
    setTimeout(() => { playAudio(); }, 50);
  };

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden font-sans selection:bg-cyan-500/30">
      
      {/* Main Visualizer Layer */}
      <Visualizer 
        audioContext={audioContext} 
        analyser={analyser} 
        isPlaying={isPlaying} 
        bassBarRef={bassBarRef}
        midBarRef={midBarRef}
        trebleBarRef={trebleBarRef}
        bassTextRef={bassTextRef}
        midTextRef={midTextRef}
        trebleTextRef={trebleTextRef}
      />

      {/* --- COMPACT MINI INTERFACE: Top Left --- */}
      <div className="absolute top-4 left-4 z-50">
        <div className="flex items-center gap-1.5 bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-full p-1 shadow-xl hover:bg-slate-900/60 transition-all group">
           
           {/* File Input */}
           <div className="relative flex items-center pl-1 pr-1.5 gap-1.5 cursor-pointer group/file">
             <input 
               type="file" 
               accept="audio/*"
               onChange={handleFileUpload}
               className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
             />
             <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${isPlaying ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-slate-400'}`}>
               <Music className="w-2.5 h-2.5" />
             </div>
             <span className="text-[10px] font-medium text-slate-400 max-w-[60px] sm:max-w-[80px] truncate group-hover/file:text-white transition-colors">
               {fileName || "Select Music"}
             </span>
           </div>

           <div className="h-3 w-px bg-white/10 mx-0.5"></div>

           {/* Controls */}
           <div className="flex items-center gap-1 pr-0.5">
              <button 
                  onClick={isPlaying ? pauseAudio : playAudio}
                  disabled={!audioBuffer}
                  className={`w-5 h-5 flex items-center justify-center rounded-full transition-all active:scale-95
                    ${!audioBuffer 
                        ? 'bg-white/5 text-slate-600 cursor-not-allowed' 
                        : isPlaying
                            ? 'bg-cyan-500 text-slate-900 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                            : 'bg-white/10 text-white hover:bg-white/20'
                    }
                  `}
                >
                  {isPlaying ? <Pause className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current ml-0.5" />}
                </button>

                <button 
                  onClick={handleReplay}
                  disabled={!audioBuffer}
                  className="w-5 h-5 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors active:scale-95 disabled:opacity-30"
                  title="Replay"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                </button>
           </div>
        </div>

        {error && (
            <div className="mt-2 text-[9px] text-red-200 bg-red-900/50 border border-red-500/20 px-2 py-1 rounded-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2">
                {error}
            </div>
        )}
      </div>

      {/* --- REAL-TIME DATA DASHBOARD: Top Right --- */}
      <div className="absolute top-4 right-4 z-40 w-24 pointer-events-none select-none">
        <div className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-md p-1.5 shadow-xl flex flex-col gap-1.5">
           
           {/* Treble Row */}
           <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[8px] uppercase tracking-wider text-slate-400 font-medium leading-none">
                  <span className="text-cyan-200">High</span>
                  <span ref={trebleTextRef} className="font-mono text-cyan-200">0</span>
              </div>
              <div className="h-1 w-full bg-slate-800/80 rounded-full overflow-hidden">
                  <div ref={trebleBarRef} className="h-full bg-[rgb(165,243,252)] shadow-[0_0_8px_rgba(165,243,252,0.6)] w-0 transition-none" />
              </div>
           </div>

           {/* Mid Row */}
           <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[8px] uppercase tracking-wider text-slate-400 font-medium leading-none">
                  <span className="text-sky-100">Mid</span>
                  <span ref={midTextRef} className="font-mono text-sky-100">0</span>
              </div>
              <div className="h-1 w-full bg-slate-800/80 rounded-full overflow-hidden">
                  <div ref={midBarRef} className="h-full bg-[rgb(215,245,255)] shadow-[0_0_8px_rgba(215,245,255,0.6)] w-0 transition-none" />
              </div>
           </div>

           {/* Bass Row */}
           <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[8px] uppercase tracking-wider text-slate-400 font-medium leading-none">
                  <span className="text-white">Bass</span>
                  <span ref={bassTextRef} className="font-mono text-white">0</span>
              </div>
              <div className="h-1 w-full bg-slate-800/80 rounded-full overflow-hidden">
                  <div ref={bassBarRef} className="h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] w-0 transition-none" />
              </div>
           </div>

        </div>
      </div>
    </div>
  );
};

export default App;