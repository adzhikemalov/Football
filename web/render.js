// Canvas renderer, input and main loop for game.js.
(function () {
  'use strict';
  const { CFG, createMatch, cpuThink } = window.FootballGame;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const menu = document.getElementById('menu');
  const touchLeft = document.getElementById('touch-left');
  const touchRight = document.getElementById('touch-right');

  const TEAM = [
    { name: 'BLUE', shirt: '#2f7fd8', dark: '#1d4f8c', shorts: '#f4f1e8', sock: '#2f7fd8', keeper: '#35b56a' },
    { name: 'RED', shirt: '#e0463c', dark: '#8f2621', shorts: '#1c1c1c', sock: '#e0463c', keeper: '#f2a93b' },
  ];
  const SKIN = ['#f1c7a1', '#c98e62', '#8d5a3b', '#e8b48a'];
  const HAIR = ['#3b2a1e', '#161616', '#6b3f1f', '#d9b25c'];
  const KEYMAP = { KeyA: 0, KeyD: 1, ArrowRight: 2, ArrowLeft: 3 };

  let match = null;
  let mode = null;            // 'cpu' | '2p'
  let paused = false;
  let W = 0, H = 0, S = 1, dpr = 1;
  const particles = [];
  const crowd = [];
  let banner = null;          // { text, sub, color, t }

  // ------------------------------------------------------------- layout
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    S = Math.min(W / 15.4, H / 8.6);
    crowd.length = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cols = ['#8a4b4b', '#4b6a8f', '#9a978c', '#8f7f4a', '#5d7a5f', '#6b5d80'];
    for (let i = 0; i < 520; i++) crowd.push({ x: rnd(), y: rnd(), c: cols[(rnd() * cols.length) | 0], p: rnd() * 6.28 });
  }
  const sx = (x) => W / 2 + x * S;
  const sy = (y) => H * 0.5 - (y - 3.3) * S;

  // -------------------------------------------------------------- audio
  let ac = null;
  function audio() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type, vol, slide) {
    const a = ac; if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  }
  function noise(dur, vol, freq) {
    const a = ac; if (!a) return;
    const buf = a.createBuffer(1, Math.max(1, (a.sampleRate * dur) | 0), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = 'lowpass'; f.frequency.value = freq || 1200; g.gain.value = vol;
    src.buffer = buf; src.connect(f).connect(g).connect(a.destination); src.start();
  }
  const sfx = {
    kick: (p) => { noise(0.08, 0.5 + p * 0.4, 900); tone(120, 0.12, 'sine', 0.35, 60); },
    post: () => tone(880, 0.35, 'triangle', 0.18, 700),
    hop: () => tone(260, 0.07, 'sine', 0.05, 380),
    whistle: () => { tone(2300, 0.18, 'square', 0.04); setTimeout(() => tone(2300, 0.35, 'square', 0.04), 220); },
    goal: () => { noise(1.6, 0.25, 700); tone(523, 0.2, 'triangle', 0.12); setTimeout(() => tone(659, 0.2, 'triangle', 0.12), 150); setTimeout(() => tone(784, 0.4, 'triangle', 0.12), 300); },
  };

  // -------------------------------------------------------------- input
  const humanPlayers = () => mode === 'cpu' ? [0, 1] : [0, 1, 2, 3];
  function press(i) { if (match && !paused && humanPlayers().includes(i)) match.press(i); }
  function release(i) { if (match && humanPlayers().includes(i)) match.release(i); }

  window.addEventListener('keydown', (e) => {
    if (e.code in KEYMAP) {
      e.preventDefault();
      if (!e.repeat) { audio(); press(KEYMAP[e.code]); }
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (match) paused = !paused;
    } else if (e.code === 'KeyR') {
      if (match) { match.restart(); paused = false; }
    } else if ((e.code === 'Space' || e.code === 'Enter') && match && match.state === 'over') {
      match.restart();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code in KEYMAP) { e.preventDefault(); release(KEYMAP[e.code]); }
  });
  window.addEventListener('blur', () => { if (match) for (let i = 0; i < 4; i++) match.release(i); });

  for (const pad of document.querySelectorAll('.pad')) {
    const i = +pad.dataset.player;
    const down = (e) => { e.preventDefault(); audio(); pad.classList.add('down'); pad.setPointerCapture && pad.setPointerCapture(e.pointerId); press(i); };
    const up = (e) => { e.preventDefault(); pad.classList.remove('down'); release(i); };
    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
  }
  canvas.addEventListener('pointerdown', () => { if (match && match.state === 'over') match.restart(); });

  function start(m) {
    audio();
    mode = m;
    match = createMatch({ cpu: m === 'cpu' ? [false, true] : [false, false] });
    match.events.push({ type: 'whistle' });
    paused = false;
    menu.hidden = true;
    const touch = matchMedia('(pointer: coarse)').matches;
    touchLeft.hidden = !touch;
    touchRight.hidden = !touch || m === 'cpu';
  }
  document.getElementById('btn-cpu').addEventListener('click', () => start('cpu'));
  document.getElementById('btn-2p').addEventListener('click', () => start('2p'));

  // ---------------------------------------------------------------- loop
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (match && !paused) {
      acc += dt;
      let n = 0;
      while (acc >= CFG.step && n < 10) {
        if (match.state === 'play' && mode === 'cpu') { cpuThink(match, 2, CFG.step); cpuThink(match, 3, CFG.step); }
        match.stepFixed();
        acc -= CFG.step; n++;
      }
      if (n === 10) acc = 0;
      handleEvents();
    }
    updateParticles(dt);
    draw(now / 1000);
    requestAnimationFrame(frame);
  }

  function handleEvents() {
    for (const e of match.events) {
      if (e.type === 'kick') {
        sfx.kick(e.power || 0.5);
        const b = match.ball.getPosition();
        for (let i = 0; i < 8 + e.power * 10; i++) {
          const a = Math.random() * 6.28, v = 1 + Math.random() * 3 * (0.5 + e.power);
          particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, c: '#ffffff' });
        }
      } else if (e.type === 'post') sfx.post();
      else if (e.type === 'hop') { /* quiet */ }
      else if (e.type === 'whistle') { sfx.whistle(); banner = { text: 'KICK OFF', color: '#f4f1e8', t: 0, dur: 1.0 }; }
      else if (e.type === 'goal') {
        sfx.goal();
        const t = TEAM[e.team];
        banner = match.state === 'over'
          ? { text: t.name + ' WINS', sub: 'press Space or tap to play again', color: t.shirt, t: 0, dur: 1e9 }
          : { text: 'GOAL!', sub: t.name + ' scores', color: t.shirt, t: 0, dur: 1.8 };
        const b = match.ball.getPosition();
        for (let i = 0; i < 60; i++) {
          const a = Math.random() * 6.28, v = 2 + Math.random() * 6;
          particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 3, life: 1.2, c: i % 2 ? t.shirt : '#f2c94c' });
        }
      }
    }
    match.events.length = 0;
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt; p.vy -= 12 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (banner) banner.t += dt;
  }

  // ---------------------------------------------------------------- draw
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(t);
    if (!match) {
      drawGoal(-1); drawGoal(1);
      return;
    }
    drawGoalNet(-1); drawGoalNet(1);
    for (const p of match.players) drawPlayer(p);
    drawBall(match.ball);
    drawGoal(-1); drawGoal(1);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 3));
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), Math.max(1.5, S * 0.035), 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawHUD();
  }

  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, 0, sy(0));
    g.addColorStop(0, '#6fb3e8'); g.addColorStop(1, '#cfe7f5');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // stands
    const standTop = sy(6.6), standBot = sy(1.3);
    ctx.fillStyle = '#3a4150';
    ctx.fillRect(0, standTop, W, standBot - standTop);
    ctx.fillStyle = '#2c323e';
    ctx.fillRect(0, standTop - S * 0.25, W, S * 0.25);
    const r = Math.max(1.2, S * 0.055);
    const excite = banner && banner.text === 'GOAL!' && banner.t < 1.8 ? 1 : 0.2;
    for (const c of crowd) {
      const x = c.x * W, y = standTop + S * 0.2 + c.y * (standBot - standTop - S * 0.45);
      const bob = Math.sin(t * 6 + c.p) * r * excite;
      ctx.fillStyle = c.c;
      ctx.beginPath(); ctx.arc(x, y + bob, r, 0, 6.28); ctx.fill();
    }
    // advertising boards
    const bt = sy(1.3), bh = S * 0.42;
    ctx.fillStyle = '#1f2a24'; ctx.fillRect(0, bt, W, bh);
    ctx.fillStyle = '#f2c94c';
    ctx.font = `700 ${Math.max(10, S * 0.26)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const words = ['FOOTBALL PHYSICS', 'HOLD · RELEASE · SCORE', 'FOOTBALL PHYSICS', 'PLANCK.JS'];
    for (let i = 0; i < 4; i++) ctx.fillText(words[i], W * (i + 0.5) / 4, bt + bh / 2);

    // grass
    const gy = sy(0);
    ctx.fillStyle = '#3f9a45'; ctx.fillRect(0, bt + bh, W, gy - bt - bh);
    const stripe = S * 1.4;
    for (let i = -12; i < 12; i++) {
      if (i % 2) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(sx(i * 1.4), bt + bh, stripe, gy - bt - bh);
    }
    ctx.fillStyle = '#2f7a35'; ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = -12; i < 12; i += 2) ctx.fillRect(sx(i * 1.4), gy, stripe, H - gy);
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(sx(-CFG.fieldHalf), gy - 1, CFG.fieldHalf * 2 * S, Math.max(2, S * 0.04));
    ctx.fillRect(sx(0) - 1, gy - S * 0.02, 2, S * 0.1);
  }

  function goalShape(side) {
    const fx = side * CFG.goalMouthX, bx = side * CFG.fieldHalf;
    return { fx, bx, fy: CFG.goalHeight, by: CFG.goalBackHeight };
  }
  function drawGoalNet(side) {
    const g = goalShape(side);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx(g.fx), sy(0)); ctx.lineTo(sx(g.fx), sy(g.fy)); ctx.lineTo(sx(g.bx), sy(g.by)); ctx.lineTo(sx(g.bx), sy(0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
    const step = 0.18;
    for (let x = Math.min(g.fx, g.bx); x <= Math.max(g.fx, g.bx) + 0.01; x += step) {
      ctx.beginPath(); ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(3)); ctx.stroke();
    }
    for (let y = 0; y <= 3; y += step) {
      ctx.beginPath(); ctx.moveTo(sx(g.fx), sy(y)); ctx.lineTo(sx(g.bx), sy(y)); ctx.stroke();
    }
    ctx.restore();
  }
  function drawGoal(side) {
    const g = goalShape(side);
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, S * 0.12);
    ctx.beginPath(); ctx.moveTo(sx(g.fx), sy(0)); ctx.lineTo(sx(g.fx), sy(g.fy)); ctx.lineTo(sx(g.bx), sy(g.by)); ctx.stroke();
    ctx.lineWidth = Math.max(2, S * 0.06);
    ctx.beginPath(); ctx.moveTo(sx(g.bx), sy(g.by)); ctx.lineTo(sx(g.bx), sy(0)); ctx.stroke();
    // front post drawn semi-transparent: only the crossbar is solid in the physics
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx(g.fx), sy(0)); ctx.lineTo(sx(g.fx), sy(g.fy)); ctx.stroke();
  }

  function withBody(body, fn) {
    const p = body.getPosition();
    ctx.save();
    ctx.translate(sx(p.x), sy(p.y));
    ctx.rotate(-body.getAngle());
    ctx.scale(S, -S);          // world units, y up
    fn();
    ctx.restore();
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function drawLeg(p, leg, front) {
    const team = TEAM[p.team];
    withBody(leg.body, () => {
      const w = CFG.legW, h = CFG.legH;
      ctx.fillStyle = front ? team.shorts : shade(team.shorts);
      rrect(-w / 2, h / 2 - 0.3, w, 0.3, 0.05); ctx.fill();          // shorts
      ctx.fillStyle = SKIN[(p.team * 2 + (p.keeper ? 1 : 0)) % 4];
      ctx.fillRect(-w / 2 + 0.03, -0.05, w - 0.06, 0.18);               // knee
      ctx.fillStyle = front ? team.sock : shade(team.sock);
      ctx.fillRect(-w / 2 + 0.02, -h / 2 + 0.08, w - 0.04, 0.34);       // sock
      ctx.fillStyle = '#161616';                                        // boot, toe forward
      rrect(p.dir > 0 ? -w / 2 : -w / 2 - 0.1, -h / 2 - 0.02, w + 0.1, 0.13, 0.05); ctx.fill();
    });
  }
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(v * 0.78);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function drawPlayer(p) {
    const team = TEAM[p.team];
    const shirt = p.keeper ? team.keeper : team.shirt;
    drawLeg(p, p.standLeg, false);
    withBody(p.body, () => {
      const w = CFG.bodyW, h = CFG.bodyH;
      const skin = SKIN[(p.team * 2 + (p.keeper ? 1 : 0)) % 4];
      // arms
      if (p.keeper) {
        for (const s of [-1, 1]) {
          ctx.save(); ctx.translate(s * 0.33, 0.62); ctx.rotate(-s * 18 * Math.PI / 180);
          ctx.fillStyle = shirt; rrect(-0.08, -0.32, 0.16, 0.6, 0.07); ctx.fill();
          ctx.fillStyle = '#f4f1e8'; ctx.beginPath(); ctx.arc(0, 0.3, 0.1, 0, 6.28); ctx.fill();
          ctx.restore();
        }
      } else {
        const swing = Math.sin(p.body.getAngularVelocity() * 0.2 + (p.held ? 1 : 0)) * 0.4;
        ctx.save(); ctx.translate(-p.dir * 0.2, 0.36); ctx.rotate(Math.PI + swing * p.dir);
        ctx.fillStyle = shade(shirt); rrect(-0.06, 0, 0.12, 0.48, 0.06); ctx.fill();
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, 0.5, 0.065, 0, 6.28); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = shirt;
      rrect(-w / 2, -h / 2, w, h, 0.1); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(-w / 2, -h / 2, w, 0.12);
      // number
      ctx.save(); ctx.scale(1, -1);
      ctx.fillStyle = p.keeper ? '#1c1c1c' : '#ffffff';
      ctx.font = '700 0.34px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.keeper ? '1' : '9', 0, 0.02);
      ctx.restore();
      // head
      const hy = h / 2 + CFG.headR * 0.9, r = CFG.headR;
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, hy, r, 0, 6.28); ctx.fill();
      ctx.fillStyle = HAIR[(p.team * 2 + (p.keeper ? 1 : 0)) % 4];
      ctx.beginPath(); ctx.arc(0, hy + 0.02, r * 1.02, 0.1, Math.PI - 0.1); ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(p.dir * r * 0.5, hy - 0.02, 0.035, 0, 6.28); ctx.fill();
      if (!p.keeper) {
        ctx.save(); ctx.translate(p.dir * 0.2, 0.36); ctx.rotate(Math.PI - (p.held ? 0.9 : 0.35) * p.dir);
        ctx.fillStyle = shirt; rrect(-0.06, 0, 0.12, 0.48, 0.06); ctx.fill();
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, 0.5, 0.065, 0, 6.28); ctx.fill();
        ctx.restore();
      }
    });
    drawLeg(p, p.kickLeg, true);

    // key hint + charge bar above the head
    const pos = p.body.getPosition();
    const hx = sx(pos.x), hy = sy(pos.y + 1.05);
    const human = mode === '2p' || p.team === 0;
    if (human) {
      ctx.font = `700 ${Math.max(10, S * 0.2)}px ui-monospace, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      rrectPx(hx - S * 0.17, hy - S * 0.33 - S * 0.13, S * 0.34, S * 0.26, 4); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillText(p.key, hx, hy - S * 0.33);
    }
    if (p.held) {
      const bw = S * 0.7, bh = Math.max(4, S * 0.09);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; rrectPx(hx - bw / 2, hy - bh / 2, bw, bh, bh / 2); ctx.fill();
      ctx.fillStyle = p.charge >= 1 ? '#f2c94c' : '#ffffff';
      rrectPx(hx - bw / 2, hy - bh / 2, Math.max(bh, bw * p.charge), bh, bh / 2); ctx.fill();
    }
  }
  function rrectPx(x, y, w, h, r) { rrect(x, y, w, h, Math.min(r, w / 2, h / 2)); }

  function drawBall(ball) {
    const p = ball.getPosition(), r = CFG.ballR;
    // shadow
    const sh = Math.max(0.2, 1 - p.y / 6);
    ctx.fillStyle = `rgba(0,0,0,${0.25 * sh})`;
    ctx.beginPath(); ctx.ellipse(sx(p.x), sy(0) + 2, r * S * sh, r * S * 0.25 * sh, 0, 0, 6.28); ctx.fill();
    withBody(ball, () => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#1c1c1c';
      pent(0, 0, r * 0.32);
      for (let i = 0; i < 5; i++) {
        const a = i * 2 * Math.PI / 5 + Math.PI / 2;
        pent(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.22);
      }
      ctx.strokeStyle = '#1c1c1c'; ctx.lineWidth = 0.02;
      ctx.beginPath(); ctx.arc(0, 0, r - 0.01, 0, 6.28); ctx.stroke();
    });
    function pent(cx, cy, rr) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = i * 2 * Math.PI / 5 + Math.PI / 2;
        ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    }
    // off-screen marker when the ball is above the view
    if (sy(p.y) < 0) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(sx(p.x), 4); ctx.lineTo(sx(p.x) - 8, 18); ctx.lineTo(sx(p.x) + 8, 18); ctx.fill();
    }
  }

  function drawHUD() {
    // scoreboard
    const cw = Math.min(260, W * 0.5), ch = 44, x = W / 2 - cw / 2, y = 10;
    ctx.fillStyle = 'rgba(12,22,16,0.82)'; rrectPx(x, y, cw, ch, 10); ctx.fill();
    ctx.fillStyle = TEAM[0].shirt; rrectPx(x + 6, y + 6, 32, ch - 12, 6); ctx.fill();
    ctx.fillStyle = TEAM[1].shirt; rrectPx(x + cw - 38, y + 6, 32, ch - 12, 6); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 24px "Trebuchet MS", sans-serif';
    ctx.fillText(`${match.score[0]}  –  ${match.score[1]}`, W / 2, y + ch / 2 + 1);
    ctx.font = '700 11px "Trebuchet MS", sans-serif';
    ctx.fillText('BLU', x + 22, y + ch / 2); ctx.fillText('RED', x + cw - 22, y + ch / 2);

    if (H > W * 1.1 && match.time < 6) {
      ctx.font = '700 14px "Trebuchet MS", sans-serif'; ctx.fillStyle = '#1c2a3a';
      ctx.fillText('Turn your phone sideways for a bigger pitch', W / 2, y + ch + 22);
    }
    if (paused) drawBanner({ text: 'PAUSED', sub: 'press P to continue', color: '#f4f1e8', t: 1, dur: 1e9 });
    else if (banner && banner.t < banner.dur) drawBanner(banner);
  }
  function drawBanner(b) {
    const a = Math.min(1, b.t * 5, (b.dur - b.t) * 4);
    ctx.globalAlpha = Math.max(0, a);
    const size = Math.min(W * 0.12, S * 1.1);
    ctx.font = `900 ${size}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.12; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(b.text, W / 2, H * 0.3);
    ctx.fillStyle = b.color; ctx.fillText(b.text, W / 2, H * 0.3);
    if (b.sub) {
      ctx.font = `700 ${Math.max(14, size * 0.28)}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 4; ctx.strokeText(b.sub, W / 2, H * 0.3 + size * 0.7);
      ctx.fillStyle = '#ffffff'; ctx.fillText(b.sub, W / 2, H * 0.3 + size * 0.7);
    }
    ctx.globalAlpha = 1;
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
