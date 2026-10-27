import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '30mb' }));

// Shared Gemini Client with telemetry user agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const AP_SYSTEM_INSTRUCTION = `You are the LedgerPilot Autonomous AP Agent, an elite financial accounts payable auditor.
You assist controllers, accountants, and finance operations leads with:
1. Vendor invoice verification, line-item arithmetic, and subtotal sum checking.
2. Detecting sales tax rate discrepancies, unlinked POs, and fraudulent or unverified remittance changes.
3. Classifying payment terms (Net 30, Net 15, 2/10 Net 30 early discounts).
4. Explaining status milestones (Received, Processing, Pending Review, Needs Attention, Approved, Processed).

Tone: Direct, knowledgeable, professional human accountant. Never use AI cliches like "delve", "testament", "in today's digital landscape", or "streamline your world". Always ground your answers in specific financial terminology (GL accounts, 2-way / 3-way matching, variance thresholds, remittance routes).`;

// --- REST Endpoint: Multi-Turn Gemini Chatbot ---
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { messages, model = 'gemini-3.8-flash', invoiceContext } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    // Supported models based on user requirements:
    // gemini-4-argon: complex audit tasks
    // gemini-3.8-flash: general queries
    // gemini-3.1-flash-lite: fast tasks
    const validModels = ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    const chosenModel = validModels.includes(model) ? model : 'gemini-3.8-flash';

    // Format conversation history
    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Inject active invoice context if provided
    let systemInstruction = AP_SYSTEM_INSTRUCTION;
    if (invoiceContext) {
      systemInstruction += `\n\nActive Invoice Context in Review:\n${JSON.stringify(invoiceContext, null, 2)}`;
    }

    const response = await ai.models.generateContent({
      model: chosenModel,
      contents,
      config: {
        systemInstruction,
        temperature: 0.4,
      },
    });

    return res.json({
      reply: response.text || 'Invoice verification complete.',
      modelUsed: chosenModel,
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to process invoice chat query.',
    });
  }
});

// --- REST Endpoint: Gemini Audio Transcription ---
app.post('/api/gemini/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', prompt } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 payload is required.' });
    }

    const audioPart = {
      inlineData: {
        mimeType,
        data: audioBase64,
      },
    };

    const textPrompt = prompt ||
      'Transcribe this voice memo regarding vendor invoices, line item discrepancies, or payment approvals accurately into text with timestamps and financial entity recognition.';

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [audioPart, { text: textPrompt }],
      },
    });

    return res.json({
      transcription: response.text || '',
    });
  } catch (error: any) {
    console.error('Transcription error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to transcribe audio intake.',
    });
  }
});

// --- REST Endpoint: Voice Assistant Fallback Dialogue ---
app.post('/api/gemini/voice-dialogue', async (req, res) => {
  try {
    const { transcript, invoiceContext } = req.body;

    const promptText = transcript || 'Checking invoice queue';
    let systemInstruction = `${AP_SYSTEM_INSTRUCTION}\nProvide a concise, direct spoken response (1-2 sentences maximum) suitable for audio readout to an AP controller.`;

    if (invoiceContext) {
      systemInstruction += `\nTarget Invoice: ${invoiceContext.vendor} (${invoiceContext.invoiceNumber}), Amount: $${invoiceContext.amount}, Status: ${invoiceContext.status}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: promptText,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    return res.json({
      text: response.text || 'Checking AP database records now.',
    });
  } catch (error: any) {
    console.error('Voice dialogue error:', error);
    return res.status(500).json({
      error: error?.message || 'Voice assistant error.',
    });
  }
});

// --- WebSocket Server: Gemini Live API (gemini-3.8-live) ---
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  if (url.pathname === '/api/live' || url.pathname === '/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (clientWs: WebSocket) => {
  console.log('Gemini Live API client connected');
  let session: any = null;

  try {
    if (process.env.GEMINI_API_KEY) {
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
          systemInstruction: AP_SYSTEM_INSTRUCTION,
        },
        callbacks: {
          onmessage: (message: any) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ audio: audioData }));
            }
            if (message.serverContent?.interrupted && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
        },
      });
    }

    clientWs.on('message', (data: Buffer | string) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.audio && session) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        }
      } catch (err) {
        console.error('Live socket input error:', err);
      }
    });

    clientWs.on('close', () => {
      console.log('Gemini Live client disconnected');
      if (session && typeof session.close === 'function') {
        session.close();
      }
    });
  } catch (liveError) {
    console.error('Failed to connect to Gemini Live API:', liveError);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ error: 'Live API connection unavailable. Fallback active.' }));
    }
  }
});

// Vite Middleware for Dev or Static Serving for Prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`LedgerPilot Server running on port ${port}`);
  });
}

startServer();
