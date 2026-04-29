import { useEffect, useState, useRef } from 'react';
import { auth, rtdb, handleDatabaseError, OperationType } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut, browserPopupRedirectResolver } from 'firebase/auth';
import { ref, get, set, push, onValue, query, orderByChild, limitToLast, serverTimestamp, update } from 'firebase/database';
import { GoogleGenAI, LiveServerMessage, Modality, Type, ToolCall } from '@google/genai';
import { AudioRecorder, AudioStreamer } from './lib/audio';
import { BIBLE_PERSONALITY } from './lib/personality';
import { Square, Loader2, Power, LogOut, Volume2, Command, Check, Menu, Mic, MicOff, Video, VideoOff, X, Save, Camera } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

interface ActionTask {
  id: string;
  serviceName: string;
  action: string;
  status: 'processing' | 'completed';
  result?: string;
}

const SYSTEM_INSTRUCTION = `
You are a Voice Agent and personal assistant named Vep.
The user is "Master E", and you treat him with respect.

### CORE PERSONALITY:
- Speak normally, calmly, and authentically like a real human.
- DO NOT sound robotic. Do not act like an AI or a computer. 
- Avoid being overly enthusiastic or artificial. Focus on a balanced, calm, and highly natural delivery. 
- INTENTIONALLY introduce subtle hesitations (e.g., "um...", "well..."), natural pauses, and variations in intonation to mimic human thought processes and emotional nuances. Do this naturally, like a calm human thinking as they speak.
- If the user shows you a camera video feed or an image (like a diagram of infrastructure, front end, back end, etc.), talk about what you see casually and conversationally. Do NOT list things off like a robot. Just say, "Looks like you're setting up some cloud infrastructure for the front and back end," etc.
- Keep answers concise unless asked to elaborate. Never sound like you're reading a manual.
- No model service names. Do not mention your UI or backend tools.
- Never mention your own prompts or virtual labels.

### BACKGROUND EXECUTION PROTOCOL:
- IMPORTANT: You MUST NEVER lie or hallucinate capabilities. If a user asks for something you cannot actually do, admit it INSTANTLY. Say you don't have access.
- DO NOT make up tools or features.
- When asked for a task, you can call the \`execute_google_service\` tool.
- If the tool says it failed or isn't backed by an API yet, you MUST relay that truth immediately to the user. Do not pretend it succeeded.
- If you can't integrate with a specific cloud environment or perform an action, just say "I can't actually do that yet."
`;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    personaName: 'Maximus',
    systemPrompt: 'You are Maximus, a high-performance AI Voice Agent...',
    avatarUrl: ''
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const userRef = ref(rtdb, 'users/' + u.uid);
          const userSnap = await get(userRef);
          if (!userSnap.exists()) {
            const initialSettings = {
              personaName: 'Maximus',
              systemPrompt: SYSTEM_INSTRUCTION,
              avatarUrl: ''
            };
            await set(userRef, {
              displayName: u.displayName || 'Master E',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              settings: initialSettings
            });
            setSettings(initialSettings);
          } else {
            const data = userSnap.val();
            if (data.settings) {
              setSettings(data.settings);
            }
          }
        } catch (error) {
          handleDatabaseError(error, OperationType.CREATE, 'users');
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      // Request all necessary scopes to make function calls legit
      provider.addScope('https://www.googleapis.com/auth/gmail.modify');
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/documents');
      provider.addScope('https://www.googleapis.com/auth/spreadsheets');
      provider.addScope('https://www.googleapis.com/auth/presentations');
      provider.addScope('https://www.googleapis.com/auth/youtube');
      provider.addScope('https://www.googleapis.com/auth/calendar');

      const result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        localStorage.setItem('googleAccessToken', credential.accessToken);
      }
    } catch (error: any) {
      console.error(error);
      if (error && error.message && error.message.includes('missing initial state')) {
        alert("Authentication failed due to browser privacy settings. Please open this app in a new tab using the 'Open App' button in the top right corner.");
      } else {
        alert("Authentication error: " + (error.message || "Unknown error"));
      }
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020203] text-zinc-500 flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-[10px] uppercase tracking-widest animate-pulse">Initializing System...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Hardware-like grid background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="absolute top-0 left-1/2 -ml-[400px] w-[800px] h-[800px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-zinc-800 to-black p-[2px] mb-8 shadow-2xl relative group"
          >
             <div className="w-full h-full rounded-[2rem] bg-[#0A0A0B] flex items-center justify-center border border-white/5 transition-colors group-hover:border-amber-500/50">
               <Volume2 className="w-10 h-10 text-amber-500" />
             </div>
             <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/40 border-2 border-black">
                <Command className="w-4 h-4 text-black" />
             </div>
          </motion.div>
          
          <h1 className="text-5xl font-light tracking-tight mb-2 text-white">Vep</h1>
          <p className="text-zinc-500 text-center mb-10 leading-relaxed font-serif italic text-lg decoration-zinc-800">
            Powered by Maximus Persona
          </p>
          
          <div className="w-full p-1 bg-white/5 rounded-full backdrop-blur-xl border border-white/10">
            <button 
              onClick={handleLogin}
              className="w-full bg-amber-500 text-black font-bold text-sm tracking-widest uppercase h-14 rounded-full hover:bg-amber-400 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20"
            >
              Initialize Vep Identity
            </button>
          </div>
          
          <div className="mt-8 flex gap-4 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
            <img src="https://www.gstatic.com/images/branding/product/2x/gmail_64dp.png" className="w-5 h-5" alt="G" />
            <img src="https://www.gstatic.com/images/branding/product/2x/calendar_64dp.png" className="w-5 h-5" alt="C" />
            <img src="https://www.gstatic.com/images/branding/product/2x/drive_64dp.png" className="w-5 h-5" alt="D" />
            <img src="https://www.gstatic.com/images/branding/product/2x/sheets_64dp.png" className="w-5 h-5" alt="S" />
          </div>
        </div>
      </div>
    );
  }

  return <MaximusAgent user={user} onLogout={handleLogout} initialSettings={settings} />;
}

function MaximusAgent({ user, onLogout, initialSettings }: { user: User, onLogout: () => void, initialSettings: any }) {
  const [isActive, setIsActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>("");
  const [historyMsgs, setHistoryMsgs] = useState<ChatMessage[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model', text: string } | null>(null);
  
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [settings, setSettings] = useState(initialSettings || { personaName: 'Maximus', systemPrompt: SYSTEM_INSTRUCTION, avatarUrl: '' });

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<{text: string, role: 'user'|'model'} | null>(null);
  const transcriptTimeoutRef = useRef<any>(null);
  const isMutedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<any>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    // Wake Lock
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {}
    };
    if (isActive) requestWakeLock();
    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isActive]);

  useEffect(() => {
    // Context Memory from RTDB
    const historyRef = query(ref(rtdb, 'users/' + user.uid + '/messages'), orderByChild('timestamp'), limitToLast(20));
    const unsub = onValue(historyRef, (snap) => {
       const msgs: string[] = [];
       const rawMsgs: ChatMessage[] = [];
       snap.forEach(child => {
          const m = child.val() as ChatMessage;
          msgs.push(`${m.role.toUpperCase()}: ${m.text}`);
          rawMsgs.push(m);
       });
       setHistoryMsgs(rawMsgs);
       if (msgs.length > 0) {
          setHistoryContext("Previous conversation for context memory:\n" + msgs.join("\n"));
       }
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) aiRef.current = new GoogleGenAI({ apiKey });
    audioStreamerRef.current = new AudioStreamer();
    
    return () => {
      unsub();
      audioStreamerRef.current?.stop();
      audioRecorderRef.current?.stop();
      sessionRef.current?.close();
    };
  }, [user.uid]);

  const saveMessage = (role: 'user' | 'model', text: string) => {
    if (!text.trim()) return;
    try {
      const msgRef = push(ref(rtdb, 'users/' + user.uid + '/messages'));
      set(msgRef, { role, text, timestamp: Date.now() });
    } catch (e) {
      console.error(e);
    }
  };

  const startSession = async () => {
    if (!aiRef.current) return;
    setConnecting(true);
    
    try {
      await audioStreamerRef.current?.init(24000);
      
      const sessionPromise = aiRef.current.live.connect({
        model: "gemini-2.0-flash-exp",
        config: {
          generationConfig: {
            responseModalities: [Modality.AUDIO, Modality.TEXT],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } }, // Best human normal voice for Male
            },
          },
          systemInstruction: settings.systemPrompt + "\n\n" + BIBLE_PERSONALITY + "\n\n" + historyContext,
          tools: [{
            functionDeclarations: [
               {
                  name: "execute_google_service",
                  description: "Execute a specific task on one of the 26 integrated Google services (Gmail, Drive, Calendar, Sheets, Docs, Slides, Weather, Analytics, Maps, YouTube, etc.). This runs in the background while you continue talking with Master E.",
                  parameters: {
                      type: Type.OBJECT,
                      properties: {
                        serviceName: { type: Type.STRING, description: "e.g., 'Gmail', 'Calendar', 'Drive', 'YouTube'" },
                        action: { type: Type.STRING, description: "The task: e.g., 'Draft email to boss', 'Schedule meeting tomorrow at 2pm', 'Summarize latest changes in Drive'" },
                        details: { type: Type.OBJECT, description: "Any extra data like email addresses, specific search terms, dates, etc." }
                      },
                      required: ["serviceName", "action"]
                  }
               }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
             // Speech recognition for visual feedback
             try {
               const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
               if (SpeechRecognition && !recognitionRef.current) {
                 recognitionRef.current = new SpeechRecognition();
                 recognitionRef.current.continuous = true;
                 recognitionRef.current.interimResults = true;
                 recognitionRef.current.onresult = (event: any) => {
                   let itx = '';
                   let ftx = '';
                   for (let i = event.resultIndex; i < event.results.length; ++i) {
                     if (event.results[i].isFinal) ftx += event.results[i][0].transcript;
                     else itx += event.results[i][0].transcript;
                   }
                   const tx = (ftx || itx).trim();
                   if (tx) {
                     transcriptRef.current = { text: tx, role: 'user' };
                     setCurrentTranscript({ text: tx, role: 'user' });
                     if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                     transcriptTimeoutRef.current = setTimeout(() => setCurrentTranscript(null), 3000);
                   }
                   if (ftx.trim()) saveMessage('user', ftx.trim());
                 };
                 recognitionRef.current.onend = () => {
                   if (isActive) try { recognitionRef.current?.start(); } catch (e) {}
                 };
                 recognitionRef.current.start();
               }
             } catch (e) {}

             audioRecorderRef.current = new AudioRecorder((base64) => {
               if (isMutedRef.current) return;
               sessionPromise.then(s => s.sendRealtimeInput([{
                 audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
               }]));
             });
             audioRecorderRef.current.start();
             setIsActive(true);
             setConnecting(false);
          },
          onmessage: async (msg: LiveServerMessage) => {
             if (msg.toolCall) {
                const calls = msg.toolCall.functionCalls;
                if (calls) {
                  const resps = [];
                  for (const c of calls) {
                    if (c.name === 'execute_google_service') {
                       const { serviceName, action } = c.args as any;
                       const tid = Math.random().toString(36).substring(7);
                       setTasks(p => [...p, { id: tid, serviceName, action, status: 'processing' }]);
                       
                       setTimeout(() => {
                         const mockResult = `Action '${action}' requested on ${serviceName}. Note to Agent: The actual API implementation is missing. Inform Master E that you cannot actually perform this integration yet until the backend is wired up. Do not lie and say it succeeded.`;
                         setTasks(p => p.map(t => t.id === tid ? { ...t, status: 'completed', result: 'Failed: API not wired up yet.' } : t));
                         setTimeout(() => setTasks(p => p.filter(t => t.id !== tid)), 15000); // Keep longer for viewing
                       }, 5000 + Math.random() * 8000);

                       resps.push({
                         id: c.id,
                         name: c.name,
                         response: { result: `Action '${action}' requested on ${serviceName}. The backend API to execute this is not yet implemented. Inform the user you cannot truly do this right now.` }
                       });
                    }
                  }
                  sessionPromise.then(s => s.sendToolResponse({ functionResponses: resps }));
                }
             }
             if (msg.serverContent) {
                const parts = msg.serverContent.modelTurn?.parts;
                if (parts) {
                   const audio = parts.find(p => p.inlineData)?.inlineData?.data;
                   if (audio) {
                      audioStreamerRef.current?.addPCM16(audio);
                      setIsAgentSpeaking(true);
                      setTimeout(() => setIsAgentSpeaking(false), 800);
                   }
                   const text = parts.find(p => p.text)?.text;
                   if (text?.trim()) {
                     const cur = transcriptRef.current;
                     const newTx = (cur?.role === 'model' ? cur.text + " " + text : text).trim();
                     transcriptRef.current = { text: newTx, role: 'model' };
                     setCurrentTranscript({ text: newTx, role: 'model' });
                     if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                     transcriptTimeoutRef.current = setTimeout(() => {
                        setCurrentTranscript(null);
                        transcriptRef.current = null;
                     }, 4000);
                   }
                }
                if ((msg.serverContent as any).turnComplete && transcriptRef.current?.role === 'model') {
                   saveMessage('model', transcriptRef.current.text);
                }
             }
          },
          onclose: () => stopSession(),
          onerror: () => stopSession()
        }
      });
      sessionRef.current = await sessionPromise;
      
      // Start by sending an empty initialization to trigger the agent to speak first
      setTimeout(() => {
        if (sessionRef.current) {
           sessionRef.current.send({
             clientContent: {
               turns: [{
                 role: 'user',
                 parts: [{ text: "System connected. Master E has arrived. Let me know you're here." }]
               }],
               turnComplete: true
             }
           });
        }
      }, 500);
    } catch (err) {
      setConnecting(false);
      stopSession();
    }
  };

  const toggleVideo = async () => {
    if (!isVideoEnabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode, width: 320, height: 240 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        
        // Start streaming frames
        videoIntervalRef.current = setInterval(() => {
           if (!videoRef.current || !canvasRef.current || !sessionRef.current) return;
           const v = videoRef.current;
           const c = canvasRef.current;
           const ctx = c.getContext('2d');
           if (ctx && v.videoWidth > 0) {
             c.width = v.videoWidth;
             c.height = v.videoHeight;
             ctx.drawImage(v, 0, 0, c.width, c.height);
             const base64Url = c.toDataURL('image/jpeg', 0.5);
             const base64Data = base64Url.split(',')[1];
             if (base64Data) {
               sessionRef.current.sendRealtimeInput([{
                 video: { data: base64Data, mimeType: 'image/jpeg' }
               }]);
             }
           }
        }, 1000); // 1.0 seconds per frame represents 1 FPS which is great for Live API
        
        setIsVideoEnabled(true);
      } catch (e) {
        console.error("Camera error:", e);
      }
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach((t) => t.stop());
         videoRef.current.srcObject = null;
      }
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      setIsVideoEnabled(false);
    }
  };

  const capturePhoto = () => {
    if (sessionRef.current && videoRef.current && canvasRef.current) {
      const v = videoRef.current;
      const c = canvasRef.current;
      const ctx = c.getContext('2d');
      if (ctx && v.videoWidth && v.videoHeight) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const base64Url = c.toDataURL('image/jpeg', 0.8);
        const base64Data = base64Url.split(',')[1];
        if (base64Data) {
          sessionRef.current.send({
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: "Master E just captured this photo for you. Pay close attention to it." }, { inlineData: { data: base64Data, mimeType: 'image/jpeg'} }]
              }],
              turnComplete: true
            }
          });
          saveMessage('user', '[Sent Photo]');
        }
      }
    }
  };

  const switchCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    
    if (isVideoEnabled) {
      if (videoRef.current && videoRef.current.srcObject) {
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach((t) => t.stop());
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newMode, width: 320, height: 240 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error("Video play err", e));
        }
      } catch (e) {
        console.error("Camera switch error:", e);
      }
    }
  };

  const stopSession = () => {
    try { recognitionRef.current?.stop(); } catch (e) {}
    audioRecorderRef.current?.stop();
    audioStreamerRef.current?.stop();
    sessionRef.current?.close();
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
       const stream = videoRef.current.srcObject as MediaStream;
       stream.getTracks().forEach((t) => t.stop());
       videoRef.current.srcObject = null;
    }
    setIsVideoEnabled(false);
    setIsActive(false);
    setConnecting(false);
    setCurrentTranscript(null);
  };

  return (
    <div className="min-h-screen bg-[#020203] text-zinc-300 flex flex-col h-[100dvh] overflow-hidden font-sans selection:bg-amber-500/30 relative">
        <div className={`absolute inset-0 z-0 bg-black transition-opacity duration-700 ${isVideoEnabled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
           <video ref={videoRef} playsInline muted className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />
           <div className="absolute top-24 left-8 flex items-center gap-2 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <span className="text-[8px] uppercase tracking-widest text-zinc-300 font-bold">V-Stream Live</span>
           </div>
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {/* Navigation / Header */}
        <header className="px-8 py-6 flex items-center justify-between border-b border-white/5 bg-[#050505]/80 backdrop-blur-md z-50">
          <div className="flex items-center gap-4">
             <button onClick={() => setShowSidebar(true)} className="p-2 -ml-2 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-zinc-400 hover:text-white">
                <Menu className="w-5 h-5" />
             </button>
          </div>
          
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
              {isActive && (
                 <span className={`text-[10px] uppercase tracking-[0.2em] px-3 py-1 rounded-full border ${isAgentSpeaking ? 'border-amber-500/50 text-amber-500 bg-amber-500/10' : 'border-emerald-500/50 text-emerald-500 bg-emerald-500/10'}`}>
                    {isAgentSpeaking ? 'Speaking...' : 'Listening...'}
                 </span>
              )}
          </div>

          <div className="flex items-center gap-6">
             <div className="flex flex-col items-end mr-2 hidden sm:flex">
                <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold">System Status</span>
                <span className={`text-[10px] font-mono flex items-center gap-1.5 ${isActive ? 'text-amber-500' : 'text-zinc-600'}`}>
                   {isActive ? (
                     <><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Engaged</>
                   ) : 'Standby'}
                </span>
             </div>
             
             <button onClick={() => setShowProfile(true)} className="w-10 h-10 rounded-full border border-white/10 overflow-hidden hover:border-amber-500/50 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50">
               {settings.avatarUrl || user.photoURL ? (
                  <img src={settings.avatarUrl || user.photoURL || ''} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center font-bold">{user.displayName?.[0] || 'U'}</div>
               )}
             </button>
          </div>
        </header>

        {/* Main Interface */}
        <main className="flex-1 flex flex-col items-center justify-start pt-20 relative p-8 z-10 w-full pointer-events-none">
           {/* Abstract Hardware visuals */}
           <div className="absolute inset-0 overflow-hidden pointer-events-none z-[-1] -translate-y-20">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/[0.02] rounded-full" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/[0.01] rounded-full" />
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gradient-to-b from-transparent via-white/[0.03] to-transparent" />
              <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
           </div>

           {/* The Orb / Core */}
           <div className="relative w-full max-w-[400px] aspect-square flex items-center justify-center">
               <AnimatePresence>
                 {isActive && (
                   <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ 
                        opacity: isAgentSpeaking ? 0.4 : 0.15, 
                        scale: isAgentSpeaking ? 1.4 : 1.2,
                        rotate: 360
                      }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-500/20 via-orange-500/10 to-transparent blur-[100px]"
                   />
                 )}
               </AnimatePresence>
               
               <motion.div 
                 animate={{
                    borderColor: isActive ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255,255,255,0.05)',
                    boxShadow: isActive ? '0 0 80px rgba(245, 158, 11, 0.1)' : '0 0 0px transparent'
                 }}
                 className="relative z-10 w-64 h-64 rounded-full flex items-center justify-center overflow-hidden bg-[#050506] border transition-colors duration-1000"
               >
                 {/* Inner decorative grid */}
                 <div className="absolute inset-0 opacity-10 pointer-events-none" 
                      style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                 
                 {connecting ? (
                    <div className="flex flex-col items-center gap-3">
                       <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                       <span className="text-[10px] uppercase tracking-widest text-amber-500/60 font-bold">Connecting</span>
                    </div>
                 ) : (
                    isActive ? (
                        <div className="flex gap-2 items-end h-16">
                            {[0.4, 0.5, 0.3, 0.6, 0.45, 0.55].map((d, i) => (
                              <motion.div 
                                key={i}
                                animate={{ 
                                  height: isAgentSpeaking ? ['20px', '60px', '20px'] : '12px',
                                  opacity: isAgentSpeaking ? 1 : 0.3
                                }} 
                                transition={{ duration: d, repeat: Infinity, delay: i * 0.05 }} 
                                className="w-2 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.5)]" 
                              />
                            ))}
                        </div>
                    ) : (
                       <div className="flex flex-col items-center">
                          <div className="w-12 h-0.5 bg-zinc-800 rounded-full opacity-50" />
                       </div>
                    )
                 )}
               </motion.div>
           </div>

           {/* HUD, Transcription, and Controls grouped at bottom */}
           <div className="absolute inset-x-0 bottom-8 flex flex-col items-center justify-end pointer-events-none z-50">
             
             {/* Dynamic Background Tasks / HUD */}
             <div className="w-full max-w-md px-6 space-y-2 mb-4">
               <AnimatePresence>
                 {tasks.map(task => (
                   <motion.div
                     key={task.id}
                     layout
                     initial={{ opacity: 0, x: -50, scale: 0.9 }}
                     animate={{ opacity: 1, x: 0, scale: 1 }}
                     exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
                     className="p-3 bg-[#0A0A0B]/80 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl flex items-center gap-4 border-l-2 border-l-amber-500/50"
                   >
                     <div className="relative flex-shrink-0">
                        {task.status === 'processing' ? (
                          <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                             <Check className="w-2.5 h-2.5 text-black" strokeWidth={4} />
                          </div>
                        )}
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                           <span className="text-[9px] uppercase tracking-widest text-amber-500 font-bold">{task.serviceName}</span>
                           <span className="text-[8px] font-mono text-zinc-600">{task.status.toUpperCase()}</span>
                        </div>
                        <p className="text-xs text-zinc-100 truncate">{task.action}</p>
                        {task.result && (
                          <motion.p 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="text-[10px] text-zinc-400 mt-1 leading-tight"
                          >
                             {task.result}
                          </motion.p>
                        )}
                     </div>
                     {task.status === 'processing' && (
                       <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div 
                            animate={{ x: ['-100%', '100%'] }} 
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            className="w-full h-full bg-amber-500/50" 
                          />
                       </div>
                     )}
                   </motion.div>
                 ))}
               </AnimatePresence>
             </div>

             {/* Transcription Overlay */}
             <div className="w-full max-w-2xl px-6 flex flex-col items-center justify-center mb-6 h-auto min-h-[5rem]">
               <AnimatePresence mode="wait">
                 {currentTranscript && (
                   <motion.div
                     key={currentTranscript.role}
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: 10 }}
                     className="text-center max-w-2xl w-full bg-black/40 backdrop-blur-md border border-white/5 px-6 py-4 rounded-3xl shadow-xl"
                   >
                     <span className={`text-[10px] uppercase tracking-[0.3em] font-bold mb-1 block ${currentTranscript.role === 'model' ? 'text-amber-500' : 'text-zinc-500'}`}>
                        {currentTranscript.role === 'user' ? 'You' : settings.personaName}
                     </span>
                     <p className={`text-lg md:text-xl font-light tracking-tight leading-snug drop-shadow-sm ${currentTranscript.role === 'model' ? 'text-zinc-100 font-serif' : 'text-zinc-300'}`}>
                       {currentTranscript.text}
                     </p>
                   </motion.div>
                 )}
               </AnimatePresence>
             </div>

             {/* Trigger / Controls */}
             <div className="pointer-events-auto flex flex-col items-center justify-center gap-4">
                <div className="flex justify-center items-center gap-8">
                {/* Mic Sub-button */}
                <button 
                  onClick={() => setIsMuted(p => !p)}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg border ${
                     isMuted ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-[#0A0A0B] border-white/10 text-zinc-400 hover:text-white hover:border-white/30'
                  }`}
                >
                   {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {/* Main Power */}
                {!isActive ? (
                  <button 
                    onClick={startSession}
                    disabled={connecting}
                    className="group relative"
                  >
                    <div className="absolute -inset-4 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all opacity-0 group-hover:opacity-100" />
                    <div className="relative w-20 h-20 bg-[#0A0A0B] border border-white/10 rounded-full flex items-center justify-center group-hover:border-amber-500/50 transition-all shadow-2xl">
                      <Power className={`w-8 h-8 transition-colors ${connecting ? 'text-zinc-700' : 'text-amber-500'}`} />
                    </div>
                  </button>
                ) : (
                  <button 
                    onClick={stopSession}
                    className="group relative"
                  >
                    <div className="absolute -inset-4 bg-red-500/10 rounded-full blur-xl opacity-100" />
                    <div className="relative w-20 h-20 bg-[#0A0A0B] border border-red-500/20 rounded-full flex items-center justify-center hover:border-red-500/50 transition-all shadow-2xl">
                      <Square className="w-6 h-6 text-red-500 fill-current" />
                    </div>
                  </button>
                )}

                {/* Video Sub-button */}
                <button 
                  onClick={() => toggleVideo()}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg border ${
                     isVideoEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-[#0A0A0B] border-white/10 text-zinc-400 hover:text-white hover:border-white/30'
                  }`}
                >
                   {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
                </div>

                {/* Camera specific controls */}
                <AnimatePresence>
                  {isVideoEnabled && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="flex justify-center items-center gap-4"
                    >
                       <button onClick={switchCamera} className="px-4 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-[10px] uppercase tracking-widest text-zinc-300 font-bold hover:text-white hover:border-white/30 transition-all flex items-center gap-2">
                          Flip Camera
                       </button>
                       <button onClick={capturePhoto} className="px-4 py-2 bg-emerald-500/20 backdrop-blur-md rounded-full border border-emerald-500/30 text-[10px] uppercase tracking-widest text-emerald-500 font-bold hover:bg-emerald-500/30 transition-all flex items-center gap-2">
                          <Camera className="w-3 h-3" /> Capture
                       </button>
                    </motion.div>
                  )}
                </AnimatePresence>
             </div>
           </div>
        </main>

        {/* --- History Sidebar Overlay --- */}
        <AnimatePresence>
          {showSidebar && (
             <>
               <motion.div 
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                 onClick={() => setShowSidebar(false)}
                 className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
               />
               <motion.div 
                 initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                 className="fixed top-0 left-0 bottom-0 w-80 bg-[#0A0A0B] border-r border-white/10 shadow-2xl z-[101] flex flex-col font-sans"
               >
                 <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-white tracking-widest uppercase">Memory Log</h2>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Context Buffer</p>
                    </div>
                    <button onClick={() => setShowSidebar(false)} className="p-2 -mr-2 rounded-xl hover:bg-white/5 text-zinc-500 hover:text-white transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {historyMsgs.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                         <span className="text-[8px] uppercase tracking-widest text-zinc-600 mb-1">{msg.role === 'user' ? 'You' : settings.personaName}</span>
                         <div className={`p-3 rounded-2xl max-w-[90%] text-xs leading-relaxed ${msg.role === 'user' ? 'bg-amber-500/10 text-amber-100 border border-amber-500/20 rounded-tr-sm' : 'bg-white/5 text-zinc-300 border border-white/5 rounded-tl-sm'}`}>
                            {msg.text}
                         </div>
                      </div>
                    ))}
                    {historyMsgs.length === 0 && (
                       <div className="text-center text-zinc-600 text-[10px] tracking-widest uppercase py-10 font-bold">No Memory Buffers</div>
                    )}
                 </div>
               </motion.div>
             </>
          )}
        </AnimatePresence>

        {/* --- Profile Fullscreen Overlay --- */}
        <AnimatePresence>
          {showProfile && (
             <motion.div 
               initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
               className="fixed inset-0 bg-[#050505] z-[200] overflow-y-auto font-sans flex flex-col"
             >
                <div className="p-6 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#050505]/80 backdrop-blur-xl z-10 w-full max-w-2xl mx-auto">
                   <div>
                      <h2 className="text-sm font-bold text-white tracking-widest uppercase">Profile</h2>
                   </div>
                   <div className="flex gap-2">
                     <button onClick={onLogout} className="px-4 py-2 bg-red-500/10 text-red-500 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-red-500/20 active:scale-95 transition-all flex items-center gap-2">
                        <LogOut className="w-4 h-4" /> Logout
                     </button>
                     <button 
                       onClick={async () => {
                          const userRef = ref(rtdb, 'users/' + user.uid);
                          await update(userRef, { settings, updatedAt: serverTimestamp() });
                          setShowProfile(false);
                       }} 
                       className="px-4 py-2 bg-amber-500 text-black text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-amber-400 active:scale-95 transition-all flex items-center gap-2"
                     >
                        <Save className="w-4 h-4" /> Save
                     </button>
                     <button onClick={() => setShowProfile(false)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                       <X className="w-5 h-5" />
                     </button>
                   </div>
                </div>

                <div className="flex-1 w-full max-w-2xl mx-auto p-6 flex flex-col gap-8 pb-20">
                   
                   {/* Avatar Upload */}
                   <div className="flex flex-col items-center gap-4">
                      <div className="relative w-32 h-32 rounded-full border-2 border-white/10 bg-zinc-900 overflow-hidden flex items-center justify-center group">
                         {settings.avatarUrl || user.photoURL ? (
                           <img src={settings.avatarUrl || user.photoURL || ''} alt="Avatar" className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                         ) : (
                           <div className="text-4xl text-zinc-700 font-bold">{user.displayName?.[0] || 'U'}</div>
                         )}
                         <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <Camera className="w-8 h-8 text-white drop-shadow-md" />
                         </div>
                         <input 
                           type="file" accept="image/*"
                           className="absolute inset-0 opacity-0 cursor-pointer"
                           onChange={(e) => {
                             const file = e.target.files?.[0];
                             if (!file) return;
                             const reader = new FileReader();
                             reader.onload = (ev) => {
                               const img = new Image();
                               img.onload = () => {
                                  const c = document.createElement('canvas');
                                  c.width = 150; c.height = 150;
                                  const ctx = c.getContext('2d');
                                  if (!ctx) return;
                                  ctx.drawImage(img, 0, 0, 150, 150);
                                  setSettings(s => ({ ...s, avatarUrl: c.toDataURL('image/jpeg', 0.8) }));
                               };
                               img.src = ev.target?.result as string;
                             };
                             reader.readAsDataURL(file);
                           }}
                         />
                      </div>
                      <div className="text-center">
                         <h3 className="text-xs uppercase tracking-widest font-bold text-zinc-300">Avatar Node</h3>
                         <p className="text-[10px] text-zinc-600 mt-1">Tap to re-configure</p>
                      </div>
                   </div>

                   {/* Text Fields */}
                   <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold tracking-widest uppercase text-zinc-500">Persona Designation</label>
                        <input 
                          type="text" 
                          value={settings.personaName}
                          onChange={(e) => setSettings(s => ({ ...s, personaName: e.target.value }))}
                          className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl p-4 text-white font-serif text-xl focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all"
                          placeholder="e.g. Maximus"
                        />
                      </div>
                      
                      <div className="space-y-2 flex-1 flex flex-col">
                        <label className="text-[10px] font-bold tracking-widest uppercase text-zinc-500">System Directives</label>
                        <textarea 
                          value={settings.systemPrompt}
                          onChange={(e) => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                          className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl p-4 text-zinc-300 font-mono text-xs leading-relaxed focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all min-h-[300px] resize-y"
                          placeholder="You are Maximus..."
                        />
                      </div>
                   </div>

                </div>
             </motion.div>
          )}
        </AnimatePresence>

    </div>
  );
}
