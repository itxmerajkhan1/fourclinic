import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
}

export interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => unknown;
  setHeader: (name: string, value: string | number | readonly string[]) => unknown;
}

interface FirebaseAppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

let cachedFirebaseConfig: FirebaseAppletConfig | null = null;

export function getFirebaseConfig(): FirebaseAppletConfig {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;
  const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(firebaseConfigPath)) {
    try {
      cachedFirebaseConfig = JSON.parse(
        fs.readFileSync(firebaseConfigPath, 'utf8')
      ) as FirebaseAppletConfig;
      return cachedFirebaseConfig;
    } catch {
      cachedFirebaseConfig = {};
    }
  }
  cachedFirebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || '',
  };
  return cachedFirebaseConfig;
}

function ensureAdminApp(): string {
  const cfg = getFirebaseConfig();
  const projectId = cfg.projectId || process.env.FIREBASE_PROJECT_ID || '';
  if (projectId && !getApps().length) {
    // Token verification only (verifyIdToken requires no IAM on Google-hosted Starter Tier projects)
    initializeApp({ projectId });
  }
  return projectId;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function applyApiSecurityHeaders(res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function getBearerToken(req: ApiRequest): string | null {
  const raw = req.headers.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function getClientIp(req: ApiRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  if (first) {
    return first.split(',')[0].trim() || 'unknown';
  }
  return req.socket?.remoteAddress || 'unknown';
}

// Sliding-window rate limiter for /api/chat (20 requests per 60s)
// Uses Upstash Redis REST when configured for multi-instance Vercel persistence,
// with per-instance sliding window fallback for local dev / zero-config deployments.
const CHAT_WINDOW_MS = 60_000;
const CHAT_MAX_REQUESTS = 20;
const REDIS_TIMEOUT_MS = 2500;
const chatRateMap = new Map<string, number[]>();

function normalizeUpstashSecret(val: string | undefined, expectedKey: string): string {
  let trimmed = val?.trim() || '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  const keyPrefixPattern = new RegExp(`^${expectedKey}\\s*=\\s*`, 'i');
  if (keyPrefixPattern.test(trimmed)) {
    trimmed = trimmed.replace(keyPrefixPattern, '').trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      trimmed = trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

type UpstashConfigResult =
  | { url: string; token: string }
  | {
      invalid: true;
      reason:
        | 'non_https_protocol'
        | 'embedded_credentials'
        | 'assignment_prefix'
        | 'missing_https_scheme'
        | 'malformed_url';
      scheme?: string;
    }
  | null;

function getValidatedUpstashConfig(): UpstashConfigResult {
  const rawUrl = normalizeUpstashSecret(process.env.UPSTASH_REDIS_REST_URL, 'UPSTASH_REDIS_REST_URL');
  const rawToken = normalizeUpstashSecret(
    process.env.UPSTASH_REDIS_REST_TOKEN,
    'UPSTASH_REDIS_REST_TOKEN'
  );
  if (!rawUrl || !rawToken) return null;

  if (/^[A-Z0-9_]+\s*=/.test(rawUrl)) {
    return { invalid: true, reason: 'assignment_prefix' };
  }
  if (/^[a-zA-Z0-9.-]+\.upstash\.io\/?$/.test(rawUrl)) {
    return { invalid: true, reason: 'missing_https_scheme' };
  }

  try {
    const parsed = new URL(rawUrl);
    const isLocalHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
    if (parsed.protocol !== 'https:' && !isLocalHttp) {
      return { invalid: true, reason: 'non_https_protocol', scheme: parsed.protocol };
    }
    if (parsed.username || parsed.password) {
      return { invalid: true, reason: 'embedded_credentials' };
    }
    return {
      url: rawUrl.replace(/\/+$/, ''),
      token: rawToken,
    };
  } catch {
    return { invalid: true, reason: 'malformed_url' };
  }
}

function summarizeSafeRedisError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'unknown_error';
  const obj = err as { name?: unknown; code?: unknown; cause?: unknown };
  const name = typeof obj.name === 'string' ? obj.name : 'Error';
  const directCode = typeof obj.code === 'string' ? obj.code : '';
  const causeCode =
    obj.cause &&
    typeof obj.cause === 'object' &&
    typeof (obj.cause as { code?: unknown }).code === 'string'
      ? (obj.cause as { code: string }).code
      : '';
  const code = directCode || causeCode;
  return code ? `${name}:${code}` : name;
}

export function isDistributedRateLimitConfigured(): boolean {
  const cfg = getValidatedUpstashConfig();
  return Boolean(cfg && !('invalid' in cfg));
}

export async function verifyUpstashRedisConnection(): Promise<{
  configured: boolean;
  connected: boolean;
  status: 'connected' | 'unreachable' | 'invalid_config' | 'not_configured';
  configHint?: string;
  latencyMs?: number;
}> {
  const cfg = getValidatedUpstashConfig();
  if (!cfg) {
    return { configured: false, connected: false, status: 'not_configured' };
  }
  if ('invalid' in cfg) {
    const hint =
      cfg.reason === 'non_https_protocol'
        ? `Expected https:// Upstash REST URL (received ${cfg.scheme || 'non-https'} scheme).`
        : cfg.reason === 'embedded_credentials'
          ? 'UPSTASH_REDIS_REST_URL must not contain embedded username/password; pass token in UPSTASH_REDIS_REST_TOKEN.'
          : cfg.reason === 'assignment_prefix'
            ? 'UPSTASH_REDIS_REST_URL contains a "KEY=" prefix; set only the https://... REST URL value.'
            : cfg.reason === 'missing_https_scheme'
              ? 'UPSTASH_REDIS_REST_URL is missing the https:// scheme prefix.'
              : 'UPSTASH_REDIS_REST_URL is not a valid https:// URL (check for placeholder text, spaces, or missing https://).';
    console.warn(`Upstash Redis configuration rejected (${cfg.reason}).`);
    return { configured: true, connected: false, status: 'invalid_config', configHint: hint };
  }

  const startedAt = Date.now();
  try {
    const resp = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['PING']]),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });

    if (!resp.ok) {
      console.warn(`Upstash Redis PING failed (httpStatus=${resp.status}).`);
      return { configured: true, connected: false, status: 'unreachable' };
    }

    const results = (await resp.json()) as Array<{ result?: unknown; error?: unknown }>;
    const pong = results?.[0]?.result;
    const itemErr = results?.[0]?.error;
    if (itemErr || pong !== 'PONG') {
      console.warn('Upstash Redis PING failed (unexpected_pipeline_response).');
      return { configured: true, connected: false, status: 'unreachable' };
    }

    return {
      configured: true,
      connected: true,
      status: 'connected',
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    console.warn(`Upstash Redis PING failed (${summarizeSafeRedisError(err)}).`);
    return { configured: true, connected: false, status: 'unreachable' };
  }
}

export function checkChatRateLimit(
  key: string,
  now = Date.now()
): { allowed: boolean; remaining: number; limit: number; retryAfterSec: number } {
  const cutoff = now - CHAT_WINDOW_MS;
  const existing = (chatRateMap.get(key) || []).filter((ts) => ts > cutoff);

  if (existing.length >= CHAT_MAX_REQUESTS) {
    const oldest = existing[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + CHAT_WINDOW_MS - now) / 1000));
    chatRateMap.set(key, existing);
    return { allowed: false, remaining: 0, limit: CHAT_MAX_REQUESTS, retryAfterSec };
  }

  existing.push(now);
  chatRateMap.set(key, existing);

  // Bound map growth in long-lived Express processes
  if (chatRateMap.size > 2000) {
    for (const [entryKey, stamps] of chatRateMap.entries()) {
      const fresh = stamps.filter((ts) => ts > cutoff);
      if (fresh.length === 0) chatRateMap.delete(entryKey);
      else chatRateMap.set(entryKey, fresh);
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, CHAT_MAX_REQUESTS - existing.length),
    limit: CHAT_MAX_REQUESTS,
    retryAfterSec: 0,
  };
}

export async function checkDistributedChatRateLimit(
  key: string,
  now = Date.now()
): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
  backend: 'upstash-redis' | 'memory';
}> {
  const safeKey = key.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 96) || 'unknown';
  const cfg = getValidatedUpstashConfig();

  if (cfg && 'invalid' in cfg) {
    console.warn('Upstash Redis rate-limit skipped (invalid_config); using in-memory limiter.');
  } else if (cfg) {
    try {
      const windowBucket = Math.floor(now / CHAT_WINDOW_MS);
      const redisKey = `fc:rl:chat:${safeKey}:${windowBucket}`;
      const resp = await fetch(`${cfg.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, Math.ceil(CHAT_WINDOW_MS / 1000) + 5, 'NX'],
        ]),
        signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      });

      if (resp.ok) {
        const results = (await resp.json()) as Array<{ result?: unknown; error?: unknown }>;
        const rawCount = results?.[0]?.result;
        const itemErr = results?.[0]?.error;
        const count = Number(rawCount);
        if (!itemErr && Number.isInteger(count) && count >= 1) {
          if (count > CHAT_MAX_REQUESTS) {
            const msIntoWindow = now % CHAT_WINDOW_MS;
            const retryAfterSec = Math.max(1, Math.ceil((CHAT_WINDOW_MS - msIntoWindow) / 1000));
            return {
              allowed: false,
              remaining: 0,
              limit: CHAT_MAX_REQUESTS,
              retryAfterSec,
              backend: 'upstash-redis',
            };
          }
          return {
            allowed: true,
            remaining: Math.max(0, CHAT_MAX_REQUESTS - count),
            limit: CHAT_MAX_REQUESTS,
            retryAfterSec: 0,
            backend: 'upstash-redis',
          };
        }
        console.warn('Upstash Redis pipeline returned invalid counter; falling back to memory.');
      } else {
        console.warn(`Upstash Redis rate-limit HTTP fallback (status=${resp.status}).`);
      }
    } catch (err) {
      console.warn(`Upstash Redis rate-limit fallback (${summarizeSafeRedisError(err)}).`);
    }
  }

  const mem = checkChatRateLimit(safeKey, now);
  return { ...mem, backend: 'memory' };
}

function parseJsonBody<T>(req: ApiRequest): T | null {
  if (req.body == null) return null;
  if (typeof req.body === 'string') {
    if (req.body.length > 65_536) return null;
    try {
      return JSON.parse(req.body) as T;
    } catch {
      return null;
    }
  }
  if (typeof req.body === 'object') {
    return req.body as T;
  }
  return null;
}

export async function handleHealth(_req: ApiRequest, res: ApiResponse) {
  applyApiSecurityHeaders(res);
  const cfg = getFirebaseConfig();
  const redis = await verifyUpstashRedisConnection();
  res.json({
    ok: true,
    firebaseProjectId: cfg.projectId || null,
    firestoreDatabaseId: cfg.firestoreDatabaseId || null,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    rateLimitMode: redis.connected ? 'upstash-redis' : 'memory',
    redis,
    timestamp: new Date().toISOString(),
  });
}

export async function handleAuthVerify(req: ApiRequest, res: ApiResponse) {
  applyApiSecurityHeaders(res);
  if (req.method && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }
  const projectId = ensureAdminApp();
  if (!projectId) {
    res.status(503).json({ error: 'Firebase project is not configured' });
    return;
  }
  try {
    const decoded = await getAdminAuth(getApp()).verifyIdToken(token);
    res.json({
      verified: true,
      uid: decoded.uid,
      email: decoded.email || null,
      emailVerified: Boolean(decoded.email_verified),
    });
  } catch {
    res.status(401).json({
      verified: false,
      error: 'Invalid or expired authentication token.',
    });
  }
}

export async function handleAuthBootstrapRole(req: ApiRequest, res: ApiResponse) {
  applyApiSecurityHeaders(res);
  if (req.method && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }
  const projectId = ensureAdminApp();
  if (!projectId) {
    res.status(503).json({ error: 'Firebase project is not configured' });
    return;
  }
  try {
    const decoded = await getAdminAuth(getApp()).verifyIdToken(token);
    const configuredAdminEmail = (
      process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || 'itxmerajkhan3109@gmail.com'
    ).toLowerCase();
    const isBootstrapAdmin =
      Boolean(configuredAdminEmail) &&
      decoded.email_verified === true &&
      typeof decoded.email === 'string' &&
      decoded.email.trim().toLowerCase() === configuredAdminEmail;

    res.json({
      uid: decoded.uid,
      emailVerified: Boolean(decoded.email_verified),
      initialRole: isBootstrapAdmin ? 'admin' : 'patient',
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export interface ChatContextPayload {
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  clinicContext?: {
    clinicName?: string;
    address?: string;
    phone?: string;
    email?: string;
    hoursSummary?: string;
    services?: Array<{ id: string; name: string; priceLabel: string; durationMins: number }>;
    doctors?: Array<{ id: string; name: string; role: string; specialty: string; languages: string }>;
    upcomingSlots?: Array<{ date: string; doctorId: string; doctorName: string; times: string[] }>;
    allowChatbotBooking?: boolean;
  };
}

export async function handleChat(req: ApiRequest, res: ApiResponse) {
  applyApiSecurityHeaders(res);
  if (req.method && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let verifiedUser = false;
  let verifiedUid: string | null = null;
  const token = getBearerToken(req);
  if (token) {
    const projectId = ensureAdminApp();
    if (projectId) {
      try {
        const decoded = await getAdminAuth(getApp()).verifyIdToken(token);
        verifiedUser = Boolean(decoded.email_verified);
        verifiedUid = decoded.uid;
      } catch {
        res.status(401).json({ error: 'Invalid authentication token.' });
        return;
      }
    }
  }

  const rateKey = verifiedUid ? `uid:${verifiedUid}` : `ip:${getClientIp(req)}`;
  const rate = await checkDistributedChatRateLimit(rateKey);
  res.setHeader('X-RateLimit-Limit', String(rate.limit));
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    res.status(429).json({
      error: `Too many messages sent. Please wait ${rate.retryAfterSec} seconds and try again.`,
    });
    return;
  }

  const body = parseJsonBody<ChatContextPayload>(req);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 600) {
    res.status(400).json({ error: 'Message must be between 1 and 600 characters.' });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'AI receptionist is temporarily unavailable because GEMINI_API_KEY is not configured.',
    });
    return;
  }

  const ctx = body?.clinicContext && typeof body.clinicContext === 'object' ? body.clinicContext : {};
  const servicesList = Array.isArray(ctx.services)
    ? ctx.services
        .slice(0, 20)
        .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
        .map((s) => ({
          id: s.id.slice(0, 64),
          name: s.name.slice(0, 80),
          priceLabel: String(s.priceLabel || '').slice(0, 40),
          durationMins: Number(s.durationMins) || 30,
        }))
    : [];
  const doctorsList = Array.isArray(ctx.doctors)
    ? ctx.doctors
        .slice(0, 15)
        .filter((d) => d && typeof d.id === 'string' && typeof d.name === 'string')
        .map((d) => ({
          id: d.id.slice(0, 64),
          name: d.name.slice(0, 80),
          role: String(d.role || '').slice(0, 60),
          specialty: String(d.specialty || '').slice(0, 80),
          languages: String(d.languages || '').slice(0, 80),
        }))
    : [];
  const slotsList = Array.isArray(ctx.upcomingSlots)
    ? ctx.upcomingSlots
        .slice(0, 20)
        .filter((s) => s && typeof s.date === 'string' && typeof s.doctorId === 'string' && Array.isArray(s.times))
        .map((s) => ({
          date: s.date.slice(0, 10),
          doctorId: s.doctorId.slice(0, 64),
          doctorName: String(s.doctorName || '').slice(0, 80),
          times: s.times.slice(0, 10).map((t) => String(t).slice(0, 5)),
        }))
    : [];
  const allowChatbotBooking = ctx.allowChatbotBooking !== false;

  const historyLines = Array.isArray(body?.history)
    ? body.history
        .slice(-8)
        .filter(
          (m) =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.text === 'string' &&
            m.text.trim().length > 0
        )
        .map((m) => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.text.trim().slice(0, 600)}`)
        .join('\n')
    : '';

  const clinicName = typeof ctx.clinicName === 'string' ? ctx.clinicName.slice(0, 80) : 'FourClinic';
  const clinicAddress =
    typeof ctx.address === 'string' ? ctx.address.slice(0, 160) : '88 Harbor Street, Suite 2, Greenfield';
  const clinicPhone = typeof ctx.phone === 'string' ? ctx.phone.slice(0, 30) : '+1 555 010 0000';
  const hoursSummary =
    typeof ctx.hoursSummary === 'string'
      ? ctx.hoursSummary.slice(0, 400)
      : 'Mon–Fri 9:00 AM–5:00 PM (lunch 12–1), Sat 9:00 AM–1:00 PM, Sun Closed';

  const systemInstruction = `You are the FourClinic Front-Desk AI Dental Receptionist.
LANGUAGE SUPPORT:
- Respond naturally in the EXACT same language as the patient: English, Urdu (اردو script), or Roman Urdu (e.g., "Ji bilkul, Dr. Maya ka kal subah 10:00 AM ka slot khali hai.").
CLINIC FACTS (PUBLIC CATALOG ONLY):
- Clinic: ${clinicName}
- Address: ${clinicAddress}
- Phone/WhatsApp: ${clinicPhone}
- Hours: ${hoursSummary}
- Services & Prices: ${JSON.stringify(servicesList)}
- Active Doctors: ${JSON.stringify(doctorsList)}
- Live Duration-Verified Open Slots (non-PII): ${JSON.stringify(slotsList)}
- Chatbot Booking Enabled: ${allowChatbotBooking}
- Caller verified signed-in: ${verifiedUser}

RECEPTIONIST WORKFLOW & BOOKING RULES:
1. Answer service, pricing, insurance, doctor specialty, and clinic hours questions strictly using the facts above. Do NOT invent doctors, prices, or slots.
2. When checking availability or helping book: check Live Open Slots. If no slots exist for the requested date/doctor, clearly say none are open and suggest the nearest available date/time from Live Open Slots.
3. To create a booking request inside chat (when Chatbot Booking Enabled is true), collect ALL required details step-by-step:
   - Treatment (suggestedServiceId)
   - Preferred doctor (suggestedDoctorId)
   - Date (YYYY-MM-DD in suggestedDate) & Time (HH:MM 24h in suggestedTime from Live Open Slots)
   - Patient full name (draftPatientName, 2-80 chars, no digits)
   - Patient phone/WhatsApp (draftPatientPhone, 7-15 digits)
4. Set bookingReadyToConfirm=true ONLY when ALL 6 fields above are explicitly known and confirmed in the conversation, and tell the patient to review and click the "Confirm & Submit Request" card below.
5. NEVER claim an appointment is already booked or confirmed, and NEVER invent a reference code like FC-1234. Explain that clicking Confirm submits a pending request for clinic confirmation.

SAFETY & PRIVACY RULES (STRICT):
1. NEVER provide a medical diagnosis, prescribe medication, or claim clinical certainty. Clearly state that a licensed dentist must examine them in person for medical advice.
2. NEVER ask for or claim access to private patient dental records.
3. If the patient describes severe tooth pain, facial swelling, fever, uncontrolled bleeding, or trauma, set urgent=true, intent="urgent", advise calling the clinic immediately at ${ctx.phone || '+1 555 010 0000'} (or emergency services if breathing/swallowing is affected), and invite them to escalate to the front desk.`;

  try {
    let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: historyLines
            ? `Recent conversation:\n${historyLines}\n\nLatest patient message: ${message}`
            : message,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: {
                  type: Type.STRING,
                  description: 'Warm, concise receptionist reply (2-4 sentences) matching patient language.',
                },
                detectedLanguage: {
                  type: Type.STRING,
                  description: 'One of: english, urdu, roman_urdu',
                },
                intent: {
                  type: Type.STRING,
                  description: 'One of: info, book, urgent, escalate',
                },
                urgent: {
                  type: Type.BOOLEAN,
                  description: 'True only if acute pain, swelling, fever, trauma, or bleeding is mentioned.',
                },
                suggestedServiceId: {
                  type: Type.STRING,
                  description: 'Matching service id from catalog if discussed, otherwise empty string.',
                },
                suggestedDoctorId: {
                  type: Type.STRING,
                  description: 'Matching doctor id from catalog if selected/recommended, otherwise empty string.',
                },
                suggestedDate: {
                  type: Type.STRING,
                  description: 'YYYY-MM-DD from Live Open Slots if chosen/suggested, otherwise empty string.',
                },
                suggestedTime: {
                  type: Type.STRING,
                  description: 'HH:MM 24h from Live Open Slots if chosen/suggested, otherwise empty string.',
                },
                bookingReadyToConfirm: {
                  type: Type.BOOLEAN,
                  description: 'True ONLY if serviceId, doctorId, date, time, patient name, and patient phone are all explicitly provided and ready for patient click confirmation.',
                },
                draftPatientName: {
                  type: Type.STRING,
                  description: 'Patient full name if explicitly given, otherwise empty string.',
                },
                draftPatientPhone: {
                  type: Type.STRING,
                  description: 'Patient phone/WhatsApp if explicitly given, otherwise empty string.',
                },
                draftNotes: {
                  type: Type.STRING,
                  description: 'Optional visit notes mentioned by patient, otherwise empty string.',
                },
              },
              required: ['reply', 'detectedLanguage', 'intent', 'urgent', 'bookingReadyToConfirm'],
            },
          },
        });
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          attempt < 2 &&
          (msg.includes('503') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('429') ||
            msg.includes('RESOURCE_EXHAUSTED'))
        ) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    if (!response) throw lastErr || new Error('Empty model response');

    const rawText = (response.text ?? '').trim();
    const parsed = JSON.parse(rawText || '{}') as Record<string, unknown>;

    const validServiceId =
      typeof parsed.suggestedServiceId === 'string' &&
      servicesList.some((s) => s.id === parsed.suggestedServiceId)
        ? parsed.suggestedServiceId
        : '';

    const validDoctorId =
      typeof parsed.suggestedDoctorId === 'string' &&
      doctorsList.some((d) => d.id === parsed.suggestedDoctorId)
        ? parsed.suggestedDoctorId
        : '';

    const validDate =
      typeof parsed.suggestedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.suggestedDate)
        ? parsed.suggestedDate
        : '';

    const validTime =
      typeof parsed.suggestedTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.suggestedTime)
        ? parsed.suggestedTime
        : '';

    const draftName =
      typeof parsed.draftPatientName === 'string' ? parsed.draftPatientName.trim().slice(0, 80) : '';
    const draftPhone =
      typeof parsed.draftPatientPhone === 'string'
        ? parsed.draftPatientPhone.trim().slice(0, 24)
        : '';
    const phoneDigits = draftPhone.replace(/\D/g, '');
    const draftNotes =
      typeof parsed.draftNotes === 'string' ? parsed.draftNotes.trim().slice(0, 400) : '';

    const bookingReady =
      allowChatbotBooking &&
      Boolean(parsed.bookingReadyToConfirm) &&
      Boolean(validServiceId && validDoctorId && validDate && validTime) &&
      draftName.length >= 2 &&
      !/\d/.test(draftName) &&
      phoneDigits.length >= 7 &&
      phoneDigits.length <= 15;

    res.json({
      reply:
        typeof parsed.reply === 'string' && parsed.reply.trim()
          ? parsed.reply.trim()
          : 'Thank you for contacting FourClinic. How can I assist with hours, pricing, or booking a visit?',
      detectedLanguage:
        parsed.detectedLanguage === 'urdu' || parsed.detectedLanguage === 'roman_urdu'
          ? parsed.detectedLanguage
          : 'english',
      intent:
        parsed.intent === 'book' || parsed.intent === 'urgent' || parsed.intent === 'escalate'
          ? parsed.intent
          : 'info',
      urgent: Boolean(parsed.urgent),
      suggestedServiceId: validServiceId,
      suggestedDoctorId: validDoctorId,
      suggestedDate: validDate,
      suggestedTime: validTime,
      bookingDraft: bookingReady
        ? {
            readyToConfirm: true,
            serviceId: validServiceId,
            doctorId: validDoctorId,
            date: validDate,
            time: validTime,
            patientName: draftName,
            patientPhone: draftPhone,
            notes: draftNotes,
          }
        : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Gemini /api/chat error:', msg);
    const isQuota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
    res.status(isQuota ? 429 : 502).json({
      error: isQuota
        ? 'The AI receptionist is experiencing high demand right now. Please wait a few seconds and try again, or use the booking form.'
        : 'Unable to reach the AI receptionist right now. Please try again or use the booking form.',
    });
  }
}
