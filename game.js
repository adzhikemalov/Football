// Browser version of "Football": a one-button physics football game.
//
// The mechanics follow the decoded Soccer Physics model (see
// docs/why-soccer-physics-plays-better.md). Physics runs on planck.js (Box2D).
//
//   press   -> the kicking leg swings forward, the standing leg counter-swings,
//              and if the player is touching anything but the ball (ground,
//              the other player, the goal) it jumps along a blend of its own up
//              vector and world up, with a flip torque toward the opponent.
//              That flip is the only way to move across the pitch.
//   hold    -> 0.05 s after take-off the second 25% of the jump impulse lands,
//              so a tap is a short hop and a hold a full jump.
//   release -> the leg returns at half speed; the next jump is re-armed.
//              A short limiter stops bunny hopping.
//
// Standing, the body is heavy (45 kg) with its centre of mass far below the
// feet, so it rights itself like a weeble. Airborne it is lighter with a higher
// centre of mass, so it can flip. The ball never fully stops and does not
// bounce off players, only off the ground and the posts.
(function (root) {
  'use strict';

  const pl = root.planck || (typeof require === 'function' ? require('./planck.min.js') : null);
  const Vec2 = pl.Vec2;

  // ---------------------------------------------------------------- config
  const CFG = {
    gravity: -20,                 // Physics2DSettings.m_Gravity
    step: 1 / 120,
    timeScale: 0.85,              // the reference runs at 0.85: the chaos stays readable
    fieldHalf: 5.6,               // half width of the pitch: the ball is always a hop or two away
    ceiling: 12,
    goalMouthX: 4.8,              // front of the goal (crossbar)
    keeperX: 4.2,                 // keepers start on their line
    strikerX: 1.4,
    goalHeight: 3.0,
    goalBackHeight: 3.5,
    winScore: 5,
    readyTime: 1.0,               // s the ball hangs in the air at kick-off
    goalTime: 1.5,                // s of celebration before the next round (the first part in slow motion)

    bodyW: 0.5, bodyH: 1.0,       // Player BoxCollider2D
    legW: 0.25, legH: 0.75,       // leg BoxCollider2D
    legMass: 2,
    hipX: 0.125, hipY: -0.37,     // HingeJoint2D connected anchor
    headR: 0.2,

    // body (reference Player.cs: mass 45 / 30, centre of mass -1.6 / -0.2)
    groundedMass: 45,
    airborneMass: 30,
    groundedCom: -1.3,            // just below the feet: the player rights itself
    airborneCom: -0.2,
    bodyDamping: 0.15,
    bodyAngularDamping: 1.5,
    startWobble: 0.45,            // rad/s random spin at spawn

    // jump (reference: power 375 field / 495 keeper, 75% now + 25% later)
    jumpPowerPlayer: 250,
    jumpPowerKeeper: 310,
    jumpFirstShare: 0.75,
    jumpSecondDelay: 0.05,        // s (3 ticks at 60 Hz)
    jumpLimiter: 0.17,            // s (10 ticks at 60 Hz)
    jumpGrace: 0.12,              // s after take-off during which contacts do not count (no double jump)
    contactMemory: 0.08,          // s a contact keeps the player grounded (coyote time)
    fallenAngle: 50,              // degrees: beyond this the player is down
    getUpTorque: 160,             // righting torque while down
    getUpImpulse: 20,             // angular impulse when the button is pressed while down
    getUpHop: 3.5,                // m/s upward hop when the button is pressed while down
    jumpTorque: 2,                // angular impulse toward the opponent
    jumpForward: 0.45,            // forward lean of every hop (world up is 1.2, body up 1.3)
    maxPlayerSpeed: 25,           // sanity cap only

    // legs (reference: 800 forward, 400 back, 300 counter-swing, deg/s)
    kickSpeed: 800, returnSpeed: 400, backLegSpeed: 300,
    kickLimit: 90, backLegLimit: 6,
    legTorque: 700,
    legFriction: 0.6,

    ballR: 0.3,
    ballMass: 0.3,
    ballRestitution: 0.5,
    ballFriction: 0.15,
    alwaysMoveSqrSpeed: 0.5,      // below this the ball gets nudged ...
    nudgeSpeed: 0.1,              // ... by this much every tick

    groundFriction: 0.5,
  };

  // Round modifiers, rolled after every goal (probabilities from the reference).
  const MODS = [
    { id: 0, name: '' },
    { id: 1, name: 'MINI GOALS', chance: 0.10, goal: 0.6 },
    { id: 2, name: 'BIG GOALS', chance: 0.18, goal: 1.45 },
    { id: 3, name: 'HEAVY BALL', chance: 0.12, ball: 'heavy' },
    { id: 4, name: 'BEACH BALL', chance: 0.15, ball: 'beach' },
    { id: 5, name: 'ICY PITCH', chance: 0.20, ice: true },
    { id: 6, name: 'LOW GRAVITY', chance: 0.08, gravity: 0.55 },
  ];

  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function rollModifier(rnd) {
    let r = rnd();
    for (const m of MODS) {
      if (!m.chance) continue;
      if (r < m.chance) return m;
      r -= m.chance;
    }
    return MODS[0];
  }

  // ---------------------------------------------------------------- match
  function createMatch(opts) {
    opts = opts || {};
    const rnd = opts.random || Math.random;
    const match = {
      score: [0, 0],
      time: 0,
      round: 0,
      state: 'ready',       // ready | play | goal | over
      stateTimer: 0,
      lastScorer: -1,
      mod: MODS[0],
      modName: '',
      kits: [0, 0],         // kit variant per team, re-rolled every round
      goalHeight: CFG.goalHeight,
      goalBackHeight: CFG.goalBackHeight,
      ballR: CFG.ballR,
      events: [],           // {type:'kick'|'goal'|'post'|'whistle'|'hop', ...} consumed by the renderer
      players: [],
      ball: null,
      world: null,
      cpu: opts.cpu || [false, false],
    };

    function build() {
      const mod = match.round > 0 ? rollModifier(rnd) : MODS[0];
      match.mod = mod;
      match.modName = mod.name;
      match.kits = [Math.floor(rnd() * 3) % 3, Math.floor(rnd() * 3) % 3];
      const goalScale = mod.goal || 1;
      match.goalHeight = CFG.goalHeight * goalScale;
      match.goalBackHeight = CFG.goalBackHeight * goalScale;
      match.ballR = CFG.ballR * (mod.ball === 'beach' ? 1.4 : mod.ball === 'heavy' ? 1.15 : 1);

      const world = new pl.World({ gravity: Vec2(0, CFG.gravity * (mod.gravity || 1)) });
      match.world = world;
      match.players = [];

      // ground + bounds
      const groundFriction = mod.ice ? 0.02 : CFG.groundFriction;
      const ground = world.createBody();
      ground.createFixture(new pl.Box(CFG.fieldHalf + 1, 1, Vec2(0, -1), 0), {
        friction: groundFriction, restitution: 0, userData: { kind: 'ground' },
      });
      const bounds = world.createBody();
      const wallOpts = { friction: 0.2, restitution: 0.3, userData: { kind: 'wall' } };
      bounds.createFixture(new pl.Box(0.5, 20, Vec2(-CFG.fieldHalf - 0.5, 10), 0), wallOpts);
      bounds.createFixture(new pl.Box(0.5, 20, Vec2(CFG.fieldHalf + 0.5, 10), 0), wallOpts);
      bounds.createFixture(new pl.Box(CFG.fieldHalf + 1, 0.5, Vec2(0, CFG.ceiling + 0.5), 0), wallOpts);

      // goals: a roof sloping up towards the back so nothing rests on it,
      // plus a round crossbar at the front
      for (const side of [-1, 1]) {
        const g = world.createBody();
        const fx = side * CFG.goalMouthX, bx = side * CFG.fieldHalf;
        g.createFixture(new pl.Edge(Vec2(fx, match.goalHeight), Vec2(bx, match.goalBackHeight)), {
          friction: 0.1, restitution: 0.3, userData: { kind: 'goal' },
        });
        g.createFixture(new pl.Circle(Vec2(fx, match.goalHeight), 0.07), {
          friction: 0.1, restitution: 0.45, userData: { kind: 'post' },
        });
      }

      // ball
      const ball = world.createBody({
        type: 'dynamic', position: Vec2(0, 3.2), bullet: true,
        linearDamping: 0, angularDamping: 0.05,
      });
      let ballMass = CFG.ballMass, ballRest = CFG.ballRestitution;
      if (mod.ball === 'heavy') { ballMass *= 3; ballRest = 0.2; }
      if (mod.ball === 'beach') { ballMass *= 0.3; ballRest = 0.8; ball.setGravityScale(0.6); }
      const area = Math.PI * match.ballR * match.ballR;
      ball.createFixture(new pl.Circle(match.ballR), {
        density: ballMass / area, friction: CFG.ballFriction,
        restitution: ballRest, userData: { kind: 'ball' },
      });
      ball.nudge = mod.ball === 'beach' ? { sqr: 0.8, speed: 0.17 } : { sqr: CFG.alwaysMoveSqrSpeed, speed: CFG.nudgeSpeed };
      ball.playerContacts = 0;
      match.ball = ball;

      // players: team 0 attacks +x, team 1 attacks -x
      let group = 1;
      const add = (team, keeper, x, key) => {
        match.players.push(createPlayer(world, team, keeper, x, key, -(group++)));
      };
      add(0, true, -CFG.keeperX, 'A');
      add(0, false, -CFG.strikerX, 'D');
      add(1, true, CFG.keeperX, '→');
      add(1, false, CFG.strikerX, '←');

      world.on('begin-contact', onBeginContact);
      world.on('end-contact', onEndContact);
      world.on('pre-solve', onPreSolve);
    }

    function createPlayer(world, team, keeper, x, key, groupIndex) {
      const dir = team === 0 ? 1 : -1;
      const standY = -CFG.hipY + CFG.legH;    // body centre height when standing
      const filter = { filterGroupIndex: groupIndex };
      const body = world.createBody({
        type: 'dynamic', position: Vec2(x, standY),
        linearDamping: CFG.bodyDamping, angularDamping: CFG.bodyAngularDamping,
      });
      const bodyArea = CFG.bodyW * CFG.bodyH;
      body.createFixture(new pl.Box(CFG.bodyW / 2, CFG.bodyH / 2), Object.assign({
        density: 20 / bodyArea, friction: 0.4, restitution: 0, userData: { kind: 'body' },
      }, filter));
      const head = body.createFixture(new pl.Circle(Vec2(0, CFG.bodyH / 2 + CFG.headR * 0.9), CFG.headR), Object.assign({
        density: 2, friction: 0.3, restitution: 0.1, userData: { kind: 'head' },
      }, filter));
      if (keeper) {
        // raised arms (FixedJoint2D on the goalkeeper's hands in the original)
        for (const s of [-1, 1]) {
          body.createFixture(new pl.Box(0.08, 0.32, Vec2(s * 0.33, 0.62), -s * 18 * DEG), Object.assign({
            density: 1, friction: 0.3, restitution: 0.1, userData: { kind: 'arm' },
          }, filter));
        }
      }
      // The reference swaps mass and centre of mass with the grounded state.
      // Inertia stays the auto-computed one, scaled with the mass.
      // (Box2D measures MassData.I about the body origin, so add m*d^2 for the offset centre.)
      const md = { mass: 0, center: Vec2(0, 0), I: 0 };
      body.getMassData(md);
      const inertiaPerKg = (md.I - md.mass * Vec2.dot(md.center, md.center)) / md.mass;
      const massData = (mass, com) => ({ mass, center: Vec2(0, com), I: inertiaPerKg * mass + mass * com * com });
      const groundedMass = massData(CFG.groundedMass, CFG.groundedCom);
      const airborneMass = massData(CFG.airborneMass, CFG.airborneCom);
      body.setMassData(groundedMass);

      const mkLeg = (hx, kick) => {
        const hip = Vec2(x + hx, standY + CFG.hipY);
        const leg = world.createBody({
          type: 'dynamic', position: Vec2(hip.x, hip.y - CFG.legH / 2 + 0.005),
          linearDamping: 0.5, angularDamping: 0.05,
        });
        const fix = leg.createFixture(new pl.Box(CFG.legW / 2, CFG.legH / 2), Object.assign({
          density: CFG.legMass / (CFG.legW * CFG.legH), friction: CFG.legFriction,
          restitution: 0, userData: { kind: 'leg' },
        }, filter));
        // positive joint angle = counter-clockwise = the foot moves toward +x
        const lo = kick ? (dir > 0 ? 0 : -CFG.kickLimit) : -CFG.backLegLimit;
        const hi = kick ? (dir > 0 ? CFG.kickLimit : 0) : CFG.backLegLimit;
        const joint = world.createJoint(new pl.RevoluteJoint({
          enableMotor: true, maxMotorTorque: CFG.legTorque, motorSpeed: 0, enableLimit: true,
          lowerAngle: lo * DEG, upperAngle: hi * DEG,
        }, body, leg, hip));
        return { body: leg, fix, joint };
      };
      // the kicking leg is the one closer to the opponent's goal
      const kickLeg = mkLeg(dir * CFG.hipX, true);
      const standLeg = mkLeg(-dir * CFG.hipX, false);

      const p = {
        team, keeper, dir, key, body, head, kickLeg, standLeg, spawnX: x,
        groundedMass, airborneMass,
        held: false, grounded: false, released: true, jumped: false,
        secondDone: false, secondTimer: 0, limiter: 0, airborne: false,
        grace: 0, lastContact: -1, down: false,
        pendingPress: false, pendingRelease: false,
      };
      for (const part of [body, kickLeg.body, standLeg.body]) part.setUserData({ player: p });
      relaxLegs(p);
      body.setAngularVelocity((rnd() < 0.5 ? -1 : 1) * CFG.startWobble * (0.8 + 0.4 * rnd()));
      return p;
    }

    function setMotor(joint, degPerSec) {
      joint.setMaxMotorTorque(CFG.legTorque);
      joint.setMotorSpeed(degPerSec * DEG);
    }
    function kickLegs(p) {
      setMotor(p.kickLeg.joint, CFG.kickSpeed * p.dir);
      setMotor(p.standLeg.joint, -CFG.backLegSpeed * p.dir);
    }
    function relaxLegs(p) {
      setMotor(p.kickLeg.joint, -CFG.returnSpeed * p.dir);
      setMotor(p.standLeg.joint, CFG.backLegSpeed * p.dir);
    }

    // ------------------------------------------------------------ contacts
    function ballAndOther(contact) {
      const fa = contact.getFixtureA(), fb = contact.getFixtureB();
      const ua = fa.getUserData() || {}, ub = fb.getUserData() || {};
      if (ua.kind === 'ball') return { other: ub, otherFix: fb, ballFix: fa };
      if (ub.kind === 'ball') return { other: ua, otherFix: fa, ballFix: fb };
      return null;
    }
    function ownerOf(fix) {
      return (fix.getBody().getUserData() || {}).player || null;
    }
    const kickEvents = [];
    function onBeginContact(contact) {
      const c = ballAndOther(contact);
      if (!c) return;
      const owner = ownerOf(c.otherFix);
      if (owner) {
        match.ball.playerContacts++;
        match.ball.lastTouch = owner.team;
        kickEvents.push(owner);
      } else if (c.other.kind === 'post' || c.other.kind === 'goal') {
        match.events.push({ type: 'post' });
      }
    }
    function onEndContact(contact) {
      const c = ballAndOther(contact);
      if (!c) return;
      if (ownerOf(c.otherFix)) match.ball.playerContacts = Math.max(0, match.ball.playerContacts - 1);
    }
    // the ball does not bounce off players: kicks push it instead of pinging it
    function onPreSolve(contact) {
      const c = ballAndOther(contact);
      if (c && ownerOf(c.otherFix)) contact.setRestitution(0);
    }

    // ------------------------------------------------------------ controls
    match.press = function (i) {
      const p = match.players[i];
      if (p && !p.held) { p.held = true; p.pendingPress = true; }
    };
    match.release = function (i) {
      const p = match.players[i];
      if (p && p.held) { p.held = false; p.pendingRelease = true; }
    };

    // Touching anything except the ball counts as ground, like the reference's
    // Grounder: players can jump off each other, the keeper and the goal frame.
    function isGrounded(p) {
      for (const part of [p.kickLeg.body, p.standLeg.body, p.body]) {
        for (let ce = part.getContactList(); ce; ce = ce.next) {
          if (!ce.contact.isTouching()) continue;
          if (ce.other === match.ball) continue;
          return true;
        }
      }
      return false;
    }

    function jumpImpulse(p, share) {
      const body = p.body;
      const power = p.keeper ? CFG.jumpPowerKeeper : CFG.jumpPowerPlayer;
      const up = body.getWorldVector(Vec2(0, 1));
      const dir = Vec2((up.x * 1.3 + p.dir * CFG.jumpForward) * 0.5, (up.y * 1.3 + 1.2) * 0.5);
      body.applyLinearImpulse(Vec2(dir.x * power * share, dir.y * power * share), body.getWorldCenter(), true);
    }

    function drivePlayer(p, dt) {
      const body = p.body;
      // A contact keeps the player grounded for a short while (so a hop still works from
      // the lip of a landing), but contacts are ignored right after take-off: the feet
      // still touch the ground for a tick or two and would otherwise re-arm a mid-air jump.
      if (p.grace > 0) p.grace -= dt;
      if (p.grace <= 0 && isGrounded(p)) p.lastContact = match.time;
      p.grounded = p.grace <= 0 && p.lastContact >= 0 && match.time - p.lastContact <= CFG.contactMemory;
      if (p.limiter > 0) p.limiter -= dt;

      const angle = wrapAngle(body.getAngle());
      p.down = p.grounded && Math.abs(angle) > CFG.fallenAngle * DEG;
      if (p.down) {
        // a fallen player rolls back up on its own ...
        body.applyTorque(-Math.sign(angle) * CFG.getUpTorque, true);
      }

      if (p.pendingPress) {
        p.pendingPress = false;
        kickLegs(p);
        if (p.down && p.limiter <= 0) {
          // ... and faster when the button is pressed
          body.applyAngularImpulse(-Math.sign(angle) * CFG.getUpImpulse, true);
          body.applyLinearImpulse(Vec2(0, CFG.getUpHop * body.getMass()), body.getWorldCenter(), true);
          p.limiter = CFG.jumpLimiter;
          match.events.push({ type: 'hop', p });
        } else if (!p.jumped && p.grounded && p.released && p.limiter <= 0) {
          // switch to the airborne mass first so the flip torque acts on the lighter body
          body.setMassData(p.airborneMass);
          p.airborne = true;
          jumpImpulse(p, CFG.jumpFirstShare);
          body.applyAngularImpulse(-CFG.jumpTorque * p.dir, true);
          p.grounded = false;
          p.grace = CFG.jumpGrace;
          p.lastContact = -1;
          p.jumped = true;
          p.secondDone = false;
          p.secondTimer = CFG.jumpSecondDelay;
          p.limiter = CFG.jumpLimiter;
          p.released = false;
          match.events.push({ type: 'hop', p });
        }
      }
      if (p.pendingRelease) {
        p.pendingRelease = false;
        p.jumped = false;
        p.released = true;
        relaxLegs(p);
      }

      if (p.grounded && !p.jumped) {
        if (p.airborne) { body.setMassData(p.groundedMass); p.airborne = false; }
      } else if (p.jumped && !p.grounded) {
        // the second part of the jump, only while the button is still held
        if (p.secondTimer > 0) p.secondTimer -= dt;
        else if (!p.secondDone) { jumpImpulse(p, 1 - CFG.jumpFirstShare); p.secondDone = true; }
      }

      const v = body.getLinearVelocity();
      const sp = v.length();
      if (sp > CFG.maxPlayerSpeed) body.setLinearVelocity(Vec2(v.x * CFG.maxPlayerSpeed / sp, v.y * CFG.maxPlayerSpeed / sp));
    }

    function driveBall(dt) {
      const ball = match.ball;
      if (match.state === 'ready') {
        ball.setLinearVelocity(Vec2(0, 0));
        ball.setAngularVelocity(0);
        return;
      }
      if (ball.playerContacts > 0) return;
      const v = ball.getLinearVelocity();
      const sq = v.x * v.x + v.y * v.y;
      if (sq >= ball.nudge.sqr) return;
      let dx, dy;
      if (sq > 1e-4) { const l = Math.sqrt(sq); dx = v.x / l; dy = v.y / l; }
      else { dx = ball.getPosition().x >= 0 ? -1 : 1; dy = 0; }   // a dead ball creeps toward the middle
      ball.setLinearVelocity(Vec2(v.x + dx * ball.nudge.speed, v.y + dy * ball.nudge.speed));
    }

    function flushKickEvents() {
      if (!kickEvents.length) return;
      const bv = match.ball.getLinearVelocity();
      const power = clamp(bv.length() / 14, 0.15, 1);
      const seen = new Set();
      for (const p of kickEvents) {
        if (seen.has(p)) continue;
        seen.add(p);
        if (match.time - (p.lastKickEvent || -1) < 0.12) continue;
        p.lastKickEvent = match.time;
        match.events.push({ type: 'kick', p, power });
      }
      kickEvents.length = 0;
    }

    function checkGoal() {
      const b = match.ball.getPosition();
      if (Math.abs(b.x) > CFG.goalMouthX + match.ballR * 0.6 && b.y < match.goalHeight) {
        const scorer = b.x > 0 ? 0 : 1;
        match.score[scorer]++;
        match.lastScorer = scorer;
        match.state = match.score[scorer] >= CFG.winScore ? 'over' : 'goal';
        match.stateTimer = 0;
        match.events.push({ type: 'goal', team: scorer });
      }
    }

    match.stepFixed = function () {
      const dt = CFG.step;
      match.time += dt;
      const playing = match.state === 'play' || match.state === 'ready';
      if (!playing) {
        // keep the world moving during the celebration, but ignore input
        for (const p of match.players) {
          if (p.held) { p.held = false; p.pendingRelease = true; }
          p.pendingPress = false;
        }
      }
      for (const p of match.players) drivePlayer(p, dt);
      driveBall(dt);
      match.world.step(dt, 10, 8);
      flushKickEvents();
      if (match.state === 'ready') {
        match.stateTimer += dt;
        if (match.stateTimer >= CFG.readyTime) { match.state = 'play'; match.stateTimer = 0; }
      } else if (match.state === 'play') {
        checkGoal();
      } else {
        match.stateTimer += dt;
        if (match.state === 'goal' && match.stateTimer > CFG.goalTime) {
          match.round++;
          match.kickoff();
        }
      }
    };

    match.kickoff = function () {
      build();
      match.state = 'ready';
      match.stateTimer = 0;
      // the team that conceded gets the ball dropped slightly on its side
      if (match.lastScorer >= 0) {
        match.ball.setPosition(Vec2(match.lastScorer === 0 ? 0.6 : -0.6, 3.2));
      }
      match.events.push({ type: 'whistle', mod: match.modName });
    };

    match.restart = function () {
      match.score = [0, 0];
      match.lastScorer = -1;
      match.round = 0;
      match.kickoff();
    };

    build();
    return match;
  }

  // -------------------------------------------------------------- simple AI
  // Like the reference: mostly random taps, eager when the ball is close, and
  // the keeper reacts to a ball coming at its goal.
  function cpuThink(match, i, dt) {
    const p = match.players[i];
    const ai = p.ai || (p.ai = { hold: 0, wait: 0.3 + Math.random() * 0.3 });
    if (match.state !== 'play') return;
    const b = match.ball.getPosition(), bv = match.ball.getLinearVelocity();
    const foot = p.kickLeg.body.getPosition();
    const dist = Math.hypot(b.x - foot.x, b.y - foot.y);
    const ahead = (b.x - p.body.getPosition().x) * p.dir;

    if (p.held) {
      ai.hold -= dt;
      if (ai.hold <= 0) { match.release(i); ai.wait = 0.12 + Math.random() * 0.25; }
      return;
    }
    ai.wait -= dt;
    if (ai.wait > 0) return;

    let rate = 0.6;                               // random taps per second
    if (dist < 1.8) rate = 9;                     // the ball is at the feet
    else if (p.keeper && bv.x * p.dir < -2 && ahead > -1 && ahead < 4.5) rate = 5;   // shot coming in
    else if (!p.keeper && ahead > 1.5) rate = 2.5;                                 // chase the ball
    if (Math.random() < rate * dt) {
      match.press(i);
      ai.hold = dist < 1.8 ? 0.06 + Math.random() * 0.2 : 0.12 + Math.random() * 0.3;
    }
  }

  const api = { CFG, MODS, createMatch, cpuThink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FootballGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
