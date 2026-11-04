# Why the browser game still plays worse than Soccer Physics and Soccer Random

Measured on the build published on 2026-11-04 (`web/game.js`), with headless Node
simulations of the real game code and frame captures from headless Chromium. Numbers are
from a 10 minute CPU vs CPU match unless stated.

## 1. What the measurements say

| Metric | This game | What the genre leaders feel like |
|---|---|---|
| Presses that touch the ball within 0.35 s | 15% | most presses near the ball connect |
| Average gap between ball touches | 1.3 s, longest 16 s | a touch every second or two, no dead spells |
| A player lying on the ground | 25% of play time | a tumble lasts a second |
| Tap hop vs hold hop apex | 1.31 m vs 1.54 m | tap and hold are clearly different actions |
| Striker mashing toward a ball 1.9 m away | overshoots it in 5 of 8 runs, flies to 8 to 11 m height | the ball is one hop away and you land on it |
| Ball airborne | 40% of play | ball mostly bouncing at player height |
| Goals per minute | 4.7 | 3 to 6 |
| Keeper vs a scripted 10 m/s shot | saves 10 of 12 | similar |

Goal rate and keeper strength are fine. Everything else points at one defect and two
design gaps.

## 2. Root causes, ranked

### 2.1 A second jump fires in mid-air (bug)

A tick-by-tick trace of a striker pressing at the top of a hop:

```
t0.00 y=1.14 gr=true  HOP                 feet on the ground, jump
t0.05 y=1.51 gr=true  [no contacts]       grounded again: the feet were still touching one tick after take-off
t0.45 y=2.61 gr=true  HOP (in the air)    second jump at the apex, 5.3 m/s sideways
t0.60 y=3.46 ... t0.85 y=4.13             twice the height of a normal hop, lands 6 m away
```

Grounded is set by any contact and cleared only by a jump, as in the reference, but the
feet stay in contact for a tick or two after the impulse, so the flag comes straight back.
Any press while airborne then jumps again with the tilted body's up vector, which is mostly
horizontal. This single bug explains the overshooting, the players lying down a quarter of
the time (they land from 4 m up at an angle), the ball being airborne 40% of the time, and
the 16 second spells where nobody touches it. The reference ships a "DJFix" trigger zone
for exactly this double jump.

Tested fix in a scratch copy (ignore contacts for 0.12 s after a jump, let grounded expire
0.1 s after the last contact): tap 1.57 m / hold 2.56 m (distinct at last), touches every
1.1 s, longest gap 9 s, 19% of presses connect, goals 7.3 per minute. Jump power then needs
to come down (about 240) and the fallen share (still 24%) needs the next item.

### 2.2 Getting up is slow and passive

The reference's centre of mass is 1.6 units below the body on a bigger body, so a fallen
player pops back up in well under a second. Here 1.3 is already beyond the feet (1.12), and
a lying player rolls up over one to two seconds with nothing the player can do. The previous
web build let a press stand the player up; Soccer Physics players barely ever lie still.
Options: a stronger righting torque while fallen, or a press while lying down that applies
the righting impulse.

### 2.3 The pitch is too big for the hop

The pitch is 14 m wide and a player is 1.9 m tall: 7.4 player heights. A hop lands 0.3 to
0.8 m forward, so crossing to the ball takes 5 to 10 hops, and in the meantime the ball has
been nudged elsewhere. In Soccer Physics the four players nearly fill the screen; the ball
is always within one hop of someone, which is why every press matters. Either shrink the
pitch to about 9 to 10 m, or make the hop carry further and spawn the strikers closer to
the centre.

## 3. What the genre leaders do that this game does not

Soccer Physics (Otto Ojala) and Soccer Random (RHM Interactive) are the two games people
play instead of this one. Both are one button, first to five, local two player plus CPU,
and no online. Beyond the mechanics above, they differ from this game in:

- **Something changes every goal, visibly.** Soccer Random moves to a new field with new
  characters after each goal; Soccer Physics re-rolls goals, balls, pitch and outfits. Here
  the modifiers exist but most are invisible: icy pitch draws the same grass, heavy ball
  looks like the normal ball, low gravity has no cue beyond the banner, and the kit never
  changes.
- **Every press has a sound and a reaction.** The reference plays a woosh and a hop sound
  on each press, a jump sound on take-off, and a ball sound scaled by impact speed. Here
  the hop is silent and the kick sound ignores how hard the ball was hit.
- **Goals are an event.** The reference stops for a replay (Everyplay) and a "Ready" beat;
  Soccer Random cuts to a fresh scene. Here the ball hangs in the air for a second with a
  "KICK OFF" banner and nothing else.
- **The keeper is a character.** In the reference the keeper jumps higher (495 vs 375) and
  holds its arms up; here the keeper differs only by the arms and a slightly bigger jump,
  and it starts far from its goal, so it rarely plays as a keeper.
- **A CPU you can beat but that scores.** Both games' CPUs are mostly random with a nudge
  toward the ball, like this one, but on a small pitch that is enough. Here the random
  tapper spends most of its presses travelling.
- **Phones first.** Soccer Random is a mobile game first. Here the portrait layout gives the
  pitch 40% of the screen height, and the touch pads are per player with no one-button pad
  per team, so one finger cannot drive a team the way W does on a keyboard.
- **A readable camera.** The reference camera follows the ball and zooms out when it goes
  high. Here the camera is static and the ball marker at the top is a small white triangle.

Head Soccer and Football Legends are a different sub-genre (direct movement plus a kick
button and special shots) and are not a target, but they show the other thing players
reward: agency. When a one-button game cannot deliver "I pressed and reached the ball",
players drift to those games.

## 4. Recommended order

1. Fix the mid-air jump (jump grace plus contact expiry), then retune jump power to about
   240 so a tap is 1 m and a hold about 1.8 m.
2. Fast get-up: righting torque while fallen, or a press that stands the player up.
3. Shrink the pitch or lengthen the hop so the ball is one hop away; move the keepers to the
   goal line and the strikers nearer the centre.
4. Make the modifiers visible: icy pitch tint, ball art per kind, gravity cue, kit colour
   change per round.
5. Hop, take-off and impact-scaled ball sounds; a short goal freeze with a replay of the
   last two seconds (the game runs deterministic fixed steps, so recording positions is
   cheap).
6. One-button touch pads per team and a landscape-first mobile layout.
7. Camera follow and zoom.

Items 1 to 3 are measurable with the scripts in the session scratchpad and should be
re-measured after each change: presses connecting, touch gap, fallen share, tap vs hold.

## 5. Done since this analysis

Items 1 to 7 are implemented in `web/` (see `web/README.md` for the numbers): jump grace
and contact memory, retuned jump power, righting torque plus press-to-get-up, a smaller
pitch with keepers on their line, visible modifiers (ice, moon, ball art) and kits re-rolled
every round, hop and impact-scaled sounds, a slow-motion start to every goal, a team pad per
side on touch screens, and a camera that pans on narrow screens and zooms out for high balls.
