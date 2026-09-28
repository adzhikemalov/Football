// Browser port of the Unity "Football" prototype (Assets/Scripts/*.cs).
// Physics runs on planck.js (Box2D), the same engine family as Unity 2D, and
// starts from the values in Player.prefab / Ball.prefab / Physics2DSettings.
//
// One button per player, like the original:
//   press   -> hop (if a foot is on something) and cock the kicking leg back
//   hold    -> charge the kick (the bar above the player fills up)
//   release -> swing the leg forward; power depends on the charge
//
// Kick/ball-control changes compared to the Unity build:
//   * legs used a friction of 100, so the ball stuck to the feet -> 0.6
//   * a kicking foot that touches the ball sends it towards the opponent's
//     goal with lift (driven shot when hit high, chip when hit low)
//   * the hold/release charge that the unused "Scroll" bar hinted at now
//     controls kick power and timing
//   * players have a head (headers get a small forward boost) and right
//     themselves after falling; pressing while lying down stands them up
(function (root) {
  'use strict';

  const pl = root.planck || (typeof require === 'function' ? require('./planck.min.js') : null);
  const Vec2 = pl.Vec2;

  // ---------------------------------------------------------------- config
  const CFG = {
    gravity: -20,                 // Physics2DSettings.m_Gravity
    step: 1 / 120,
    fieldHalf: 7,                 // walls at x = ±7 (scene "Bound" objects)
    ceiling: 9,
    goalMouthX: 6.15,             // front of the goal (crossbar)
    goalHeight: 2.8,
    goalBackHeight: 3.35,
    winScore: 5,

    bodyW: 0.5, bodyH: 1.0,       // Player BoxCollider2D
    bodyMass: 20,                 // Player Rigidbody2D mass
    legW: 0.25, legH: 0.75,       // leg BoxCollider2D
    legMass: 2,
    hipX: 0.125, hipY: -0.37,     // HingeJoint2D connected anchor
    headR: 0.2,

    ballR: 0.3,                   // CircleCollider2D radius
    ballDensity: 1,               // -> mass ~0.28 (auto mass in Unity)
    ballRestitution: 0.8,
    ballFriction: 0.3,

    legFriction: 0.6,             // was 100 (ActiveLeg.physicsMaterial2D)
    groundFriction: 1.2,

    hopSpeed: 6.6,                // get-up hop
    hopUpMin: 6.8, hopUpMax: 10.5,  // vertical speed: tap .. full charge (~1.2 m .. 2.7 m)
    swayAmp: 24,                  // degrees standing players rock back and forth
    swayPeriod: 0.7,              // s per full sway
    maxAim: 32,                   // degrees: steepest locked jump direction
    hopCooldown: 0.22,
    maxPlayerSpeed: 12,

    kickBackAngle: 50,            // degrees the leg cocks back while charging
    kickFwdAngle: 105,
    kickSwingSpeed: 18,           // rad/s
    kickTorque: 600,
    idleTorque: 700,              // Leg.MaxMotorTorque
    kickWindow: 0.3,              // s after release during which contact = kick
    chargeTime: 0.7,              // s to full charge
    minCharge: 0.35,
    kickMinSpeed: 7.5,
    kickMaxSpeed: 16.5,

    uprightK: 650, uprightD: 120, // self-righting torque on the ground
    aimK: 1400,                   // holds the locked lean while the button is held
    coyoteTime: 0.15,             // s after leaving the ground a jump still works
    airK: 160, airD: 18,
  };

  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------------------------------------------------------------- match
  function createMatch(opts) {
    opts = opts || {};
    const match = {
      score: [0, 0],
      time: 0,
      state: 'play',        // play | goal | over
      stateTimer: 0,
      lastScorer: -1,
      events: [],           // {type:'kick'|'goal'|'bounce'|'whistle', ...} consumed by the renderer
      players: [],
      ball: null,
      world: null,
      cpu: opts.cpu || [false, false],
    };

    function build() {
      const world = new pl.World({ gravity: Vec2(0, CFG.gravity) });
      match.world = world;
      match.players = [];

      // ground + bounds
      const ground = world.createBody();
      ground.createFixture(new pl.Box(CFG.fieldHalf + 1, 1, Vec2(0, -1), 0), {
        friction: CFG.groundFriction, restitution: 0.1, userData: { kind: 'ground' },
      });
      const bounds = world.createBody();
      const wallOpts = { friction: 0.2, restitution: 0.3, userData: { kind: 'wall' } };
      bounds.createFixture(new pl.Box(0.5, 10, Vec2(-CFG.fieldHalf - 0.5, 8), 0), wallOpts);
      bounds.createFixture(new pl.Box(0.5, 10, Vec2(CFG.fieldHalf + 0.5, 8), 0), wallOpts);
      bounds.createFixture(new pl.Box(CFG.fieldHalf + 1, 0.5, Vec2(0, CFG.ceiling + 0.5), 0), wallOpts);

      // goals: roof sloping up towards the back so nothing rests on it,
      // plus a round crossbar at the front
      for (const side of [-1, 1]) {
        const g = world.createBody();
        const fx = side * CFG.goalMouthX, bx = side * CFG.fieldHalf;
        g.createFixture(new pl.Edge(Vec2(fx, CFG.goalHeight), Vec2(bx, CFG.goalBackHeight)), {
          friction: 0.1, restitution: 0.3, userData: { kind: 'goal' },
        });
        g.createFixture(new pl.Circle(Vec2(fx, CFG.goalHeight), 0.07), {
          friction: 0.1, restitution: 0.45, userData: { kind: 'post' },
        });
      }

      // ball
      const ball = world.createBody({
        type: 'dynamic', position: Vec2(0, 3.2), bullet: true,
        linearDamping: 0.03, angularDamping: 0.6,
      });
      ball.createFixture(new pl.Circle(CFG.ballR), {
        density: CFG.ballDensity, friction: CFG.ballFriction,
        restitution: CFG.ballRestitution, userData: { kind: 'ball' },
      });
      match.ball = ball;

      // players: team 0 attacks +x, team 1 attacks -x
      let group = 1;
      const add = (team, keeper, x, key) => {
        match.players.push(createPlayer(world, team, keeper, x, key, -(group++)));
      };
      add(0, true, -5.3, 'A');
      add(0, false, -2.1, 'D');
      add(1, true, 5.3, '→');
      add(1, false, 2.1, '←');

      world.on('begin-contact', onBeginContact);
    }

    function createPlayer(world, team, keeper, x, key, groupIndex) {
      const dir = team === 0 ? 1 : -1;
      const standY = -CFG.hipY + CFG.legH;    // body centre height when standing
      const filter = { filterGroupIndex: groupIndex };
      const body = world.createBody({
        type: 'dynamic', position: Vec2(x, standY), linearDamping: 0.4, angularDamping: 1.5,
      });
      const bodyArea = CFG.bodyW * CFG.bodyH;
      body.createFixture(new pl.Box(CFG.bodyW / 2, CFG.bodyH / 2), Object.assign({
        density: CFG.bodyMass / bodyArea, friction: 0.4, restitution: 0.05, userData: { kind: 'body' },
      }, filter));
      const head = body.createFixture(new pl.Circle(Vec2(0, CFG.bodyH / 2 + CFG.headR * 0.9), CFG.headR), Object.assign({
        density: 2, friction: 0.3, restitution: 0.35, userData: { kind: 'head' },
      }, filter));
      if (keeper) {
        // raised arms (FixedJoint2D on the goalkeeper's hands in the original)
        for (const s of [-1, 1]) {
          body.createFixture(new pl.Box(0.08, 0.32, Vec2(s * 0.33, 0.62), -s * 18 * DEG), Object.assign({
            density: 1, friction: 0.3, restitution: 0.2, userData: { kind: 'arm' },
          }, filter));
        }
      }

      const mkLeg = (hx) => {
        const hip = Vec2(x + hx, standY + CFG.hipY);
        const leg = world.createBody({
          type: 'dynamic', position: Vec2(hip.x, hip.y - CFG.legH / 2 + 0.005),
          linearDamping: 0.5, angularDamping: 0.05,
        });
        const fix = leg.createFixture(new pl.Box(CFG.legW / 2, CFG.legH / 2), Object.assign({
          density: CFG.legMass / (CFG.legW * CFG.legH), friction: CFG.legFriction,
          restitution: 0.1, userData: { kind: 'leg' },
        }, filter));
        const joint = world.createJoint(new pl.RevoluteJoint({
          enableMotor: true, maxMotorTorque: CFG.idleTorque, motorSpeed: 0, enableLimit: true,
          lowerAngle: 0, upperAngle: 0,
        }, body, leg, hip));
        return { body: leg, fix, joint };
      };
      // the kicking leg is the one closer to the opponent's goal
      const kickLeg = mkLeg(dir * CFG.hipX);
      const standLeg = mkLeg(-dir * CFG.hipX);
      const lo = (a, b) => dir > 0 ? [a * DEG, b * DEG] : [-b * DEG, -a * DEG];
      kickLeg.joint.setLimits(...lo(-CFG.kickBackAngle - 5, CFG.kickFwdAngle + 5));
      standLeg.joint.setLimits(...lo(-35, 35));

      const p = {
        team, keeper, dir, key, body, head, kickLeg, standLeg, spawnX: x,
        held: false, holdTime: 0, charge: 0, kickTimer: 99, kickPower: 0,
        hopCooldown: 0, lastAssist: -1, grounded: false, fallenTime: 0, aim: 0,
        swayPhase: (team * 2 + (keeper ? 1 : 0)) * 1.7,
        pendingPress: false, pendingRelease: false,
      };
      for (const part of [body, kickLeg.body, standLeg.body]) part.setUserData({ player: p });
      return p;
    }

    const assists = [];
    function onBeginContact(contact) {
      const fa = contact.getFixtureA(), fb = contact.getFixtureB();
      const ua = fa.getUserData() || {}, ub = fb.getUserData() || {};
      let other = null, otherFix = null;
      if (ua.kind === 'ball') { other = ub; otherFix = fb; }
      else if (ub.kind === 'ball') { other = ua; otherFix = fa; }
      if (!other) return;
      const owner = (otherFix.getBody().getUserData() || {}).player;
      if (owner && other.kind === 'head') {
        assists.push({ p: owner, fix: otherFix, kind: other.kind });
      } else if (other.kind === 'post' || other.kind === 'goal') {
        match.events.push({ type: 'post' });
      }
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

    function isGrounded(p) {
      for (const part of [p.kickLeg.body, p.standLeg.body, p.body]) {
        for (let ce = part.getContactList(); ce; ce = ce.next) {
          const c = ce.contact;
          if (!c.isTouching()) continue;
          const other = ce.other;
          if (other === match.ball) continue;
          if (part === p.body && other.getType() !== 'static') continue;
          return true;
        }
      }
      return false;
    }

    function drivePlayer(p, dt) {
      const body = p.body;
      p.grounded = isGrounded(p);
      p.airTime = p.grounded ? 0 : (p.airTime || 0) + dt;
      p.hopCooldown -= dt;
      p.kickTimer += dt;
      const angle = wrapAngle(body.getAngle());
      const fallen = Math.abs(angle) > 65 * DEG;

      const hop = (up, getUp) => {
        if (p.airTime > CFG.coyoteTime || p.hopCooldown > 0) return;
        p.hopCooldown = CFG.hopCooldown;
        const mass = body.getMass() + p.kickLeg.body.getMass() + p.standLeg.body.getMass();
        let dir;
        if (getUp) {
          // mostly straight up with a spin back towards upright
          dir = Vec2(p.dir * 0.15 * up, up);
          body.setAngularVelocity(-angle * 7);
        } else {
          // straight along the locked lean: the jump goes where the head points
          dir = Vec2(-Math.sin(p.aim) * up, Math.cos(p.aim) * up);
        }
        const v = body.getLinearVelocity();
        const add = Vec2(dir.x - v.x * 0.5, dir.y - Math.min(v.y, 0));
        body.applyLinearImpulse(Vec2(add.x * mass, add.y * mass), body.getWorldCenter(), true);
        match.events.push({ type: 'hop', p });
      };

      if (p.pendingPress) {
        p.pendingPress = false;
        p.holdTime = 0;
        p.charge = 0;
        // lock the lean: holding keeps the head pointing this way
        p.aim = clamp(angle, -CFG.maxAim * DEG, CFG.maxAim * DEG);
        if (fallen) hop(CFG.hopSpeed * 0.8, true);
      }
      if (p.held) {
        p.holdTime += dt;
        p.charge = clamp(p.holdTime / CFG.chargeTime, 0, 1);
      }
      if (p.pendingRelease) {
        // kick and hop together: a tap is a short hop, a charged release a
        // hard kick and a high jump
        p.pendingRelease = false;
        p.kickPower = CFG.minCharge + (1 - CFG.minCharge) * p.charge;
        p.kickTimer = 0;
        if (!fallen) hop(CFG.hopUpMin + (CFG.hopUpMax - CFG.hopUpMin) * p.charge, false);
        p.charge = 0;
        match.events.push({ type: 'swing', p });
      }

      // leg motors (P-controllers on the hinge angle, sign flipped for team 1)
      const kicking = p.kickTimer < CFG.kickWindow;
      let kickTarget = 0, standTarget = 0, kickSpeed = 12, kickTorque = CFG.idleTorque;
      if (p.held) {
        kickTarget = -CFG.kickBackAngle; standTarget = 12;
      } else if (kicking) {
        kickTarget = CFG.kickFwdAngle; standTarget = -18;
        kickSpeed = CFG.kickSwingSpeed * (0.6 + 0.4 * p.kickPower);
        kickTorque = CFG.kickTorque;
      }
      setMotor(p.kickLeg.joint, kickTarget * DEG * p.dir, kickSpeed, kickTorque);
      setMotor(p.standLeg.joint, standTarget * DEG * p.dir, 10, CFG.idleTorque);

      // stay upright (Player.cs moved the centre of mass for this)
      const w = body.getAngularVelocity();
      const onFeet = p.grounded && !fallen;
      let k = onFeet ? CFG.uprightK : CFG.airK, d = onFeet ? CFG.uprightD : CFG.airD;
      if (fallen && p.grounded) {
        p.fallenTime += dt;
        if (p.fallenTime > 1.2) { k = CFG.uprightK * 1.6; d = CFG.uprightD; }
      } else {
        p.fallenTime = 0;
      }
      // standing players sway so the head (and the next jump) points forward
      // or back in turn; while the button is held the lean stays locked
      let target = 0, targetW = 0;
      if (p.held && !fallen) { target = p.aim; k = Math.max(k, CFG.aimK); d = Math.max(d, CFG.uprightD); }
      else if (onFeet) {
        const om = 2 * Math.PI / CFG.swayPeriod, ph = match.time * om + p.swayPhase;
        target = CFG.swayAmp * DEG * Math.sin(ph);
        targetW = CFG.swayAmp * DEG * om * Math.cos(ph);   // damp relative to the sway, so it doesn't lag
      }
      body.applyTorque(-(k * (angle - target) + d * (w - targetW)), true);

      const v = body.getLinearVelocity();
      const sp = v.length();
      if (sp > CFG.maxPlayerSpeed) body.setLinearVelocity(Vec2(v.x * CFG.maxPlayerSpeed / sp, v.y * CFG.maxPlayerSpeed / sp));
    }

    function setMotor(joint, target, maxSpeed, torque) {
      const err = target - joint.getJointAngle();
      joint.setMaxMotorTorque(torque);
      joint.setMotorSpeed(clamp(err * 18, -maxSpeed, maxSpeed));
    }

    function applyAssists() {
      const ball = match.ball;
      // a swinging kick leg that touches the ball (new or ongoing contact)
      for (const p of match.players) {
        if (p.held || p.kickTimer > CFG.kickWindow) continue;
        for (let ce = p.kickLeg.body.getContactList(); ce; ce = ce.next) {
          if (ce.other === ball && ce.contact.isTouching()) assists.push({ p, kind: 'leg' });
        }
      }
      while (assists.length) {
        const a = assists.shift();
        const p = a.p;
        if (match.time - p.lastAssist < 0.15) continue;
        const bpos = ball.getPosition();
        const bv = ball.getLinearVelocity();
        if (a.kind === 'head') {
          const pv = p.body.getLinearVelocity();
          if (pv.y < 1) continue;
          p.lastAssist = match.time;
          ball.setLinearVelocity(Vec2(bv.x * 0.5 + p.dir * 4.5, Math.max(bv.y, 0) * 0.3 + 5.5));
          match.events.push({ type: 'kick', p, power: 0.4 });
          continue;
        }
        const foot = p.kickLeg.body.getWorldPoint(Vec2(0, -CFG.legH * 0.3));
        const rel = Vec2(bpos.x - foot.x, bpos.y - foot.y);
        if (rel.x * p.dir < -0.2) continue;   // ball behind the foot
        p.lastAssist = match.time;
        // ball above the foot -> driven low shot, below/level -> lifted
        const lift = clamp(30 - rel.y * 55, 12, 58) * DEG;
        const speed = CFG.kickMinSpeed + (CFG.kickMaxSpeed - CFG.kickMinSpeed) * p.kickPower;
        const nv = Vec2(p.dir * Math.cos(lift) * speed + bv.x * 0.15, Math.sin(lift) * speed + Math.max(bv.y, 0) * 0.15);
        ball.setLinearVelocity(nv);
        ball.setAngularVelocity(-p.dir * speed * 1.5);
        match.events.push({ type: 'kick', p, power: p.kickPower });
      }
    }

    function checkGoal() {
      const b = match.ball.getPosition();
      if (Math.abs(b.x) > CFG.goalMouthX + CFG.ballR * 0.6 && b.y < CFG.goalHeight) {
        const scorer = b.x > 0 ? 0 : 1;
        match.score[scorer]++;
        match.lastScorer = scorer;
        match.state = match.score[scorer] >= CFG.winScore ? 'over' : 'goal';
        match.stateTimer = 0;
        match.events.push({ type: 'goal', team: scorer });
      }
    }

    let stuckTime = 0;
    function unstickBall(dt) {
      const b = match.ball;
      const pos = b.getPosition();
      if (b.getLinearVelocity().length() < 0.4 && pos.y > CFG.ballR + 0.15) stuckTime += dt;
      else stuckTime = 0;
      if (stuckTime > 2.5) {
        stuckTime = 0;
        b.setLinearVelocity(Vec2(-Math.sign(pos.x || 1) * 2.5, 3));
      }
    }

    match.stepFixed = function () {
      const dt = CFG.step;
      match.time += dt;
      if (match.state === 'play') {
        for (const p of match.players) drivePlayer(p, dt);
        match.world.step(dt, 10, 8);
        applyAssists();
        unstickBall(dt);
        checkGoal();
      } else {
        // keep the world moving during the celebration, but ignore input
        for (const p of match.players) {
          p.held = false; p.pendingPress = false; p.pendingRelease = false;
          drivePlayer(p, dt);
        }
        match.world.step(dt, 10, 8);
        assists.length = 0;
        match.stateTimer += dt;
        if (match.state === 'goal' && match.stateTimer > 1.8) match.kickoff();
      }
    };

    match.kickoff = function () {
      build();
      match.state = 'play';
      match.stateTimer = 0;
      // the team that conceded gets the ball dropped slightly on its side
      if (match.lastScorer >= 0) {
        match.ball.setPosition(Vec2(match.lastScorer === 0 ? 0.6 : -0.6, 3.2));
      }
      match.events.push({ type: 'whistle' });
    };

    match.restart = function () {
      match.score = [0, 0];
      match.lastScorer = -1;
      match.kickoff();
    };

    build();
    return match;
  }

  // -------------------------------------------------------------- simple AI
  // Decides press/release for a player; holds state on the player object.
  function cpuThink(match, i, dt) {
    const p = match.players[i];
    const ai = p.ai || (p.ai = { holdFor: 0, wait: Math.random() * 0.3 });
    const b = match.ball.getPosition(), bv = match.ball.getLinearVelocity();
    const pos = p.body.getPosition();
    const ahead = (b.x - pos.x) * p.dir;        // ball distance in attacking direction
    const dy = b.y - pos.y;
    ai.wait -= dt;

    if (p.held) {
      ai.holdFor -= dt;
      // release early if the ball is right at the foot
      const foot = p.kickLeg.body.getPosition();
      const near = Math.hypot(b.x - foot.x - p.dir * 0.3, b.y - foot.y) < 0.55;
      if (ai.holdFor <= 0 || (near && p.holdTime > 0.08)) {
        match.release(i);
        ai.wait = 0.15 + Math.random() * 0.25;
      }
      return;
    }
    if (ai.wait > 0 || !p.grounded) return;

    // the jump goes where the head points, so wait for the sway to lean the
    // way we want to go (>0: leaning towards the opponent's goal)
    const leanFwd = -wrapAngle(p.body.getAngle()) * p.dir;
    const leaning = (want) => leanFwd * want > 0.1;
    const fallen = Math.abs(wrapAngle(p.body.getAngle())) > 65 * DEG;
    if (fallen) { match.press(i); ai.holdFor = 0.05; ai.wait = 0.4; return; }

    if (p.keeper) {
      const home = (p.spawnX - pos.x) * p.dir;      // >0: home is ahead
      const threat = ahead > -0.5 && ahead < 3.2 && dy < 1.8;
      const coming = bv.x * p.dir < -1 && ahead < 5 && ahead > -0.5;
      if (threat || coming) {
        match.press(i);
        ai.holdFor = threat && ahead < 1.2 ? 0.05 + Math.random() * 0.2 : 0.35;
        ai.wait = 0.2 + Math.random() * 0.2;
      } else if (Math.abs(home) > 1.2 && leaning(Math.sign(home))) {
        match.press(i); ai.holdFor = 0.05;           // hop back home
        ai.wait = 0.3;
      }
      return;
    }

    if (ahead > -0.3 && ahead < 1.3 && dy < 1.2) {
      if (leanFwd > -0.05) { match.press(i); ai.holdFor = 0.1 + Math.random() * 0.45; }
    } else if (ahead >= 1.3) {
      if (leaning(1)) { match.press(i); ai.holdFor = 0.04 + Math.random() * 0.2; ai.wait = 0.2 + Math.random() * 0.3; }
    } else if (ahead <= -0.3) {
      if (leaning(-1)) { match.press(i); ai.holdFor = 0.04 + Math.random() * 0.2; ai.wait = 0.3; }
    }
  }

  const api = { CFG, createMatch, cpuThink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FootballGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
