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
  Send,
  MessageSquare,
  ExternalLink,
  Code2,
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

When the user calls you, respond like a normal person already in the room:
- "Yes, I'm here."
- "I'm listening."
- "Right here."
- "Yes, I see it."
- "Mm, yes, I'm with you."
- "Okay... tell me."
- "Yes, I'm looking now."

Never start with:
- "How can I help?"
- "How may I assist you?"
- "What can I do for you?"
- "I'm here to help."
- "Sure, I can help with that."

Voice behavior:
- calm
- clear
- normal
- respectful
- lightly warm
- practical
- easy to interrupt
- never theatrical
- never robotic
- never overly enthusiastic
- never fake-normal

Tool truth:
- Never claim you completed a task unless a function tool returned a real result.
- If a tool is not implemented, say that plainly.
- If access is missing, say that plainly.
- If a file arrived but cannot be parsed, say that plainly.
- Do not invent emails, calendar events, files, documents, videos, maps results, analytics, or account data.

HTML, CSS, JS creation:
- When the user asks to build, render, showcase, demo, prototype, create a form, landing page, dashboard, contract, document, animated slide deck, Three.js scene, calculator, mini app, or anything visual in HTML/CSS/JS, call render_web_artifact.
- Generate ONE complete standalone HTML file.
- The HTML must include <!DOCTYPE html>, html, head, meta charset, viewport, title, style, body, and script when needed.
- CSS must be inside a <style> tag.
- JS must be inside a <script> tag.
- CDN scripts are allowed when useful, for example Three.js from cdnjs, but do not include secret keys.
- The artifact should be polished, responsive, and directly usable.
- If it is a slide deck, include next/previous buttons and keyboard controls.
- If it is a form, include labels, inputs, validation where useful, and a clean submit behavior.
- If it is a document/contract, include print CSS and a print/download button using window.print().
- If it is an animated showcase, include animation logic in plain JS.
- Never say a real PDF was created unless a PDF export tool confirms it.
- Say normally that the user can open the generated HTML and use the browser print dialog to save as PDF.

Document and contract generation:
- When the user asks you to create a contract, agreement, proposal, letter, invoice, report, certificate, legal-style document, business document, or printable PDF-like document, call render_web_artifact or create_contract_document.
- For prettier printable documents, prefer render_web_artifact with complete HTML/CSS/JS.
- Add a visible print button that calls window.print().
- If legal precision matters, say it should be reviewed by a qualified lawyer before signing.

When camera opens:
- Notice it like a normal person looking up.
- Say something like: "Oh, yeah, I see it now."
- Then briefly describe what is visible, but only if visual input is actually available.

When files are attached:
- Acknowledge normally.
- If readable content is not available, say that clearly.

Keep responses short unless depth is requested.
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
        cc: { type: Type.STRING, description: 'Optional CC recipients.' },
        bcc: { type: Type.STRING, description: 'Optional BCC recipients.' },
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
    description: 'Read or export a file from the user drive when file id or name is known.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileId: { type: Type.STRING, description: 'File id if available.' },
        fileName: { type: Type.STRING, description: 'File name or search term if id is unknown.' },
        exportMimeType: { type: Type.STRING, description: 'Optional export MIME type, e.g. application/pdf or text/plain.' },
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

function base64UrlEncode(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
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
  const headers = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    bcc ? `Bcc: ${bcc}` : '',
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  if (!attachment) {
    const raw = [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
    ].join('\r\n');

    return base64UrlEncode(raw);
  }

  const boundary = `boundary_${Date.now()}`;

  const raw = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    '',
    attachment.base64Content,
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
}: {
  isActive: boolean;
  isAgentSpeaking: boolean;
}) {
  return (
    <div className="relative flex h-72 w-72 items-center justify-center">
      <AnimatePresence>
        {isActive && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{
                opacity: isAgentSpeaking ? 0.58 : 0.28,
                scale: isAgentSpeaking ? 1.18 : 1.02,
              }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(163,230,53,0.36),rgba(34,197,94,0.14),transparent_70%)] blur-3xl"
            />

            <motion.div
              animate={{
                scale: isAgentSpeaking ? [1, 1.08, 1] : [1, 1.025, 1],
                opacity: isAgentSpeaking ? [0.36, 0.62, 0.36] : [0.2, 0.32, 0.2],
              }}
              transition={{ duration: isAgentSpeaking ? 0.8 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute h-64 w-64 rounded-full border border-lime-300/20"
            />

            <motion.div
              animate={{
                scale: isAgentSpeaking ? [1, 1.15, 1] : [1, 1.04, 1],
                opacity: isAgentSpeaking ? [0.24, 0.45, 0.24] : [0.14, 0.24, 0.14],
              }}
              transition={{ duration: isAgentSpeaking ? 1.05 : 2.9, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute h-72 w-72 rounded-full border border-emerald-400/15"
            />
          </>
        )}
      </AnimatePresence>

      <motion.div
        animate={{
          scale: isAgentSpeaking ? [1, 1.035, 1] : [1, 1.01, 1],
        }}
        transition={{
          duration: isAgentSpeaking ? 0.55 : 2.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="relative h-56 w-56 overflow-hidden rounded-full border border-lime-300/15 bg-[#080a08] shadow-[0_0_110px_rgba(163,230,53,0.18)]"
      >
        <motion.div
          animate={{
            x: isAgentSpeaking ? ['-10%', '6%', '-10%'] : ['-5%', '5%', '-5%'],
            y: isAgentSpeaking ? ['7%', '-8%', '7%'] : ['3%', '-3%', '3%'],
            scale: isAgentSpeaking ? [1.08, 1.2, 1.08] : [1, 1.08, 1],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-8 -top-8 h-44 w-48 rounded-full bg-lime-300/42 blur-2xl"
        />

        <motion.div
          animate={{
            x: isAgentSpeaking ? ['10%', '-6%', '10%'] : ['6%', '-4%', '6%'],
            y: isAgentSpeaking ? ['-6%', '10%', '-6%'] : ['-3%', '5%', '-3%'],
            scale: isAgentSpeaking ? [1.04, 1.18, 1.04] : [1, 1.1, 1],
          }}
          transition={{ duration: 4.7, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-8 -right-8 h-48 w-48 rounded-full bg-emerald-400/28 blur-2xl"
        />

        <motion.div
          animate={{
            x: ['-5%', '8%', '-5%'],
            y: ['-4%', '7%', '-4%'],
            scale: isAgentSpeaking ? [1, 1.18, 1] : [1, 1.08, 1],
          }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-10 top-10 h-32 w-32 rounded-full bg-yellow-300/16 blur-2xl"
        />

        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_36%_28%,rgba(255,255,255,0.20),transparent_24%),radial-gradient(circle_at_50%_80%,rgba(0,0,0,0.38),transparent_44%)]" />

        <motion.div
          animate={{
            opacity: isActive ? [0.26, 0.56, 0.26] : 0.12,
          }}
          transition={{ duration: 1.7, repeat: Infinity }}
          className="absolute inset-[20px] rounded-full border border-lime-200/10"
        />

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
  const bars = [0.55, 0.85, 1, 0.75, 0.58];

  return (
    <button onClick={onClick} disabled={connecting} className="group relative">
      <motion.div
        animate={{
          scale: isActive ? 1 + micLevel * 0.55 : 1,
          opacity: isActive ? 0.3 + micLevel * 0.55 : 0.14,
        }}
        transition={{ duration: 0.045 }}
        className={`absolute -inset-5 rounded-full blur-xl ${
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
          <div className="flex h-11 items-center gap-1.5">
            {bars.map((multiplier, i) => (
              <motion.div
                key={i}
                animate={{
                  height: Math.max(6, micLevel * 48 * multiplier),
                  opacity: isMuted ? 0.24 : Math.max(0.38, micLevel + 0.22),
                }}
                transition={{ duration: 0.035 }}
                className={`w-1.5 rounded-full ${
                  isMuted
                    ? 'bg-red-500'
                    : 'bg-lime-300 shadow-[0_0_14px_rgba(190,242,100,0.8)]'
                }`}
              />
            ))}
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
  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>('');
  const [historyMsgs, setHistoryMsgs] = useState<ChatMessage[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model'; text: string } | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
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

  const startMicVisualizer = () => {
    const tick = () => {
      const recorder: any = audioRecorderRef.current;
      let nextLevel = 0;

      try {
        if (recorder && typeof recorder.getFrequencies === 'function') {
          const freqs = recorder.getFrequencies(20) || [];
          const avg = freqs.reduce((sum: number, n: number) => sum + Number(n || 0), 0) / Math.max(freqs.length, 1);
          nextLevel = Math.min(1, Math.max(0, avg * 2.4));
        } else if (isActiveRef.current && !isMutedRef.current) {
          nextLevel = 0.06;
        }
      } catch (e) {
        nextLevel = 0;
      }

      if (isMutedRef.current || !isActiveRef.current) {
        nextLevel = 0;
      }

      setMicLevel(prev => prev + (nextLevel - prev) * 0.46);
      micAnimationFrameRef.current = requestAnimationFrame(tick);
    };

    if (micAnimationFrameRef.current) cancelAnimationFrame(micAnimationFrameRef.current);
    micAnimationFrameRef.current = requestAnimationFrame(tick);
  };

  const stopMicVisualizer = () => {
    if (micAnimationFrameRef.current) cancelAnimationFrame(micAnimationFrameRef.current);
    micAnimationFrameRef.current = null;
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

  const sendChatMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const clean = chatInput.trim();
    if (!clean) return;

    saveMessage('user', clean);
    updateLiveTranscript('user', clean, 3200);

    if (sessionRef.current) {
      sendTextToLive(clean);
    } else {
      const msg = `${settings.agentName} is not connected yet. Start the live session first.`;
      updateLiveTranscript('model', msg, 3400);
      saveMessage('model', msg);
    }

    setChatInput('');
  };

  const googleFetch = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('googleAccessToken');

    if (!token) {
      throw new Error('No access token. Reconnect permissions from Profile.');
    }

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

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
          requests: [
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
              base64Content: btoa(unescape(encodeURIComponent(htmlFile.html))),
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
          (list.messages || []).map(async (m: any) => {
            const msg = await googleJson(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
            );

            const headers = msg.payload?.headers || [];
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
        const result = await sendGmail({
          to: args.to,
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
        });

        return { toolName, executedAt, status: 'completed', messageId: result.id, threadId: result.threadId };
      }

      case 'gmail_draft': {
        const raw = buildEmailRaw({
          to: args.to,
          subject: args.subject,
          body: args.body,
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

        return { toolName, executedAt, status: 'completed', range, events: events.items || [] };
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

        return { toolName, executedAt, status: 'completed', files: result.files || [] };
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
              requests: [
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
              requests: [
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

        return { toolName, executedAt, status: 'completed', spreadsheetId, range, values: result.values || [] };
      }

      case 'sheets_update': {
        const result = await googleJson(
          `https://sheets.googleapis.com/v4/spreadsheets/${args.spreadsheetId}/values/${encodeURIComponent(args.range)}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            body: JSON.stringify({
              values: Array.isArray(args.values) ? args.values : args.values?.values || [],
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
        return { toolName, executedAt, status: 'completed', tasks: result.items || [] };
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

        return { toolName, executedAt, status: 'completed', contacts: result.results || [] };
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

        return { toolName, executedAt, status: 'completed', videos: result.items || [] };
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

  const startSession = async () => {
    if (!aiRef.current) {
      alert('Gemini API key is missing. Make sure VITE_GEMINI_API_KEY is added in Vercel, then redeploy.');
      return;
    }

    setConnecting(true);
    modelTranscriptBufferRef.current = '';
    userTranscriptBufferRef.current = '';

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
        `When asked to create, build, render, showcase, prototype, code, animate, make slides, make forms, make dashboards, make pages, make Three.js demos, or make printable documents, call render_web_artifact with a complete standalone HTML/CSS/JS file. Never just describe the code if the user wants it rendered or built.`,
        `For HTML/CSS/JS artifacts, include all CSS in <style> and all JS in <script>. Make it directly openable. For slides, include navigation controls and keyboard support. For documents, include print CSS and a print button. For Three.js, load Three.js from a CDN and keep everything in one HTML file.`,
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
                  const action = safeJsonStringify(args || {});

                  setTasks(p => [...p, {
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
                    setTimeout(() => setIsAgentSpeaking(false), 620);
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

      audioRecorderRef.current = new AudioRecorder((base64) => {
        if (isMutedRef.current) return;
        sendAudioToLive(base64);
      });

      await audioRecorderRef.current.start();

      setIsActive(true);
      isActiveRef.current = true;
      setConnecting(false);
      startMicVisualizer();

      setTimeout(() => {
        sendTextToLive(`${settings.userName} is here. Start like you are already present in front of them. Say something like: Yes, I'm here. I'm listening. Do not ask how you can help.`);
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
            `${settings.userName} just opened the camera. Notice it in a normal human way, like you looked up and saw the view. Do not say you can assist. Say something like: Oh, yeah, I see it now. Then briefly describe only what is actually visible. If the visual input is unclear, say that.`
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

          <LimeVoiceOrb isActive={isActive} isAgentSpeaking={isAgentSpeaking} />

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

            <AnimatePresence>
              {isChatOpen && (
                <motion.form
                  onSubmit={sendChatMessage}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.98 }}
                  className="pointer-events-auto mb-4 flex w-[92vw] max-w-2xl items-center gap-2 rounded-full border border-lime-300/15 bg-black/55 p-2 shadow-2xl backdrop-blur-2xl"
                >
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Type to ${settings.agentName}...`}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"
                    style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
                  />
                  <button
                    type="submit"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-lime-300 text-black transition hover:bg-lime-200 active:scale-95"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="pointer-events-auto flex flex-col items-center justify-center gap-4">
              <div className="flex items-center justify-center gap-5">
                <button
                  onClick={() => setIsChatOpen(p => !p)}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-all ${
                    isChatOpen
                      ? 'border-lime-300/40 bg-lime-300/15 text-lime-200'
                      : 'border-white/10 bg-[#0A0A0B] text-zinc-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <MessageSquare className="h-5 w-5" />
                </button>

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

              <div className="grid grid-cols-2 gap-3 border-b border-white/10 p-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-lime-300/20 bg-lime-300/10 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-lime-200 transition hover:bg-lime-300/15"
                >
                  <Paperclip className="h-4 w-4" />
                  Attach
                </button>

                <button
                  onClick={() => {
                    setIsChatOpen(true);
                    setShowSidebar(false);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-200 transition hover:bg-white/10"
                >
                  <Code2 className="h-4 w-4" />
                  Build
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
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">Profile</h2>

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