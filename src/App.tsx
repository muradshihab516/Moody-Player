/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  RefreshCcw, 
  Lock, 
  Unlock, 
  Settings, 
  X, 
  RefreshCw,
  Trophy,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { clearAllVideos, getAllVideos, saveVideo, VideoItem } from './lib/db';

// --- Constants & Mock Data ---

const MAX_TOTAL_DURATION = 3 * 60 * 60; // 3 hours in seconds
const LONG_PRESS_DURATION = 3000; // 3 seconds for unlock

const SAMPLE_VIDEOS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4"
];

// --- Helper Functions ---

const parseUsernameFromUrl = (url: string): string => {
  try {
    const trimmed = url.trim();
    if (!trimmed.includes('http')) return trimmed;

    // TikTok: tiktok.com/@username
    const tiktokMatch = trimmed.match(/tiktok\.com\/@([a-zA-Z0-9._-]+)/);
    if (tiktokMatch) return tiktokMatch[1];

    // Instagram: instagram.com/username/
    const instaMatch = trimmed.match(/instagram\.com\/([a-zA-Z0-9._-]+)/);
    if (instaMatch) return instaMatch[1];

    // Simple fallback: last part of URL path
    const urlObj = new URL(trimmed);
    const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
    if (pathParts.length > 0) {
      const last = pathParts[pathParts.length - 1];
      return last.startsWith('@') ? last.slice(1) : last;
    }

    return trimmed;
  } catch {
    return url.trim();
  }
};

// --- Components ---

export default function App() {
  const [view, setView] = useState<'player' | 'setup'>('player');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, msg: '' });
  const [usernames, setUsernames] = useState<string>(''); // This now stores URLs
  const [unlockProgress, setUnlockProgress] = useState(0);
  const unlockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Load videos from DB on mount
  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      const stored = await getAllVideos();
      setVideos(stored);
    } catch (error) {
      console.error("Failed to load videos from IndexedDB:", error);
    }
  };

  // --- Sync Logic ---

  const handleSync = async () => {
    const lines = usernames.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      alert("Please enter at least one profile link.");
      return;
    }

    setIsSyncing(true);
    setSyncProgress({ current: 0, total: lines.length, msg: 'Initializing sync engine...' });
    
    try {
      await clearAllVideos();
      let totalSecondsStored = 0;
      
      for (let i = 0; i < lines.length; i++) {
        if (totalSecondsStored >= MAX_TOTAL_DURATION) {
          setSyncProgress(prev => ({ ...prev, msg: 'Library capacity reached (3 hours). Stopping.' }));
          break;
        }

        const rawInput = lines[i];
        const username = parseUsernameFromUrl(rawInput);
        
        setSyncProgress(prev => ({ ...prev, current: i + 1, msg: `Syncing @${username}...` }));

        const randomVideoUrl = SAMPLE_VIDEOS[Math.floor(Math.random() * SAMPLE_VIDEOS.length)];
        
        try {
          const response = await fetch(randomVideoUrl);
          if (!response.ok) throw new Error('Network error');
          const blob = await response.blob();
          
          const simulatedDuration = 15 + Math.floor(Math.random() * 45); 
          
          const videoItem: VideoItem = {
            id: `${username}-${Date.now()}-${i}`,
            username,
            blob,
            duration: simulatedDuration,
            timestamp: Date.now()
          };

          await saveVideo(videoItem);
          totalSecondsStored += simulatedDuration;
        } catch (err) {
          console.error(`Failed to download video for ${username}`, err);
        }
      }

      await loadVideos();
      setTimeout(() => setView('player'), 500);
      setCurrentIndex(0);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Player Logic ---

  const handleVideoEnded = () => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCurrentIndex(0); 
    }
  };

  const handleNext = () => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  // --- Lock Logic ---

  const startUnlock = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setUnlockProgress(0);
    const start = Date.now();
    unlockTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / LONG_PRESS_DURATION);
      setUnlockProgress(progress * 100);
      if (progress >= 1) {
        setIsLocked(false);
        setUnlockProgress(0);
        if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
      }
    }, 50);
  };

  const cancelUnlock = () => {
    if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
    setUnlockProgress(0);
  };

  // Build video blobs into URLs
  const [videoBlobUrls, setVideoBlobUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const newMap = new Map();
    videos.forEach(v => {
      const url = URL.createObjectURL(v.blob);
      newMap.set(v.id, url);
    });
    setVideoBlobUrls(newMap);
    
    return () => {
      newMap.forEach(url => URL.revokeObjectURL(url));
    };
  }, [videos]);

  if (view === 'setup') {
    return (
      <div className="min-h-screen bg-[#0a0502] text-stone-200 p-6 font-sans relative overflow-hidden">
        {/* Background Atmosphere for Setup */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-900/20 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full" />
        </div>

        <div className="max-w-md mx-auto space-y-8 relative z-10">
          <header className="flex justify-between items-center bg-white/5 border border-white/10 backdrop-blur-xl p-6 rounded-3xl">
            <h1 className="text-2xl font-light tracking-tighter text-white">
              MOODY<span className="font-bold text-orange-500">PLAYER</span>
            </h1>
            <button 
              onClick={() => setView('player')}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-stone-400 hover:text-white"
            >
              <X size={24} />
            </button>
          </header>

          <section className="space-y-6">
            <div className="bg-white/5 border border-white/10 backdrop-blur-xl p-6 rounded-3xl space-y-4">
              <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">
                Targeted Profile Links
              </label>
              <textarea 
                value={usernames}
                onChange={(e) => setUsernames(e.target.value)}
                placeholder="https://www.tiktok.com/@user&#10;https://www.instagram.com/user/..."
                className="w-full h-64 bg-black/40 p-4 rounded-2xl border border-white/5 outline-none resize-none font-mono text-sm text-stone-300 focus:border-orange-500/50 transition-all"
              />
            </div>

            <div className="flex items-start gap-4 p-5 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl">
              <AlertCircle size={20} className="text-orange-500 mt-1 shrink-0" />
              <p className="text-xs text-stone-400 leading-relaxed">
                Reset & Sync will purge existing videos and fetch fresh content (Max 3 hours). Content is stored as Blobs in IndexedDB for 100% offline access.
              </p>
            </div>

            <button 
              disabled={isSyncing}
              onClick={handleSync}
              className={`w-full py-5 rounded-2xl flex items-center justify-center gap-3 font-bold transition-all shadow-lg shadow-orange-900/20 ${
                isSyncing 
                  ? 'bg-stone-800 text-stone-500 cursor-not-allowed' 
                  : 'bg-orange-600 hover:bg-orange-500 text-white active:scale-95'
              }`}
            >
              {isSyncing ? (
                <>
                  <RefreshCw size={22} className="animate-spin" />
                  <span>SYNCING ASSETS...</span>
                </>
              ) : (
                <>
                  <RefreshCcw size={22} />
                  <span>RESET & SYNC NOW</span>
                </>
              )}
            </button>

            {isSyncing && (
              <div className="space-y-4 p-5 bg-black/40 rounded-3xl border border-white/5">
                <div className="flex justify-between text-[10px] uppercase tracking-widest text-stone-400 font-bold">
                  <span>STORAGE (OFFLINE)</span>
                  <span>{Math.round((syncProgress.current / syncProgress.total) * 100 || 0)}%</span>
                </div>
                <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                    className="h-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"
                  />
                </div>
                <p className="text-[11px] text-center text-stone-500 font-mono italic">{syncProgress.msg}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0a0502] overflow-hidden select-none touch-none font-sans flex flex-col items-center justify-center">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full" />
      </div>

      {videos.length === 0 ? (
        <div className="h-full w-full flex flex-col items-center justify-center p-10 text-center space-y-10 z-10 relative">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border border-orange-500/30 flex items-center justify-center bg-white/5 backdrop-blur-xl shadow-2xl">
              <Play className="text-orange-500 ml-1" size={40} fill="currentColor" />
            </div>
            <motion.div 
              animate={{ opacity: [0.2, 0.4, 0.2], scale: [1, 1.1, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute -inset-6 border border-orange-500/10 rounded-full" 
            />
          </div>
          <div className="space-y-3">
            <h2 className="text-3xl font-light text-white tracking-tighter">MOODY<span className="font-bold text-orange-500">PLAYER</span></h2>
            <p className="text-stone-400 text-sm max-w-[280px] leading-relaxed mx-auto italic">
              Offline content library is empty. Initialize the sync engine to begin automated playback.
            </p>
          </div>
          <button 
            onClick={() => setView('setup')}
            className="px-10 py-4 bg-orange-600 text-white rounded-2xl font-bold shadow-lg shadow-orange-900/20 active:scale-95 transition-all text-sm uppercase tracking-widest"
          >
            INITIALIZE ENGINE
          </button>
        </div>
      ) : (
        <div className="relative h-full w-full max-w-[500px] bg-black shadow-[0_0_100px_rgba(0,0,0,1)]">
          {/* Vertical Video Stack */}
          <div className="h-full w-full overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={videos[currentIndex].id}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="absolute inset-0 z-0 h-full w-full"
              >
                <video
                  ref={el => videoRefs.current[currentIndex] = el}
                  src={videoBlobUrls.get(videos[currentIndex].id)}
                  autoPlay
                  playsInline
                  className="h-full w-full object-cover"
                  onEnded={handleVideoEnded}
                  onError={(e) => console.error("Video Error:", e)}
                />
                
                {/* Visual Vignette */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80 pointer-events-none" />
                
                {/* Video Info Overlay */}
                <div className="absolute bottom-28 left-8 right-8 z-10 pointer-events-none text-white drop-shadow-lg">
                  <div className="space-y-1">
                    <motion.p 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-2xl font-bold tracking-tight text-white mb-2"
                    >
                      @{videos[currentIndex].username}
                    </motion.p>
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                       <span className="text-[10px] text-white tracking-[0.2em] font-black uppercase">PLAYING OFFLINE</span>
                    </div>
                  </div>
                </div>

                {/* Vertical Progress Bar */}
                <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10 z-30">
                  <div className="h-full bg-orange-500" style={{ width: '60%' }} /> 
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Simple Navigation Zones */}
          {!isLocked && (
            <>
              {/* Invisible touch zones for tap navigation */}
              <div 
                className="absolute top-0 inset-x-0 h-1/3 z-20 active:bg-white/5 transition-colors cursor-pointer" 
                onClick={handlePrev} 
              />
              <div 
                className="absolute bottom-0 inset-x-0 h-1/3 z-20 active:bg-white/5 transition-colors cursor-pointer" 
                onClick={handleNext} 
              />
              
              {/* Controls UI */}
              <div className="absolute top-8 left-8 right-8 flex justify-between items-center z-30 pointer-events-none">
                <button 
                  className="p-4 bg-white/5 backdrop-blur-xl rounded-2xl text-white pointer-events-auto border border-white/10 hover:bg-orange-500 transition-all active:scale-95 shadow-2xl"
                  onClick={() => setView('setup')}
                >
                  <Settings size={22} />
                </button>
                <div className="bg-white/5 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10 text-[10px] font-bold tracking-[0.2em] text-orange-500 uppercase">
                  Track {currentIndex + 1}
                </div>
                <button 
                  className="p-4 bg-white/5 backdrop-blur-xl rounded-2xl text-white pointer-events-auto border border-white/10 hover:bg-orange-500 transition-all active:scale-95 shadow-2xl"
                  onClick={() => setIsLocked(true)}
                >
                  <Lock size={22} />
                </button>
              </div>
            </>
          )}

          {/* Screen Lock Overlay */}
          <AnimatePresence shadow-none>
            {isLocked && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[9999] bg-black/5 backdrop-blur-[2px] touch-none flex flex-col items-center justify-center cursor-none"
                onMouseDown={startUnlock}
                onMouseUp={cancelUnlock}
                onMouseLeave={cancelUnlock}
                onTouchStart={startUnlock}
                onTouchEnd={cancelUnlock}
              >
                {/* Visual Lock Indicator */}
                <div className="relative flex flex-col items-center space-y-10 pointer-events-none">
                  <div className="w-32 h-32 rounded-full border-2 border-orange-500/50 flex items-center justify-center bg-orange-500/10 backdrop-blur-3xl relative">
                    {/* Ring Progress SVG */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="60"
                        fill="none"
                        stroke="rgba(249, 115, 22, 0.1)"
                        strokeWidth="4"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="60"
                        fill="none"
                        stroke="#f97316"
                        strokeWidth="4"
                        strokeDasharray="377"
                        strokeDashoffset={377 - (377 * unlockProgress) / 100}
                        strokeLinecap="round"
                        className="transition-all duration-100 ease-linear shadow-[0_0_20px_rgba(249,115,22,0.8)]"
                      />
                    </svg>
                    <motion.div
                      animate={{ y: [0, -5, 0], scale: [1, 1.1, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Lock className="text-orange-500 drop-shadow-[0_0_12px_rgba(249,115,22,0.8)]" size={40} />
                    </motion.div>
                  </div>
                  <div className="text-center space-y-4">
                    <p className="text-[14px] uppercase tracking-[0.5em] font-black text-orange-500 px-8 py-3 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md">
                      SYSTEM LOCKED
                    </p>
                    <p className="text-[10px] tracking-[0.3em] text-stone-500 font-bold uppercase">
                      Long Press Center to Release
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
