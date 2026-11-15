const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const own = path.resolve(__dirname, '..');
const roots = [
  ['web', process.env.WIEZ_WEB_SECURITY_ROOT || (fs.existsSync(path.join(own, 'src/context/AuthContext.tsx')) ? own : path.resolve(own, '../fthreadly'))],
  ['native', process.env.WIEZ_NATIVE_SECURITY_ROOT || (fs.existsSync(path.join(own, 'src/storage/secureStorage.ts')) ? own : path.resolve(own, '../threadly-mobile'))],
];
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture(bind) {
  const handlers = new Map(), observers = new Set(), availability = new Set();
  let state = { token: 'old', identity: 'account:session:1' };
  const socket = { auth: {}, connected: false, connects: 0, disconnects: 0,
    on(event, listener) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(listener); },
    off(event, listener) { handlers.get(event)?.delete(listener); },
    connect() { this.connects++; }, disconnect() { this.connected = false; this.disconnects++; },
    fire(event, value) { if (event === 'connect') this.connected = true; if (event === 'disconnect') this.connected = false;
      for (const handler of [...(handlers.get(event) || [])]) handler(value); },
  };
  let refreshes = 0, refresh = async () => null;
  const port = { current: () => state, refresh: () => { refreshes++; return refresh(); },
    subscribe: listener => { observers.add(listener); return () => observers.delete(listener); },
    subscribeAvailable: listener => { availability.add(listener); return () => availability.delete(listener); } };
  const notify = () => { for (const listener of [...observers]) listener(); };
  const dispose = bind(socket, port);
  return { socket, port, observers, availability, dispose, notify, wake: () => { for (const listener of [...availability]) listener(); }, refreshes: () => refreshes,
    state: () => state, set: value => { state = value; notify(); }, refresh: callback => { refresh = callback; } };
}
for (const [surface, root] of roots) {
  const filename = path.join(root, 'src/realtime/sessionSocket.ts');
  const run = (name, fn) => test(`${surface}: ${name}`, async context => {
    if (!fs.existsSync(filename)) { context.skip(`Sibling ${surface} session helper unavailable; set its security-root environment variable for paired checks`); return; }
    const module = { exports: {} };
    const timers = new Map(); let timerId = 0;
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, { module, exports: module.exports,
      setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
      clearTimeout: id => timers.delete(id),
    }, { filename });
    const f = fixture(module.exports.bindSessionSocket);
    f.timers = timers;
    f.retry = () => { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.callback(); return timer.delay; };
    await fn(f);
    f.dispose(); assert.equal(timers.size, 0, 'all retry timers must be disposed'); assert.equal(f.availability.size, 0);
  });
  run('same-session renewal reauthenticates the existing socket and preserves feature listeners', async f => {
    let notices = 0; f.socket.on('notification.created', () => notices++); f.socket.fire('connect');
    f.set({ ...f.state(), token: 'rotated' });
    assert.equal(f.socket.auth.token, 'rotated'); assert.equal(f.socket.disconnects, 1); assert.equal(f.socket.connects, 1);
    f.socket.fire('notification.created'); assert.equal(notices, 1); f.dispose(); assert.equal(f.observers.size, 0);
  });
  run('server expiry performs one refresh/reconnect without a subscription-driven duplicate', async f => {
    f.refresh(async () => { f.set({ ...f.state(), token: 'renewed' }); return 'renewed'; });
    f.socket.fire('disconnect', 'io server disconnect'); await settle();
    assert.equal(f.refreshes(), 1); assert.equal(f.socket.connects, 1); assert.equal(f.socket.auth.token, 'renewed');
    f.socket.fire('connect_error', { message: 'Unauthorized' }); await settle(); assert.equal(f.refreshes(), 1);
    f.socket.fire('connect'); f.socket.fire('disconnect', 'io server disconnect'); await settle(); assert.equal(f.refreshes(), 2); f.dispose();
  });
  for (const identity of ['different-account:session:1', 'account:different-session:1'])
    run(`a pending recovery cannot reconnect after identity changes to ${identity}`, async f => {
      let resolve; f.refresh(() => new Promise(yes => { resolve = yes; }));
      f.socket.fire('disconnect', 'io server disconnect'); f.set({ token: 'next-account-token', identity });
      resolve('old-recovery-token'); await settle();
      assert.equal(f.socket.connects, 0); assert.equal(f.state().token, 'next-account-token'); f.dispose();
    });
  run('authentication rejection retries once; ordinary network failures use Socket.IO reconnection', async f => {
    f.socket.fire('disconnect', 'transport close'); f.socket.fire('connect_error', { message: 'Network offline' }); await settle();
    assert.equal(f.refreshes(), 0);
    f.socket.fire('connect_error', { message: 'Unauthorized' }); await settle();
    f.socket.fire('connect_error', { message: 'Unauthorized' }); await settle(); assert.equal(f.refreshes(), 1); f.dispose();
  });
  run('unmount during refresh ignores late completion and removes owned listeners', async f => {
    let resolve; f.refresh(() => new Promise(yes => { resolve = yes; }));
    f.socket.fire('disconnect', 'io server disconnect'); f.dispose();
    f.set({ ...f.state(), token: 'renewed' }); resolve('renewed'); await settle();
    assert.equal(f.socket.connects, 0); assert.equal(f.observers.size, 0);
    f.socket.fire('connect_error', { message: 'Unauthorized' }); await settle(); assert.equal(f.refreshes(), 1);
  });
  for (const mode of ['null', 'throws']) run(`expiry recovers after a transient ${mode} failure without manual refresh`, async f => {
    f.refresh(async () => { if (mode === 'throws') throw new Error('Offline'); return null; });
    f.socket.fire('disconnect', 'io server disconnect'); await settle();
    assert.equal(f.refreshes(), 1); assert.equal(f.timers.size, 1);
    f.refresh(async () => { f.set({ ...f.state(), token: 'back-online' }); return 'back-online'; });
    assert.equal(f.retry(), 1000); await settle();
    assert.equal(f.refreshes(), 2); assert.equal(f.socket.connects, 1); assert.equal(f.socket.auth.token, 'back-online');
    f.socket.fire('connect'); assert.equal(f.timers.size, 0);
  });
  run('repeated outage has one timer with capped delay; foreground recovery resumes immediately', async f => {
    f.socket.fire('disconnect', 'io server disconnect'); await settle();
    for (let i = 0; i < 10; i++) { assert.equal(f.timers.size, 1); assert(f.retry() <= 30000); await settle(); }
    const attempts = f.refreshes();
    f.refresh(async () => { f.set({ ...f.state(), token: 'resumed' }); return 'resumed'; });
    f.wake(); await settle(); assert.equal(f.refreshes(), attempts + 1); assert.equal(f.socket.connects, 1); assert.equal(f.timers.size, 0);
  });
  run('sign-out cancels an outage timer and cannot revive the old account', async f => {
    f.socket.fire('disconnect', 'io server disconnect'); await settle(); assert.equal(f.timers.size, 1);
    f.set(null); assert.equal(f.timers.size, 0); f.wake(); await settle(); assert.equal(f.refreshes(), 1);
  });
}
