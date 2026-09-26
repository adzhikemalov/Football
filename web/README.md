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

**Hold** to wind up the kicking leg and **release** to kick and hop.
A quick tap gives a small hop and a light touch. A full charge (the bar over
the head) gives a big jump and a hard shot. Players hop in the direction
they lean. Pressing while lying on the ground stands the player back up.
`P` pauses, `R` restarts, and on phones on-screen buttons appear.
You can play against the CPU or with two people on one keyboard. First to 5
goals wins.

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
* **Heads and headers.** Players have a head, and a jumping header gets a
  small push forward.
* **Self-righting.** A balancing torque replaces the centre-of-mass swap
  in `Player.cs`. Fallen players get up after about 1 s, or right away when
  you press their key.
* **Goals.** The roof slopes toward the pitch, so the ball can't rest on
  top of a goal. A ball stuck on a player for a few seconds gets nudged free.

## Files

* `game.js`: physics, rules and CPU players. It has no DOM code, so it
  also runs in Node for tuning (`require('./game.js')`, with `planck` on
  `globalThis`).
* `render.js`: canvas drawing, input, sound and the main loop.
* `planck.min.js`: planck.js 1.4.2 (MIT), included in the repo so the game
  works offline.
