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

| Team | Striker | Keeper |
|------|---------|--------|
| Blue | `D`     | `A`    |
| Red  | `←`     | `→`    |

Standing players rock back and forth (about ±15°, every 0.7 s), and a jump
always goes where the head points. **Press** when the head leans the way you
want to go: the lean locks and an arrow over the head shows the jump
direction. **Hold** to charge (the bar fills) and **release** to kick and
jump. A quick tap gives a hop of about 1 m and a light touch. A full charge
gives a jump of about 2 m and a hard shot. Kicks always aim at the
opponent's goal. Pressing while lying on the ground stands the player back up.
`P` pauses, `R` restarts, and on phones on-screen buttons appear.
You can play against the CPU or with two people on one keyboard. First to 5
goals wins.

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

## Changes to kicking and ball control compared with the Unity build

* **Kick on release.** In the Unity build, holding the key swung the legs,
  and hopping (when it was enabled) happened on press. That carried the
  player over the ball before the leg could reach it. Now press plants the
  player and cocks the leg back. Release swings the leg and hops at the
  same moment, so you time the kick to the moment you let go.
* **Kick power.** The charge bar (the unused `Scroll` image in `Player.cs`)
  now sets kick power: about 7 m/s for a tap, about 16 m/s at full charge.
* **Kick assist.** When a swinging foot touches the ball, the ball goes
  toward the opponent's goal with lift. Hitting the ball high gives a
  driven shot, and hitting it low gives a chip. This replaces a random
  bounce off a box.
* **Leg friction** was 100 (`ActiveLeg.physicsMaterial2D`), which made the
  ball stick to the feet. It is now 0.6.
* **Bouncier ball.** Restitution is 0.8 (a 3 m drop bounces back to about 2 m).
* **Heads and headers.** Players have a head, and a jumping header gets a
  small push forward.
* **Self-righting.** A balancing torque replaces the centre-of-mass swap
  in `Player.cs`. Fallen players get up after about 1 s, or right away when
  you press their key.
* **Goals** are 2.8 m tall. The roof slopes toward the pitch, so the ball can't rest on
  top of a goal. A ball stuck on a player for a few seconds gets nudged free.

## Files

* `game.js`: physics, rules and CPU players. It has no DOM code, so it
  also runs in Node for tuning (`require('./game.js')`, with `planck` on
  `globalThis`).
* `render.js`: canvas drawing, input, sound and the main loop.
* `net.js`: online play: hosting, joining, snapshots and interpolation.
* `ice-config.js`: the relay (TURN) server settings for online play.
* `planck.min.js`: planck.js 1.4.2 (MIT), included in the repo so the game
  works offline.
* `peerjs.min.js`: PeerJS 1.5.5 (MIT), used for online play.
* `mqtt.min.js`: MQTT.js 5.16.0 (MIT), used for the backup relay.
