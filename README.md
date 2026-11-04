# Football

A two-player, one-button physics football game in the spirit of Soccer Physics, built with
Unity 5.5 (2D physics).

## Play

Open `Assets/Scenes/Main.unity` and press Play. The match controller builds the pitch, goals,
players and ball at runtime, so no scene wiring is required.

| Key | Action |
|---|---|
| W | Team 1 (left): jump + kick for both the striker and the keeper |
| Up arrow | Team 2 (right): same |
| T | Toggle two-button mode (Team 1: A keeper / D striker, Team 2: Right keeper / Left striker) |
| C | Toggle a CPU opponent for team 2 |
| R | Restart the match |

First to 5 goals wins. After every goal the next round may get a random modifier: mini or
big goals, a heavy or beach ball, an icy pitch, low gravity.

## How a press works

Hold the button: the kicking leg swings forward, the arms flail, and if the player is
standing on anything (ground, the other player, the goal frame) it jumps along a blend of its
own up vector and world up, with a flip torque toward the opponent's goal. That torque is the
only horizontal movement. The jump impulse is 75% immediately and 25% three physics ticks
later, so a tap gives a short hop and a hold a full jump. Release relaxes the leg and arms and
re-arms the next jump; a 10-tick limiter prevents bunny hopping.

The body is 45 kg with a very low centre of mass while standing (it rights itself) and 30 kg
with a higher centre of mass in the air (it can flip). The ball never fully stops and uses a
no-bounce material while a player touches it. Time scale is 0.85.

All numbers are public fields on `Player`, `Leg`, `Ball`, `Game` and `CameraFollow`, tunable
in the inspector. The values come from the reference game and have not yet been tuned in this
project's scale; see `docs/why-soccer-physics-plays-better.md` for where each one came from.

## Layout

- `Assets/Scripts/Game.cs`: match loop, input, CPU, round modifiers, UI, bootstrap.
- `Assets/Scripts/Player.cs`, `Leg.cs`: the ragdoll and its one-button behaviour.
- `Assets/Scripts/Ball.cs`, `GoalTrigger.cs`, `CameraFollow.cs`.
- `Assets/Resources/Prefabs`: Player, Ball and Gate prefabs, loaded by name at runtime.
- `Assets/Scripts/Network/Server.cs`: experimental server, off by default (`StartOnAwake`).
