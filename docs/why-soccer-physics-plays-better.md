# Why Soccer Physics (and its clones) play better than this project

Source of truth for the reference: `decompiled/Assembly-CSharp.dll` in this repo is the
real Soccer Physics build (Otto Ojala, 2D Toolkit). Its `Player`, `Ball`, `BallCol`,
`Grounder`, `Game` and `InputReceiver` classes were disassembled to IL and the numbers
below come straight from that code. This project's numbers come from
`Assets/Prefabs/Player.prefab`, `Assets/Prefabs/Ball.prefab`, the physics materials and
`ProjectSettings`.

## 1. The reference input model (what one button press actually does)

Press (`Player.pressKey`):
- Kick leg hinge motor: `800 * inverter` deg/s. Back leg: `-300 * inverter` (swings the
  other way, counter-balances). Both arm motors switched ON at `-400 * inverter`.
- Jump, only if `grounded && released && !jumped && jumpLimiter <= 0`:
  - Force = `((torso.up * 1.3 + Vector3.up * 1.2) / 2) * power * 0.75 / fixedDeltaTime`
  - `power` = 495 for the goalkeeper, 375 for the field player
  - Torque = `-5 / fixedDeltaTime` for P1, `+5` for P2  -> this is the forward flip
    that moves the player toward the ball. There is no other horizontal movement.
  - `jumpLimiter = 10` physics ticks, `released = false`, `jump2delay = 3`
- Sounds: woosh + hop on every press, jump sound when a jump fires.

While airborne (`jumpMore`, from `FixedUpdate`): after 3 ticks apply the remaining
`power * 0.25` once. The jump is a 75% + 25% two-stage impulse, which reads as a
"spring" rather than a bang.

Release (`releaseKey`): kick leg motor `-400 * inverter` (returns at half speed),
back leg `+300`, arm motors OFF (arms go limp). `released = true`, `jumped = false`.
You cannot jump again until you release: no spam, every hop is a decision.

Body (`Start` / `FixedUpdate`):
- grounded and not jumping: mass 45, centre of mass y = -1.6 (very bottom-heavy, the
  player rights itself after a tumble)
- airborne: mass 30, centre of mass y = -0.2 (can flip)
- Start gives the torso a random angular velocity of +-(2..3) so matches are never
  symmetric.
- `Grounder`: `OnCollisionStay2D` with anything NOT tagged Ball sets `grounded`.
  Players can jump off the opponent, the keeper, the goal frame.

Ball (`Ball`, `BallCol`):
- `alwaysMove`: if `velocity.sqrMagnitude < 0.5` and no player is touching it, add
  `0.1 * velocity.normalized` every tick. The ball never stops; no dead stalemates.
- Material swap: `noBounceMat` while touching a player, `normalMat` on ground.
  Kicks push the ball instead of pinging it off the shin.
- Ground material: friction 0.5, bounciness 0.
- Impact sound volume scaled by `velocity.sqrMagnitude`; sprite spins with `velocity.x`.
- Kinematic until a spawn coroutine releases it; "Ready" indicator.

Global (`Game.Start`): `Time.timeScale = 0.85`, `fixedDeltaTime = 0.85 * 0.02`,
`Physics2D.gravity = (0, -20)`. After every goal the next round is re-rolled:
Splits 13%, rainy/icy ground 20%, mini goals 10%, big goals 18%, American or beach ball
~27%, headless 8%, random outfits. First to 5. One button drives player + keeper
together (`InputReceiver.p` and `.g`); two-button mode is optional. Simple random AI
(2% chance per tick to press, random release, plus a ball-proximity trigger).
Camera follows the ball, shadows under players, off-screen ball indicator, replays.

## 2. This project, measured against that

| Area | Soccer Physics | This project |
|---|---|---|
| Jump | 75%+25% impulse along blended up vector, flip torque +-5 | `Jump` flag is never set to true: `Player.FixedUpdate` jump code is dead. Players never leave the ground and have no way to move |
| Kick | 800 deg/s forward, 400 back on release, arms flail | 700 deg/s both ways; passive leg locked 0..0 so its motor does nothing; arms never move |
| Jump gating | grounded && released && 10-tick limiter | none (and no jump) |
| Grounded | any contact except Ball | leg box vs tag "Grass" only, flickers on enter/exit |
| Centre of mass | -1.6 grounded, -0.2 in air | -1.4 only when exactly one leg touches grass; with both feet down it is +0.1, so a standing player is top-heavy |
| Body mass | 45 ground / 30 air | 20 constant |
| Velocity cap | none | `MaxVelocity (8,8)` clamps the torso every tick |
| Ground material | friction 0.5, bounce 0 | friction 1.75, bounce 0.5 (feet bounce on landing) |
| Leg material | n/a | ActiveLeg friction 100, Leg friction 0.5 |
| Ball vs player | no-bounce material while touching | bounce 0.5 always, auto-mass 0.28 kg vs 2 kg legs |
| Ball at rest | never (alwaysMove) | stops, can sit in a corner forever |
| Time scale | 0.85 | 1.0 |
| Goals / score / reset | yes, first to 5, spawn coroutine | `GatesTrigger.cs` is an empty `FieldManager`; no goal, no score, no reset. `Game.Restart` destroys the `Player` components, not the GameObjects |
| Controls | 1 key per team (player+keeper) | 4 keys, one per character |
| Round variety | 6 random modifiers + outfits | none |
| Feedback | hop/woosh/jump/ball sounds, camera follow, shadows, ball indicator | none |
| AI / single player | yes | no |
| Networking | none | half-built UNET server sending JSON every frame; build log shows port bind and spawn failures |
| Flip player legs | n/a | `Leg.Start` and `Player.Start` race; Flip active limits are min 90 / max 0 (inverted) |

## 3. What other current games in the genre confirm

Soccer Random (RHM Interactive, 2020) and 2 Player Soccer use the same recipe: one
button that jumps and kicks, instant restart after a goal, a new scene or characters
after every goal, first to 5, local 2-player plus CPU. None of them ship online play.
The genre's fun is "readable chaos": every press produces a big, legible, slightly
unpredictable action, and a round ends within seconds.

## 4. Recommended order of work

1. Close the loop: goal triggers, score, ball and player reset, first-to-5.
2. Port the reference press/release model with the numbers above; delete the velocity
   clamp; one key per team.
3. Fix body physics: mass 45/30, COM -1.6/-0.2 keyed on grounded/jumped, grounded =
   any non-ball contact with a release requirement and 10-tick limiter.
4. Fix materials: ground bounce 0, leg friction sane, ball no-bounce on player contact,
   alwaysMove nudge.
5. timeScale 0.85, random starting wobble, random modifiers per round.
6. Sounds, camera follow, shadows, simple random AI.
7. Only then revisit networking (physics games need lockstep or server-authoritative
   simulation with interpolation; per-frame JSON state will always feel laggy).

## 5. What has been implemented since this analysis

Steps 1 to 6 of the list above are in the code now (see `README.md`): goal triggers, score
and first-to-5 with reset; the press/release jump-and-kick model with the reference numbers;
mass and centre-of-mass switching; any-contact grounding with release requirement and
10-tick limiter; ground bounce 0 and sane leg friction (assigned at runtime, the binary
material assets are untouched); ball no-bounce on player contact and the always-move nudge;
time scale 0.85; random starting wobble; random round modifiers; one key per team with an
optional two-button mode; camera follow; a random CPU for team 2. Networking is left as is
and disabled by default.

Not yet verified in the Unity editor (this was written without one): the kick direction sign
of the mirrored right-hand team, and the absolute jump height and flip torque, which depend on
this project's body size. Both are single inspector fields on `Player` and `Leg`.
