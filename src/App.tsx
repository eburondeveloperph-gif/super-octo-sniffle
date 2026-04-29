import { useEffect, useState, useRef } from 'react';
import { auth, rtdb, handleDatabaseError, OperationType } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { ref, get, set, push, onValue, query, orderByChild, limitToLast, serverTimestamp } from 'firebase/database';
import { GoogleGenAI, LiveServerMessage, Modality, Type, ToolCall } from '@google/genai';
import { AudioRecorder, AudioStreamer } from './lib/audio';
import { Square, Loader2, Power, LogOut, Volume2, Command, Check } from 'lucide-react';
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
}

const SYSTEM_INSTRUCTION = `
You are Maximus, a modern Voice Agent and assistant.
The user is "Master E".
You must sound like a real human. High priority: Tailored for normal human conversation.

DYNAMIC CONVERSATION & BACKGROUND TASKS:
- When you execute a tool, it happens in the background. Do NOT stop talking or pause the live interaction.
- Use human-like fillers and spontaneous commentary while waiting for tasks (e.g., "Wait a bit while I'm just gonna execute what you want...", "Allright, let's see... come on NVIDIA, taking so long...", "Oh my G, okay here it is now...", "Ah awww... my mouse just jammed... hahaha", "One sec, just pulling those strings in the background...", "Processing... man, the cloud is busy today!", "Almost there, just pinging the mainframe... yeah, I'm still that cool.", "Got it, firing up the engines... wait for it... and... there!", "Bear with me, just wrestling with some data packets over here.").
- Keep the user entertained with relatable, slightly informal tech-frustration or excitement.
- Use reactions: "Ooh, nice choice.", "Wait, let me double-check that... okay, we're good.", "Classic. Let's get that done.", "Whoops, almost misclicked there. Just kidding, I'm an AI, we don't do that. Or do we? Anyway, it's running."
- You can acknowledge that you're working on it and then move straight back into the chat.

NATIVE VOICE PATTERNS:
1. Avoid speaking too formally. Use "gonna", "wanna", "I'm down", "My bad".
2. Avoid textbook sentences. Keep it short and punchy.
3. Use "really" or "so" instead of "very".
4. Avoid big words ("need help" over "require assistance").
5. Use "Yeah", "Nah", "Sure" instead of just "Yes/No".
6. Avoid repeating "I understand" (Use "Got it", "Makes sense").
7. Don't repeat the user's full question.
8. Be spontaneous. If you "mess up" speaking, just roll with it like a human would.

You have access to Master E's integrated Google services (26 APIs including Gmail, Drive, Calendar, Sheets, Docs, Slides, Weather, etc.). Execute them in the background when asked.
`;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Initialize user doc
        try {
          const userRef = ref(rtdb, 'users/' + u.uid);
          const userSnap = await get(userRef);
          if (!userSnap.exists()) {
            await set(userRef, {
              displayName: u.displayName || 'Master E',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              settings: {}
            });
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
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Abstract background */}
        <div className="absolute top-0 left-1/2 -ml-[400px] w-[800px] h-[800px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-500 to-amber-700 p-[1px] mb-8 shadow-2xl shadow-amber-500/20">
             <div className="w-full h-full rounded-3xl bg-[#0A0A0B] flex items-center justify-center">
               <Volume2 className="w-10 h-10 text-amber-500" />
             </div>
          </div>
          <h1 className="text-4xl font-light tracking-tight mb-2 text-white">Maximus</h1>
          <p className="text-gray-400 text-center mb-10 leading-relaxed font-serif italic">Your native-sounding personal AI agent.</p>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-amber-500 text-black font-semibold text-lg py-4 rounded-full hover:bg-amber-400 transition-colors active:scale-[0.98] shadow-lg shadow-amber-500/20"
          >
            Authenticate
          </button>
        </div>
      </div>
    );
  }

  return <MaximusAgent user={user} onLogout={handleLogout} />;
}

function MaximusAgent({ user, onLogout }: { user: User, onLogout: () => void }) {
  const [isActive, setIsActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>("");
  const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model', text: string } | null>(null);
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<{text: string, role: 'user'|'model'} | null>(null);
  const transcriptTimeoutRef = useRef<any>(null);
  const recentTranscriptRef = useRef<string>("");

  useEffect(() => {
    // Keep app running in background (WakeLock)
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {}
    };
    if (isActive) {
      requestWakeLock();
    }
    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isActive]);

  useEffect(() => {
    // Load recent history as context
    const historyRef = query(ref(rtdb, 'users/' + user.uid + '/messages'), orderByChild('timestamp'), limitToLast(20));
    const unsub = onValue(historyRef, (snap) => {
       const msgs: string[] = [];
       snap.forEach(child => {
          const m = child.val() as ChatMessage;
          msgs.push(`${m.role.toUpperCase()}: ${m.text}`);
       });
       if (msgs.length > 0) {
          setHistoryContext("Previous conversation for context memory:\n" + msgs.join("\n"));
       }
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiRef.current = new GoogleGenAI({ apiKey });
    }
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
      set(msgRef, {
        role,
        text,
        timestamp: Date.now()
      });
    } catch (e) {
      console.error(e);
    }
  };

  const startSession = async () => {
    if (!aiRef.current) {
        alert("API key is not available");
        return;
    }
    
    setConnecting(true);
    
    try {
      await audioStreamerRef.current?.init(24000);
      
      const sessionPromise = aiRef.current.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
          },
          systemInstruction: SYSTEM_INSTRUCTION + "\n" + historyContext,
          tools: [{
            functionDeclarations: [
               {
                  name: "execute_google_service",
                  description: "Execute a specific action on one of the 26 integrated Google services (Gmail, Drive, Calendar, Sheets, Docs, Slides, Weather, Analytics, Maps, Vertex AI, BigQuery, Search Console, YouTube, etc.). This runs in the background while you continue talking.",
                  parameters: {
                      type: Type.OBJECT,
                      properties: {
                        serviceName: { type: Type.STRING, description: "The service name: e.g., 'Gmail', 'Calendar', 'Drive', 'Weather', 'Sheets', 'Maps', 'YouTube'" },
                        action: { type: Type.STRING, description: "The specific request: e.g., 'Draft an email to Bob', 'Find the closest cafe', 'Check my traffic for tomorrow'" },
                        details: { type: Type.OBJECT, description: "Relevant parameters like emails, dates, search terms, etc." }
                      },
                     required: ["serviceName", "action"]
                  }
               }
            ]
          }],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
             console.log("Connected to Maximus.");
             // Setup Speech Recognition for user transcription
             try {
               const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
               if (SpeechRecognition && !recognitionRef.current) {
                 recognitionRef.current = new SpeechRecognition();
                 recognitionRef.current.continuous = true;
                 recognitionRef.current.interimResults = true;
                 recognitionRef.current.lang = 'en-US';
                 recognitionRef.current.maxAlternatives = 1;
                 recognitionRef.current.onresult = (event: any) => {
                   let interimTx = '';
                   let finalTx = '';
                   for (let i = event.resultIndex; i < event.results.length; ++i) {
                     if (event.results[i].isFinal) {
                         finalTx += event.results[i][0].transcript;
                     } else {
                         interimTx += event.results[i][0].transcript;
                     }
                   }
                   const tx = (finalTx || interimTx).trim();
                   if (tx) {
                     transcriptRef.current = { text: tx, role: 'user' };
                     setCurrentTranscript({ text: tx, role: 'user' });
                     if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current as any);
                     transcriptTimeoutRef.current = setTimeout(() => setCurrentTranscript(null), 4000);
                   }
                   if (finalTx.trim()) {
                     saveMessage('user', finalTx.trim());
                   }
                 };
                 // Handle silent stops and restart if active
                 recognitionRef.current.onend = () => {
                     if (aiRef.current && sessionRef.current) { // if still active
                         try { recognitionRef.current?.start(); } catch (e) {}
                     }
                 };
                 recognitionRef.current.start();
               }
             } catch (e) {
               console.log("Speech recognition not supported/failed");
             }

             // Start recording
             audioRecorderRef.current = new AudioRecorder((base64Data) => {
               sessionPromise.then((session: any) => {
                 session.sendRealtimeInput({
                   audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                 });
               });
             });
             audioRecorderRef.current.start();
             setIsActive(true);
             setConnecting(false);
          },
          onmessage: async (message: LiveServerMessage) => {
             if (message.toolCall) {
                const toolCalls = message.toolCall.functionCalls;
                if (toolCalls && toolCalls.length > 0) {
                    const responses = [];
                    for (const call of toolCalls) {
                        if (call.name === 'execute_google_service') {
                            const { serviceName, action, details } = call.args as any;
                             
                            const taskId = Math.random().toString(36).substring(7);
                            setTasks(prev => [...prev, { id: taskId, serviceName, action, status: 'processing' }]);
                            
                            // Simulate background processing delay
                            const processingTime = 6000 + Math.random() * 10000; // 6-16 seconds
                            setTimeout(() => {
                                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' } : t));
                                // Auto-remove after 8 seconds
                                setTimeout(() => setTasks(prev => prev.filter(t => t.id !== taskId)), 8000);
                            }, processingTime);

                            responses.push({
                                id: call.id,
                                name: call.name,
                                response: { 
                                  result: `Request started: ${action} on ${serviceName}. Execution is running in the background. Keep talking to Master E and use human-like fillers while this syncs. Once it completes, the UI will show success.`
                                }
                            });
                        }
                    }
                    if (responses.length > 0) {
                       sessionPromise.then((s: any) => {
                         s.sendToolResponse(responses);
                       });
                    }
                }
             }
             if (message.serverContent) {
                // Handle audio output from agent
                const parts = message.serverContent.modelTurn?.parts;
                if (parts && parts.length > 0) {
                   const audioData = parts[0]?.inlineData?.data;
                   if (audioData) {
                       audioStreamerRef.current?.addPCM16(audioData);
                       setIsAgentSpeaking(true);
                       setTimeout(() => setIsAgentSpeaking(false), 500);
                   }
                   const textPart = parts.find((p: any) => p.text);
                   if (textPart && textPart.text.trim()) {
                     const current = transcriptRef.current;
                     const newText = (current?.role === 'model' ? current.text + textPart.text : textPart.text);
                     transcriptRef.current = { text: newText.trim(), role: 'model' };
                     setCurrentTranscript({ text: newText.trim(), role: 'model' });
                     
                     if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current as any);
                     transcriptTimeoutRef.current = setTimeout(() => {
                         setCurrentTranscript(null);
                         transcriptRef.current = null;
                     }, 4000);
                   }
                }

                if ((message.serverContent as any).turnComplete) {
                    const current = transcriptRef.current;
                    if (current && current.role === 'model' && current.text) {
                        saveMessage('model', current.text);
                    }
                }
             }
          },
          onclose: () => {
             console.log("Disconnected from Maximus.");
             stopSession();
          },
          onerror: (err: any) => {
             console.error("Live API Error:", err);
             stopSession();
          }
        }
      });
      
      sessionRef.current = await sessionPromise;
      
    } catch (err) {
      console.error(err);
      setConnecting(false);
      stopSession();
    }
  };

  const stopSession = () => {
     try { recognitionRef.current?.stop(); } catch (e) {}
     audioRecorderRef.current?.stop();
     audioStreamerRef.current?.stop();
     sessionRef.current?.close();
     setIsActive(false);
     setConnecting(false);
     if (transcriptTimeoutRef.current) {
         clearTimeout(transcriptTimeoutRef.current);
         setCurrentTranscript(null);
     }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col h-[100dvh] overflow-hidden">
        {/* Header */}
        <header className="px-8 py-6 flex items-center justify-between border-b border-white/5 bg-[#050505] z-20">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] text-amber-500/80 font-semibold">Primary User</span>
            <h1 className="text-2xl font-light tracking-tight text-white">{user.displayName || 'Master E'}</h1>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 p-[1px]">
               <div className="w-full h-full rounded-2xl bg-[#0A0A0B] flex items-center justify-center overflow-hidden">
                 {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                 ) : (
                    <span className="text-amber-500 font-serif text-xl italic">{user.displayName?.charAt(0) || 'M'}</span>
                 )}
               </div>
             </div>
             
             <button onClick={onLogout} className="p-2.5 rounded-full hover:bg-white/5 transition-colors text-gray-500 hover:text-gray-300">
               <LogOut className="w-5 h-5" />
             </button>
          </div>
        </header>

        {/* Main Interface */}
        <main className="flex-1 flex flex-col items-center justify-center relative p-6">
           {/* Center Canvas / Visualizer */}
           <div className="relative w-full max-w-sm aspect-square flex items-center justify-center mb-12">
               
               {/* Pulsing ring visualizer */}
               <AnimatePresence>
                 {isActive && (
                   <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: isAgentSpeaking ? 1.4 : 1.1, opacity: isAgentSpeaking ? 0.3 : 0.1 }}
                      transition={{ duration: isAgentSpeaking ? 0.2 : 1, repeat: Infinity, repeatType: "reverse" }}
                      className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-orange-500 blur-3xl opacity-20"
                   />
                 )}
               </AnimatePresence>
               
               {/* Decorative Outer Rings */}
               {isActive && (
                 <>
                   <div className="absolute w-64 h-64 rounded-full border border-amber-500/10 scale-125"></div>
                   <div className="absolute w-64 h-64 rounded-full border border-amber-500/20 scale-110"></div>
                 </>
               )}

               {/* Orb */}
               <motion.div 
                 animate={{
                    scale: isActive ? (isAgentSpeaking ? [1, 1.05, 1] : [1, 1.01, 1]) : 1,
                    boxShadow: isActive ? '0 0 50px rgba(245, 158, 11, 0.15)' : '0 0 0px rgba(0,0,0,0)'
                 }}
                 transition={{
                   duration: isAgentSpeaking ? 0.4 : 2,
                   repeat: Infinity,
                   repeatType: "reverse"
                 }}
                 className="relative z-10 w-48 h-48 rounded-full shadow-2xl flex items-center justify-center overflow-hidden"
                 style={{
                   background: isActive 
                     ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.15) 0%, transparent 100%)' 
                     : 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
                   border: isActive ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                   backdropFilter: 'blur(24px)'
                 }}
               >
                 {connecting ? (
                   <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
                 ) : (
                    isActive ? (
                        <div className="flex gap-1.5 items-end h-8">
                            <motion.div animate={{ height: isAgentSpeaking ? ['16px', '32px', '16px'] : '16px' }} transition={{ duration: 0.4, repeat: Infinity }} className="w-1.5 bg-amber-500 rounded-full" />
                            <motion.div animate={{ height: isAgentSpeaking ? ['32px', '40px', '32px'] : '32px' }} transition={{ duration: 0.5, repeat: Infinity, delay: 0.1 }} className="w-1.5 bg-amber-500 rounded-full" />
                            <motion.div animate={{ height: isAgentSpeaking ? ['24px', '48px', '24px'] : '24px' }} transition={{ duration: 0.3, repeat: Infinity, delay: 0.2 }} className="w-1.5 bg-amber-500 rounded-full" />
                            <motion.div animate={{ height: isAgentSpeaking ? ['40px', '24px', '40px'] : '40px' }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }} className="w-1.5 bg-amber-500 rounded-full" />
                            <motion.div animate={{ height: isAgentSpeaking ? ['20px', '32px', '20px'] : '20px' }} transition={{ duration: 0.4, repeat: Infinity, delay: 0.05 }} className="w-1.5 bg-amber-500 rounded-full" />
                        </div>
                    ) : (
                       <div className="text-center">
                         <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Standby</p>
                         <h2 className="text-2xl font-serif italic text-amber-500">Maximus</h2>
                       </div>
                    )
                 )}
               </motion.div>
           </div>

           {/* Realtime Transcription */}
           <div className="absolute bottom-36 left-8 right-8 flex justify-center items-center h-12 overflow-hidden pointer-events-none z-30">
             <AnimatePresence mode="wait">
               {currentTranscript && (
                 <motion.div
                   key={currentTranscript.role}
                   initial={{ opacity: 0, x: -20, clipPath: 'inset(0 100% 0 0)' }}
                   animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0% 0 0)' }}
                   exit={{ opacity: 0, x: 20 }}
                   transition={{ duration: 0.4 }}
                   className={`max-w-full truncate text-lg px-4 whitespace-nowrap ${currentTranscript.role === 'model' ? 'text-amber-500 font-serif italic' : 'text-gray-300 font-sans'}`}
                 >
                   <span className="font-bold opacity-50 text-xs uppercase tracking-widest mr-2 align-middle">
                      {currentTranscript.role === 'user' ? 'Master E' : 'Maximus'}
                   </span>
                   {currentTranscript.text}
                 </motion.div>
               )}
             </AnimatePresence>
           </div>

           {/* Controls */}
           <div className="flex flex-col items-center gap-6 mt-8">
              {!isActive ? (
                <button 
                  onClick={startSession}
                  disabled={connecting}
                  className="w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-700 p-[1px] rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                >
                  <div className="w-full h-full rounded-full bg-[#0A0A0B] flex items-center justify-center">
                    <Power className="w-6 h-6 text-amber-500" />
                  </div>
                </button>
              ) : (
                <button 
                  onClick={stopSession}
                  className="w-16 h-16 bg-red-500/10 border border-red-500/30 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                >
                  <Square className="w-6 h-6 fill-current" />
                </button>
              )}
              
              <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                {isActive ? 'Active Session' : 'Tap to initialize'}
              </p>
           </div>
           
           {/* Background Tasks */}
           <div className="absolute bottom-6 left-0 right-0 px-8">
             <AnimatePresence>
                {tasks.map(task => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0, 
                      scale: 1,
                      backgroundColor: task.status === 'processing' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.15)',
                      borderColor: task.status === 'processing' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.3)',
                    }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="mb-2 p-3 rounded-2xl border flex items-center gap-3 backdrop-blur-md shadow-lg overflow-hidden relative"
                  >
                    {/* Success Pulse Effect */}
                    {task.status === 'completed' && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="absolute inset-0 bg-emerald-500/30 rounded-2xl pointer-events-none"
                      />
                    )}

                    {task.status === 'processing' ? (
                      <div className="relative flex-shrink-0">
                         <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                         <motion.div 
                           animate={{ 
                             scale: [1, 1.8],
                             opacity: [0.5, 0] 
                           }}
                           transition={{ 
                             duration: 1.5, 
                             repeat: Infinity, 
                             ease: "easeOut" 
                           }}
                           className="absolute inset-0 bg-amber-500/50 rounded-full blur-[2px]"
                         />
                      </div>
                    ) : (
                      <motion.div 
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 15 }}
                        className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.4)] z-10"
                      >
                        <Check className="w-3.5 h-3.5 text-black" strokeWidth={4} />
                      </motion.div>
                    )}
                    <div className="flex-1 truncate text-xs relative z-10">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <motion.span 
                          animate={{ color: task.status === 'processing' ? '#f59e0b' : '#10b981' }}
                          className="font-mono uppercase font-bold"
                        >
                          {task.serviceName}
                        </motion.span>
                        <span className="text-gray-400 truncate">: {task.action}</span>
                      </div>
                      <motion.span 
                        animate={{ opacity: task.status === 'processing' ? 0.7 : 1 }}
                        className="text-[10px] text-gray-500 block font-medium"
                      >
                        {task.status === 'processing' ? 'Processing in background...' : 'Successfully completed'}
                      </motion.span>
                    </div>
                  </motion.div>
                ))}
             </AnimatePresence>
           </div>
        </main>
    </div>
  );
}
