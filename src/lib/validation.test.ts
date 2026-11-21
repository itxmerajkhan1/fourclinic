import assert from 'node:assert/strict';
import { DEFAULT_CLINIC_SETTINGS, SAMPLE_DOCTORS } from '../data/sampleSeed';
import {
  checkChatRateLimit,
  checkDistributedChatRateLimit,
  verifyUpstashRedisConnection,
  type ApiRequest,
  type ApiResponse,
} from '../../lib/serverHandlers';
import healthHandler from '../../api/health';
import verifyHandler from '../../api/auth/verify';
import bootstrapRoleHandler from '../../api/auth/bootstrap-role';
import chatHandler from '../../api/chat';
import {
  addDaysIso,
  formatUserFriendlyError,
  generateAvailableSlotsForDoctor,
  getCoveredLockIds,
  getCoveredTimes,
  todayIso,
  validateBookingInput,
} from './validation';

function createMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown = null;

  const res: ApiResponse = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
      return res;
    },
  };

  return {
    res,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    },
  };
}

async function runTests() {
  // Pick next weekday (Mon-Fri) so clinic & doctor working hours are guaranteed enabled and in the future
  let testDate = addDaysIso(todayIso(), 2);
  while (new Date(`${testDate}T12:00:00`).getDay() === 0 || new Date(`${testDate}T12:00:00`).getDay() === 6) {
    testDate = addDaysIso(testDate, 1);
  }

  const doctor = SAMPLE_DOCTORS[0];

  // 1. Covered times calculation across 30-min base grid
  assert.deepEqual(getCoveredTimes('09:00', 30, 30), ['09:00']);
  assert.deepEqual(getCoveredTimes('09:00', 60, 30), ['09:00', '09:30']);
  assert.deepEqual(getCoveredTimes('09:00', 45, 30), ['09:00', '09:30']);
  assert.deepEqual(getCoveredTimes('09:00', 90, 30), ['09:00', '09:30', '10:00']);

  const lockIds = getCoveredLockIds(doctor.id, testDate, '09:00', 90, 30);
  assert.equal(lockIds.length, 3);
  assert.equal(lockIds[0], `${doctor.id}_${testDate}_0900`);
  assert.equal(lockIds[1], `${doctor.id}_${testDate}_0930`);
  assert.equal(lockIds[2], `${doctor.id}_${testDate}_1000`);

  // 2. Full-duration overlap prevention (60m appointment owning 10:00 & 10:30)
  const locks = [
    {
      doctorId: doctor.id,
      date: testDate,
      time: '10:00',
      appointmentId: 'appt_existing',
      bookedByUid: 'u1',
    },
    {
      doctorId: doctor.id,
      date: testDate,
      time: '10:30',
      appointmentId: 'appt_existing',
      bookedByUid: 'u1',
    },
  ];

  const slots60 = generateAvailableSlotsForDoctor({
    dateStr: testDate,
    doctor,
    schedules: [],
    slotLocks: locks,
    settings: DEFAULT_CLINIC_SETTINGS,
    serviceDurationMins: 60,
  });
  assert.equal(slots60.includes('09:30'), false, '09:30 (60m) must be blocked by 10:00 lock');
  assert.equal(slots60.includes('10:00'), false, '10:00 (60m) must be blocked');
  assert.equal(slots60.includes('10:30'), false, '10:30 (60m) must be blocked');
  assert.equal(slots60.includes('09:00'), true, '09:00 (60m = 09:00+09:30) should be open');
  assert.equal(slots60.includes('11:00'), true, '11:00 (60m = 11:00+11:30) should be open');
  assert.equal(slots60.includes('11:30'), false, '11:30 (60m) must not cross into 12:00 lunch');

  // 3. Rescheduling own appointment allows reusing its own slot locks
  const reschedSlots60 = generateAvailableSlotsForDoctor({
    dateStr: testDate,
    doctor,
    schedules: [],
    slotLocks: locks,
    settings: DEFAULT_CLINIC_SETTINGS,
    serviceDurationMins: 60,
    ignoreAppointmentId: 'appt_existing',
  });
  assert.equal(reschedSlots60.includes('10:00'), true, 'Own appointment locks should be reusable on reschedule');

  // 4. Holiday & doctor leave override blocking
  const holidaySlots = generateAvailableSlotsForDoctor({
    dateStr: testDate,
    doctor,
    schedules: [],
    slotLocks: [],
    settings: {
      ...DEFAULT_CLINIC_SETTINGS,
      holidays: [{ date: testDate, label: 'Clinic Maintenance' }],
    },
    serviceDurationMins: 30,
  });
  assert.deepEqual(holidaySlots, []);

  const leaveOverrideSlots = generateAvailableSlotsForDoctor({
    dateStr: testDate,
    doctor,
    schedules: [
      {
        id: 'ov1',
        doctorId: doctor.id,
        date: testDate,
        isBlockedDay: false,
        blockedSlots: ['09:00'],
        reason: 'Morning briefing',
        createdByUid: 'admin1',
      },
    ],
    slotLocks: [],
    settings: DEFAULT_CLINIC_SETTINGS,
    serviceDurationMins: 60,
  });
  assert.equal(leaveOverrideSlots.includes('09:00'), false, 'Blocked 09:00 slot must prevent 60m start');

  // 5. Booking input validation & friendly error sanitizer
  assert.ok(
    validateBookingInput({
      patientName: 'Test123',
      patientPhone: '+1 555 010 2030',
      date: testDate,
      time: '09:00',
      notes: '',
      maxDaysAhead: 60,
      minLeadTimeMins: 30,
    }),
    'Name with digits should be rejected'
  );
  assert.ok(
    validateBookingInput({
      patientName: 'Jordan Rivera',
      patientPhone: '123',
      date: testDate,
      time: '09:00',
      notes: '',
      maxDaysAhead: 60,
      minLeadTimeMins: 30,
    }),
    'Short phone number should be rejected'
  );
  assert.equal(
    validateBookingInput({
      patientName: 'Jordan Rivera',
      patientPhone: '+1 555 010 2030',
      date: testDate,
      time: '09:00',
      notes: 'Prefer morning checkup',
      maxDaysAhead: 60,
      minLeadTimeMins: 30,
    }),
    null,
    'Valid input should return null'
  );

  const sanitizedErr = formatUserFriendlyError(
    new Error(
      JSON.stringify({
        error: '7 PERMISSION_DENIED: Missing or insufficient permissions.',
        operationType: 'list',
        path: 'appointments',
        authInfo: { email: 'secret@example.com' },
      })
    )
  );
  assert.equal(sanitizedErr.includes('secret@example.com'), false, 'User-facing error must strip authInfo email');
  assert.ok(sanitizedErr.toLowerCase().includes('permission denied'));

  // 6. Chat rate limiter (20 requests/min allowed, 21st rejected)
  const testIp = 'ip:198.51.100.42';
  const t0 = 1_700_000_000_000;
  for (let i = 0; i < 20; i++) {
    assert.equal(checkChatRateLimit(testIp, t0 + i * 100).allowed, true);
  }
  const blocked = checkChatRateLimit(testIp, t0 + 3000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0);

  const distRes = await checkDistributedChatRateLimit('uid:test_user_1', t0);
  assert.equal(distRes.allowed, true);
  assert.ok(distRes.backend === 'memory' || distRes.backend === 'upstash-redis');

  // 7. Vercel /api/* serverless handler wrapper checks
  const healthMock = createMockRes();
  await healthHandler({ method: 'GET', headers: {} }, healthMock.res);
  assert.equal(healthMock.statusCode, 200);
  assert.equal((healthMock.body as { ok?: boolean })?.ok, true);
  assert.equal(healthMock.headers['x-content-type-options'], 'nosniff');

  const verifyMock = createMockRes();
  await verifyHandler({ method: 'POST', headers: {} }, verifyMock.res);
  assert.equal(verifyMock.statusCode, 401);

  const bootstrapMock = createMockRes();
  await bootstrapRoleHandler({ method: 'POST', headers: {} }, bootstrapMock.res);
  assert.equal(bootstrapMock.statusCode, 401);

  const chatBadMethod = createMockRes();
  await chatHandler({ method: 'GET', headers: {} }, chatBadMethod.res);
  assert.equal(chatBadMethod.statusCode, 405);

  const chatEmptyReq: ApiRequest = {
    method: 'POST',
    headers: {},
    body: { message: '   ' },
    socket: { remoteAddress: '198.51.100.99' },
  };
  const chatEmptyRes = createMockRes();
  await chatHandler(chatEmptyReq, chatEmptyRes.res);
  assert.equal(chatEmptyRes.statusCode, 400);

  // 8. Distributed Upstash Redis verification, 20/min enforcement & credential-safe error handling
  const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
  const prevToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const prevFetch = globalThis.fetch;
  const prevWarn = console.warn;
  const capturedWarns: string[] = [];
  const fakeSecretHost = 'secret-redis-host.upstash.io';
  const fakeSecretToken = 'UPSTASH_SUPER_SECRET_TOKEN_XYZ_999';

  console.warn = (...args: unknown[]) => {
    capturedWarns.push(args.map((a) => String(a)).join(' '));
  };

  try {
    // 8a. Invalid URL scheme rejected without leaking secret token/URL
    process.env.UPSTASH_REDIS_REST_URL = `http://${fakeSecretHost}`;
    process.env.UPSTASH_REDIS_REST_TOKEN = fakeSecretToken;
    const invalidCheck = await verifyUpstashRedisConnection();
    assert.equal(invalidCheck.status, 'invalid_config');
    assert.equal(invalidCheck.connected, false);

    // 8b. Simulated shared Upstash Redis store across requests (20 allowed, 21st rejected)
    process.env.UPSTASH_REDIS_REST_URL = `https://${fakeSecretHost}`;
    process.env.UPSTASH_REDIS_REST_TOKEN = fakeSecretToken;
    const sharedRedisCounts = new Map<string, number>();

    globalThis.fetch = (async (input, init) => {
      assert.equal(String(input), `https://${fakeSecretHost}/pipeline`);
      const cmds = JSON.parse(String(init?.body || '[]')) as Array<unknown[]>;
      const out = cmds.map((cmd) => {
        if (cmd[0] === 'PING') return { result: 'PONG' };
        if (cmd[0] === 'INCR') {
          const k = String(cmd[1]);
          const next = (sharedRedisCounts.get(k) || 0) + 1;
          sharedRedisCounts.set(k, next);
          return { result: next };
        }
        if (cmd[0] === 'EXPIRE') return { result: 1 };
        return { error: 'ERR unsupported' };
      });
      return new Response(JSON.stringify(out), { status: 200 });
    }) as typeof fetch;

    const pingOk = await verifyUpstashRedisConnection();
    assert.equal(pingOk.connected, true);
    assert.equal(pingOk.status, 'connected');

    const distKey = 'uid:multi_instance_user';
    const fixedNow = 1_700_000_060_000;
    for (let i = 1; i <= 20; i++) {
      const r = await checkDistributedChatRateLimit(distKey, fixedNow + i * 500);
      assert.equal(r.backend, 'upstash-redis');
      assert.equal(r.allowed, true);
      assert.equal(r.remaining, 20 - i);
    }
    const overLimit = await checkDistributedChatRateLimit(distKey, fixedNow + 12_000);
    assert.equal(overLimit.backend, 'upstash-redis');
    assert.equal(overLimit.allowed, false);
    assert.equal(overLimit.remaining, 0);
    assert.ok(overLimit.retryAfterSec > 0);

    // 8c. Simulated Redis HTTP 401 and network throw must fail open to memory and never log URL/token
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;
    const ping401 = await verifyUpstashRedisConnection();
    assert.equal(ping401.connected, false);
    assert.equal(ping401.status, 'unreachable');

    globalThis.fetch = (async () => {
      const e = new TypeError(`fetch failed for https://${fakeSecretHost}/pipeline`);
      throw e;
    }) as typeof fetch;
    const fallbackRes = await checkDistributedChatRateLimit('uid:fallback_user', fixedNow);
    assert.equal(fallbackRes.backend, 'memory');
    assert.equal(fallbackRes.allowed, true);

    for (const msg of capturedWarns) {
      assert.equal(msg.includes(fakeSecretHost), false, 'Redis host must never appear in logs');
      assert.equal(msg.includes(fakeSecretToken), false, 'Redis token must never appear in logs');
    }
  } finally {
    console.warn = prevWarn;
    globalThis.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = prevUrl;
    if (prevToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = prevToken;
  }

  console.log('ALL_VALIDATION_SECURITY_AND_API_TESTS_PASSED');
}

void runTests();
