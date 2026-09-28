// Online play over WebRTC (PeerJS). The host's browser runs the physics for
// both teams. The guest sends key presses and draws the snapshots the host
// streams back. Nothing is simulated on the guest.
(function () {
  'use strict';

  const PREFIX = 'football-physics-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const SNAPSHOT_HZ = 30;
  const INTERP_DELAY = 0.1;        // s the guest renders behind the host

  const available = () => typeof window.Peer === 'function' && typeof window.RTCPeerConnection === 'function';

  // ICE servers. PeerJS's built-in TURN relays (*.turn.peerjs.com) no longer
  // resolve, so they are replaced entirely: STUN for direct connections plus
  // whatever TURN relay ice-config.js provides for networks that need one.
  const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  let icePromise = null;
  function iceServers() {
    if (icePromise) return icePromise;
    const cfg = window.FOOTBALL_ICE || {};
    const fixed = Array.isArray(cfg.iceServers) ? cfg.iceServers : [];
    let fetched = Promise.resolve([]);
    if (cfg.credentialsUrl && typeof fetch === 'function') {
      // e.g. Metered.ca: returns a ready-made iceServers array
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => ctl && ctl.abort(), 5000);
      fetched = fetch(cfg.credentialsUrl, { signal: ctl && ctl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => (Array.isArray(list) ? list : (list && list.iceServers) || []))
        .catch(() => [])
        .finally(() => clearTimeout(timer));
    }
    icePromise = fetched.then((list) => STUN.concat(fixed, list));
    return icePromise;
  }
  const hasRelay = (servers) => servers.some((s) => [].concat(s.urls || s.url || []).some((u) => /^turns?:/.test(u)));

  // ?peer=localhost:9000 points at a self-hosted PeerServer (used for testing)
  function peerOptions(servers) {
    const opts = { debug: 0, config: { iceServers: servers } };
    const m = /[?&]peer=([^&#]+)/.exec(location.search);
    if (!m) return opts;
    const [host, port] = decodeURIComponent(m[1]).split(':');
    return Object.assign(opts, { host, port: +port || 9000, path: '/', secure: location.protocol === 'https:' });
  }

  function newCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHABET[(Math.random() * ALPHABET.length) | 0];
    return c;
  }
  const cleanCode = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

  // Session wraps one Peer + one DataConnection. handlers: onStatus(text),
  // onOpen(), onData(msg), onClose(reason)
  function host(handlers) {
    const outer = { closed: false };
    let inner = null;
    const start = (servers, tries) => {
      if (outer.closed) return;
      const code = newCode();
      const peer = new window.Peer(PREFIX + code, peerOptions(servers));
      const s = inner = session(peer, handlers, servers);
      s.code = code;
      outer.code = code;
      peer.on('open', () => handlers.onStatus('waiting', code));
      peer.on('connection', (conn) => {
        if (s.conn) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
        s.attach(conn);
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && tries < 5) { s.close(); start(servers, tries + 1); } // code taken
        else s.fail(err);
      });
    };
    outer.send = (msg) => inner && inner.send(msg);
    outer.close = () => { outer.closed = true; if (inner) inner.close(); };
    iceServers().then((servers) => start(servers, 0));
    return outer;
  }

  function join(code, handlers) {
    const outer = { closed: false, code };
    let inner = null;
    handlers.onStatus('connecting', code);
    iceServers().then((servers) => {
      if (outer.closed) return;
      const peer = new window.Peer(undefined, peerOptions(servers));
      const s = inner = session(peer, handlers, servers);
      s.code = code;
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        s.attach(conn);
        // PeerJS reports a missing host as a peer error, but a connection
        // that never gets through (blocked, no relay) gives no error at all.
        s.timer = setTimeout(() => { if (!s.open) s.fail({ type: 'timeout' }); }, 20000);
      });
      peer.on('error', (err) => s.fail(err));
    });
    outer.send = (msg) => inner && inner.send(msg);
    outer.close = () => { outer.closed = true; if (inner) inner.close(); };
    return outer;
  }

  function session(peer, handlers, servers) {
    const s = {
      peer, conn: null, open: false, closed: false, timer: 0, ice: '', cands: {},
      attach(conn) {
        s.conn = conn;
        watchIce(conn);
        conn.on('open', () => { clearTimeout(s.timer); s.open = true; handlers.onOpen(); });
        conn.on('data', (msg) => { if (!s.closed && msg && typeof msg === 'object') handlers.onData(msg); });
        conn.on('close', () => s.end('left'));
        conn.on('error', () => s.end('left'));
      },
      send(msg) { if (s.open && s.conn && s.conn.open) s.conn.send(msg); },
      fail(err) {
        const type = err && err.type;
        let msg = {
          'peer-unavailable': 'No game with that code. Check the code and that your friend is still hosting.',
          'network': 'Could not reach the connection server. Check your internet connection.',
          'server-error': 'The connection server is not responding. Try again in a minute.',
          'browser-incompatible': 'This browser does not support online play.',
          'timeout': hasRelay(servers || [])
            ? 'Could not connect to your friend, even through the relay server. Try again, or try another network.'
            : 'Could not connect to your friend. Your networks do not allow a direct connection, and this site has no relay (TURN) server set up. See web/ice-config.js.',
          'ice-failed': hasRelay(servers || [])
            ? 'Found your friend\'s game, but could not link the two browsers, even through the relay server.'
            : 'Found your friend\'s game, but your networks block a direct link, and this site has no relay (TURN) server set up yet.',
        }[type] || 'Connection failed' + (type ? ' (' + type + ')' : '') + '.';
        if (type === 'timeout' && !s.ice) msg = 'Your friend\'s game did not answer. Ask them to reload the page and host again.';
        // which step failed, and what kind of network addresses this browser found
        const found = Object.keys(s.cands).join(', ') || 'none';
        const step = { network: 1, 'server-error': 1, 'peer-unavailable': 2 }[type] || 3;
        msg += ' [step ' + step + ' of 3' + (step === 3 ? ', link ' + (s.ice || 'not started') + ', addresses: ' + found : '') + ']';
        if (window.console) console.warn('Online play failed:', type, s.ice, s.cands, err);
        s.end(msg);
      },
      end(reason) {
        if (s.closed) return;
        s.closed = true; s.open = false;
        clearTimeout(s.timer);
        try { peer.destroy(); } catch (e) { /* already gone */ }
        handlers.onClose(reason);
      },
      close() { s.closed = true; clearTimeout(s.timer); try { peer.destroy(); } catch (e) { /* ignore */ } },
    };
    // PeerJS creates the RTCPeerConnection a moment after connect(); follow its
    // ICE state so a blocked link fails right away with a clear message.
    function watchIce(conn) {
      const poll = setInterval(() => {
        const pc = conn.peerConnection;
        if (s.closed) { clearInterval(poll); return; }
        if (!pc) return;
        clearInterval(poll);
        const update = () => {
          s.ice = pc.iceConnectionState;
          if (s.ice === 'checking' && !s.open) handlers.onStatus('linking', s.code);
          if (s.ice === 'failed' && !s.open) s.fail({ type: 'ice-failed' });
        };
        pc.addEventListener('iceconnectionstatechange', update);
        pc.addEventListener('icecandidate', (e) => {
          const m = e.candidate && / typ (host|srflx|prflx|relay)/.exec(e.candidate.candidate);
          if (m) s.cands[{ host: 'local', srflx: 'public', prflx: 'public', relay: 'relay' }[m[1]]] = true;
        });
        update();
      }, 100);
    }
    return s;
  }

  // ------------------------------------------------------------ snapshots
  const STATES = ['play', 'goal', 'over'];
  const r3 = (v) => Math.round(v * 1000) / 1000;

  function encode(match, events) {
    const a = [r3(match.time), STATES.indexOf(match.state), match.score[0], match.score[1]];
    const push = (b) => { const p = b.getPosition(); a.push(r3(p.x), r3(p.y), r3(b.getAngle())); };
    push(match.ball);
    for (const p of match.players) {
      push(p.body); push(p.kickLeg.body); push(p.standLeg.body);
      a.push(p.held ? 1 : 0, r3(p.charge));
    }
    const ev = events.map((e) => {
      const o = { type: e.type };
      if (e.p) o.p = match.players.indexOf(e.p);
      if (e.power != null) o.power = r3(e.power);
      if (e.team != null) o.team = e.team;
      return o;
    });
    return { t: 's', s: a, e: ev };
  }

  // A read-only stand-in for a match, shaped like the parts render.js draws.
  function createView() {
    const proxy = () => ({
      x: 0, y: 0, a: 0,
      getPosition() { return { x: this.x, y: this.y }; },
      getAngle() { return this.a; },
      getAngularVelocity() { return 0; },
    });
    const meta = [[0, true, 'A'], [0, false, 'D'], [1, true, '→'], [1, false, '←']];
    const view = {
      remote: true, time: 0, state: 'play', score: [0, 0], events: [],
      ball: proxy(),
      players: meta.map(([team, keeper, key]) => ({
        team, keeper, key, dir: team === 0 ? 1 : -1, held: false, charge: 0,
        body: proxy(), kickLeg: { body: proxy() }, standLeg: { body: proxy() },
      })),
      buffer: [], offset: null,
    };

    view.receive = function (msg, nowSec) {
      const s = msg.s;
      const sample = s[0] - nowSec;
      view.offset = view.offset == null ? sample : view.offset + (sample - view.offset) * 0.05;
      if (sample < view.offset) view.offset = sample; // jump back on a late-but-fresh packet
      view.buffer.push(s);
      while (view.buffer.length > 30) view.buffer.shift();
      view.state = STATES[s[1]] || 'play';
      view.score = [s[2], s[3]];
      for (const e of msg.e || []) {
        const ev = Object.assign({}, e);
        if (e.p != null) ev.p = view.players[e.p];
        view.events.push(ev);
      }
    };

    view.update = function (nowSec) {
      const buf = view.buffer;
      if (!buf.length) return;
      const rt = nowSec + view.offset - INTERP_DELAY;
      let a = buf[0], b = buf[0];
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i][0] <= rt) { a = buf[i]; b = buf[i + 1] || buf[i]; break; }
      }
      const f = b[0] > a[0] ? Math.max(0, Math.min(1, (rt - a[0]) / (b[0] - a[0]))) : 0;
      const lerp = (i) => a[i] + (b[i] - a[i]) * f;
      const lerpA = (i) => { const d = Math.atan2(Math.sin(b[i] - a[i]), Math.cos(b[i] - a[i])); return a[i] + d * f; };
      const set = (o, i) => { o.x = lerp(i); o.y = lerp(i + 1); o.a = lerpA(i + 2); };
      view.time = lerp(0);
      set(view.ball, 4);
      view.players.forEach((p, k) => {
        const base = 7 + k * 11;
        set(p.body, base); set(p.kickLeg.body, base + 3); set(p.standLeg.body, base + 6);
        p.held = !!b[base + 9]; p.charge = b[base + 10];
      });
    };
    return view;
  }

  window.FootballNet = { available, host, join, encode, createView, cleanCode, SNAPSHOT_HZ };
})();
