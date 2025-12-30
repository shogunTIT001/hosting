import React, { useState, useRef, useEffect } from 'react';
import { Monitor, Users, Copy, Check, Wifi, WifiOff } from 'lucide-react';

export default function ScreenShareApp() {
  const [mode, setMode] = useState(''); // 'host' or 'viewer'
  const [roomId, setRoomId] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  
  const videoRef = useRef(null);
  const peerConnection = useRef(null);
  const dataChannel = useRef(null);
  const streamRef = useRef(null);

  // Generate random room ID
  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Start screen sharing (Host mode)
  const startSharing = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' },
        audio: false
      });
      
      streamRef.current = stream;
      const newRoomId = generateRoomId();
      setRoomId(newRoomId);
      setIsSharing(true);
      setMode('host');
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Store offer in memory for this room
      setupHostConnection(newRoomId, stream);
      
      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };
    } catch (err) {
      setError('ไม่สามารถเริ่มแชร์หน้าจอได้: ' + err.message);
    }
  };

  const setupHostConnection = async (rid, stream) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnection.current = pc;

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    dataChannel.current = pc.createDataChannel('screenShare');
    
    pc.onicecandidate = (event) => {
      if (event.candidate === null) {
        const offer = pc.localDescription;
        // Store in memory
        if (!window.screenShareRooms) window.screenShareRooms = {};
        window.screenShareRooms[rid] = { offer, type: 'offer' };
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  };

  // Join room (Viewer mode)
  const joinRoom = async () => {
    try {
      setError('');
      if (!roomId) {
        setError('กรุณาใส่ Room ID');
        return;
      }

      setMode('viewer');
      
      // Check if room exists in memory
      if (!window.screenShareRooms || !window.screenShareRooms[roomId]) {
        setError('ไม่พบ Room ID นี้ กรุณาตรวจสอบอีกครั้ง');
        return;
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnection.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
          setIsConnected(true);
        }
      };

      pc.ondatachannel = (event) => {
        dataChannel.current = event.channel;
      };

      const roomData = window.screenShareRooms[roomId];
      await pc.setRemoteDescription(new RTCSessionDescription(roomData.offer));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      pc.onicecandidate = (event) => {
        if (event.candidate === null) {
          window.screenShareRooms[roomId].answer = pc.localDescription;
          
          // Send answer back to host
          if (window.screenShareRooms[roomId].hostPc) {
            window.screenShareRooms[roomId].hostPc.setRemoteDescription(
              new RTCSessionDescription(pc.localDescription)
            );
          }
        }
      };

    } catch (err) {
      setError('ไม่สามารถเชื่อมต่อได้: ' + err.message);
    }
  };

  const stopSharing = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }
    if (window.screenShareRooms && roomId) {
      delete window.screenShareRooms[roomId];
    }
    setIsSharing(false);
    setIsConnected(false);
    setMode('');
    setRoomId('');
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-3">
            <Monitor className="w-10 h-10 text-indigo-600" />
            แอปแชร์หน้าจอ
          </h1>
          <p className="text-gray-600">แชร์หน้าจอของคุณไปยังเครื่องอื่นได้ทันที</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {!mode && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow">
              <div className="text-center">
                <Monitor className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-3">แชร์หน้าจอ</h2>
                <p className="text-gray-600 mb-6">เริ่มแชร์หน้าจอของคุณและรับ Room ID</p>
                <button
                  onClick={startSharing}
                  className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
                >
                  เริ่มแชร์หน้าจอ
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow">
              <div className="text-center">
                <Users className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-3">เข้าร่วมดูหน้าจอ</h2>
                <p className="text-gray-600 mb-6">ใส่ Room ID เพื่อดูหน้าจอที่ถูกแชร์</p>
                <input
                  type="text"
                  placeholder="ใส่ Room ID"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="w-full mb-4 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={joinRoom}
                  className="w-full bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                >
                  เข้าร่วม
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'host' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="mb-6 p-4 bg-indigo-50 rounded-lg border-2 border-indigo-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Room ID ของคุณ:</p>
                  <p className="text-2xl font-bold text-indigo-600 font-mono">{roomId}</p>
                  <p className="text-xs text-gray-500 mt-1">แชร์รหัสนี้เพื่อให้ผู้อื่นเข้าดูหน้าจอ</p>
                </div>
                <button
                  onClick={copyRoomId}
                  className="flex items-center gap-2 bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  {copied ? 'คัดลอกแล้ว!' : 'คัดลอก'}
                </button>
              </div>
            </div>

            <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                กำลังแชร์
              </div>
            </div>

            <button
              onClick={stopSharing}
              className="w-full mt-6 bg-red-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              หยุดแชร์หน้าจอ
            </button>
          </div>
        )}

        {mode === 'viewer' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                <span className="text-lg font-semibold text-gray-700">
                  {isConnected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ...'}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                Room: <span className="font-mono font-bold text-indigo-600">{roomId}</span>
              </div>
            </div>

            <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
              {!isConnected && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white">
                    <Wifi className="w-16 h-16 mx-auto mb-4 animate-pulse" />
                    <p className="text-lg">กำลังรอการเชื่อมต่อ...</p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                if (peerConnection.current) {
                  peerConnection.current.close();
                }
                setMode('');
                setRoomId('');
                setIsConnected(false);
              }}
              className="w-full mt-6 bg-gray-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
            >
              ออกจากห้อง
            </button>
          </div>
        )}

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>💡 เคล็ดลับ: ทำงานได้ดีที่สุดในเบราว์เซอร์ Chrome, Edge, หรือ Safari</p>
        </div>
      </div>
    </div>
  );
}