'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Cast, Monitor, Radio, Copy, Power, ShieldCheck, Wifi, Tv } from 'lucide-react';

export default function ScreenCastApp() {
  // --- State สำหรับระบบ ---
  const [role, setRole] = useState(null); // 'host' | 'viewer' | null
  const [roomId, setRoomId] = useState('');
  const [status, setStatus] = useState('idle'); // idle, connecting, connected, failed
  const [firebaseUrl, setFirebaseUrl] = useState('https://mirror-b0519-default-rtdb.asia-southeast1.firebasedatabase.app/'); // ใส่ URL Firebase ของคุณที่นี่เป็น Default ได้เลย
  const [showSettings, setShowSettings] = useState(false);
  
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const pollerRef = useRef(null);

  // --- Cleanup ---
  useEffect(() => {
    return () => stopCast();
  }, []);

  // --- 🔥 เพิ่มส่วนนี้: เมื่อเข้าโหมด Host ให้เอาภาพใส่จอทันที ---
  useEffect(() => {
    // ถ้าเป็น Host และมี Stream เตรียมไว้แล้ว
    if (role === 'host' && streamRef.current && videoRef.current) {
      console.log("Setting host video preview...");
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.muted = true; // ปิดเสียงตัวเองกันสะท้อน
      videoRef.current.play().catch(e => console.error("Host preview play error:", e));
    }
  }, [role]); // ทำงานทุกครั้งที่ role เปลี่ยนเป็น host

  // --- Helper Functions ---
  const sendToDb = async (path, data) => {
    if (!firebaseUrl) return;
    try {
      await fetch(`${firebaseUrl}/${path}.json`, { //${firebaseUrl}
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch (e) { console.error(e); }
  };

  const getFromDb = async (path) => {
    if (!firebaseUrl) return null;
    try {
      const res = await fetch(`${firebaseUrl}/${path}.json`);
      return await res.json();
    } catch (e) { return null; }
  };

  // --- WebRTC Logic ---
  const createPeer = (id) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
         // ถ้ามี TURN Server ส่วนตัว ให้ใส่เพิ่มตรงนี้
      ]
    });

    pc.onconnectionstatechange = () => {
      console.log('Connection State:', pc.connectionState);
      if (pc.connectionState === 'connected') setStatus('connected');
      if (pc.connectionState === 'failed') setStatus('failed');
    };

    return pc;
  };

  // --- Host Logic (คนส่งภาพ) ---
  const startCast = async () => {
    if (!firebaseUrl) return setShowSettings(true);
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;
      
      const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
      setRoomId(newRoomId);
      setRole('host');
      setStatus('connecting');

      // Setup Video Preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
      }

      const pc = createPeer(newRoomId);
      peerRef.current = pc;

      // Add Tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // ICE Candidates
      pc.onicecandidate = (e) => {
        if (e.candidate) sendToDb(`rooms/${newRoomId}/host_ice/${Date.now()}`, e.candidate);
      };

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendToDb(`rooms/${newRoomId}/offer`, offer);

      // Poll for Answer
      pollerRef.current = setInterval(async () => {
        const answer = await getFromDb(`rooms/${newRoomId}/answer`);
        if (answer && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
        
        // Poll Viewer Candidates
        if (pc.remoteDescription) {
          const viewerIce = await getFromDb(`rooms/${newRoomId}/viewer_ice`);
          if (viewerIce) {
            Object.values(viewerIce).forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{}));
          }
        }
      }, 2000);

      // Stop handling
      stream.getVideoTracks()[0].onended = stopCast;

    } catch (e) {
      alert("Error starting cast: " + e.message);
      stopCast();
    }
  };

  // --- Viewer Logic (คนรับภาพ) ---
  const joinCast = async () => {
    if (!firebaseUrl) return setShowSettings(true);
    if (!roomId) return alert("Please enter a Cast Code");

    try {
      setRole('viewer');
      setStatus('connecting');

      const offer = await getFromDb(`rooms/${roomId}/offer`);
      if (!offer) throw new Error("Room not found");

      const pc = createPeer(roomId);
      peerRef.current = pc;

      // Handle Incoming Stream
      pc.ontrack = (e) => {
        if (e.streams && e.streams[0] && videoRef.current) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.play().catch(e => console.log("Autoplay blocked, user interaction needed"));
          setStatus('connected');
        }
      };

      // ICE Candidates
      pc.onicecandidate = (e) => {
        if (e.candidate) sendToDb(`rooms/${roomId}/viewer_ice/${Date.now()}`, e.candidate);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendToDb(`rooms/${roomId}/answer`, answer);

      // Poll Host Candidates
      pollerRef.current = setInterval(async () => {
        const hostIce = await getFromDb(`rooms/${roomId}/host_ice`);
        if (hostIce) {
          Object.values(hostIce).forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{}));
        }
      }, 2000);

    } catch (e) {
      alert("Join Error: " + e.message);
      stopCast();
    }
  };

  const stopCast = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (peerRef.current) peerRef.current.close();
    if (pollerRef.current) clearInterval(pollerRef.current);
    setRole(null);
    setRoomId('');
    setStatus('idle');
  };

  // --- UI Components ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-400">
            <Cast className="w-6 h-6" />
            <span className="font-bold text-xl tracking-tight text-white">ScreenCast<span className="text-indigo-500">Pro</span></span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="text-sm text-slate-400 hover:text-white transition">
            {firebaseUrl ? 'Configured' : '⚙️ Settings'}
          </button>
        </div>
      </nav>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4 text-white">⚙️ System Configuration</h3>
            <label className="block text-xs text-slate-400 mb-2 uppercase font-semibold">Firebase Database URL</label>
            <input 
              type="text" 
              value={firebaseUrl}
              onChange={(e) => setFirebaseUrl(e.target.value)}
              placeholder="https://your-project.firebaseio.com"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition mb-4"
            />
            <button onClick={() => setShowSettings(false)} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition">Save Configuration</button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        
        {/* Landing State */}
        {!role && (
          <div className="flex flex-col md:flex-row gap-8 items-stretch justify-center h-[60vh]">
            
            {/* Host Card */}
            <div onClick={startCast} className="flex-1 bg-gradient-to-br from-indigo-900/20 to-slate-900 border border-indigo-500/30 hover:border-indigo-500 rounded-3xl p-8 cursor-pointer group transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-900/20 flex flex-col items-center justify-center text-center">
              <div className="bg-indigo-500/10 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                <Monitor className="w-16 h-16 text-indigo-400" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Start Casting</h2>
              <p className="text-slate-400">Share your screen to another device.</p>
            </div>

            {/* Viewer Card */}
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center text-center">
              <div className="bg-slate-800 p-6 rounded-full mb-6">
                <Tv className="w-16 h-16 text-emerald-400" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-6">Receive Cast</h2>
              
              <div className="w-full max-w-xs space-y-4">
                <input 
                  type="text" 
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="Enter Code (e.g. A1B2C)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-4 text-center text-2xl tracking-widest font-mono text-white focus:outline-none focus:border-emerald-500 transition uppercase"
                />
                <button onClick={joinCast} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition shadow-lg shadow-emerald-900/20">
                  Join Stream
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Active Session State */}
        {role && (
          <div className="animate-in fade-in zoom-in duration-300">
            {/* Status Bar */}
            <div className="flex items-center justify-between mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-amber-500 animate-pulse'}`}></div>
                <span className="font-mono text-sm text-slate-300 uppercase tracking-wider">{status}</span>
              </div>

              <div className="flex items-center gap-4">
                {role === 'host' && (
                  <div className="flex items-center gap-2 bg-indigo-500/10 px-4 py-2 rounded-lg border border-indigo-500/30">
                    <span className="text-xs text-indigo-300 uppercase font-bold">Cast Code</span>
                    <span className="text-xl font-mono font-bold text-white tracking-widest">{roomId}</span>
                    <button onClick={() => navigator.clipboard.writeText(roomId)} className="hover:text-white text-indigo-400"><Copy size={16}/></button>
                  </div>
                )}
                <button onClick={stopCast} className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-lg transition flex items-center gap-2 font-bold">
                  <Power size={18} /> Stop
                </button>
              </div>
            </div>

            {/* Video Player */}
            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 ring-4 ring-slate-900/50">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                controls={role === 'viewer'} // Viewer gets controls
                className="w-full h-full object-contain"
              />
              
              {/* Overlay for Waiting State */}
              {status !== 'connected' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse"></div>
                    <Wifi className="w-16 h-16 text-white relative z-10 animate-pulse" />
                  </div>
                  <p className="mt-4 text-slate-300 font-medium">Establishing secure connection...</p>
                </div>
              )}
            </div>

            {role === 'host' && (
              <div className="mt-6 flex items-center justify-center gap-2 text-slate-500 text-sm">
                <ShieldCheck size={16} />
                <span>End-to-end encrypted stream via WebRTC</span>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}