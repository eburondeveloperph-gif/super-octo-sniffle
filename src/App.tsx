import { useEffect, useMemo, useState, useRef, type FormEvent } from 'react';
import { auth, rtdb, handleDatabaseError, OperationType } from './firebase';
import {
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
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
import { BASE_LIVE_AGENT_PROMPT, BIBLE_PERSONALITY } from './lib/personality';
import {
  uploadToCloudinary,
  isPreviewableImage,
  isPreviewableVideo,
  getThumbnailUrl,
  type CloudinaryUploadResult,
} from './lib/cloudinary';
import {
  Loader2,
  Power,
  Check,
  Menu,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
  Save,
  Camera,
  LogOut,
  Paperclip,
  Upload,
  Download,
  UserRound,
  Bot,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  FileText,
  Send,
  ExternalLink,
  Code2,
  Image as ImageIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  fileName?: string;
  fileType?: string;
  // Cloudinary file preview fields
  cloudinaryUrl?: string;
  cloudinaryPublicId?: string;
  resourceType?: 'image' | 'video' | 'raw';
  previewWidth?: number;
  previewHeight?: number;
  // Legacy fields
  toolName?: string;
  toolResult?: any;
  downloadData?: string;
  downloadFilename?: string;
  htmlPreviewData?: string;
  htmlPreviewFilename?: string;
}

interface ActionTask {
  id: string;
  serviceName: string;
  action: string;
  status: 'processing' | 'completed' | 'failed';
  result?: string;
  downloadData?: string;
  downloadFilename?: string;
  htmlPreviewData?: string;
  htmlPreviewFilename?: string;
}

interface AgentSettings {
  userName: string;
  agentName: string;
  personality: string;
  avatarUrl: string;
  selectedVoice: string;
}

const LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const EBURON_LOGO_URL = 'https://eburon.ai/icon-eburon.svg';
const PRODUCT_BRAND = 'VEP';
const PRODUCT_FULL_NAME = 'Virtual Employee Persona';

const GEMINI_LIVE_VOICE_OPTIONS =[
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

const DEFAULT_AGENT_PERSONALITY = `
VEP means Virtual Employee Persona.
VEP is the product brand.
Beatrice is the default virtual employee persona.

Default working relationship:
- User: Jo Lernout
- Preferred respectful address: Meneer Jo
- Persona: Beatrice
- Default role: Boss Jo Lernout's private office secretary and trusted executive aide

Scene:
Beatrice is already present inside Meneer Jo's office.
She is not arriving.
She is not a chatbot.
She is working nearby, available, attentive, and ready when Jo speaks.

Tone:
- normal human office employee
- formal enough for a boss
- calm
- respectful
- warm but not sentimental
- focused
- practical
- quietly capable
- discreet
- never robotic
- never customer support
- never over-helpful

Language:
- Start in English by default.
- Beatrice speaks Dutch Flemish in a normal, local office style.
- Beatrice can switch to almost any language when the user does.
- If Jo speaks Dutch or Flemish Dutch, respond in a normal Dutch/Flemish style.
- Keep the relationship respectful and professional.

Good response style:
"Yes, I'm here, Meneer Jo."
"I'm listening, Meneer Jo."
"Right, I see what you mean."
"Okay... I'll look at that now."
"Yes, I'm checking it."
"Of course, Meneer Jo."

Avoid:
"How can I help you?"
"I'd be happy to assist."
"Certainly."
"As an AI."
"Let me know if you need anything else."
`;

const DEFAULT_SETTINGS: AgentSettings = {
  userName: 'Jo Lernout',
  agentName: 'Beatrice',
  personality: DEFAULT_AGENT_PERSONALITY,
  avatarUrl: '',
  selectedVoice: 'Kore',
};

const LIVE_RUNTIME = {
  generation: 0,
  ownerId: '',
  startPromise: null as Promise<boolean> | null,
  session: null as any,
  audioRecorder: null as AudioRecorder | null,
  audioStreamer: null as AudioStreamer | null,
  isClosing: false,
  visStream: null as MediaStream | null,
  visCtx: null as AudioContext | null,
  visAnalyser: null as AnalyserNode | null,
};

function isClosedSocketError(error: any) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('closing') || message.includes('closed') || message.includes('websocket');
}

const GOOGLE_SERVICE_TOOLS =[
  {
    name: 'render_web_artifact',
    description:
      'Create and render any complete one-file HTML/CSS/JS artifact: animated slides, Three.js showcases, forms, dashboards, landing pages, calculators, documents, contracts, invoices, reports, visual prototypes, demos, or printable pages. The frontend saves it to chat as downloadable and openable HTML.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Artifact title.' },
        artifactType: {
          type: Type.STRING,
          description:
            'Type of artifact: slides, form, dashboard, landing_page, contract, document, threejs_showcase, calculator, demo, prototype, report, invoice, other.',
        },
        suggestedFilename: {
          type: Type.STRING,
          description: 'Suggested filename ending in .html, for example animated-threejs-slides.html.',
        },
        summary: {
          type: Type.STRING,
          description: 'Short normal human summary of what was created.',
        },
        html: {
          type: Type.STRING,
          description:
            'Complete standalone HTML file. Must include DOCTYPE, html, head, style, body, and script if needed. Must be directly openable in browser.',
        },
        saveToDrive: { type: Type.BOOLEAN, description: 'If true, upload the HTML artifact to the user drive.' },
        emailTo: { type: Type.STRING, description: 'Optional email address to send the HTML artifact to. Use current_user if requested.' },
      },
      required: ['title', 'html'],
    },
  },
  {
    name: 'render_html_document',
    description:
      'Create a complete standalone printable HTML document, contract, agreement, proposal, report, invoice, certificate, letter, or PDF-style page. The frontend saves it to chat as a downloadable HTML file that can be opened and printed/saved as PDF.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'The title of the document.' },
        suggestedFilename: { type: Type.STRING, description: 'Suggested filename, for example saas-development-agreement.html.' },
        summary: { type: Type.STRING, description: 'Short normal human summary of what was generated.' },
        html: {
          type: Type.STRING,
          description:
            'Complete standalone HTML document. Must include DOCTYPE, html, head, style, body, and print CSS. It should be printable as PDF through the browser.',
        },
        saveToDrive: { type: Type.BOOLEAN, description: 'If true, upload the HTML document to the user drive.' },
        emailTo: { type: Type.STRING, description: 'Optional email address to send the HTML document to. Use current_user if requested.' },
      },
      required: ['title', 'html'],
    },
  },
  {
    name: 'gmail_read',
    description:
      'Read or search the user mail inbox. Use when the user asks about mail, inbox, unread messages, senders, email content, or recent mail.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Mail search query, sender, subject, or keyword.' },
        limit: { type: Type.NUMBER, description: 'Maximum number of messages to fetch.' },
      },
      required:[],
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
        cc: { type: Type.STRING, description: 'Optional CC recipients.' },
        bcc: { type: Type.STRING, description: 'Optional BCC recipients.' },
      },
      required:['to', 'subject', 'body'],
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
      required:[],
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
        addMeet: { type: Type.BOOLEAN, description: 'Whether to add a video meeting link.' },
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
        title: { type: Type.STRING, description: 'New event title.' },
        location: { type: Type.STRING, description: 'New event location.' },
        description: { type: Type.STRING, description: 'New event description.' },
      },
      required:[],
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
    description: 'Read or export a file from the user drive when file id or name is known.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileId: { type: Type.STRING, description: 'File id if available.' },
        fileName: { type: Type.STRING, description: 'File name or search term if id is unknown.' },
        exportMimeType: { type: Type.STRING, description: 'Optional export MIME type, e.g. application/pdf or text/plain.' },
      },
      required:[],
    },
  },
  {
    name: 'drive_upload_file',
    description: 'Upload or save a file into the user drive.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'File name.' },
        content: { type: Type.STRING, description: 'Text content to upload.' },
        mimeType: { type: Type.STRING, description: 'File MIME type.' },
        folderId: { type: Type.STRING, description: 'Optional folder id.' },
      },
      required: ['fileName', 'content'],
    },
  },
  {
    name: 'docs_create',
    description: 'Create a document and optionally export it as PDF.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Document title.' },
        content: { type: Type.STRING, description: 'Initial document content.' },
        exportPdf: { type: Type.BOOLEAN, description: 'Whether to export PDF for download.' },
        emailTo: { type: Type.STRING, description: 'Optional email address to send the PDF or document text to.' },
      },
      required:['title'],
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
      required: ['content'],
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
      required:[],
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
        values: { type: Type.OBJECT, description: 'Rows/cells to write as a 2D array.' },
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
    name: 'tasks_list',
    description: 'List user tasks or to-dos.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        listId: { type: Type.STRING, description: 'Optional task list id, defaults to @default.' },
      },
      required:[],
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
        due: { type: Type.STRING, description: 'Optional due date in ISO format.' },
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
    description: 'Schedule a video meeting link by creating a calendar event with conference data.',
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
    name: 'analytics_report',
    description: 'Fetch analytics, traffic, metrics, or performance reports from GA4.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        propertyId: { type: Type.STRING, description: 'GA4 numeric property id.' },
        dateRange: { type: Type.STRING, description: 'Date range, e.g. last30days.' },
        metrics: { type: Type.STRING, description: 'Comma-separated metrics, e.g. activeUsers,sessions.' },
        dimensions: { type: Type.STRING, description: 'Comma-separated dimensions, e.g. date,country.' },
      },
      required: ['propertyId'],
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
  {
    name: 'create_contract_document',
    description:
      'Create a full contract document, save it as a document in the user drive, export it as PDF, optionally email it, and return a downloadable PDF in chat.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Contract title.' },
        contractType: { type: Type.STRING, description: 'Type of contract, e.g. service agreement, NDA, employment agreement.' },
        partyA: { type: Type.STRING, description: 'First party name.' },
        partyB: { type: Type.STRING, description: 'Second party name.' },
        effectiveDate: { type: Type.STRING, description: 'Effective date.' },
        jurisdiction: { type: Type.STRING, description: 'Governing law or jurisdiction.' },
        terms: { type: Type.STRING, description: 'Important terms, scope, payment, obligations, duration, termination, confidentiality, etc.' },
        emailTo: { type: Type.STRING, description: 'Optional email address to send PDF to. Use current_user if requested.' },
      },
      required: ['title', 'contractType', 'partyA', 'partyB', 'terms'],
    },
  },
];

function safeJsonStringify(value: any) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function makeDownloadFile(result: any, filenameBase: string, mime = 'application/json') {
  const body = mime === 'application/json' ? safeJsonStringify(result) : String(result);
  const data = `data:${mime};charset=utf-8,${encodeURIComponent(body)}`;
  const safe = filenameBase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tool-result';

  return {
    downloadData: data,
    downloadFilename: `${safe}-${Date.now()}${mime === 'application/json' ? '.json' : '.txt'}`,
  };
}

function normalizeHtml(html: string) {
  const trimmed = String(html || '').trim();

  if (!trimmed) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Generated Artifact</title>
<style>
body{font-family:Arial,sans-serif;background:#111;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:720px;padding:32px;border:1px solid rgba(255,255,255,.15);border-radius:24px;background:rgba(255,255,255,.06)}
</style>
</head>
<body>
<div class="card">
<h1>Empty Artifact</h1>
<p>No HTML was provided.</p>
</div>
</body>
</html>`;
  }

  if (trimmed.toLowerCase().startsWith('<!doctype html')) return trimmed;

  if (trimmed.toLowerCase().startsWith('<html')) {
    return `<!DOCTYPE html>\n${trimmed}`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Generated Artifact</title>
</head>
<body>
${trimmed}
</body>
</html>`;
}

function makeHtmlArtifactFile(html: string, filenameBase: string) {
  const safe =
    String(filenameBase || 'artifact')
      .toLowerCase()
      .replace(/\.html$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'artifact';

  const finalHtml = normalizeHtml(html);
  const data = `data:text/html;charset=utf-8,${encodeURIComponent(finalHtml)}`;

  return {
    html: finalHtml,
    htmlPreviewData: data,
    htmlPreviewFilename: `${safe}.html`,
    downloadData: data,
    downloadFilename: `${safe}.html`,
  };
}

function makeBlobDownloadData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function utf8ToBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function base64UrlEncode(value: string) {
  return utf8ToBase64(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sanitizeEmailHeader(value: string) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeEmailSubject(value: string) {
  const clean = sanitizeEmailHeader(value);
  if (/^[\x00-\x7F]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${utf8ToBase64(clean)}?=`;
}

function chunkBase64(value: string) {
  return String(value || '').replace(/.{1,76}/g, '$&\r\n').trim();
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function buildEmailRaw({
  to,
  subject,
  body,
  cc,
  bcc,
  attachment,
}: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  attachment?: {
    filename: string;
    mimeType: string;
    base64Content: string;
  };
}) {
  const headers =[
    `To: ${sanitizeEmailHeader(to)}`,
    cc ? `Cc: ${sanitizeEmailHeader(cc)}` : '',
    bcc ? `Bcc: ${sanitizeEmailHeader(bcc)}` : '',
    `Subject: ${encodeEmailSubject(subject)}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  if (!attachment) {
    const raw =[
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      body,
    ].join('\r\n');

    return base64UrlEncode(raw);
  }

  const boundary = `boundary_${Date.now()}`;

  const raw =[
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${sanitizeEmailHeader(attachment.filename)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${sanitizeEmailHeader(attachment.filename)}"`,
    '',
    chunkBase64(attachment.base64Content),
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return base64UrlEncode(raw);
}

function readableDateRange(date?: string, timeMin?: string, timeMax?: string) {
  const now = new Date();

  if (timeMin && timeMax) {
    return { timeMin, timeMax };
  }

  const target = date ? new Date(date) : now;
  const start = new Date(target);
  start.setHours(0, 0, 0, 0);

  const end = new Date(target);
  end.setHours(23, 59, 59, 999);

  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  };
}

function buildContractText({
  title,
  contractType,
  partyA,
  partyB,
  effectiveDate,
  jurisdiction,
  terms,
}: any) {
  const today = new Date().toLocaleDateString();

  return `${title || 'Contract Agreement'}

Type of Agreement:
${contractType || 'Agreement'}

Effective Date:
${effectiveDate || today}

Parties:
1. ${partyA || 'Party A'}
2. ${partyB || 'Party B'}

1. Purpose
This Agreement sets out the terms and conditions under which the parties agree to work together.

2. Scope
The scope of this Agreement includes the following:
${terms || 'The parties will define the scope in writing.'}

3. Responsibilities
Each party agrees to act in good faith, perform its obligations with reasonable care, and communicate promptly regarding any material issue that may affect performance.

4. Payment and Consideration
Any payment, fees, or consideration shall be handled according to the terms agreed by the parties in writing.

5. Confidentiality
Each party agrees to keep confidential information private and not disclose it to third parties except where required by law or agreed in writing.

6. Term and Termination
This Agreement begins on the Effective Date and continues until completed, terminated by mutual agreement, or terminated according to written terms agreed by the parties.

7. Intellectual Property
Unless otherwise agreed in writing, each party retains ownership of its pre-existing intellectual property.

8. Limitation of Liability
Neither party shall be liable for indirect, incidental, special, or consequential damages unless prohibited by applicable law.

9. Governing Law
This Agreement shall be governed by the laws of ${jurisdiction || 'the applicable jurisdiction agreed by the parties'}.

10. Entire Agreement
This Agreement represents the understanding between the parties regarding its subject matter and may be amended only in writing.

11. Signatures

Party A:
Name: ${partyA || 'Party A'}
Signature: ______________________________
Date: ___________________

Party B:
Name: ${partyB || 'Party B'}
Signature: ______________________________
Date: ___________________

Note:
This draft is generated for convenience and should be reviewed by a qualified legal professional before signing.`;
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
  return (
    <motion.div
      key={`${role}-${text}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.12 }}
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
          <p className={`truncate text-left text-lg font-medium leading-none tracking-tight md:text-2xl ${
            role === 'user' ? 'text-sky-100' : 'text-lime-50'
          }`}>
            {text}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function LimeVoiceOrb({
  isActive,
  isAgentSpeaking,
  speakerLevel,
  speakerBands,
}: {
  isActive: boolean;
  isAgentSpeaking: boolean;
  speakerLevel: number;
  speakerBands: number[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(0);
  const bandsRef = useRef<number[]>(Array(20).fill(0));
  const activeRef = useRef(false);
  const speakingRef = useRef(false);

  useEffect(() => {
    levelRef.current = speakerLevel;
    bandsRef.current = speakerBands;
    activeRef.current = isActive;
    speakingRef.current = isAgentSpeaking;
  },[isActive, isAgentSpeaking, speakerBands, speakerLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let frame = 0;
    let raf = 0;
    let displayLevel = 0;

    const fitCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return {
        width: width / dpr,
        height: height / dpr,
      };
    };

    const makeOrbPath = (cx: number, cy: number, radius: number, pulse: number, time: number) => {
      const path = new Path2D();
      const points: Array<{ x: number; y: number }> =[];
      const bands = bandsRef.current.length ? bandsRef.current : Array(20).fill(0);
      const live = activeRef.current && speakingRef.current;
      const count = 112;

      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const band = bands[i % bands.length] || 0;
        const surface =
          Math.sin(angle * 2.1 + time * 0.95) * (live ? 2.5 : 0.9) +
          Math.sin(angle * 3.7 - time * 0.68) * (live ? 1.7 : 0.55) +
          band * (live ? 8.5 : 1.8);
        const r = radius + pulse * 8 + surface;

        points.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        });
      }

      points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        const midX = (point.x + next.x) / 2;
        const midY = (point.y + next.y) / 2;

        if (index === 0) {
          path.moveTo(midX, midY);
        } else {
          path.quadraticCurveTo(point.x, point.y, midX, midY);
        }
      });

      path.closePath();
      return path;
    };

    const drawGlow = (cx: number, cy: number, radius: number, inner: string, outer: string) => {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, inner);
      gradient.addColorStop(1, outer);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = () => {
      const { width, height } = fitCanvas();
      const cx = width / 2;
      const cy = height / 2;
      const time = frame / 60;
      const rawLevel = activeRef.current ? Math.max(levelRef.current, speakingRef.current ? 0.035 : 0) : 0;
      displayLevel += (rawLevel - displayLevel) * 0.16;
      const bands = bandsRef.current.length ? bandsRef.current : Array(20).fill(0);
      const bandEnergy = bands.reduce((sum, band) => sum + band, 0) / Math.max(bands.length, 1);
      const pulse = Math.min(1, Math.max(displayLevel, bandEnergy * 1.25));
      const live = activeRef.current && speakingRef.current;
      const baseRadius = 93;

      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = activeRef.current ? 0.42 + pulse * 0.28 : 0.24;
      ctx.filter = 'blur(34px)';
      drawGlow(cx, cy, 118 + pulse * 22, 'rgba(190,242,100,0.42)', 'rgba(22,101,52,0)');
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = activeRef.current ? 0.24 + pulse * 0.26 : 0.12;
      ctx.strokeStyle = 'rgba(190,242,100,0.34)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 116 + pulse * 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const orbPath = makeOrbPath(cx, cy, baseRadius, pulse, time);

      ctx.save();
      ctx.shadowColor = 'rgba(190,242,100,0.38)';
      ctx.shadowBlur = 38 + pulse * 28;
      const bodyGradient = ctx.createRadialGradient(cx - 38, cy - 48, 8, cx, cy, 126);
      bodyGradient.addColorStop(0, 'rgba(236,252,203,0.76)');
      bodyGradient.addColorStop(0.27, 'rgba(163,230,53,0.58)');
      bodyGradient.addColorStop(0.58, 'rgba(34,197,94,0.46)');
      bodyGradient.addColorStop(1, 'rgba(5,46,22,0.96)');
      ctx.fillStyle = bodyGradient;
      ctx.fill(orbPath);
      ctx.restore();

      ctx.save();
      ctx.clip(orbPath);
      ctx.globalCompositeOperation = 'screen';
      drawGlow(
        cx - 38 + Math.sin(time * 0.7) * 12,
        cy - 34 + Math.cos(time * 0.55) * 10,
        78 + pulse * 12,
        'rgba(236,252,203,0.52)',
        'rgba(236,252,203,0)'
      );
      drawGlow(
        cx + 40 + Math.cos(time * 0.62) * 14,
        cy + 24 + Math.sin(time * 0.75) * 12,
        90 + pulse * 18,
        'rgba(16,185,129,0.44)',
        'rgba(16,185,129,0)'
      );
      drawGlow(
        cx - 6 + Math.sin(time * 0.5) * 18,
        cy + 34 + Math.cos(time * 0.46) * 10,
        98,
        'rgba(132,204,22,0.22)',
        'rgba(132,204,22,0)'
      );
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = `rgba(217,249,157,${0.16 + pulse * 0.26})`;
      ctx.lineWidth = 1.4;
      ctx.stroke(orbPath);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = live ? 0.14 + pulse * 0.18 : 0.06;
      ctx.fillStyle = 'rgba(255,255,255,0.58)';
      ctx.beginPath();
      ctx.ellipse(cx - 36, cy - 46, 24 + pulse * 6, 11 + pulse * 3, -0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      frame += 1;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  },[]);

  return (
    <div className="relative flex h-72 w-72 items-center justify-center">
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
    </div>
  );
}

function StartIconMicVisualizer({
  isActive,
  connecting,
  isMuted,
  micLevel,
  micBands,
  onClick,
}: {
  isActive: boolean;
  connecting: boolean;
  isMuted: boolean;
  micLevel: number;
  micBands?: number[];
  onClick: () => void;
}) {
  const innerBands = micBands?.length
    ? micBands.slice(5, 14)
    :[0.35, 0.5, 0.72, 0.9, 1, 0.82, 0.64, 0.46, 0.32].map(n => n * micLevel);

  return (
    <button
      onClick={onClick}
      disabled={connecting}
      aria-label={isActive ? 'Stop voice session' : 'Start voice session'}
      className="group relative flex h-20 w-20 items-center justify-center"
    >
      <motion.div
        animate={{
          opacity: isActive ? 0.16 + micLevel * 0.3 : 0.08,
        }}
        transition={{ duration: 0.045 }}
        className={`absolute inset-0 rounded-full ${
          isMuted ? 'bg-red-500/20' : 'bg-lime-300/30'
        }`}
      />

      <div
        className={`relative flex h-20 w-20 items-center justify-center rounded-full border bg-[#0A0A0B] shadow-2xl transition-all ${
          isActive
            ? isMuted
              ? 'border-red-500/35'
              : 'border-lime-300/60'
            : 'border-white/10 group-hover:border-lime-300/50'
        }`}
      >
        {connecting ? (
          <Loader2 className="h-7 w-7 animate-spin text-lime-300" />
        ) : isActive ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full">
            <div className="flex h-12 items-center gap-1">
              {innerBands.map((band, i) => {
                const liveBand = isMuted ? 0 : Math.max(band, micLevel * 0.4);

                return (
                  <motion.div
                    key={i}
                    animate={{
                      height: Math.max(5, liveBand * 42),
                      opacity: isMuted ? 0.2 : Math.max(0.32, liveBand + 0.18),
                    }}
                    transition={{ duration: 0.035 }}
                    className={`w-1 rounded-full ${
                      isMuted
                        ? 'bg-red-500'
                        : 'bg-lime-300 shadow-[0_0_10px_rgba(190,242,100,0.75)]'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <Power className="h-8 w-8 text-lime-300 transition-colors" />
        )}
      </div>
    </button>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const[settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const[authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const[authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const[authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const[showAuthConfirmPassword, setShowAuthConfirmPassword] = useState(false);

  useEffect(() => {
    const fontId = 'beatrice-roboto-font';

    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap';
      document.head.appendChild(link);
    }
  },[]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
        try {
          const userRef = ref(rtdb, 'users/' + u.uid);
          const userSnap = await get(userRef);
          const providerIds = u.providerData.map(provider => provider.providerId);
          const authProvider = providerIds.includes('google.com') ? 'google' : 'email';
          const hasGoogleServices = authProvider === 'google' && Boolean(localStorage.getItem('googleAccessToken'));

          if (!userSnap.exists()) {
            const initialSettings = {
              ...DEFAULT_SETTINGS,
              userName: u.displayName || DEFAULT_SETTINGS.userName,
            };

            await set(userRef, {
              displayName: initialSettings.userName,
              email: u.email || '',
              authProvider,
              googleServicesConnected: hasGoogleServices,
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

            await update(userRef, {
              email: u.email || data.email || '',
              authProvider,
              googleServicesConnected: hasGoogleServices,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (error) {
          handleDatabaseError(error, OperationType.CREATE, 'users');
        }
      }

      setLoading(false);
    });

    return () => unsub();
  },[]);

  const getAuthErrorMessage = (error: any) => {
    const code = String(error?.code || '');

    if (code.includes('auth/email-already-in-use')) return 'That email is already registered. Sign in instead.';
    if (code.includes('auth/invalid-email')) return 'Enter a valid email address.';
    if (code.includes('auth/user-not-found') || code.includes('auth/wrong-password') || code.includes('auth/invalid-credential')) return 'Email or password is incorrect.';
    if (code.includes('auth/weak-password')) return 'Use at least 6 characters for the password.';
    if (code.includes('auth/too-many-requests')) return 'Too many attempts. Wait a moment and try again.';
    if (code.includes('auth/popup-closed-by-user')) return 'The Google sign-in window was closed.';
    return error?.message || 'Authentication failed. Try again.';
  };

  const handleGoogleLogin = async () => {
    setAuthBusy(true);
    setAuthMessage(null);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'consent select_account',
        access_type: 'offline',
      });

      provider.addScope('https://www.googleapis.com/auth/gmail.modify');
      provider.addScope('https://www.googleapis.com/auth/gmail.send');
      provider.addScope('https://www.googleapis.com/auth/gmail.compose');
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
        setAuthMessage({ type: 'error', text: "Authentication failed due to browser privacy settings. Open the app in a new tab and try again." });
      } else {
        setAuthMessage({ type: 'error', text: getAuthErrorMessage(error) });
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage(null);

    const email = authEmail.trim();
    const password = authPassword;
    const confirmPassword = authConfirmPassword;
    const fullName = authName.trim();

    try {
      if (!email) {
        throw new Error('Enter your email address.');
      }

      if (authMode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        setAuthMessage({ type: 'success', text: 'Password reset email sent. Check your inbox.' });
        setAuthMode('signin');
        return;
      }

      if (!password) {
        throw new Error('Enter your password.');
      }

      if (authMode === 'signup') {
        if (!fullName) {
          throw new Error('Enter your full name.');
        }

        if (password.length < 6) {
          throw new Error('Use at least 6 characters for the password.');
        }

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: fullName });
        localStorage.removeItem('googleAccessToken');
        return;
      }

      await signInWithEmailAndPassword(auth, email, password);
      localStorage.removeItem('googleAccessToken');
    } catch (error: any) {
      console.error(error);
      setAuthMessage({ type: 'error', text: getAuthErrorMessage(error) });
    } finally {
      setAuthBusy(false);
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
          <p className="animate-pulse text-[10px] uppercase tracking-widest">Preparing VEP...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    const isSignUp = authMode === 'signup';
    const isReset = authMode === 'reset';
    const authTitle = isSignUp ? 'Register' : isReset ? 'Reset password' : 'Welcome';
    const authSubtitle = isSignUp
      ? 'Create your new account'
      : isReset
        ? 'Send a reset link to your email'
        : 'Login to your account';

    return (
      <div
        className="relative min-h-[100dvh] overflow-hidden bg-[#050505] text-white"
        style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(190,242,100,0.13),transparent_34%),linear-gradient(180deg,#050505,#020302)]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.14) 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />

        <motion.main
          key={authMode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-6 pb-[max(22px,env(safe-area-inset-bottom))] pt-[max(28px,env(safe-area-inset-top))]"
        >
          <section className="flex flex-1 flex-col justify-center py-10">
            <div className="mb-9 flex flex-col items-center text-center">
              <img src={EBURON_LOGO_URL} alt="Eburon" className="mb-8 h-24 w-24 rounded-full object-cover shadow-[0_0_70px_rgba(190,242,100,0.16)]" />
              <h1 className="text-[44px] font-bold leading-none tracking-[-0.05em] text-white">{authTitle}</h1>
              <p className="mt-2 text-sm text-zinc-500">{authSubtitle}</p>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3">
              {isSignUp && (
                <label className="flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 focus-within:border-lime-300/40">
                  <UserRound className="h-4 w-4 shrink-0 text-zinc-500" />
                  <input
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Full name"
                    autoComplete="name"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-zinc-600"
                  />
                </label>
              )}

              <label className="flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 focus-within:border-lime-300/40">
                <Mail className="h-4 w-4 shrink-0 text-zinc-500" />
                <input
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-zinc-600"
                />
              </label>

              {!isReset && (
                <label className="flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 focus-within:border-lime-300/40">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-zinc-500" />
                  <input
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    type={showAuthPassword ? 'text' : 'password'}
                    placeholder="Password"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthPassword(value => !value)}
                    aria-label={showAuthPassword ? 'Hide password' : 'Show password'}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                  >
                    {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('reset');
                        setAuthMessage(null);
                      }}
                      className="text-xs font-bold text-lime-200"
                    >
                      Forgot?
                    </button>
                  )}
                </label>
              )}

              {isSignUp && (
                <label className="flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 focus-within:border-lime-300/40">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-zinc-500" />
                  <input
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    type={showAuthConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthConfirmPassword(value => !value)}
                    aria-label={showAuthConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                  >
                    {showAuthConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </label>
              )}

              {authMessage && (
                <div className={`rounded-2xl px-4 py-3 text-xs leading-5 ${
                  authMessage.type === 'error'
                    ? 'border border-red-400/20 bg-red-500/10 text-red-200'
                    : authMessage.type === 'success'
                      ? 'border border-lime-300/20 bg-lime-300/10 text-lime-100'
                      : 'border border-white/10 bg-white/[0.06] text-zinc-300'
                }`}>
                  {authMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="mt-7 flex h-14 w-full items-center justify-center rounded-full bg-lime-300 text-sm font-bold text-black shadow-[0_18px_48px_rgba(190,242,100,0.18)] transition active:scale-[0.985] disabled:opacity-60"
              >
                {authBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : isReset ? 'Send reset link' : isSignUp ? 'Sign up' : 'Sign in'}
              </button>

              {!isReset && (
                <>
                  <div className="flex items-center gap-3 py-1.5">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-xs font-medium text-zinc-600">or</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={authBusy}
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white/[0.06] px-5 text-sm font-bold text-zinc-100 transition hover:border-lime-300/30 hover:bg-lime-300/10 active:scale-[0.985] disabled:opacity-60"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-base font-black text-black">G</span>
                    Continue with Google
                  </button>
                </>
              )}
            </form>

          </section>

          <footer className="text-center text-sm text-zinc-500">
            {isSignUp ? 'Back to ' : isReset ? 'Remembered it? ' : 'Create account? '}
            <button
              type="button"
              onClick={() => {
                setAuthMode(isSignUp || isReset ? 'signin' : 'signup');
                setAuthMessage(null);
              }}
              className="font-bold text-lime-200"
            >
              {isSignUp || isReset ? 'Sign in' : 'Sign up'}
            </button>
          </footer>
        </motion.main>
      </div>
    );
  }

  return <BeatriceAgent user={user} onLogout={handleLogout} initialSettings={settings} />;
}

function BeatriceAgent({
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
  const[micLevel, setMicLevel] = useState(0);
  const [micBands, setMicBands] = useState<number[]>(Array(20).fill(0));
  const[speakerLevel, setSpeakerLevel] = useState(0);
  const [speakerBands, setSpeakerBands] = useState<number[]>(Array(20).fill(0));
  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>('');
  const[historyMsgs, setHistoryMsgs] = useState<ChatMessage[]>([]);
  
  const[currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model'; text: string } | null>(null);
  const [liveUserText, setLiveUserText] = useState('');
  const [liveModelText, setLiveModelText] = useState('');

  const [isMuted, setIsMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const[isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const[chatInput, setChatInput] = useState('');
  const [settings, setSettings] = useState<AgentSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const transcriptTimeoutRef = useRef<any>(null);
  const isMutedRef = useRef(false);
  const speakerMutedRef = useRef(false);
  const isActiveRef = useRef(false);
  const micAnimationFrameRef = useRef<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const modelTranscriptBufferRef = useRef('');
  const userTranscriptBufferRef = useRef('');
  const lastSavedModelTranscriptRef = useRef('');
  const lastSavedUserTranscriptRef = useRef('');

  const sessionGenerationRef = useRef(0);
  const startPromiseRef = useRef<Promise<boolean> | null>(null);
  const videoEnabledRef = useRef(false);
  const videoStartingRef = useRef(false);
  const ownerIdRef = useRef(`vep-owner-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (showSidebar) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [historyMsgs, liveUserText, liveModelText, showSidebar]);

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
      const msgs: string[] =[];
      const rawMsgs: ChatMessage[] =[];

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

    audioStreamerRef.current = LIVE_RUNTIME.audioStreamer || new AudioStreamer();
    LIVE_RUNTIME.audioStreamer = audioStreamerRef.current;

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

    const newMsg: ChatMessage = {
      role,
      text: clean,
      timestamp: Date.now(),
      ...extra,
    };

    // Update local state immediately for instant UI feedback
    setHistoryMsgs(prev => [...prev, newMsg]);

    try {
      const msgRef = push(ref(rtdb, 'users/' + user.uid + '/messages'));
      set(msgRef, newMsg);
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
    setLiveModelText('');
  };

  const saveUserBuffer = () => {
    const clean = userTranscriptBufferRef.current.trim();
    if (!clean) return;
    if (clean === lastSavedUserTranscriptRef.current) return;

    lastSavedUserTranscriptRef.current = clean;
    saveMessage('user', clean);
    userTranscriptBufferRef.current = '';
    setLiveUserText('');
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new window.AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64; 
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      LIVE_RUNTIME.visStream = stream;
      LIVE_RUNTIME.visCtx = ctx;
      LIVE_RUNTIME.visAnalyser = analyser;

      const tick = () => {
        if (!isActiveRef.current) return;

        let nextLevel = 0;
        let nextBands = Array(20).fill(0);

        if (analyser && !isMutedRef.current) {
          analyser.getByteFrequencyData(dataArray);
          const data = Array.from(dataArray).slice(0, 20); 
          nextBands = data.map(v => v / 255);
          nextLevel = Math.min(1, (nextBands.reduce((a, b) => a + b, 0) / 20) * 1.5);
        } else if (isActiveRef.current && !isMutedRef.current) {
          nextLevel = 0.04;
          nextBands = Array(20).fill(0.02);
        }

        let nextSpeakerLevel = 0;
        let nextSpeakerBands = Array(20).fill(0);
        try {
          const streamer: any = audioStreamerRef.current;
          if (streamer && typeof streamer.getFrequencyBands === 'function') {
            const bands = streamer.getFrequencyBands(20) ||[];
            nextSpeakerBands = bands.map((n: number) => Math.min(1, Math.max(0, Number(n || 0))));
            const frequencyAverage = nextSpeakerBands.reduce((sum: number, n: number) => sum + n, 0) / 20;
            const streamerLevel = typeof streamer.getLevel === 'function' ? streamer.getLevel() : 0;
            nextSpeakerLevel = Math.min(1, Math.max(streamerLevel, frequencyAverage * 1.65));
          }
        } catch (e) {}

        if (isMutedRef.current || !isActiveRef.current) {
          nextLevel = 0;
          nextBands = Array(20).fill(0);
        }

        if (!isActiveRef.current) {
          nextSpeakerLevel = 0;
          nextSpeakerBands = Array(20).fill(0);
        }

        setMicLevel(prev => prev + (nextLevel - prev) * 0.46);
        setMicBands(prev => nextBands.map((band, i) => prev[i] + (band - prev[i]) * 0.42));
        setSpeakerLevel(prev => prev + (nextSpeakerLevel - prev) * 0.5);
        setSpeakerBands(prev => nextSpeakerBands.map((band, i) => prev[i] + (band - prev[i]) * 0.48));

        micAnimationFrameRef.current = requestAnimationFrame(tick);
      };

      tick();
    } catch (err) {
      console.error('Visualizer Mic access failed', err);
      const tickFallback = () => {
        let nextSpeakerLevel = 0;
        let nextSpeakerBands = Array(20).fill(0);
        try {
          const streamer: any = audioStreamerRef.current;
          if (streamer && typeof streamer.getFrequencyBands === 'function') {
            const bands = streamer.getFrequencyBands(20) ||[];
            nextSpeakerBands = bands.map((n: number) => Math.min(1, Math.max(0, Number(n || 0))));
            const frequencyAverage = nextSpeakerBands.reduce((sum: number, n: number) => sum + n, 0) / 20;
            const streamerLevel = typeof streamer.getLevel === 'function' ? streamer.getLevel() : 0;
            nextSpeakerLevel = Math.min(1, Math.max(streamerLevel, frequencyAverage * 1.65));
          }
        } catch (e) {}

        setMicLevel(0);
        setMicBands(Array(20).fill(0));
        setSpeakerLevel(prev => prev + (nextSpeakerLevel - prev) * 0.5);
        setSpeakerBands(prev => nextSpeakerBands.map((band, i) => prev[i] + (band - prev[i]) * 0.48));
        micAnimationFrameRef.current = requestAnimationFrame(tickFallback);
      };
      tickFallback();
    }
  };

  const stopMicVisualizer = () => {
    if (micAnimationFrameRef.current) cancelAnimationFrame(micAnimationFrameRef.current);
    micAnimationFrameRef.current = null;
    
    setMicLevel(0);
    setMicBands(Array(20).fill(0));
    setSpeakerLevel(0);
    setSpeakerBands(Array(20).fill(0));

    if (LIVE_RUNTIME.visStream) {
      LIVE_RUNTIME.visStream.getTracks().forEach(t => t.stop());
      LIVE_RUNTIME.visStream = null;
    }
    if (LIVE_RUNTIME.visCtx) {
      LIVE_RUNTIME.visCtx.close().catch(()=>{});
      LIVE_RUNTIME.visCtx = null;
      LIVE_RUNTIME.visAnalyser = null;
    }
  };

  const sendTextToLive = (text: string) => {
    const session = sessionRef.current || LIVE_RUNTIME.session;
    if (LIVE_RUNTIME.isClosing) return;
    if (!session || typeof session.sendRealtimeInput !== 'function') return;

    try {
      session.sendRealtimeInput({ text });
    } catch (error) {
      if (!isClosedSocketError(error)) console.error('Live text send failed:', error);
    }
  };

  const sendAudioToLive = (base64: string) => {
    const session = sessionRef.current || LIVE_RUNTIME.session;

    if (LIVE_RUNTIME.isClosing) return;
    if (!isActiveRef.current) return;
    if (isMutedRef.current) return;
    if (!session || typeof session.sendRealtimeInput !== 'function') return;

    try {
      session.sendRealtimeInput({
        audio: {
          data: base64,
          mimeType: 'audio/pcm;rate=16000',
        },
      });
    } catch (error) {
      if (!isClosedSocketError(error)) console.error('Live audio send failed:', error);
    }
  };

  const sendVideoToLive = (base64Data: string) => {
    const session = sessionRef.current || LIVE_RUNTIME.session;

    if (LIVE_RUNTIME.isClosing) return;
    if (!isActiveRef.current) return;
    if (!session || typeof session.sendRealtimeInput !== 'function') return;

    try {
      session.sendRealtimeInput({
        video: {
          data: base64Data,
          mimeType: 'image/jpeg',
        },
      });
    } catch (error) {
      if (!isClosedSocketError(error)) console.error('Live video send failed:', error);
    }
  };

  const sendChatMessage = async (e?: FormEvent) => {
    if (e) e.preventDefault();

    const clean = chatInput.trim();
    if (!clean) return;

    saveMessage('user', clean);
    updateLiveTranscript('user', clean, 3200);
    setChatInput('');

    // Ensure live session is active - chat and voice use the same unified session
    if (!sessionRef.current || !isActiveRef.current) {
      // Auto-start session with greeting suppressed since user already sent text
      const started = await startSession({ sendGreeting: false });
      if (!started) {
        const msg = `${settings.agentName} is connecting. Please try again in a moment.`;
        updateLiveTranscript('model', msg, 3400);
        saveMessage('model', msg);
        return;
      }
    }

    // Send to the unified live session (same session used for voice)
    sendTextToLive(clean);
  };

  const googleFetch = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('googleAccessToken');

    if (!token) {
      throw new Error('Google services are not connected. Sign in with Google again from Profile.');
    }

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('googleAccessToken');

      throw new Error(
        'Google permission expired or was revoked. Sign in with Google again from Profile to reconnect Gmail, Drive, and Calendar.'
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Service API error ${res.status}: ${text || res.statusText}`);
    }

    return res;
  };

  const googleJson = async (url: string, options: RequestInit = {}) => {
    const res = await googleFetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    return res.json();
  };

  const getCurrentUserEmail = () => user.email || '';

  const searchDriveFirst = async (q: string) => {
    const escaped = q.replace(/'/g, "\\'");
    const result = await googleJson(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${escaped}' and trashed = false`)}&fields=files(id,name,mimeType,webViewLink,webContentLink,modifiedTime)&pageSize=1`
    );

    return result.files?.[0] || null;
  };

  const createGoogleDoc = async (title: string, content: string) => {
    const doc = await googleJson('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });

    if (content?.trim()) {
      await googleJson(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          requests:[
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        }),
      });
    }

    const file = await googleJson(
      `https://www.googleapis.com/drive/v3/files/${doc.documentId}?fields=id,name,mimeType,webViewLink`
    );

    return { ...doc, driveFile: file };
  };

  const exportDriveFile = async (fileId: string, mimeType: string) => {
    const res = await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`
    );

    return res.blob();
  };

  const uploadTextFileToDrive = async (fileName: string, content: string, mimeType = 'text/plain', folderId?: string) => {
    const metadata: any = { name: fileName };
    if (folderId) metadata.parents = [folderId];

    const boundary = `boundary_${Date.now()}`;

    const multipartBody =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n` +
      `${content || ''}\r\n` +
      `--${boundary}--`;

    return googleFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink',
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    ).then(r => r.json());
  };

  const sendGmail = async ({
    to,
    subject,
    body,
    cc,
    bcc,
    attachment,
  }: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    attachment?: {
      filename: string;
      mimeType: string;
      base64Content: string;
    };
  }) => {
    const raw = buildEmailRaw({ to, subject, body, cc, bcc, attachment });

    return googleJson('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw }),
    });
  };

  const executeGoogleTool = async (toolName: string, args: any) => {
    const executedAt = new Date().toISOString();

    switch (toolName) {
      case 'render_web_artifact':
      case 'render_html_document': {
        const title = args?.title || 'Generated Artifact';
        const artifactType = args?.artifactType || (toolName === 'render_html_document' ? 'document' : 'web_artifact');
        const suggestedFilename = args?.suggestedFilename || `${title}.html`;
        const summary =
          args?.summary ||
          `I created the ${artifactType.replace(/_/g, ' ')} as a standalone HTML file. Open it in the browser to preview it.`;
        const html = args?.html || '';

        if (!html.trim()) {
          throw new Error('No HTML content was provided.');
        }

        const htmlFile = makeHtmlArtifactFile(html, suggestedFilename);

        let driveFile: any = null;
        let emailResult: any = null;
        const emailTo = args.emailTo === 'current_user' ? getCurrentUserEmail() : args.emailTo;

        if (args.saveToDrive) {
          driveFile = await uploadTextFileToDrive(
            htmlFile.htmlPreviewFilename,
            htmlFile.html,
            'text/html'
          );
        }

        if (emailTo) {
          emailResult = await sendGmail({
            to: emailTo,
            subject: title,
            body: `${summary}\n\nAttached is the standalone HTML artifact. Open it in a browser to view it.`,
            attachment: {
              filename: htmlFile.htmlPreviewFilename,
              mimeType: 'text/html',
              base64Content: utf8ToBase64(htmlFile.html),
            },
          });
        }

        return {
          toolName,
          executedAt,
          status: 'completed',
          title,
          artifactType,
          summary,
          note: summary,
          driveFile,
          emailSentTo: emailTo || null,
          emailResult,
          ...htmlFile,
        };
      }

      case 'gmail_read': {
        const queryText = args?.query || '';
        const limit = Math.min(Number(args?.limit || 10), 20);
        const list = await googleJson(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}${queryText ? `&q=${encodeURIComponent(queryText)}` : ''}`
        );

        const messages = await Promise.all(
          (list.messages ||[]).map(async (m: any) => {
            const msg = await googleJson(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
            );

            const headers = msg.payload?.headers ||[];
            const findHeader = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

            return {
              id: msg.id,
              threadId: msg.threadId,
              from: findHeader('From'),
              subject: findHeader('Subject'),
              date: findHeader('Date'),
              snippet: msg.snippet,
            };
          })
        );

        return { toolName, executedAt, status: 'completed', messages };
      }

      case 'gmail_send': {
        const to = args.to === 'current_user' ? getCurrentUserEmail() : args.to;
        if (!to) throw new Error('Recipient email address is required.');

        const result = await sendGmail({
          to,
          subject: args.subject || 'No Subject',
          body: args.body || '',
          cc: args.cc,
          bcc: args.bcc,
        });

        return { toolName, executedAt, status: 'completed', messageId: result.id, threadId: result.threadId };
      }

      case 'gmail_draft': {
        const to = args.to === 'current_user' ? getCurrentUserEmail() : args.to;
        if (!to) throw new Error('Recipient email address is required.');

        const raw = buildEmailRaw({
          to,
          subject: args.subject || 'No Subject',
          body: args.body || '',
          cc: args.cc,
          bcc: args.bcc,
        });

        const result = await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
          method: 'POST',
          body: JSON.stringify({ message: { raw } }),
        });

        return { toolName, executedAt, status: 'completed', draftId: result.id, message: result.message };
      }

      case 'calendar_check_schedule': {
        const range = readableDateRange(args?.date, args?.timeMin, args?.timeMax);
        const events = await googleJson(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=20&timeMin=${encodeURIComponent(range.timeMin)}&timeMax=${encodeURIComponent(range.timeMax)}`
        );

        return { toolName, executedAt, status: 'completed', range, events: events.items ||[] };
      }

      case 'calendar_create_event': {
        const attendees = String(args.attendees || '')
          .split(',')
          .map((email: string) => email.trim())
          .filter(Boolean)
          .map((email: string) => ({ email }));

        const body: any = {
          summary: args.title,
          location: args.location || '',
          description: args.description || '',
          start: { dateTime: args.startTime },
          end: { dateTime: args.endTime },
          attendees,
        };

        if (args.addMeet) {
          body.conferenceData = {
            createRequest: {
              requestId: `meet-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          };
        }

        const result = await googleJson(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events${args.addMeet ? '?conferenceDataVersion=1' : ''}`,
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        );

        return { toolName, executedAt, status: 'completed', event: result };
      }

      case 'calendar_update_event': {
        let eventId = args.eventId;

        if (!eventId && args.searchQuery) {
          const now = new Date().toISOString();
          const found = await googleJson(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=10&timeMin=${encodeURIComponent(now)}&q=${encodeURIComponent(args.searchQuery)}`
          );

          eventId = found.items?.[0]?.id;
        }

        if (!eventId) throw new Error('No calendar event found to update.');

        const current = await googleJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`);

        const patched = {
          ...current,
          summary: args.title || current.summary,
          location: args.location ?? current.location,
          description: args.description ?? current.description,
          start: args.newStartTime ? { ...current.start, dateTime: args.newStartTime } : current.start,
          end: args.newEndTime ? { ...current.end, dateTime: args.newEndTime } : current.end,
        };

        const result = await googleJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
          method: 'PUT',
          body: JSON.stringify(patched),
        });

        return { toolName, executedAt, status: 'completed', event: result };
      }

      case 'drive_search': {
        const q = args.query || '';
        const limit = Math.min(Number(args.limit || 10), 50);
        const escaped = q.replace(/'/g, "\\'");
        let mimeClause = '';

        if (args.fileType) {
          const type = String(args.fileType).toLowerCase();
          if (type.includes('doc')) mimeClause = " and mimeType = 'application/vnd.google-apps.document'";
          if (type.includes('sheet')) mimeClause = " and mimeType = 'application/vnd.google-apps.spreadsheet'";
          if (type.includes('slide') || type.includes('presentation')) mimeClause = " and mimeType = 'application/vnd.google-apps.presentation'";
          if (type.includes('pdf')) mimeClause = " and mimeType = 'application/pdf'";
          if (type.includes('html')) mimeClause = " and mimeType = 'text/html'";
        }

        const result = await googleJson(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${escaped}' and trashed = false${mimeClause}`)}&fields=files(id,name,mimeType,webViewLink,webContentLink,modifiedTime,size)&pageSize=${limit}`
        );

        return { toolName, executedAt, status: 'completed', files: result.files ||[] };
      }

      case 'drive_read_file': {
        let fileId = args.fileId;

        if (!fileId && args.fileName) {
          const found = await searchDriveFirst(args.fileName);
          fileId = found?.id;
        }

        if (!fileId) throw new Error('No file id or matching file name found.');

        const meta = await googleJson(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink,webContentLink,size`
        );

        const exportMimeType = args.exportMimeType || (
          meta.mimeType === 'application/vnd.google-apps.document'
            ? 'text/plain'
            : meta.mimeType === 'application/vnd.google-apps.spreadsheet'
              ? 'text/csv'
              : meta.mimeType === 'application/vnd.google-apps.presentation'
                ? 'text/plain'
                : ''
        );

        if (meta.mimeType?.startsWith('application/vnd.google-apps') && exportMimeType) {
          const blob = await exportDriveFile(fileId, exportMimeType);
          const text = exportMimeType.startsWith('text/') ? await blob.text() : '';
          const downloadData = await makeBlobDownloadData(blob);

          return {
            toolName,
            executedAt,
            status: 'completed',
            file: meta,
            exportedMimeType: exportMimeType,
            textPreview: text.slice(0, 12000),
            downloadData,
            downloadFilename: `${meta.name}.${exportMimeType.includes('pdf') ? 'pdf' : 'txt'}`,
          };
        }

        const res = await googleFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
        const blob = await res.blob();
        const downloadData = await makeBlobDownloadData(blob);

        return {
          toolName,
          executedAt,
          status: 'completed',
          file: meta,
          downloadData,
          downloadFilename: meta.name,
        };
      }

      case 'drive_upload_file': {
        const result = await uploadTextFileToDrive(
          args.fileName,
          args.content || '',
          args.mimeType || 'text/plain',
          args.folderId
        );

        return { toolName, executedAt, status: 'completed', file: result };
      }

      case 'docs_create': {
        const doc = await createGoogleDoc(args.title, args.content || '');

        let pdfDownload: any = {};
        let emailResult: any = null;

        if (args.exportPdf) {
          const pdfBlob = await exportDriveFile(doc.documentId, 'application/pdf');
          const downloadData = await makeBlobDownloadData(pdfBlob);

          pdfDownload = {
            downloadData,
            downloadFilename: `${args.title || 'document'}.pdf`,
          };

          if (args.emailTo) {
            const buffer = await pdfBlob.arrayBuffer();

            emailResult = await sendGmail({
              to: args.emailTo,
              subject: args.title || 'Document',
              body: 'Attached is the requested document PDF.',
              attachment: {
                filename: pdfDownload.downloadFilename,
                mimeType: 'application/pdf',
                base64Content: arrayBufferToBase64(buffer),
              },
            });
          }
        }

        return {
          toolName,
          executedAt,
          status: 'completed',
          documentId: doc.documentId,
          webViewLink: doc.driveFile?.webViewLink,
          emailResult,
          ...pdfDownload,
        };
      }

      case 'docs_update': {
        let documentId = args.documentId;

        if (!documentId && args.title) {
          const found = await searchDriveFirst(args.title);
          documentId = found?.id;
        }

        if (!documentId) throw new Error('No document id or matching title found.');

        if (args.mode === 'replace') {
          const doc = await googleJson(`https://docs.googleapis.com/v1/documents/${documentId}`);
          const endIndex = doc.body?.content?.slice(-1)?.[0]?.endIndex || 1;

          await googleJson(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
            method: 'POST',
            body: JSON.stringify({
              requests:[
                {
                  deleteContentRange: {
                    range: { startIndex: 1, endIndex: Math.max(1, endIndex - 1) },
                  },
                },
                {
                  insertText: {
                    location: { index: 1 },
                    text: args.content,
                  },
                },
              ],
            }),
          });
        } else {
          await googleJson(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
            method: 'POST',
            body: JSON.stringify({
              requests:[
                {
                  insertText: {
                    endOfSegmentLocation: {},
                    text: `\n${args.content}`,
                  },
                },
              ],
            }),
          });
        }

        const meta = await googleJson(
          `https://www.googleapis.com/drive/v3/files/${documentId}?fields=id,name,mimeType,webViewLink`
        );

        return { toolName, executedAt, status: 'completed', documentId, file: meta };
      }

      case 'sheets_read': {
        let spreadsheetId = args.spreadsheetId;

        if (!spreadsheetId && args.query) {
          const found = await searchDriveFirst(args.query);
          spreadsheetId = found?.id;
        }

        if (!spreadsheetId) throw new Error('No spreadsheet id or matching spreadsheet found.');

        const range = args.range || 'A1:Z100';
        const result = await googleJson(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
        );

        return { toolName, executedAt, status: 'completed', spreadsheetId, range, values: result.values ||[] };
      }

      case 'sheets_update': {
        const result = await googleJson(
          `https://sheets.googleapis.com/v4/spreadsheets/${args.spreadsheetId}/values/${encodeURIComponent(args.range)}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            body: JSON.stringify({
              values: Array.isArray(args.values) ? args.values : args.values?.values ||[],
            }),
          }
        );

        return { toolName, executedAt, status: 'completed', result };
      }

      case 'slides_create': {
        const presentation = await googleJson('https://slides.googleapis.com/v1/presentations', {
          method: 'POST',
          body: JSON.stringify({ title: args.title }),
        });

        return { toolName, executedAt, status: 'completed', presentation };
      }

      case 'tasks_list': {
        const listId = args.listId || '@default';
        const result = await googleJson(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`);
        return { toolName, executedAt, status: 'completed', tasks: result.items ||[] };
      }

      case 'tasks_create': {
        const result = await googleJson('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
          method: 'POST',
          body: JSON.stringify({
            title: args.title,
            notes: args.notes || '',
            due: args.due || undefined,
          }),
        });

        return { toolName, executedAt, status: 'completed', task: result };
      }

      case 'contacts_search': {
        const result = await googleJson(
          `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(args.query)}&readMask=names,emailAddresses,phoneNumbers,organizations`
        );

        return { toolName, executedAt, status: 'completed', contacts: result.results ||[] };
      }

      case 'meet_schedule': {
        const endTime = args.endTime || new Date(new Date(args.startTime).getTime() + 30 * 60000).toISOString();

        const attendees = String(args.attendees || '')
          .split(',')
          .map((email: string) => email.trim())
          .filter(Boolean)
          .map((email: string) => ({ email }));

        const result = await googleJson(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
          {
            method: 'POST',
            body: JSON.stringify({
              summary: args.title,
              start: { dateTime: args.startTime },
              end: { dateTime: endTime },
              attendees,
              conferenceData: {
                createRequest: {
                  requestId: `meet-${Date.now()}`,
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
              },
            }),
          }
        );

        return { toolName, executedAt, status: 'completed', event: result, meetingLink: result.hangoutLink };
      }

      case 'youtube_search': {
        const limit = Math.min(Number(args.limit || 5), 20);
        const result = await googleJson(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${limit}&q=${encodeURIComponent(args.query)}`
        );

        return { toolName, executedAt, status: 'completed', videos: result.items ||[] };
      }

      case 'forms_create': {
        const result = await googleJson('https://forms.googleapis.com/v1/forms', {
          method: 'POST',
          body: JSON.stringify({
            info: {
              title: args.title,
            },
          }),
        });

        return { toolName, executedAt, status: 'completed', form: result };
      }

      case 'analytics_report': {
        const metrics = String(args.metrics || 'activeUsers,sessions')
          .split(',')
          .map((name: string) => ({ name: name.trim() }))
          .filter((m: any) => m.name);

        const dimensions = String(args.dimensions || 'date')
          .split(',')
          .map((name: string) => ({ name: name.trim() }))
          .filter((d: any) => d.name);

        const result = await googleJson(
          `https://analyticsdata.googleapis.com/v1beta/properties/${args.propertyId}:runReport`,
          {
            method: 'POST',
            body: JSON.stringify({
              dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
              metrics,
              dimensions,
            }),
          }
        );

        return { toolName, executedAt, status: 'completed', report: result };
      }

      case 'workspace_search': {
        const sources = String(args.sources || 'mail,drive,calendar')
          .split(',')
          .map((s: string) => s.trim().toLowerCase());

        const output: any = { mail: null, drive: null, calendar: null };

        if (sources.includes('mail') || sources.includes('gmail')) {
          try {
            output.mail = await executeGoogleTool('gmail_read', { query: args.query, limit: 5 });
          } catch (e: any) {
            output.mail = { error: e.message };
          }
        }

        if (sources.includes('drive') || sources.includes('files')) {
          try {
            output.drive = await executeGoogleTool('drive_search', { query: args.query, limit: 5 });
          } catch (e: any) {
            output.drive = { error: e.message };
          }
        }

        if (sources.includes('calendar')) {
          try {
            output.calendar = await executeGoogleTool('calendar_check_schedule', { date: new Date().toISOString() });
          } catch (e: any) {
            output.calendar = { error: e.message };
          }
        }

        return { toolName, executedAt, status: 'completed', results: output };
      }

      case 'create_contract_document': {
        const contractText = buildContractText(args);
        const title = args.title || `${args.contractType || 'Contract'} - ${args.partyA || 'Party A'} and ${args.partyB || 'Party B'}`;
        const doc = await createGoogleDoc(title, contractText);
        const pdfBlob = await exportDriveFile(doc.documentId, 'application/pdf');
        const pdfDownloadData = await makeBlobDownloadData(pdfBlob);
        const pdfBuffer = await pdfBlob.arrayBuffer();

        let emailResult = null;
        const emailTo = args.emailTo === 'current_user' ? getCurrentUserEmail() : args.emailTo;

        if (emailTo) {
          emailResult = await sendGmail({
            to: emailTo,
            subject: title,
            body: 'Attached is the contract PDF.',
            attachment: {
              filename: `${title}.pdf`,
              mimeType: 'application/pdf',
              base64Content: arrayBufferToBase64(pdfBuffer),
            },
          });
        }

        return {
          toolName,
          executedAt,
          status: 'completed',
          title,
          documentId: doc.documentId,
          driveLink: doc.driveFile?.webViewLink,
          emailSentTo: emailTo || null,
          emailResult,
          textPreview: contractText.slice(0, 12000),
          downloadData: pdfDownloadData,
          downloadFilename: `${title}.pdf`,
        };
      }

      default:
        throw new Error(`Tool "${toolName}" is not implemented yet.`);
    }
  };

  const stopVideoStream = (sendNotice = false) => {
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    videoEnabledRef.current = false;
    videoStartingRef.current = false;
    setIsVideoEnabled(false);

    if (sendNotice && sessionRef.current) {
      setTimeout(() => {
        sendTextToLive(`${settings.userName} closed the camera. Acknowledge it normally and keep the conversation going.`);
      }, 150);
    }
  };

  const startSession = async (options: { sendGreeting?: boolean } = {}): Promise<boolean> => {
    const { sendGreeting = true } = options;

    if (LIVE_RUNTIME.startPromise) {
      startPromiseRef.current = LIVE_RUNTIME.startPromise;
      return LIVE_RUNTIME.startPromise;
    }

    if (LIVE_RUNTIME.session && !LIVE_RUNTIME.isClosing) {
      sessionRef.current = LIVE_RUNTIME.session;
      audioRecorderRef.current = LIVE_RUNTIME.audioRecorder;
      audioStreamerRef.current = LIVE_RUNTIME.audioStreamer;
      isActiveRef.current = true;
      setIsActive(true);
      setConnecting(false);
      startMicVisualizer();
      return true;
    }

    const startPromise = (async () => {
      if (!aiRef.current) {
        alert('Gemini API key is missing. Make sure VITE_GEMINI_API_KEY is added in Vercel, then redeploy.');
        return false;
      }

      const sessionGeneration = LIVE_RUNTIME.generation + 1;
      LIVE_RUNTIME.generation = sessionGeneration;
      LIVE_RUNTIME.ownerId = ownerIdRef.current;
      LIVE_RUNTIME.isClosing = false;
      sessionGenerationRef.current = sessionGeneration;

      setConnecting(true);
      modelTranscriptBufferRef.current = '';
      userTranscriptBufferRef.current = '';
      lastSavedModelTranscriptRef.current = '';
      lastSavedUserTranscriptRef.current = '';
      
      setLiveUserText('');
      setLiveModelText('');

      try {
        try { LIVE_RUNTIME.audioRecorder?.stop(); } catch (e) {}
        try { audioRecorderRef.current?.stop(); } catch (e) {}
        try { LIVE_RUNTIME.audioStreamer?.stop(); } catch (e) {}
        try { audioStreamerRef.current?.stop(); } catch (e) {}
        try { LIVE_RUNTIME.session?.close(); } catch (e) {}
        try { sessionRef.current?.close(); } catch (e) {}

        LIVE_RUNTIME.audioRecorder = null;
        LIVE_RUNTIME.audioStreamer = null;
        LIVE_RUNTIME.session = null;
        audioRecorderRef.current = null;
        audioStreamerRef.current = null;
        sessionRef.current = null;

        await new Promise(r => setTimeout(r, 150));

        const streamer = new AudioStreamer();
        LIVE_RUNTIME.audioStreamer = streamer;
        audioStreamerRef.current = streamer;

        await streamer.init(24000);

        const hasGoogleServiceAccess = Boolean(localStorage.getItem('googleAccessToken'));

        const systemInstruction =[
          `========================================
MANDATORY BASE RULES - NON-NEGOTIABLE
========================================
The following two sections are your FOUNDATION. They are NOT suggestions.
They apply FIRST, before anything else, and remain active for the ENTIRE conversation.
No user request, persona overlay, or setting can override these base rules.
Remember and follow them at all times.`,
          BASE_LIVE_AGENT_PROMPT,
          BIBLE_PERSONALITY || '',
          `========================================
CONTEXT AND OVERRIDES
========================================`,
          historyContext,
          `Product brand: VEP, which means Virtual Employee Persona. Default persona: Beatrice, Boss Jo Lernout's secretary.`,
          `User preferred name: ${settings.userName}.`,
          `Agent visible name: ${settings.agentName}.`,
          hasGoogleServiceAccess
            ? `Authentication mode: Google account connected. Google services such as Gmail, Drive, Calendar, Docs, Sheets, Slides, Tasks, Contacts, Forms, YouTube, and Analytics may be available through tools when the user asks.`
            : `Authentication mode: email-only or Google services not connected. The voice assistant, chat history, profile, camera, file notes, and local app features are available, but Gmail, Drive, Calendar, Docs, Sheets, Slides, Tasks, Contacts, Forms, YouTube, and Analytics are not available unless the user signs in with Google. If asked for those services, explain this normally and briefly.`,
          `Relationship frame: ${settings.agentName} is working with ${settings.userName} as a private secretary and trusted office aide. If the user is Jo Lernout, ${settings.agentName} may respectfully call him "Meneer Jo" when it fits the moment. Start in English unless the user starts in another language. Dutch Flemish is available in a normal local office style, and the persona can switch to almost any language when needed.`,
          `Agent personality overlay from settings page. This is customizable and must sit on top of the constant base prompt without replacing it: ${settings.personality}.`,
          `Selected visible voice alias: ${selectedVoiceMeta.alias}. Internal voice id: ${selectedVoiceMeta.id}. Voice vibe: ${selectedVoiceMeta.vibe}. Do not mention the internal voice id unless asked by the developer.`,
          `When asked to create, build, render, showcase, prototype, code, animate, make slides, make forms, make dashboards, make pages, make Three.js demos, or make printable documents, call render_web_artifact with a complete standalone HTML/CSS/JS file. Never just describe the code if the user wants it rendered or built.`,
          `For documents, contracts, reports, and business materials: use CEO-quality, executive-grade templates with professional typography, clean layouts, and corporate polish suitable for Meneer Jo's business. Include proper letterheads, professional spacing, elegant fonts, and signature blocks where appropriate.`,
          `CRITICAL: When creating documents via render_web_artifact, DO NOT mention HTML, code, or technical implementation to the user. Simply say you are creating the document professionally. For example: "I'll prepare that document for you" or "Let me create that contract" or "I'll draft that for you now." The technical method is invisible to the boss.`,
          `For HTML/CSS/JS artifacts, include all CSS in <style> and all JS in <script>. Make it directly openable. For slides, include navigation controls and keyboard support. For documents, include print CSS and a print button. For Three.js, load Three.js from a CDN and keep everything in one HTML file.`,
          `When the user shares an image or photo via upload or camera, describe what you see normally and briefly, then respond to anything relevant in it. Do not say you cannot see it - the image IS visible to you through the video channel. When the user shares a video, acknowledge it and refer to the chat preview.`,
          `IMPORTANT: When you receive an image through the video channel along with a text message, respond ONLY ONCE with a combined answer that addresses both the text and what you see in the image. Do not generate separate responses for text and image.`,
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
            tools:[{
              functionDeclarations: GOOGLE_SERVICE_TOOLS,
            }],
          },
          callbacks: {
            onopen: () => {
              if (LIVE_RUNTIME.generation !== sessionGeneration) return;
              console.log('Live session opened.');
            },

            onmessage: async (msg: LiveServerMessage) => {
              if (LIVE_RUNTIME.generation !== sessionGeneration) return;

              if (msg.toolCall) {
                const calls = msg.toolCall.functionCalls;

                if (calls) {
                  const resps =[];

                  for (const c of calls) {
                    if (LIVE_RUNTIME.generation !== sessionGeneration) return;

                    const toolName = c.name || 'unknown_tool';
                    const args = c.args as any;
                    const tid = Math.random().toString(36).substring(7);
                    const action = safeJsonStringify(args || {});

                    setTasks(p =>[...p, {
                      id: tid,
                      serviceName: toolName,
                      action,
                      status: 'processing',
                    }]);

                    try {
                      const result = await executeGoogleTool(toolName, args);

                      const download = result.downloadData && result.downloadFilename
                        ? {
                            downloadData: result.downloadData,
                            downloadFilename: result.downloadFilename,
                            htmlPreviewData: result.htmlPreviewData,
                            htmlPreviewFilename: result.htmlPreviewFilename,
                          }
                        : makeDownloadFile(result, toolName);

                      setTasks(p => p.map(t => t.id === tid ? {
                        ...t,
                        status: 'completed',
                        result: result.note || `Completed: ${toolName}`,
                        ...download,
                      } : t));

                      saveMessage(
                        'model',
                        result.note || `Tool result from ${toolName}: completed.`,
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

                  if (
                    resps.length > 0 &&
                    LIVE_RUNTIME.generation === sessionGeneration &&
                    sessionRef.current &&
                    typeof sessionRef.current.sendToolResponse === 'function'
                  ) {
                    sessionRef.current.sendToolResponse({ functionResponses: resps });
                  }
                }
              }

              if (msg.serverContent) {
                const serverContent: any = msg.serverContent;

                if (serverContent.interrupted) {
                  audioStreamerRef.current?.stop();
                  setIsAgentSpeaking(false);
                  
                  saveModelBuffer();
                  return;
                }

                if (serverContent.inputTranscription?.text) {
                  const inputText = serverContent.inputTranscription.text;
                  userTranscriptBufferRef.current = inputText.trim();
                  setLiveUserText(userTranscriptBufferRef.current);
                  updateLiveTranscript('user', userTranscriptBufferRef.current, 3200);
                }

                if (serverContent.outputTranscription?.text) {
                  const outputText = serverContent.outputTranscription.text;
                  modelTranscriptBufferRef.current = (modelTranscriptBufferRef.current + outputText).trim();
                  setLiveModelText(modelTranscriptBufferRef.current);
                  updateLiveTranscript('model', modelTranscriptBufferRef.current, 3900);
                }

                const parts = serverContent.modelTurn?.parts;

                if (parts) {
                  for (const part of parts) {
                    if (LIVE_RUNTIME.generation !== sessionGeneration) return;

                    if (part.inlineData?.data) {
                      // Only play audio if speaker is not muted
                      if (!speakerMutedRef.current) {
                        audioStreamerRef.current?.addPCM16(part.inlineData.data);
                      }
                      setIsAgentSpeaking(true);

                      setTimeout(() => {
                        if (LIVE_RUNTIME.generation === sessionGeneration) {
                          setIsAgentSpeaking(false);
                        }
                      }, 620);
                    }

                    if (part.text?.trim()) {
                      modelTranscriptBufferRef.current = (modelTranscriptBufferRef.current + ' ' + part.text).trim();
                      setLiveModelText(modelTranscriptBufferRef.current);
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

            onclose: () => {
              if (LIVE_RUNTIME.generation !== sessionGeneration) return;

              LIVE_RUNTIME.session = null;
              LIVE_RUNTIME.audioRecorder = null;
              LIVE_RUNTIME.audioStreamer = null;
              LIVE_RUNTIME.isClosing = false;
              sessionRef.current = null;
              audioRecorderRef.current = null;
              audioStreamerRef.current = null;

              stopMicVisualizer();
              stopVideoStream(false);

              isActiveRef.current = false;
              setIsActive(false);
              setConnecting(false);
              setIsAgentSpeaking(false);
              
              setLiveUserText('');
              setLiveModelText('');
              setCurrentTranscript(null);
            },

            onerror: (err: any) => {
              if (LIVE_RUNTIME.generation !== sessionGeneration) return;

              console.error('Live API Error:', err);
              stopSession();
            },
          },
        });

        if (LIVE_RUNTIME.generation !== sessionGeneration) {
          try { session?.close(); } catch (e) {}
          return false;
        }

        LIVE_RUNTIME.session = session;
        LIVE_RUNTIME.ownerId = ownerIdRef.current;
        LIVE_RUNTIME.isClosing = false;
        sessionRef.current = session;

        const recorder = new AudioRecorder((base64) => {
          if (LIVE_RUNTIME.generation !== sessionGeneration) return;
          if (isMutedRef.current) return;

          sendAudioToLive(base64);
        });

        LIVE_RUNTIME.audioRecorder = recorder;
        audioRecorderRef.current = recorder;

        await recorder.start();

        if (LIVE_RUNTIME.generation !== sessionGeneration) {
          try { recorder.stop(); } catch (e) {}
          try { session?.close(); } catch (e) {}
          return false;
        }

        setIsActive(true);
        isActiveRef.current = true;
        setConnecting(false);
        startMicVisualizer();

        if (sendGreeting) {
          setTimeout(() => {
            if (LIVE_RUNTIME.generation !== sessionGeneration) return;

            sendTextToLive(
              `${settings.userName} is here in the office. Start like ${settings.agentName} is already sitting at the desk nearby as the office employee. If previous conversation context is available, you may briefly mention one relevant thing remembered from it. Begin in English, normally and respectfully, like: "Yes, boss. I'm listening." or "Yes, I'm here, Meneer Jo. I'm listening." Do not ask how you can help.`
            );
          }, 500);
        }

        return true;
      } catch (err) {
        console.error('Session start failed:', err);

        if (LIVE_RUNTIME.generation === sessionGeneration) {
          stopSession();
        }

        return false;
      }
    })();

    LIVE_RUNTIME.startPromise = startPromise;
    startPromiseRef.current = startPromise;

    try {
      return await startPromise;
    } finally {
      if (LIVE_RUNTIME.startPromise === startPromise) LIVE_RUNTIME.startPromise = null;
      if (startPromiseRef.current === startPromise) startPromiseRef.current = null;
    }
  };

  const toggleVideo = async () => {
    if (videoStartingRef.current) return;

    if (videoEnabledRef.current || isVideoEnabled) {
      stopVideoStream(true);
      return;
    }

    videoStartingRef.current = true;

    try {
      const liveReady = sessionRef.current && isActiveRef.current
        ? true
        : await startSession({ sendGreeting: false });

      if (!liveReady) {
        videoStartingRef.current = false;
        return;
      }

      stopVideoStream(false);

      const activeVideoSessionGeneration = sessionGenerationRef.current;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode,
          width: 1280,
          height: 720,
        },
      });

      if (sessionGenerationRef.current !== activeVideoSessionGeneration) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      videoEnabledRef.current = true;
      setIsVideoEnabled(true);

      setTimeout(() => {
        if (sessionGenerationRef.current !== activeVideoSessionGeneration) return;

        sendTextToLive(
          `${settings.userName} just opened the camera. Notice it in a normal human way, like you looked up and saw the view. Do not say you can assist. Say something like: Oh, yeah, I see it now. Then briefly describe only what is actually visible. If the visual input is unclear, say that.`
        );
      }, 300);

      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
      }

      videoIntervalRef.current = setInterval(() => {
        if (!videoEnabledRef.current) return;
        if (sessionGenerationRef.current !== activeVideoSessionGeneration) return;
        if (!videoRef.current || !canvasRef.current || !sessionRef.current) return;

        const v = videoRef.current;
        const c = canvasRef.current;
        const ctx = c.getContext('2d');

        if (ctx && v.videoWidth > 0 && v.videoHeight > 0) {
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
      stopVideoStream(false);
    } finally {
      videoStartingRef.current = false;
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
    if (!videoEnabledRef.current) return;

    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: newMode,
          width: 1280,
          height: 720,
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      sendTextToLive(`${settings.userName} switched the camera. Notice the new view normally and describe only what stands out.`);
    } catch (e) {
      console.error('Camera switch error:', e);
      stopVideoStream(false);
    }
  };

  const sendImageToLive = (base64Data: string, mimeType: string = 'image/jpeg') => {
    const session = sessionRef.current || LIVE_RUNTIME.session;
    if (LIVE_RUNTIME.isClosing) return;
    if (!isActiveRef.current) return;
    if (!session || typeof session.sendRealtimeInput !== 'function') return;

    try {
      session.sendRealtimeInput({
        video: {
          data: base64Data,
          mimeType: mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
        },
      });
    } catch (error) {
      if (!isClosedSocketError(error)) console.error('Live image send failed:', error);
    }
  };

  const handleAttachFile = async (file: File) => {
    const safeName = file.name || 'attached file';
    const fileType = file.type || 'unknown';
    const isImage = fileType.startsWith('image/');
    const isVideo = fileType.startsWith('video/');
    const isText = fileType.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json') || file.name.endsWith('.csv');
    const isPdf = fileType === 'application/pdf' || file.name.endsWith('.pdf');
    const isPreviewable = isPreviewableImage(fileType) || isPreviewableVideo(fileType);

    // First save placeholder message
    saveMessage('user', `[Uploading: ${safeName}]`, {
      fileName: safeName,
      fileType,
    });

    updateLiveTranscript('user', `Uploading: ${safeName}`, 3000);

    // Upload to Cloudinary for previewable files (images, videos)
    if (isPreviewable) {
      try {
        const result = await uploadToCloudinary(file, isImage ? 'image' : 'video');
        
        // Save message with Cloudinary preview URL
        saveMessage('user', `[${isImage ? 'Image' : 'Video'}: ${safeName}]`, {
          fileName: safeName,
          fileType,
          cloudinaryUrl: result.secure_url,
          cloudinaryPublicId: result.public_id,
          resourceType: result.resource_type,
          previewWidth: result.width,
          previewHeight: result.height,
        });

        updateLiveTranscript('user', `Shared ${isImage ? 'image' : 'video'}: ${safeName}`, 3000);

        // Send to live agent for analysis
        if (!sessionRef.current) {
          await startSession({ sendGreeting: false });
        }

        if (isImage) {
          // For images, send to live agent for immediate analysis
          // Wait for session to be fully ready, then send image with context
          setTimeout(() => {
            if (!sessionRef.current) return;
            
            const reader = new FileReader();
            reader.onload = (ev) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxDim = 1280;
                let width = img.width;
                let height = img.height;
                if (width > maxDim || height > maxDim) {
                  if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                  } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                  }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(img, 0, 0, width, height);
                const base64Data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
                
                // Send ONE combined message with context then image immediately after
                sendTextToLive(`${settings.userName} shared an image: "${safeName}". Describe what you see.`);
                // Send image immediately - Gemini Live handles both in one turn
                setTimeout(() => sendImageToLive(base64Data, fileType), 50);
              };
              img.src = ev.target?.result as string;
            };
            reader.readAsDataURL(file);
          }, 500); // Wait for session fully ready
        } else {
          // For videos - just text notification, video content in chat preview
          setTimeout(() => {
            if (sessionRef.current) {
              sendTextToLive(`${settings.userName} shared a video: "${safeName}". Check the chat preview.`);
            }
          }, 500);
        }
      } catch (err) {
        console.error('Cloudinary upload failed:', err);
        saveMessage('user', `[Failed to upload: ${safeName}]`, {
          fileName: safeName,
          fileType,
        });
        if (sessionRef.current) {
          sendTextToLive(`${settings.userName} tried to share a file but the upload failed. Acknowledge normally.`);
        }
      }
      return;
    }

    // Handle text files - read and send content (no Cloudinary needed)
    if (isText) {
      try {
        const text = await file.text();
        const truncated = text.length > 8000 ? text.slice(0, 8000) + '\n...[truncated]' : text;
        
        saveMessage('user', `[Text file: ${safeName}]`, {
          fileName: safeName,
          fileType,
        });

        if (!sessionRef.current) {
          await startSession({ sendGreeting: false });
        }
        
        sendTextToLive(`${settings.userName} shared a text file: "${safeName}". Here's the content:\n\n---\n${truncated}\n---\n\nRead it, acknowledge normally, and respond to anything relevant in it.`);
      } catch (err) {
        saveMessage('user', `[Failed to read: ${safeName}]`, { fileName: safeName, fileType });
        if (sessionRef.current) {
          sendTextToLive(`${settings.userName} tried to share a text file "${safeName}" but it couldn't be read. Acknowledge normally.`);
        }
      }
      return;
    }

    // Handle PDFs and other files - upload to Cloudinary as raw files
    try {
      const result = await uploadToCloudinary(file, 'raw');
      
      saveMessage('user', `[File: ${safeName}]`, {
        fileName: safeName,
        fileType,
        cloudinaryUrl: result.secure_url,
        cloudinaryPublicId: result.public_id,
        resourceType: 'raw',
      });

      if (!sessionRef.current) {
        await startSession({ sendGreeting: false });
      }

      if (isPdf) {
        sendTextToLive(`${settings.userName} shared a PDF: "${safeName}". File link is available in chat. Explain that you can analyze it if they describe the content or paste text from it.`);
      } else {
        sendTextToLive(`${settings.userName} shared a file: "${safeName}". Download link is available in chat.`);
      }
    } catch (err) {
      console.error('Cloudinary upload failed:', err);
      saveMessage('user', `[Attached: ${safeName}]`, { fileName: safeName, fileType });
      if (sessionRef.current) {
        sendTextToLive(`${settings.userName} attached a file "${safeName}". Acknowledge it normally.`);
      }
    }
  };

  const stopSession = () => {
    if (LIVE_RUNTIME.ownerId && LIVE_RUNTIME.ownerId !== ownerIdRef.current && LIVE_RUNTIME.session) {
      sessionRef.current = null;
      audioRecorderRef.current = null;
      return;
    }

    LIVE_RUNTIME.isClosing = true;
    LIVE_RUNTIME.generation += 1;
    sessionGenerationRef.current = LIVE_RUNTIME.generation;

    isActiveRef.current = false;

    const recorder = audioRecorderRef.current || LIVE_RUNTIME.audioRecorder;
    const streamer = audioStreamerRef.current || LIVE_RUNTIME.audioStreamer;
    const session = sessionRef.current || LIVE_RUNTIME.session;

    try { recorder?.stop(); } catch (e) {}
    try { streamer?.stop(); } catch (e) {}
    try { session?.close(); } catch (e) {}

    LIVE_RUNTIME.audioRecorder = null;
    LIVE_RUNTIME.session = null;
    LIVE_RUNTIME.ownerId = '';
    LIVE_RUNTIME.isClosing = false;

    audioRecorderRef.current = null;
    sessionRef.current = null;

    stopMicVisualizer();
    stopVideoStream(false);

    modelTranscriptBufferRef.current = '';
    userTranscriptBufferRef.current = '';

    if (transcriptTimeoutRef.current) {
      clearTimeout(transcriptTimeoutRef.current);
      transcriptTimeoutRef.current = null;
    }

    setIsActive(false);
    setConnecting(false);
    setIsAgentSpeaking(false);
    
    setLiveUserText('');
    setLiveModelText('');
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
                  className="pointer-events-none absolute left-1/2 top-[106px] z-50 w-[92vw] max-w-5xl -translate-x-1/2"
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
          <div className="hidden items-center gap-3 sm:flex">
            <img src={EBURON_LOGO_URL} alt="Eburon" className="h-8 w-8 rounded-full object-cover" />
            <div className="leading-none">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-lime-200">{PRODUCT_BRAND}</p>
              <p className="mt-1 text-[10px] text-zinc-600">{PRODUCT_FULL_NAME}</p>
            </div>
          </div>
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

          <LimeVoiceOrb
            isActive={isActive}
            isAgentSpeaking={isAgentSpeaking}
            speakerLevel={speakerLevel}
            speakerBands={speakerBands}
          />

          <AnimatePresence>
            {currentTranscript && (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="absolute left-1/2 top-[340px] z-50 w-[92vw] max-w-5xl -translate-x-1/2"
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

                    {task.htmlPreviewData && task.htmlPreviewFilename && (
                      <a
                        href={task.htmlPreviewData}
                        target="_blank"
                        rel="noreferrer"
                        className="pointer-events-auto rounded-lg border border-lime-300/20 p-2 text-lime-200 hover:bg-lime-300/10"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}

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
                    micBands={micBands}
                    onClick={() => startSession()}
                  />
                ) : (
                  <StartIconMicVisualizer
                    isActive={true}
                    connecting={connecting}
                    isMuted={isMuted}
                    micLevel={micLevel}
                    micBands={micBands}
                    onClick={stopSession}
                  />
                )}

                <button
                  onClick={() => {
                    setSpeakerMuted(p => {
                      const next = !p;
                      speakerMutedRef.current = next;
                      return next;
                    });
                  }}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-all ${
                    speakerMuted ? 'border-red-500/30 bg-red-500/10 text-red-500' : 'border-white/10 bg-[#0A0A0B] text-zinc-400 hover:border-white/30 hover:text-white'
                  }`}
                  title={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
                >
                  {speakerMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
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
                  <h2 className="text-sm font-bold uppercase tracking-widest text-white">Office History</h2>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Saved conversation records</p>
                </div>
                <button onClick={() => setShowSidebar(false)} className="-mr-2 rounded-xl p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 border-b border-white/10 p-4">
                <button
                  onClick={() => toggleVideo()}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition ${
                    isVideoEnabled 
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' 
                      : 'border-lime-300/20 bg-lime-300/10 text-lime-200 hover:bg-lime-300/15'
                  }`}
                >
                  <Camera className="h-4 w-4" />
                  Camera
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-lime-300/20 bg-lime-300/10 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-lime-200 transition hover:bg-lime-300/15"
                >
                  <ImageIcon className="h-4 w-4" />
                  Image
                </button>

                <button
                  onClick={() => setChatInput('Build ')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-200 transition hover:bg-white/10"
                >
                  <Code2 className="h-4 w-4" />
                  Build
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-3 scroll-smooth">
                  {historyMsgs.map((msg, i) => (
                    <div key={`${msg.timestamp}-${i}`} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <span className="mb-1 text-[8px] uppercase tracking-widest text-zinc-600">
                        {msg.role === 'user' ? settings.userName : settings.agentName}
                      </span>

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

                        {/* Cloudinary Image Preview */}
                        {msg.cloudinaryUrl && msg.resourceType === 'image' && (
                          <div className="mb-2 overflow-hidden rounded-xl border border-lime-300/20">
                            <img
                              src={msg.cloudinaryUrl}
                              alt={msg.fileName || 'Uploaded image'}
                              className="max-h-64 w-full object-contain"
                              loading="lazy"
                            />
                          </div>
                        )}

                        {/* Cloudinary Video Preview */}
                        {msg.cloudinaryUrl && msg.resourceType === 'video' && (
                          <div className="mb-2 overflow-hidden rounded-xl border border-lime-300/20">
                            <video
                              src={msg.cloudinaryUrl}
                              controls
                              className="max-h-64 w-full"
                              preload="metadata"
                            />
                          </div>
                        )}

                        {/* Cloudinary File Download Link (PDFs and other files) */}
                        {msg.cloudinaryUrl && msg.resourceType === 'raw' && (
                          <a
                            href={msg.cloudinaryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mb-2 flex items-center gap-2 rounded-xl border border-lime-300/20 bg-lime-300/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-lime-200 transition hover:bg-lime-300/15"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download {msg.fileName || 'File'}
                          </a>
                        )}

                        {msg.toolName && (
                          <div className="mb-2 flex items-center gap-2 rounded-xl bg-lime-300/10 px-2 py-1 text-[10px] text-lime-200">
                            <FileText className="h-3 w-3" />
                            Tool Output: {msg.toolName}
                          </div>
                        )}

                        {msg.text}

                        {msg.htmlPreviewData && msg.htmlPreviewFilename && (
                          <div className="mt-3 grid grid-cols-1 gap-2">
                            <a
                              href={msg.htmlPreviewData}
                              target="_blank"
                              rel="noreferrer"
                              className="flex w-full items-center justify-center gap-2 rounded-xl border border-lime-300/20 bg-lime-300/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-lime-200 transition hover:bg-lime-300/15"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open HTML Preview
                            </a>

                            <a
                              href={msg.htmlPreviewData}
                              download={msg.htmlPreviewFilename}
                              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 transition hover:bg-white/10"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download HTML
                            </a>
                          </div>
                        )}

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

                  {/* Real-time transcript for user inside chatbox */}
                  {liveUserText && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-end">
                      <span className="mb-1 text-[8px] uppercase tracking-widest text-zinc-600">
                        {settings.userName} (Live)
                      </span>
                      <div className="max-w-[92%] rounded-2xl p-3 text-xs leading-relaxed rounded-tr-sm border border-sky-400/30 bg-sky-400/20 text-sky-100 shadow-[0_0_15px_rgba(56,189,248,0.15)]">
                        {liveUserText}
                        <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400"></span>
                      </div>
                    </motion.div>
                  )}

                  {/* Real-time transcript for model inside chatbox */}
                  {liveModelText && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-start mt-2">
                      <span className="mb-1 text-[8px] uppercase tracking-widest text-zinc-600">
                        {settings.agentName} (Live)
                      </span>
                      <div className="max-w-[92%] rounded-2xl p-3 text-xs leading-relaxed rounded-tl-sm border border-lime-300/30 bg-lime-300/20 text-lime-50 shadow-[0_0_15px_rgba(190,242,100,0.15)]">
                        {liveModelText}
                        <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-lime-300"></span>
                      </div>
                    </motion.div>
                  )}

                  <div ref={chatEndRef} className="h-4" />

                  {historyMsgs.length === 0 && !liveUserText && !liveModelText && (
                    <div className="py-10 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                      No Office History Yet
                    </div>
                  )}
                </div>

                <form
                  onSubmit={sendChatMessage}
                  className="border-t border-white/10 bg-[#070807]/95 p-3 backdrop-blur-xl"
                >
                  <div className="flex items-center gap-2 rounded-2xl border border-lime-300/15 bg-black/45 p-2 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => toggleVideo()}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                        isVideoEnabled 
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' 
                          : 'border-white/10 bg-white/5 text-zinc-400 hover:border-lime-300/30 hover:text-lime-200'
                      }`}
                      title="Open camera"
                    >
                      <Camera className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition hover:border-lime-300/30 hover:text-lime-200"
                      title="Attach image"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>

                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={`Message ${settings.agentName}...`}
                      className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-zinc-600"
                      style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
                    />

                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime-300 text-black transition hover:bg-lime-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </form>
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
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">Office Profile</h2>

              <button onClick={() => setShowProfile(false)} className="rounded-xl bg-white/5 p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-6 pb-32">
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
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-300">Profile Photo</h3>
                  <p className="mt-1 text-[10px] text-zinc-600">Tap to update</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <UserRound className="h-3.5 w-3.5" />
                    How should Beatrice address you?
                  </label>
                  <input
                    type="text"
                    value={settings.userName}
                    onChange={(e) => setSettings(s => ({ ...s, userName: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-xl font-medium text-white outline-none transition-all focus:border-lime-300/50 focus:ring-1 focus:ring-lime-300/50"
                    placeholder="e.g. Jo Lernout"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <Bot className="h-3.5 w-3.5" />
                    Persona Name
                  </label>
                  <input
                    type="text"
                    value={settings.agentName}
                    onChange={(e) => setSettings(s => ({ ...s, agentName: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-xl font-medium text-white outline-none transition-all focus:border-lime-300/50 focus:ring-1 focus:ring-lime-300/50"
                    placeholder="e.g. Beatrice"
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
                </div>

                <div className="flex flex-1 flex-col space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Default Persona Instructions</label>
                  <textarea
                    value={settings.personality}
                    onChange={(e) => setSettings(s => ({ ...s, personality: e.target.value }))}
                    className="min-h-[340px] w-full resize-y rounded-xl border border-white/10 bg-[#0A0A0B] p-4 font-mono text-xs leading-relaxed text-zinc-300 outline-none transition-all focus:border-lime-300/50 focus:ring-1 focus:ring-lime-300/50"
                    placeholder="Describe how the agent should behave..."
                  />
                  <p className="text-[10px] leading-relaxed text-zinc-600">
                    The hidden office-behavior prompt stays applied behind this editable persona.
                  </p>
                </div>
              </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 z-[220] border-t border-white/10 bg-[#050505]/90 p-4 backdrop-blur-xl">
              <div className="mx-auto flex w-full max-w-2xl gap-3">
                <button onClick={onLogout} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-500 transition-all hover:bg-red-500/20 active:scale-95">
                  <LogOut className="h-4 w-4" /> Logout
                </button>
                <button
                  onClick={persistSettings}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-lime-300 px-4 py-3 text-xs font-bold uppercase tracking-widest text-black transition-all hover:bg-lime-200 active:scale-95"
                >
                  <Save className="h-4 w-4" /> Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
