/*
 * File: extension/lifetime-probe/web/probe.js
 * Description: TEST-ONLY MV3 background service worker whose only job is to
 *   report when it is alive and when it was restarted, so that Safari's actual
 *   service-worker suspension behaviour can be measured. It deliberately mirrors
 *   the lifecycle primitives of extension/web/background.js (a ~1.2s fetch poll
 *   loop plus a 30s alarms keepalive) and NOTHING else. It has no gateway
 *   credential, no tab access, no scripting permission and no DOM engine.
 * Author: safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
 * Created: 2026-10-11
 *
 * !!! THIS IS NOT SHIPPING CODE. It exists to produce the numbers in
 * !!! docs/SERVICE-WORKER-LIFETIME.md and should be deleted or left unbuilt
 * !!! once that measurement is considered settled.
 *
 * HOW THE MEASUREMENT WORKS
 *   Every interesting event is POSTed to a localhost collector
 *   (extension/lifetime-probe/collector.mjs), which stamps its own receive time.
 *   Server-side timestamps are the ground truth: in-worker counters die with the
 *   worker, and storage.local reads cannot be extracted without a GUI click.
 *
 *   The single most important event is "boot". Top-level code in an MV3 service
 *   worker runs exactly once per worker instantiation. Therefore:
 *       a second "boot" with a NEW bootId == the previous worker was torn down.
 *   No boot event ever arriving after a long silence == the worker is gone and
 *   nothing revived it. That is the negative result we are explicitly looking for.
 *
 * MODES (the collector sets these in its HTTP response body, so the experiment
 * can be driven without touching the GUI):
 *   active  - 1200ms setInterval that fetches the collector. Mirrors a connected
 *             poll loop in extension/web/background.js.
 *   storage - 1200ms setInterval that only touches storage.local. Mirrors a loop
 *             that is doing work but no network, and tests whether network I/O
 *             specifically is what holds the worker open.
 *   idle    - no interval at all. Only the 30s alarm can speak. This is the arm
 *             that actually tests the keepalive.
 *   silent  - no interval AND the 30s keepalive alarm is CLEARED. A single
 *             one-shot alarm is armed for SILENT_PROBE_MIN minutes later. This
 *             is the only arm that can distinguish "the worker is immortal" from
 *             "the 30s keepalive is what kept it alive", because in every other
 *             arm the keepalive resets the idle timer before it can expire.
 *             Whether the one-shot alarm arrives with a NEW bootId tells us
 *             whether alarms can resurrect a genuinely dead worker.
 */
'use strict';

const api = globalThis.browser ?? globalThis.chrome;

const COLLECTOR = 'http://127.0.0.1:4037/ev';
const KEEPALIVE_ALARM = 'safari-ai-agent-keepalive'; // same name/period as background.js
const KEEPALIVE_PERIOD_MIN = 0.5;
const TICK_MS = 1200;                                // same as POLL_INTERVAL_MS
const SILENT_PROBE_ALARM = 'silent-probe';
const SILENT_PROBE_MIN = 3;                          // one-shot "did you survive?" alarm

// Top-level state. All of this is destroyed when the worker is suspended; that
// destruction is the thing being measured, so none of it is persisted.
const BOOT_AT = Date.now();
const BOOT_ID = `${BOOT_AT}-${Math.random().toString(36).slice(2, 8)}`;
let tickSeq = 0;
let timer = null;
let mode = 'active';

/**
 * Report one event. Fire-and-forget: a failed report must never alter the
 * worker's lifetime, because that would contaminate the measurement.
 * Content-Type text/plain keeps this a CORS-simple request, so it does not need
 * a preflight and does not depend on Safari having granted the host permission.
 */
function report(ev, extra) {
  const body = JSON.stringify({
    ev,
    bootId: BOOT_ID,
    bootAt: BOOT_AT,
    clientAt: Date.now(),
    sinceBootMs: Date.now() - BOOT_AT,
    mode,
    ...extra
  });
  return fetch(COLLECTOR, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain'},
    body,
    cache: 'no-store',
    credentials: 'omit'
  })
    .then(r => r.text())
    .then(text => {
      // The collector answers with the mode it wants us in. This is how the
      // experiment is driven without a GUI.
      try {
        const want = JSON.parse(text)?.mode;
        if (want && want !== mode) applyMode(want);
      } catch { /* Non-JSON reply. Ignore; mode stays as-is. */ }
    })
    .catch(() => { /* Collector down. Never throw into the loop. */ });
}

/**
 * A storage.local round-trip of the same shape background.js performs on every
 * poll (readConfig() does a storage.local.get). Used by the 'storage' arm, and
 * also used as the durable journal so that something survives even if the
 * collector was not running.
 */
async function journal(ev) {
  try {
    const got = await api.storage.local.get(['journal']);
    const list = Array.isArray(got.journal) ? got.journal : [];
    list.push({ev, bootId: BOOT_ID, at: Date.now()});
    // Cap it: an unbounded array would turn into a storage-quota experiment.
    await api.storage.local.set({journal: list.slice(-500)});
  } catch { /* Storage failures must not alter lifetime. */ }
}

function stopTimer() {
  if (timer !== null) { clearInterval(timer); timer = null; }
}

function startTimer() {
  stopTimer();
  if (mode === 'idle' || mode === 'silent') return;
  timer = setInterval(() => {
    tickSeq += 1;
    if (mode === 'storage') void journal('tick');
    else void report('tick', {tickSeq});
  }, TICK_MS);
}

function applyMode(next) {
  const prev = mode;
  mode = next;
  startTimer();
  // "silent:0.75" arms the one-shot 45s later. Sweeping this value is how the
  // idle timeout is bracketed: the smallest delay that comes back with
  // respawnedForThisAlarm=true is an upper bound on the idle timeout, and the
  // largest delay that comes back false is a lower bound.
  if (next.startsWith('silent')) {
    const minutes = Number(next.split(':')[1]) || SILENT_PROBE_MIN;
    // Strip EVERY recurring wake source, then arm one single shot. After this
    // report returns, the worker should have nothing at all left to do.
    void (async () => {
      try {
        await api.alarms.clear(KEEPALIVE_ALARM);
        await api.alarms.create(SILENT_PROBE_ALARM, {delayInMinutes: minutes});
        const a = await api.alarms.get(SILENT_PROBE_ALARM);
        await report('silent-armed', {
          delayMinutes: minutes,
          silentProbeScheduledAt: a?.scheduledTime ?? null,
          remainingAlarms: (await api.alarms.getAll()).map(x => x.name)
        });
      } catch (e) { void report('silent-arm-failed', {error: String(e)}); }
    })();
    return;
  }
  // MEASUREMENT HAZARD, found the hard way on 2026-10-11: re-creating a periodic
  // alarm RESETS its schedule. Doing that here (a few hundred ms after boot,
  // because it takes a collector round-trip to learn the mode) pushed every
  // keepalive ~200ms PAST the worker's 30s teardown deadline and made the worker
  // look like it died every single cycle. The alarm must stay armed from
  // top-level evaluation - which is exactly what extension/web/background.js
  // does - or the keepalive loses a race it would otherwise win.
  // "period:0.4" re-creates the keepalive from INSIDE a running worker with a
  // shorter period. If the worker then survives, the 30s teardown deadline is a
  // plain race that a sooner alarm wins - rather than in-worker alarm creation
  // being somehow different from top-level creation.
  if (next.startsWith('period')) {
    const p = Number(next.split(':')[1]) || KEEPALIVE_PERIOD_MIN;
    void (async () => {
      await api.alarms.create(KEEPALIVE_ALARM, {periodInMinutes: p});
      const a = await api.alarms.get(KEEPALIVE_ALARM);
      await report('period-armed', {
        periodMinutes: p,
        scheduledTime: a?.scheduledTime ?? null,
        armedAtSinceBootMs: Date.now() - BOOT_AT,
        firesAtSinceBootMs: a?.scheduledTime ? a.scheduledTime - BOOT_AT : null
      });
    })();
    return;
  }
  if (prev.startsWith('silent')) {
    void api.alarms.create(KEEPALIVE_ALARM, {periodInMinutes: KEEPALIVE_PERIOD_MIN});
  }
  void report('mode', {appliedMode: next});
}

/* ------------------------------------------------------------------ alarms */

/**
 * Identical alarm name and period to extension/web/background.js line ~269.
 * The question this answers: when the worker has been torn down, does Safari
 * respawn it to deliver this alarm, and how late is it?
 */
api.alarms.create(KEEPALIVE_ALARM, {periodInMinutes: KEEPALIVE_PERIOD_MIN});

api.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SILENT_PROBE_ALARM) {
    // THE decisive datum. respawnedForThisAlarm === true means the worker had
    // been torn down and this alarm is what brought it back.
    const at = Date.now();
    void report('silent-probe-alarm', {
      firedAt: at,
      scheduledTime: alarm.scheduledTime ?? null,
      latenessMs: alarm.scheduledTime ? at - alarm.scheduledTime : null,
      respawnedForThisAlarm: at - BOOT_AT < 1000
    });
    return;
  }
  if (alarm.name !== KEEPALIVE_ALARM) return;
  const firedAt = Date.now();
  void (async () => {
    // alarms.get after firing returns the NEXT scheduled time, so the slot we
    // were supposed to fire in is (next - period). firedAt minus that is the
    // delivery lateness, which for a suspended worker includes respawn cost.
    let expectedAt = null;
    try {
      const a = await api.alarms.get(KEEPALIVE_ALARM);
      if (a?.scheduledTime) expectedAt = a.scheduledTime - KEEPALIVE_PERIOD_MIN * 60000;
    } catch { /* ignore */ }
    await journal('alarm');
    // If the timer died with a previous worker instance, re-arm it. This mirrors
    // background.js's `if (... && !state.pumping) void pump()`.
    const timerWasDead = timer === null && mode !== 'idle';
    if (timerWasDead) startTimer();
    await report('alarm', {
      firedAt,
      expectedAt,
      latenessMs: expectedAt === null ? null : firedAt - expectedAt,
      // sinceBootMs < ~1000 means this alarm is what respawned the worker.
      respawnedForThisAlarm: firedAt - BOOT_AT < 1000,
      timerWasDead
    });
  })();
});

/* ----------------------------------------------------------------- messages */

// Used to measure wake-up latency from a message rather than from an alarm.
// wake-content.js (on the collector's own page) sends this at document_start.
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'wake') {
    const at = Date.now();
    void report('wake', {
      sentAt: message.sentAt,
      deliveredAt: at,
      deliveryMs: at - message.sentAt,
      respawnedForThisMessage: at - BOOT_AT < 1000
    });
    sendResponse({ok: true, bootId: BOOT_ID, sinceBootMs: at - BOOT_AT});
  }
  return true;
});

/* -------------------------------------------------------------------- boot */

// This line is the measurement. It runs once per worker instantiation.
void journal('boot');
void report('boot', {reason: 'top-level evaluation'});
startTimer();
