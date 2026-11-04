# Football Physics: browser version

A browser port of the Unity prototype in `Assets/`. Unity 5.5 can't export
this project to the web without the editor, so the game is rebuilt with
[planck.js](https://github.com/piqnt/planck.js), a JavaScript Box2D port (the
same engine family as Unity 2D physics). Body sizes, masses, hinge anchors and
gravity come from `Player.prefab`, `Ball.prefab` and `Physics2DSettings`.

## Play

Open `index.html` in a browser. It has no build step and no network
dependencies, so this also works:

```sh
cd web && python3 -m http.server 8000   # then open http://localhost:8000
```

| Team | Whole team | Keeper | Striker |
|------|------------|--------|---------|
| Blue | `W`        | `A`    | `D`     |
| Red  | `↑`        | `→`    | `←`     |

One button does everything, like in Soccer Physics. **Press** to kick and hop:
the kicking leg swings forward, the arms go up, and if the player is touching
anything but the ball (the ground, the other players, the goal frame) it jumps
along a blend of its own up vector and world up, leaning a little toward the
other goal, with a small flip toward the opponent. A **tap** gives a short hop
(the first 75% of the jump); **holding** adds the other 25% a moment after
take-off for a full jump. **Release** to swing the leg back and re-arm the
jump; a short limiter stops bunny hopping. Standing players are heavy with a
very low centre of mass, so they get back up on their own after a tumble.
`W` and `↑` drive both players of a team at once; `A`/`D` and `→`/`←` still
drive them one at a time. `P` pauses, `R` restarts, and on phones on-screen
buttons appear. You can play against the CPU or with two people on one
keyboard. First to 5 goals wins, and after every goal the next round may get a
random twist: mini or big goals, a heavy or beach ball, an icy pitch, low
gravity.

## Online multiplayer

Choose **Play online**. One player presses **Host a game** and gets a 4-letter
code and a link. The other player opens the link (or types the code) and
presses **Join**. The host plays Blue and the guest plays Red.

Online, each person uses the same two keys: the key pointing at your own
goal is your keeper. Blue: `A`/`←` keeper, `D`/`→` striker. Red: `D`/`→`
keeper, `A`/`←` striker. On phones, each player gets their own team's buttons.

How it works: the browsers connect directly over WebRTC using
[PeerJS](https://peerjs.com). PeerJS's free public server introduces the two
browsers. The host's browser runs all the physics and sends positions 30 times
a second. The guest sends only key presses and draws what it receives about
0.1 s behind, which keeps the motion smooth. So the guest's controls lag by
their ping plus that 0.1 s, and the host's controls don't lag at all.

### When a direct link is blocked

Most home networks can connect the two browsers directly. Strict networks
(many mobile carriers, offices, schools, some home routers) block that. The
game then falls back on its own, with no setup needed:

1. **Backup relay (automatic).** If the direct link fails (after about 3 to
   12 seconds), the guest says "Connecting through the backup relay" and both
   browsers send the game through a free public MQTT broker
   (`broker.emqx.io` or `broker.hivemq.com`) over a secure WebSocket. No
   account or card is needed. It adds some delay for the guest, so snapshots
   drop to 20 per second and the guest draws the match 0.2 s behind. It also
   works when PeerJS's connection server is down.
2. **Optional TURN server.** For the lowest delay on strict networks, you can
   add a TURN relay in `ice-config.js`: a Metered.ca credentials URL or any
   TURN server with a username and password. PeerJS's own relays
   (`*.turn.peerjs.com`) no longer exist, so the game doesn't use them.

The public brokers are shared, so anyone who knows a game's code could read
or send its messages. That's fine for a casual game, but don't send anything
private through it.

Online play needs the page to be served over the web (not opened from a
file). The easiest way is GitHub Pages:

1. On GitHub, open the repository's **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the
   branch with this code (for example `master` once it is merged) and the
   `/ (root)` folder, and press **Save**.
3. After a minute the game is at
   `https://adzhikemalov.github.io/Football/web/`.

The empty `.nojekyll` file in the repository root tells GitHub Pages to serve
the files as they are, without running Jekyll.

To test with your own servers, run `npx peerjs --port 9000` and any MQTT
broker with WebSockets, then open
`index.html?peer=localhost:9000&relay=ws://localhost:8888`.

## Where the numbers come from

The mechanics are the ones decoded from the original Soccer Physics build
(`decompiled/Assembly-CSharp.dll` in this repository; see
`docs/why-soccer-physics-plays-better.md`): press = kick + jump + flip,
75%/25% two-stage jump, release = relax and re-arm, 10-tick jump limiter,
"grounded" = touching anything but the ball, body mass 45 standing / 30 in the
air with a centre of mass far below the feet when standing, a ball that never
stops (a small nudge below a threshold speed) and never bounces off players,
time scale 0.85, and random round modifiers with the reference probabilities.

What was tuned for this project's body size, with headless simulations in
Node (`CFG` in `game.js` holds every value):

* jump power 250 (keeper 310) instead of 375/495: a tap hops about 1.1 m and
  a hold about 1.8 m for a 1.9 m tall player;
* contacts are ignored for 0.12 s after take-off and a contact keeps the
  player grounded for 0.08 s. The reference needs a "DJFix" trigger for the
  same reason: the feet still touch the ground a tick after the impulse, and
  without this a press at the top of a hop jumps again in mid-air;
* a fallen player (more than 50 degrees over) gets a righting torque, and a
  press while down adds a righting impulse and a small hop;
* the pitch is 11.2 m wide (goals 9.6 m apart) instead of 14 m, keepers start
  on their line and strikers 1.4 m from the centre, so the ball is a hop away;
* flip torque 2 instead of 5 and angular damping 1.5, so a player lands at
  most a little tilted;
* every hop leans 0.45 toward the opponent (the reference only gets forward
  motion from the flip);
* centre of mass 1.3 below the body centre when standing (the reference's
  1.6 is beyond this body's feet).

Measured in a 10 minute CPU vs CPU match after these changes: about a third
of presses touch the ball within 0.35 s (was 15%), a touch every 0.6 s (was
1.3 s), players down 9 to 17% of the time (was 25%), 7 to 9 goals a minute.

The previous web build used a charge-on-hold, kick-on-release scheme with a
scripted "kick assist" that set the ball's velocity directly. That is gone:
the ball only ever moves because something physical hit it.

## Files

* `game.js`: physics, rules, round modifiers and CPU players. It has no DOM
  code, so it also runs in Node for tuning (`require('./game.js')`, with
  `planck` on `globalThis`).
* `render.js`: canvas drawing, input, sound and the main loop. The camera
  pans with the ball on narrow screens and zooms out when it flies high; a
  goal starts in slow motion; kits, the ball and the pitch change with the
  round modifier.
* `net.js`: online play: hosting, joining, snapshots and interpolation.
* `ice-config.js`: the relay (TURN) server settings for online play.
* `planck.min.js`: planck.js 1.4.2 (MIT), included in the repo so the game
  works offline.
* `peerjs.min.js`: PeerJS 1.5.5 (MIT), used for online play.
* `mqtt.min.js`: MQTT.js 5.16.0 (MIT), used for the backup relay.
