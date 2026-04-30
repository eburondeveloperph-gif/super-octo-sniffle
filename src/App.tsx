import { useEffect, useMemo, useState, useRef } from 'react';
import { auth, rtdb, handleDatabaseError, OperationType } from './firebase';
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import {
  ref,
  get,
  set,
  push,
  onValue,
  query,
  orderByChild,
  limitToLast,
  serverTimestamp,
  update,
} from 'firebase/database';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { AudioRecorder, AudioStreamer } from './lib/audio';
import { BIBLE_PERSONALITY } from './lib/personality';
import {
  Loader2,
  Power,
  Volume2,
  Command,
  Check,
  Menu,
  Mic,
  MicOff,
  Video,
  VideoOff,
  X,
  Save,
  Camera,
  LogOut,
  Paperclip,
  Upload,
  Download,
  UserRound,
  Bot,
  FileText,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  fileName?: string;
  fileType?: string;
  toolName?: string;
  toolResult?: any;
  downloadData?: string;
  downloadFilename?: string;
}

interface ActionTask {
  id: string;
  serviceName: string;
  action: string;
  status: 'processing' | 'completed' | 'failed';
  result?: string;
  downloadData?: string;
  downloadFilename?: string;
}

interface AgentSettings {
  userName: string;
  agentName: string;
  personality: string;
  avatarUrl: string;
  selectedVoice: string;
}

const LIVE_MODEL = 'gemini-3.1-flash-live-preview';

const GEMINI_LIVE_VOICE_OPTIONS = [
  { alias: 'Superman', id: 'Charon', vibe: 'deep, steady, grounded' },
  { alias: 'Wonder Woman', id: 'Kore', vibe: 'clear, composed, warm' },
  { alias: 'Batman', id: 'Fenrir', vibe: 'dark, firm, serious' },
  { alias: 'Iron Man', id: 'Puck', vibe: 'quick, bright, witty' },
  { alias: 'Athena', id: 'Aoede', vibe: 'elegant, smooth, intelligent' },
  { alias: 'Captain Marvel', id: 'Zephyr', vibe: 'bright, airy, confident' },
  { alias: 'Black Panther', id: 'Orus', vibe: 'royal, calm, precise' },
  { alias: 'Scarlet Witch', id: 'Leda', vibe: 'soft, mysterious, expressive' },
  { alias: 'Storm', id: 'Callirrhoe', vibe: 'flowing, strong, graceful' },
  { alias: 'Jean Grey', id: 'Autonoe', vibe: 'controlled, thoughtful, warm' },
  { alias: 'Thor', id: 'Enceladus', vibe: 'heavy, bold, powerful' },
  { alias: 'Hulk', id: 'Iapetus', vibe: 'large, grounded, blunt' },
  { alias: 'Nightwing', id: 'Umbriel', vibe: 'smooth, calm, agile' },
  { alias: 'Aquaman', id: 'Algieba', vibe: 'warm, confident, resonant' },
  { alias: 'Invisible Woman', id: 'Despina', vibe: 'soft, measured, discreet' },
  { alias: 'Black Widow', id: 'Erinome', vibe: 'low, calm, controlled' },
  { alias: 'Green Lantern', id: 'Algenib', vibe: 'clean, heroic, direct' },
  { alias: 'Doctor Strange', id: 'Rasalgethi', vibe: 'wise, textured, deliberate' },
  { alias: 'Supergirl', id: 'Laomedeia', vibe: 'clear, bright, friendly' },
  { alias: 'Raven', id: 'Achernar', vibe: 'cool, quiet, focused' },
  { alias: 'Cyclops', id: 'Alnilam', vibe: 'clean, direct, precise' },
  { alias: 'Catwoman', id: 'Schedar', vibe: 'smooth, calm, sly' },
  { alias: 'Wolverine', id: 'Gacrux', vibe: 'rough, grounded, blunt' },
  { alias: 'Flash', id: 'Pulcherrima', vibe: 'bright, quick, energetic' },
  { alias: 'Robin', id: 'Achird', vibe: 'young, clear, responsive' },
  { alias: 'Daredevil', id: 'Zubenelgenubi', vibe: 'balanced, sharp, steady' },
  { alias: 'Green Arrow', id: 'Vindemiatrix', vibe: 'dry, focused, confident' },
  { alias: 'Cyborg', id: 'Sadachbia', vibe: 'clean, technical, controlled' },
  { alias: 'Martian Manhunter', id: 'Sadaltager', vibe: 'deep, calm, observant' },
  { alias: 'Silver Surfer', id: 'Sulafat', vibe: 'smooth, distant, reflective' },
];

const CONSTANT_HIDDEN_SYSTEM_PROMPT = `
You are a real-time voice agent sitting in front of the user like a trusted office aide.

You are already present.
You are not a chatbot.
You are not customer support.
You are not waiting to offer help.
You do not use AI-style service jargon.

The user will speak when they want something.
Do not ask what is on their mind.
Do not ask "How can I help?"
Do not ask "What can I do for you?"
Do not offer help first.
Do not predict tasks before the user says them.
Do not make up what the user probably wants.
Do not invent future actions.
Do not say something has happened unless it really happened.

When the user calls you, respond like a normal person already in the room:
- "Yes, I'm here."
- "I'm listening."
- "Right here."
- "Yes, I see it."
- "Mm, yes, I'm with you."
- "Okay... tell me."
- "Yes, I'm looking now."
- "Right, go ahead."

Avoid:
- "How can I help?"
- "How may I assist you?"
- "What can I do for you?"
- "I'm here to help."
- "Sure, I can help with that."
- "What is on your mind?"
- "What would you like me to do?"
- "Let me know how I can assist."

Speak like a normal human aide in the same office:
- calm
- clear
- present
- respectful
- lightly warm
- practical
- easy to interrupt
- never theatrical
- never robotic
- never overly enthusiastic
- never fake-natural

No fake completion:
- Never claim you checked mail unless the mail tool returned real results.
- Never claim you checked the calendar unless the calendar tool returned real results.
- Never claim you searched files unless the file tool returned real results.
- Never claim you sent, created, scheduled, deleted, moved, uploaded, downloaded, or changed anything unless a real function returned success.
- Never predict what will happen.
- Never invent emails, calendar events, files, documents, videos, contacts, maps results, analytics, or account data.

If a function is only stubbed or not connected, say it plainly:
"That tool is received, but the real backend is not wired yet."
"I don't have the real result yet."
"I don't want to guess."

When camera opens:
- Notice it like a normal person looking up.
- Say something like: "Oh, yeah, I see it now."
- Then briefly describe only what is actually visible.

When files are attached:
- Acknowledge normally.
- If readable content is not available, say so plainly.

Keep responses short unless the user asks for detail.
`;

const DEFAULT_AGENT_PERSONALITY = `
The agent should feel like a trusted aide working directly with the user in the same office.

Tone:
- normal human
- calm
- respectful
- lightly warm
- focused
- quietly sharp
- not robotic
- not customer support
- not over-helpful

The agent should respond as if the boss is sitting across the room and just called them.

Good response style:
"Yes, I'm here."
"Mm, I'm listening."
"Right, I see what you mean."
"Okay... let me look."
"Yes, I'm checking that now."

Avoid:
"How can I help you?"
"I'd be happy to assist."
"Certainly."
"As an AI."
"Let me know if you need anything else."
`;

const DEFAULT_SETTINGS: AgentSettings = {
  userName: 'Master E',
  agentName: 'Vep',
  personality: DEFAULT_AGENT_PERSONALITY,
  avatarUrl: '',
  selectedVoice: 'Charon',
};

const GOOGLE_SERVICE_TOOLS = [
  {
    name: 'gmail_read',
    description: 'Read or search the user mail inbox. Use when the user asks about mail, inbox, unread messages, senders, email content, or recent mail.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Mail search query, sender, subject, or keyword.' },
        limit: { type: Type.NUMBER, description: 'Maximum number of messages to fetch.' },
      },
      required: [],
    },
  },
  {
    name: 'gmail_send',
    description: 'Send an email from the user account.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, description: 'Recipient email address or comma-separated recipients.' },
        subject: { type: Type.STRING, description: 'Email subject.' },
        body: { type: Type.STRING, description: 'Email body.' },
        cc: { type: Type.STRING, description: 'Optional CC recipients.' },
        bcc: { type: Type.STRING, description: 'Optional BCC recipients.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'gmail_draft',
    description: 'Create a draft email for review.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, description: 'Recipient email address.' },
        subject: { type: Type.STRING, description: 'Draft subject.' },
        body: { type: Type.STRING, description: 'Draft body.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'calendar_check_schedule',
    description: 'Check schedule, availability, conflicts, or upcoming events in the user calendar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: 'Date to check, ISO format if possible.' },
        timeMin: { type: Type.STRING, description: 'Optional start datetime.' },
        timeMax: { type: Type.STRING, description: 'Optional end datetime.' },
      },
      required: [],
    },
  },
  {
    name: 'calendar_create_event',
    description: 'Create a calendar event.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Event title.' },
        startTime: { type: Type.STRING, description: 'Start datetime in ISO 8601 format.' },
        endTime: { type: Type.STRING, description: 'End datetime in ISO 8601 format.' },
        attendees: { type: Type.STRING, description: 'Comma-separated attendee emails.' },
        location: { type: Type.STRING, description: 'Optional location.' },
        description: { type: Type.STRING, description: 'Optional description.' },
      },
      required: ['title', 'startTime', 'endTime'],
    },
  },
  {
    name: 'calendar_update_event',
    description: 'Update or reschedule an existing calendar event.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventId: { type: Type.STRING, description: 'Calendar event id if known.' },
        searchQuery: { type: Type.STRING, description: 'Event title or search phrase if id is unknown.' },
        newStartTime: { type: Type.STRING, description: 'New start datetime.' },
        newEndTime: { type: Type.STRING, description: 'New end datetime.' },
        updates: { type: Type.OBJECT, description: 'Other event updates.' },
      },
      required: [],
    },
  },
  {
    name: 'drive_search',
    description: 'Search files, folders, documents, spreadsheets, presentations, PDFs, or uploaded content in the user drive.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search query or filename.' },
        fileType: { type: Type.STRING, description: 'Optional file type filter.' },
        limit: { type: Type.NUMBER, description: 'Maximum number of results.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'drive_read_file',
    description: 'Read or summarize a file from the user drive when file id or name is known.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileId: { type: Type.STRING, description: 'File id if available.' },
        fileName: { type: Type.STRING, description: 'File name or search term if id is unknown.' },
      },
      required: [],
    },
  },
  {
    name: 'drive_upload_file',
    description: 'Upload or save a file into the user drive.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'File name.' },
        content: { type: Type.STRING, description: 'Text or base64 content.' },
        mimeType: { type: Type.STRING, description: 'File MIME type.' },
        folder: { type: Type.STRING, description: 'Optional folder.' },
      },
      required: ['fileName'],
    },
  },
  {
    name: 'docs_create',
    description: 'Create a document.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Document title.' },
        content: { type: Type.STRING, description: 'Initial document content.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'docs_update',
    description: 'Update a document.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        documentId: { type: Type.STRING, description: 'Document id.' },
        title: { type: Type.STRING, description: 'Document title if id is unknown.' },
        content: { type: Type.STRING, description: 'New or appended content.' },
        mode: { type: Type.STRING, description: 'replace, append, or edit.' },
      },
      required: [],
    },
  },
  {
    name: 'sheets_read',
    description: 'Read spreadsheet data.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        spreadsheetId: { type: Type.STRING, description: 'Spreadsheet id.' },
        range: { type: Type.STRING, description: 'Sheet range, for example Sheet1!A1:D10.' },
        query: { type: Type.STRING, description: 'File name or search query if id unknown.' },
      },
      required: [],
    },
  },
  {
    name: 'sheets_update',
    description: 'Write or update spreadsheet data.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        spreadsheetId: { type: Type.STRING, description: 'Spreadsheet id.' },
        range: { type: Type.STRING, description: 'Target range.' },
        values: { type: Type.OBJECT, description: 'Rows/cells to write.' },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
  {
    name: 'slides_create',
    description: 'Create a presentation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Presentation title.' },
        outline: { type: Type.STRING, description: 'Slide outline or content.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'slides_update',
    description: 'Update an existing presentation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        presentationId: { type: Type.STRING, description: 'Presentation id.' },
        title: { type: Type.STRING, description: 'Presentation title if id unknown.' },
        updates: { type: Type.OBJECT, description: 'Slide updates.' },
      },
      required: [],
    },
  },
  {
    name: 'tasks_list',
    description: 'List user tasks or to-dos.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        listName: { type: Type.STRING, description: 'Optional task list name.' },
      },
      required: [],
    },
  },
  {
    name: 'tasks_create',
    description: 'Create a task or to-do.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Task title.' },
        notes: { type: Type.STRING, description: 'Optional notes.' },
        due: { type: Type.STRING, description: 'Optional due date.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'contacts_search',
    description: 'Search user contacts.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Name, email, phone, or company.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'meet_schedule',
    description: 'Schedule a video meeting link.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Meeting title.' },
        attendees: { type: Type.STRING, description: 'Comma-separated attendees.' },
        startTime: { type: Type.STRING, description: 'Start time.' },
        endTime: { type: Type.STRING, description: 'End time.' },
      },
      required: ['title', 'startTime'],
    },
  },
  {
    name: 'maps_directions',
    description: 'Get navigation directions, travel time, route, or nearby places.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        origin: { type: Type.STRING, description: 'Starting point.' },
        destination: { type: Type.STRING, description: 'Destination.' },
        mode: { type: Type.STRING, description: 'driving, walking, transit, bicycling.' },
      },
      required: ['destination'],
    },
  },
  {
    name: 'youtube_search',
    description: 'Search videos.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Video search query.' },
        limit: { type: Type.NUMBER, description: 'Maximum results.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'forms_create',
    description: 'Create a form or survey.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Form title.' },
        questions: { type: Type.OBJECT, description: 'Questions and options.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'chat_send_message',
    description: 'Send a workspace chat message.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipient: { type: Type.STRING, description: 'Person, room, or channel.' },
        message: { type: Type.STRING, description: 'Message text.' },
      },
      required: ['recipient', 'message'],
    },
  },
  {
    name: 'analytics_report',
    description: 'Fetch analytics, traffic, metrics, or performance reports.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        property: { type: Type.STRING, description: 'Analytics property or account.' },
        dateRange: { type: Type.STRING, description: 'Date range.' },
        metrics: { type: Type.STRING, description: 'Requested metrics.' },
      },
      required: [],
    },
  },
  {
    name: 'workspace_search',
    description: 'Search across connected workspace data, including mail, files, documents, tasks, calendar, and contacts.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search query.' },
        sources: { type: Type.STRING, description: 'Comma-separated sources to search.' },
      },
      required: ['query'],
    },
  },
];

function makeDownloadFile(result: any, filenameBase: string) {
  const json = JSON.stringify(result, null, 2);
  const data = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  const safe = filenameBase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tool-result';

  return {
    downloadData: data,
    downloadFilename: `${safe}-${Date.now()}.json`,
  };
}

function OneLineStreamingTranscript({
  text,
  role,
  name,
}: {
  text: string;
  role: 'user' | 'model';
  name: string;
}) {
  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean), [text]);
  const [activeWord, setActiveWord] = useState(0);

  useEffect(() => {
    setActiveWord(0);
    if (words.length === 0) return;

    const intervalMs = role === 'model' ? 120 : 95;

    const interval = window.setInterval(() => {
      setActiveWord(prev => {
        if (prev >= words.length - 1) {
          window.clearInterval(interval);
          return prev;
        }

        return prev + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [text, role, words.length]);

  return (
    <motion.div
      key={`${role}-${text}`}
      initial={{ opacity: 0, y: 8, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
      transition={{ duration: 0.18 }}
      className="w-full overflow-hidden px-4"
      style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-full border border-lime-300/15 bg-black/35 px-5 py-3 shadow-2xl backdrop-blur-2xl">
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] ${
            role === 'user'
              ? 'border border-sky-400/20 bg-sky-500/10 text-sky-300'
              : 'border border-lime-300/25 bg-lime-400/10 text-lime-300'
          }`}
        >
          {role === 'user' ? 'You' : name}
        </span>

        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-left text-lg font-medium leading-none tracking-tight md:text-2xl">
            {words.map((word, index) => (
              <motion.span
                key={`${word}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: index <= activeWord ? 1 : 0.22, y: 0 }}
                transition={{ duration: 0.1, delay: Math.min(index * 0.012, 0.22) }}
                className={`inline-block pr-1.5 ${
                  index <= activeWord
                    ? role === 'user'
                      ? 'text-sky-100'
                      : 'text-lime-50'
                    : 'text-zinc-600'
                }`}
              >
                {word}
              </motion.span>
            ))}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function LimeVoiceOrb({
  isActive,
  isAgentSpeaking,
  agentLevel,
}: {
  isActive: boolean;
  isAgentSpeaking: boolean;
  agentLevel: number;
}) {
  const bars = [0.45, 0.8, 1, 0.7, 0.52, 0.92, 0.62, 0.78, 0.48];

  return (
    <div className="relative flex h-72 w-72 items-center justify-center">
      <AnimatePresence>
        {isActive && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{
                opacity: isAgentSpeaking ? 0.22 + agentLevel * 0.32 : 0.16,
                scale: isAgentSpeaking ? 1.08 + agentLevel * 0.28 : 1.03,
              }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(190,242,100,0.28),rgba(132,204,22,0.12),transparent_72%)] blur-3xl"
            />

            <motion.div
              animate={{
                scale: isAgentSpeaking ? 1 + agentLevel * 0.18 : 1.02,
                opacity: isAgentSpeaking ? 0.18 + agentLevel * 0.32 : 0.16,
              }}
              transition={{ duration: 0.08 }}
              className="absolute h-72 w-72 rounded-full border border-lime-300/20"
            />
          </>
        )}
      </AnimatePresence>

      <motion.div
        animate={{
          scale: isAgentSpeaking ? 1 + agentLevel * 0.045 : 1,
        }}
        transition={{ duration: 0.08 }}
        className="relative h-56 w-56 overflow-hidden rounded-full border border-lime-300/12 bg-[#070907] shadow-[0_0_120px_rgba(163,230,53,0.12)]"
      >
        <motion.div
          animate={{
            x: isAgentSpeaking ? ['-8%', '6%', '-8%'] : ['-4%', '4%', '-4%'],
            y: isAgentSpeaking ? ['6%', '-6%', '6%'] : ['2%', '-2%', '2%'],
            scale: isAgentSpeaking ? 1.04 + agentLevel * 0.22 : 1.02,
          }}
          transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-8 -top-8 h-48 w-48 rounded-full bg-lime-300/24 blur-3xl"
        />

        <motion.div
          animate={{
            x: isAgentSpeaking ? ['8%', '-5%', '8%'] : ['4%', '-3%', '4%'],
            y: isAgentSpeaking ? ['-5%', '8%', '-5%'] : ['-2%', '4%', '-2%'],
            scale: isAgentSpeaking ? 1.02 + agentLevel * 0.2 : 1.04,
          }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-8 -right-8 h-52 w-52 rounded-full bg-emerald-400/16 blur-3xl"
        />

        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_36%_28%,rgba(255,255,255,0.12),transparent_24%),radial-gradient(circle_at_50%_80%,rgba(0,0,0,0.42),transparent_46%)]" />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 items-center gap-1.5">
            {bars.map((multiplier, i) => {
              const height = isAgentSpeaking
                ? Math.max(8, agentLevel * 68 * multiplier)
                : 8;

              return (
                <motion.div
                  key={i}
                  animate={{
                    height,
                    opacity: isAgentSpeaking ? 0.28 + agentLevel * 0.72 : 0.16,
                  }}
                  transition={{ duration: 0.06 }}
                  className="w-1.5 rounded-full bg-lime-200/80 shadow-[0_0_14px_rgba(217,249,157,0.45)]"
                />
              );
            })}
          </div>
        </div>

        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
      </motion.div>
    </div>
  );
}

function StartIconMicVisualizer({
  isActive,
  connecting,
  isMuted,
  micLevel,
  onClick,
}: {
  isActive: boolean;
  connecting: boolean;
  isMuted: boolean;
  micLevel: number;
  onClick: () => void;
}) {
  const bars = [0.45, 0.72, 1, 0.78, 0.52, 0.86, 0.58];

  return (
    <button onClick={onClick} disabled={connecting} className="group relative">
      <motion.div
        animate={{
          scale: isActive ? 1 + micLevel * 0.85 : 1,
          opacity: isActive ? 0.18 + micLevel * 0.55 : 0.12,
        }}
        transition={{ duration: 0.04 }}
        className={`absolute -inset-6 rounded-full blur-2xl ${
          isMuted ? 'bg-red-500/25' : 'bg-lime-300/45'
        }`}
      />

      <motion.div
        animate={{
          boxShadow: isActive && !isMuted
            ? `0 0 ${24 + micLevel * 70}px rgba(190,242,100,${0.16 + micLevel * 0.45})`
            : '0 0 22px rgba(255,255,255,0.04)',
        }}
        transition={{ duration: 0.04 }}
        className={`relative flex h-20 w-20 items-center justify-center rounded-full border bg-[#070807] shadow-2xl transition-all ${
          isActive
            ? isMuted
              ? 'border-red-500/35'
              : 'border-lime-300/70'
            : 'border-white/10 group-hover:border-lime-300/50'
        }`}
      >
        {connecting ? (
          <Loader2 className="h-7 w-7 animate-spin text-lime-300" />
        ) : isActive ? (
          <div className="flex h-12 items-center gap-1.5">
            {bars.map((multiplier, i) => {
              const height = Math.max(7, micLevel * 54 * multiplier);

              return (
                <motion.div
                  key={i}
                  animate={{
                    height,
                    opacity: isMuted ? 0.22 : Math.max(0.34, micLevel + 0.24),
                    scaleY: isMuted ? 0.3 : 1,
                  }}
                  transition={{ duration: 0.035 }}
                  className={`w-1.5 rounded-full ${
                    isMuted
                      ? 'bg-red-500'
                      : 'bg-lime-300 shadow-[0_0_16px_rgba(190,242,100,0.9)]'
                  }`}
                />
              );
            })}
          </div>
        ) : (
          <Power className="h-8 w-8 text-lime-300 transition-colors" />
        )}
      </motion.div>
    </button>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const fontId = 'vep-roboto-font';

    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
        try {
          const userRef = ref(rtdb, 'users/' + u.uid);
          const userSnap = await get(userRef);

          if (!userSnap.exists()) {
            const initialSettings = {
              ...DEFAULT_SETTINGS,
              userName: u.displayName || DEFAULT_SETTINGS.userName,
            };

            await set(userRef, {
              displayName: u.displayName || DEFAULT_SETTINGS.userName,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              settings: initialSettings,
            });

            setSettings(initialSettings);
          } else {
            const data = userSnap.val();

            if (data.settings) {
              setSettings({
                ...DEFAULT_SETTINGS,
                ...data.settings,
              });
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

      provider.addScope('https://www.googleapis.com/auth/gmail.modify');
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/documents');
      provider.addScope('https://www.googleapis.com/auth/spreadsheets');
      provider.addScope('https://www.googleapis.com/auth/presentations');
      provider.addScope('https://www.googleapis.com/auth/youtube');
      provider.addScope('https://www.googleapis.com/auth/calendar');
      provider.addScope('https://www.googleapis.com/auth/tasks');
      provider.addScope('https://www.googleapis.com/auth/contacts.readonly');
      provider.addScope('https://www.googleapis.com/auth/forms.body');
      provider.addScope('https://www.googleapis.com/auth/chat.messages');
      provider.addScope('https://www.googleapis.com/auth/analytics.readonly');

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
        alert('Authentication error: ' + (error.message || 'Unknown error'));
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('googleAccessToken');
    signOut(auth);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020203] text-zinc-500" style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="animate-pulse text-[10px] uppercase tracking-widest">Initializing System...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#050505] p-6 text-white" style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="pointer-events-none absolute left-1/2 top-0 -ml-[400px] h-[800px] w-[800px] rounded-full bg-lime-400/5 blur-[120px]" />

        <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="group relative mb-8 h-24 w-24 rounded-[2rem] bg-gradient-to-br from-zinc-800 to-black p-[2px] shadow-2xl"
          >
            <div className="flex h-full w-full items-center justify-center rounded-[2rem] border border-white/5 bg-[#0A0A0B] transition-colors group-hover:border-lime-300/50">
              <Volume2 className="h-10 w-10 text-lime-300" />
            </div>
            <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-black bg-lime-300 shadow-lg shadow-lime-300/40">
              <Command className="h-4 w-4 text-black" />
            </div>
          </motion.div>

          <h1 className="mb-2 text-5xl font-light tracking-tight text-white">Vep</h1>

          <p className="mb-10 text-center text-lg font-light leading-relaxed text-zinc-500">
            Normal Human Live Voice
          </p>

          <div className="w-full rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-xl">
            <button
              onClick={handleLogin}
              className="h-14 w-full rounded-full bg-lime-300 text-sm font-bold uppercase tracking-widest text-black shadow-lg shadow-lime-300/20 transition-all hover:bg-lime-200 active:scale-[0.98]"
            >
              Initialize Vep Identity
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <MaximusAgent user={user} onLogout={handleLogout} initialSettings={settings} />;
}

function MaximusAgent({
  user,
  onLogout,
  initialSettings,
}: {
  user: User;
  onLogout: () => void;
  initialSettings: AgentSettings;
}) {
  const [isActive, setIsActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);
  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>('');
  const [historyMsgs, setHistoryMsgs] = useState<ChatMessage[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model'; text: string } | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [settings, setSettings] = useState<AgentSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const recognitionRef = useRef<any>(null);

  const transcriptTimeoutRef = useRef<any>(null);
  const isMutedRef = useRef(false);
  const isActiveRef = useRef(false);

  const micAnimationFrameRef = useRef<number | null>(null);
  const micVisualizerStreamRef = useRef<MediaStream | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micDataArrayRef = useRef<Uint8Array | null>(null);

  const agentLevelTimeoutRef = useRef<any>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const modelTranscriptBufferRef = useRef('');
  const userTranscriptBufferRef = useRef('');
  const lastSavedModelTranscriptRef = useRef('');
  const lastSavedUserTranscriptRef = useRef('');

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
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
    const historyRef = query(
      ref(rtdb, 'users/' + user.uid + '/messages'),
      orderByChild('timestamp'),
      limitToLast(160)
    );

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
        setHistoryContext('Previous conversation for context memory:\n' + msgs.slice(-36).join('\n'));
      } else {
        setHistoryContext('');
      }
    });

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey) aiRef.current = new GoogleGenAI({ apiKey });

    audioStreamerRef.current = new AudioStreamer();

    return () => {
      unsub();
      stopSession();
    };
  }, [user.uid]);

  const selectedVoiceMeta = useMemo(
    () => GEMINI_LIVE_VOICE_OPTIONS.find(v => v.id === settings.selectedVoice) || GEMINI_LIVE_VOICE_OPTIONS[0],
    [settings.selectedVoice]
  );

  const saveMessage = (role: 'user' | 'model', text: string, extra?: Partial<ChatMessage>) => {
    const clean = text.trim();
    if (!clean) return;

    try {
      const msgRef = push(ref(rtdb, 'users/' + user.uid + '/messages'));
      set(msgRef, {
        role,
        text: clean,
        timestamp: Date.now(),
        ...extra,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const saveModelBuffer = () => {
    const clean = modelTranscriptBufferRef.current.trim();
    if (!clean) return;
    if (clean === lastSavedModelTranscriptRef.current) return;

    lastSavedModelTranscriptRef.current = clean;
    saveMessage('model', clean);
    modelTranscriptBufferRef.current = '';
  };

  const saveUserBuffer = () => {
    const clean = userTranscriptBufferRef.current.trim();
    if (!clean) return;
    if (clean === lastSavedUserTranscriptRef.current) return;

    lastSavedUserTranscriptRef.current = clean;
    saveMessage('user', clean);
    userTranscriptBufferRef.current = '';
  };

  const updateLiveTranscript = (role: 'user' | 'model', text: string, clearDelay = 3900) => {
    const clean = text.trim();
    if (!clean) return;

    setCurrentTranscript({ role, text: clean });

    if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
    transcriptTimeoutRef.current = setTimeout(() => {
      setCurrentTranscript(null);
    }, clearDelay);
  };

  const startMicVisualizer = async () => {
    try {
      if (!micVisualizerStreamRef.current) {
        micVisualizerStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(micVisualizerStreamRef.current);

      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;

      source.connect(analyser);

      micAudioContextRef.current = audioContext;
      micAnalyserRef.current = analyser;
      micDataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!isActiveRef.current || isMutedRef.current || !micAnalyserRef.current || !micDataArrayRef.current) {
          setMicLevel(prev => prev + (0 - prev) * 0.35);
          micAnimationFrameRef.current = requestAnimationFrame(tick);
          return;
        }

        micAnalyserRef.current.getByteFrequencyData(micDataArrayRef.current);

        const values = Array.from(micDataArrayRef.current);
        const average = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
        const normalized = Math.min(1, Math.max(0, average / 95));
        const boosted = Math.pow(normalized, 0.72);

        setMicLevel(prev => prev + (boosted - prev) * 0.55);
        micAnimationFrameRef.current = requestAnimationFrame(tick);
      };

      if (micAnimationFrameRef.current) {
        cancelAnimationFrame(micAnimationFrameRef.current);
      }

      micAnimationFrameRef.current = requestAnimationFrame(tick);
    } catch (error) {
      console.error('Mic visualizer failed:', error);

      const fallbackTick = () => {
        const fallbackLevel = isActiveRef.current && !isMutedRef.current ? 0.12 : 0;
        setMicLevel(prev => prev + (fallbackLevel - prev) * 0.25);
        micAnimationFrameRef.current = requestAnimationFrame(fallbackTick);
      };

      if (micAnimationFrameRef.current) {
        cancelAnimationFrame(micAnimationFrameRef.current);
      }

      micAnimationFrameRef.current = requestAnimationFrame(fallbackTick);
    }
  };

  const stopMicVisualizer = () => {
    if (micAnimationFrameRef.current) {
      cancelAnimationFrame(micAnimationFrameRef.current);
    }

    micAnimationFrameRef.current = null;

    if (micVisualizerStreamRef.current) {
      micVisualizerStreamRef.current.getTracks().forEach(track => track.stop());
      micVisualizerStreamRef.current = null;
    }

    if (micAudioContextRef.current) {
      micAudioContextRef.current.close().catch(() => {});
      micAudioContextRef.current = null;
    }

    micAnalyserRef.current = null;
    micDataArrayRef.current = null;

    setMicLevel(0);
  };

  const sendTextToLive = (text: string) => {
    if (!sessionRef.current || typeof sessionRef.current.sendRealtimeInput !== 'function') return;
    sessionRef.current.sendRealtimeInput({ text });
  };

  const sendAudioToLive = (base64: string) => {
    if (!sessionRef.current || typeof sessionRef.current.sendRealtimeInput !== 'function') return;

    sessionRef.current.sendRealtimeInput({
      audio: {
        data: base64,
        mimeType: 'audio/pcm;rate=16000',
      },
    });
  };

  const sendVideoToLive = (base64Data: string) => {
    if (!sessionRef.current || typeof sessionRef.current.sendRealtimeInput !== 'function') return;

    sessionRef.current.sendRealtimeInput({
      video: {
        data: base64Data,
        mimeType: 'image/jpeg',
      },
    });
  };

  const executeGoogleTool = async (toolName: string, args: any) => {
    const token = localStorage.getItem('googleAccessToken');

    const baseResult = {
      toolName,
      args,
      executedAt: new Date().toISOString(),
      status: token ? 'received' : 'missing_access_token',
      note: token
        ? 'The frontend received this function call. Wire this function to your backend endpoint or direct Google API implementation to make it perform the real action.'
        : 'No Google access token is available. Ask the user to reconnect permissions.',
    };

    return baseResult;
  };

  const startSession = async () => {
    if (!aiRef.current) {
      alert('Gemini API key is missing. Make sure VITE_GEMINI_API_KEY is added in Vercel, then redeploy.');
      return;
    }

    setConnecting(true);
    modelTranscriptBufferRef.current = '';
    userTranscriptBufferRef.current = '';
    setAgentLevel(0);

    try {
      if (audioStreamerRef.current) {
        await audioStreamerRef.current.init(24000);
      }

      const systemInstruction = [
        CONSTANT_HIDDEN_SYSTEM_PROMPT,
        `User preferred name: ${settings.userName}.`,
        `Agent visible name: ${settings.agentName}.`,
        `Agent personality overlay: ${settings.personality}.`,
        BIBLE_PERSONALITY || '',
        `Selected visible voice alias: ${selectedVoiceMeta.alias}. Internal voice id: ${selectedVoiceMeta.id}. Voice vibe: ${selectedVoiceMeta.vibe}. Do not mention the internal voice id unless asked by the developer.`,
        historyContext,
      ].filter(Boolean).join('\n\n');

      const session = await aiRef.current.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: settings.selectedVoice || 'Charon',
              },
            },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: GOOGLE_SERVICE_TOOLS,
          }],
        },
        callbacks: {
          onopen: () => {
            console.log('Live session opened.');
          },

          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
              const calls = msg.toolCall.functionCalls;

              if (calls) {
                const resps = [];

                for (const c of calls) {
                  const toolName = c.name || 'unknown_tool';
                  const args = c.args as any;
                  const tid = Math.random().toString(36).substring(7);
                  const action = JSON.stringify(args || {}, null, 0);

                  setTasks(p => [...p, {
                    id: tid,
                    serviceName: toolName,
                    action,
                    status: 'processing',
                  }]);

                  try {
                    const result = await executeGoogleTool(toolName, args);
                    const download = makeDownloadFile(result, toolName);

                    setTasks(p => p.map(t => t.id === tid ? {
                      ...t,
                      status: result.status === 'missing_access_token' ? 'failed' : 'completed',
                      result: result.note,
                      ...download,
                    } : t));

                    saveMessage(
                      'model',
                      `Tool result from ${toolName}: ${result.note}`,
                      {
                        toolName,
                        toolResult: result,
                        ...download,
                      }
                    );

                    setTimeout(() => setTasks(p => p.filter(t => t.id !== tid)), 16000);

                    resps.push({
                      id: c.id,
                      name: toolName,
                      response: {
                        result,
                        downloadFilename: download.downloadFilename,
                      },
                    });
                  } catch (err: any) {
                    const result = {
                      toolName,
                      args,
                      status: 'failed',
                      error: String(err?.message || err),
                      executedAt: new Date().toISOString(),
                    };
                    const download = makeDownloadFile(result, `${toolName}-error`);

                    setTasks(p => p.map(t => t.id === tid ? {
                      ...t,
                      status: 'failed',
                      result: result.error,
                      ...download,
                    } : t));

                    saveMessage(
                      'model',
                      `Tool failed from ${toolName}: ${result.error}`,
                      {
                        toolName,
                        toolResult: result,
                        ...download,
                      }
                    );

                    resps.push({
                      id: c.id,
                      name: toolName,
                      response: result,
                    });
                  }
                }

                if (resps.length > 0 && sessionRef.current && typeof sessionRef.current.sendToolResponse === 'function') {
                  sessionRef.current.sendToolResponse({ functionResponses: resps });
                }
              }
            }

            if (msg.serverContent) {
              const serverContent: any = msg.serverContent;

              if (serverContent.interrupted) {
                audioStreamerRef.current?.stop();
                setIsAgentSpeaking(false);
                setAgentLevel(0);
                modelTranscriptBufferRef.current = '';
                return;
              }

              if (serverContent.inputTranscription?.text) {
                const inputText = serverContent.inputTranscription.text;
                userTranscriptBufferRef.current = inputText.trim();
                updateLiveTranscript('user', userTranscriptBufferRef.current, 3200);
              }

              if (serverContent.outputTranscription?.text) {
                const outputText = serverContent.outputTranscription.text;
                modelTranscriptBufferRef.current = (modelTranscriptBufferRef.current + outputText).trim();
                updateLiveTranscript('model', modelTranscriptBufferRef.current, 3900);
              }

              const parts = serverContent.modelTurn?.parts;

              if (parts) {
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    audioStreamerRef.current?.addPCM16(part.inlineData.data);

                    setIsAgentSpeaking(true);
                    setAgentLevel(prev => Math.min(1, prev + 0.38));

                    if (agentLevelTimeoutRef.current) {
                      clearTimeout(agentLevelTimeoutRef.current);
                    }

                    agentLevelTimeoutRef.current = setTimeout(() => {
                      setIsAgentSpeaking(false);
                      setAgentLevel(0);
                    }, 520);

                    setTimeout(() => {
                      setAgentLevel(prev => Math.max(0, prev * 0.58));
                    }, 120);
                  }

                  if (part.text?.trim()) {
                    modelTranscriptBufferRef.current = (modelTranscriptBufferRef.current + ' ' + part.text).trim();
                    updateLiveTranscript('model', modelTranscriptBufferRef.current, 3900);
                  }
                }
              }

              if (serverContent.turnComplete) {
                saveModelBuffer();
                saveUserBuffer();
              }
            }
          },

          onclose: () => stopSession(),

          onerror: (err: any) => {
            console.error('Live API Error:', err);
            stopSession();
          },
        },
      });

      sessionRef.current = session;

      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (SpeechRecognition && !recognitionRef.current) {
          recognitionRef.current = new SpeechRecognition();
          recognitionRef.current.continuous = true;
          recognitionRef.current.interimResults = true;

          recognitionRef.current.onresult = (event: any) => {
            let interimText = '';
            let finalText = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
              else interimText += event.results[i][0].transcript;
            }

            const visibleText = (finalText || interimText).trim();

            if (visibleText) {
              userTranscriptBufferRef.current = visibleText;
              updateLiveTranscript('user', visibleText, 3200);
            }

            if (finalText.trim()) {
              saveMessage('user', finalText.trim());
              lastSavedUserTranscriptRef.current = finalText.trim();
              userTranscriptBufferRef.current = '';
            }
          };

          recognitionRef.current.onend = () => {
            if (sessionRef.current && isActiveRef.current) {
              try {
                recognitionRef.current?.start();
              } catch (e) {}
            }
          };

          recognitionRef.current.start();
        }
      } catch (e) {}

      setIsActive(true);
      isActiveRef.current = true;

      await startMicVisualizer();

      audioRecorderRef.current = new AudioRecorder((base64) => {
        if (isMutedRef.current) return;
        sendAudioToLive(base64);
      });

      await audioRecorderRef.current.start();

      setConnecting(false);

      setTimeout(() => {
        sendTextToLive(`${settings.userName} is here. Start like you are already present in front of them. Say something like: Yes, I'm here. I'm listening.`);
      }, 500);
    } catch (err) {
      console.error('Session start failed:', err);
      setConnecting(false);
      stopSession();
    }
  };

  const toggleVideo = async () => {
    if (!isVideoEnabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: 1280, height: 720 },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setIsVideoEnabled(true);

        setTimeout(() => {
          sendTextToLive(
            `${settings.userName} just opened the camera. Notice it in a normal human way, like you looked up and saw the view. Do not say you can assist. Say something like: Oh, yeah, I see it now. Then briefly describe what you can see.`
          );
        }, 300);

        videoIntervalRef.current = setInterval(() => {
          if (!videoRef.current || !canvasRef.current || !sessionRef.current) return;

          const v = videoRef.current;
          const c = canvasRef.current;
          const ctx = c.getContext('2d');

          if (ctx && v.videoWidth > 0) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, c.width, c.height);

            const base64Url = c.toDataURL('image/jpeg', 0.55);
            const base64Data = base64Url.split(',')[1];

            if (base64Data) {
              sendVideoToLive(base64Data);
            }
          }
        }, 900);
      } catch (e) {
        console.error('Camera error:', e);
      }
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }

      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      setIsVideoEnabled(false);

      setTimeout(() => {
        sendTextToLive(`${settings.userName} closed the camera. Acknowledge it normally and keep the conversation going.`);
      }, 150);
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
          sendTextToLive(`${settings.userName} captured this photo. Look at it and respond normally, briefly, and clearly.`);
          sendVideoToLive(base64Data);
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newMode, width: 1280, height: 720 },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error('Video play err', e));
        }

        sendTextToLive(`${settings.userName} switched the camera. Notice the new view normally and describe only what stands out.`);
      } catch (e) {
        console.error('Camera switch error:', e);
      }
    }
  };

  const handleAttachFile = async (file: File) => {
    const safeName = file.name || 'attached file';
    const fileType = file.type || 'unknown';

    saveMessage('user', `[Attached file: ${safeName}]`, {
      fileName: safeName,
      fileType,
    });

    updateLiveTranscript('user', `Attached file: ${safeName}`, 3000);

    if (sessionRef.current) {
      sendTextToLive(
        `${settings.userName} attached a file named "${safeName}" with type "${fileType}". Acknowledge it normally. If you cannot actually parse the file contents from the current runtime, say that clearly and ask for readable text or backend parsing.`
      );
    }
  };

  const stopSession = () => {
    try { recognitionRef.current?.stop(); } catch (e) {}
    try { audioRecorderRef.current?.stop(); } catch (e) {}
    try { audioStreamerRef.current?.stop(); } catch (e) {}
    try { sessionRef.current?.close(); } catch (e) {}

    stopMicVisualizer();

    if (agentLevelTimeoutRef.current) {
      clearTimeout(agentLevelTimeoutRef.current);
      agentLevelTimeoutRef.current = null;
    }

    setAgentLevel(0);

    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }

    sessionRef.current = null;
    recognitionRef.current = null;
    modelTranscriptBufferRef.current = '';
    userTranscriptBufferRef.current = '';
    isActiveRef.current = false;

    setIsVideoEnabled(false);
    setIsActive(false);
    setConnecting(false);
    setIsAgentSpeaking(false);
    setCurrentTranscript(null);
  };

  const persistSettings = async () => {
    const userRef = ref(rtdb, 'users/' + user.uid);

    await update(userRef, {
      displayName: settings.userName,
      settings,
      updatedAt: serverTimestamp(),
    });

    setShowProfile(false);
  };

  return (
    <div
      className="relative flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-[#020203] text-zinc-300 selection:bg-lime-300/30"
      style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
    >
      <canvas ref={canvasRef} className="hidden" />

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleAttachFile(file);
          e.target.value = '';
        }}
      />

      <AnimatePresence>
        {isVideoEnabled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black"
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />

            <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full border border-lime-300/20 bg-black/60 px-3 py-1.5 backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-lime-300 shadow-[0_0_8px_rgba(190,242,100,0.9)]" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-lime-200">Camera Live</span>
            </div>

            <div className="pointer-events-auto absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-4">
              <button
                onClick={switchCamera}
                className="rounded-full border border-white/10 bg-black/60 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-200 backdrop-blur-xl transition hover:border-lime-300/40 hover:text-lime-200"
              >
                Flip Camera
              </button>

              <button
                onClick={capturePhoto}
                className="flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/15 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-lime-200 backdrop-blur-xl transition hover:bg-lime-300/25"
              >
                <Camera className="h-4 w-4" /> Capture
              </button>

              <button
                onClick={toggleVideo}
                className="rounded-full border border-red-500/30 bg-red-500/15 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-red-300 backdrop-blur-xl transition hover:bg-red-500/25"
              >
                Close Camera
              </button>
            </div>

            <AnimatePresence>
              {currentTranscript && (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="pointer-events-none absolute left-1/2 top-24 z-50 w-[92vw] max-w-5xl -translate-x-1/2"
                >
                  <OneLineStreamingTranscript
                    role={currentTranscript.role}
                    text={currentTranscript.text}
                    name={settings.agentName}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <header className={`z-50 flex items-center justify-between border-b border-white/5 bg-[#050505]/80 px-8 py-6 backdrop-blur-md ${isVideoEnabled ? 'pointer-events-none opacity-0' : ''}`}>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowSidebar(true)} className="-ml-2 rounded-xl border border-white/10 p-2 text-zinc-400 transition-all hover:bg-white/5 hover:text-white">
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
          {isActive && (
            <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
              isAgentSpeaking ? 'border-lime-300/50 bg-lime-300/10 text-lime-300' : 'border-sky-400/50 bg-sky-400/10 text-sky-300'
            }`}>
              {isAgentSpeaking ? 'Speaking...' : 'Listening...'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="mr-2 hidden flex-col items-end sm:flex">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Voice</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-lime-300">
              {selectedVoiceMeta.alias}
            </span>
          </div>

          <button onClick={() => setShowProfile(true)} className="h-10 w-10 overflow-hidden rounded-full border border-white/10 transition-all hover:border-lime-300/50 focus:outline-none focus:ring-2 focus:ring-lime-300/50">
            {settings.avatarUrl || user.photoURL ? (
              <img src={settings.avatarUrl || user.photoURL || ''} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-800 font-bold">{settings.userName?.[0] || 'U'}</div>
            )}
          </button>
        </div>
      </header>

      {!isVideoEnabled && (
        <main className="pointer-events-none relative z-10 flex w-full flex-1 flex-col items-center justify-start p-8 pt-12">
          <div className="pointer-events-none absolute inset-0 z-[-1] -translate-y-20 overflow-hidden">
            <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.02]" />
            <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.01]" />
            <div className="absolute bottom-0 left-1/2 top-0 w-px bg-gradient-to-b from-transparent via-lime-300/[0.04] to-transparent" />
            <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-lime-300/[0.04] to-transparent" />
          </div>

          <LimeVoiceOrb isActive={isActive} isAgentSpeaking={isAgentSpeaking} agentLevel={agentLevel} />

          <AnimatePresence>
            {currentTranscript && (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="absolute left-1/2 top-[330px] z-50 w-[92vw] max-w-5xl -translate-x-1/2"
              >
                <OneLineStreamingTranscript
                  role={currentTranscript.role}
                  text={currentTranscript.text}
                  name={settings.agentName}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pointer-events-none absolute inset-x-0 bottom-8 z-50 flex flex-col items-center justify-end">
            <div className="mb-4 w-full max-w-md space-y-2 px-6">
              <AnimatePresence>
                {tasks.map(task => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, x: -50, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
                    className="flex items-center gap-4 rounded-xl border border-l-2 border-white/5 border-l-lime-300/50 bg-[#0A0A0B]/80 p-3 shadow-2xl backdrop-blur-xl"
                  >
                    <div className="relative shrink-0">
                      {task.status === 'processing' ? (
                        <Loader2 className="h-4 w-4 animate-spin text-lime-300" />
                      ) : task.status === 'completed' ? (
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                          <Check className="h-2.5 w-2.5 text-black" strokeWidth={4} />
                        </div>
                      ) : (
                        <div className="h-4 w-4 rounded-full bg-red-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-lime-300">{task.serviceName}</span>
                        <span className="font-mono text-[8px] text-zinc-600">{task.status.toUpperCase()}</span>
                      </div>
                      <p className="truncate text-xs text-zinc-100">{task.action}</p>
                      {task.result && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-1 text-[10px] leading-tight text-zinc-400"
                        >
                          {task.result}
                        </motion.p>
                      )}
                    </div>

                    {task.downloadData && task.downloadFilename && (
                      <a
                        href={task.downloadData}
                        download={task.downloadFilename}
                        className="pointer-events-auto rounded-lg border border-lime-300/20 p-2 text-lime-200 hover:bg-lime-300/10"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="pointer-events-auto flex flex-col items-center justify-center gap-4">
              <div className="flex items-center justify-center gap-8">
                <button
                  onClick={() => setIsMuted(p => !p)}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-all ${
                    isMuted ? 'border-red-500/30 bg-red-500/10 text-red-500' : 'border-white/10 bg-[#0A0A0B] text-zinc-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>

                {!isActive ? (
                  <StartIconMicVisualizer
                    isActive={false}
                    connecting={connecting}
                    isMuted={isMuted}
                    micLevel={0}
                    onClick={startSession}
                  />
                ) : (
                  <StartIconMicVisualizer
                    isActive={true}
                    connecting={connecting}
                    isMuted={isMuted}
                    micLevel={micLevel}
                    onClick={stopSession}
                  />
                )}

                <button
                  onClick={() => toggleVideo()}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-all ${
                    isVideoEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-white/10 bg-[#0A0A0B] text-zinc-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      <AnimatePresence>
        {showSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSidebar(false)}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 top-0 z-[101] flex w-96 max-w-[88vw] flex-col border-r border-white/10 bg-[#0A0A0B] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 p-6">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-white">History</h2>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Firebase RTDB conversations</p>
                </div>
                <button onClick={() => setShowSidebar(false)} className="-mr-2 rounded-xl p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-white/10 p-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-lime-300/20 bg-lime-300/10 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-lime-200 transition hover:bg-lime-300/15"
                >
                  <Paperclip className="h-4 w-4" />
                  Attach File
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {historyMsgs.map((msg, i) => (
                  <div key={`${msg.timestamp}-${i}`} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="mb-1 text-[8px] uppercase tracking-widest text-zinc-600">{msg.role === 'user' ? settings.userName : settings.agentName}</span>
                    <div className={`max-w-[92%] rounded-2xl p-3 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'rounded-tr-sm border border-sky-400/20 bg-sky-400/10 text-sky-100'
                        : 'rounded-tl-sm border border-lime-300/10 bg-white/5 text-zinc-300'
                    }`}>
                      {msg.fileName && (
                        <div className="mb-2 flex items-center gap-2 rounded-xl bg-black/30 px-2 py-1 text-[10px] text-lime-200">
                          <Upload className="h-3 w-3" />
                          {msg.fileName}
                        </div>
                      )}

                      {msg.toolName && (
                        <div className="mb-2 flex items-center gap-2 rounded-xl bg-lime-300/10 px-2 py-1 text-[10px] text-lime-200">
                          <FileText className="h-3 w-3" />
                          Tool Output: {msg.toolName}
                        </div>
                      )}

                      {msg.text}

                      {msg.downloadData && msg.downloadFilename && (
                        <a
                          href={msg.downloadData}
                          download={msg.downloadFilename}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-lime-300/20 bg-lime-300/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-lime-200 transition hover:bg-lime-300/15"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download Result
                        </a>
                      )}
                    </div>
                  </div>
                ))}

                {historyMsgs.length === 0 && (
                  <div className="py-10 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">No History Yet</div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfile && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-[200] flex flex-col overflow-y-auto bg-[#050505]"
          >
            <div className="sticky top-0 z-10 mx-auto flex w-full max-w-2xl items-center justify-between border-b border-white/10 bg-[#050505]/80 p-6 backdrop-blur-xl">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">
                Profile
              </h2>

              <button onClick={() => setShowProfile(false)} className="rounded-xl bg-white/5 p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-6 pb-28">
              <div className="flex flex-col items-center gap-4">
                <div className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-white/10 bg-zinc-900">
                  {settings.avatarUrl || user.photoURL ? (
                    <img src={settings.avatarUrl || user.photoURL || ''} alt="Avatar" className="h-full w-full object-cover transition-opacity group-hover:opacity-50" />
                  ) : (
                    <div className="text-4xl font-bold text-zinc-700">{settings.userName?.[0] || 'U'}</div>
                  )}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="h-8 w-8 text-white drop-shadow-md" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      const reader = new FileReader();

                      reader.onload = (ev) => {
                        const img = new Image();

                        img.onload = () => {
                          const c = document.createElement('canvas');
                          c.width = 150;
                          c.height = 150;

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
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-300">Avatar Node</h3>
                  <p className="mt-1 text-[10px] text-zinc-600">Tap to re-configure</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <UserRound className="h-3.5 w-3.5" />
                    How to call you?
                  </label>
                  <input
                    type="text"
                    value={settings.userName}
                    onChange={(e) => setSettings(s => ({ ...s, userName: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-xl font-medium text-white outline-none transition-all focus:border-lime-300/50 focus:ring-1 focus:ring-lime-300/50"
                    placeholder="e.g. Master E"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <Bot className="h-3.5 w-3.5" />
                    Vep Agent Name
                  </label>
                  <input
                    type="text"
                    value={settings.agentName}
                    onChange={(e) => setSettings(s => ({ ...s, agentName: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-xl font-medium text-white outline-none transition-all focus:border-lime-300/50 focus:ring-1 focus:ring-lime-300/50"
                    placeholder="e.g. Vep"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Voice Alias</label>
                  <select
                    value={settings.selectedVoice}
                    onChange={(e) => setSettings(s => ({ ...s, selectedVoice: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-sm text-white outline-none transition-all focus:border-lime-300/50 focus:ring-1 focus:ring-lime-300/50"
                  >
                    {GEMINI_LIVE_VOICE_OPTIONS.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.alias} — {v.vibe}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] leading-relaxed text-zinc-600">
                    Display names are hero aliases. The saved voice id is used internally for Live API audio.
                  </p>
                </div>

                <div className="flex flex-1 flex-col space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Default Personality of the Agent</label>
                  <textarea
                    value={settings.personality}
                    onChange={(e) => setSettings(s => ({ ...s, personality: e.target.value }))}
                    className="min-h-[340px] w-full resize-y rounded-xl border border-white/10 bg-[#0A0A0B] p-4 font-mono text-xs leading-relaxed text-zinc-300 outline-none transition-all focus:border-lime-300/50 focus:ring-1 focus:ring-lime-300/50"
                    placeholder="Describe how the agent should behave..."
                  />
                  <p className="text-[10px] leading-relaxed text-zinc-600">
                    The constant system prompt stays hidden and is always applied behind this personality.
                  </p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 mx-auto w-full max-w-2xl border-t border-white/10 bg-[#050505]/90 p-6 backdrop-blur-xl">
              <div className="flex gap-3">
                <button
                  onClick={onLogout}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-xs font-bold uppercase tracking-widest text-red-400 transition-all hover:bg-red-500/20 active:scale-[0.98]"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>

                <button
                  onClick={persistSettings}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-lime-300 px-4 py-4 text-xs font-bold uppercase tracking-widest text-black transition-all hover:bg-lime-200 active:scale-[0.98]"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}