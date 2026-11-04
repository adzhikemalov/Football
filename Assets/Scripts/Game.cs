using System.Collections;
using UnityEngine;

/// <summary>
/// Match controller. Builds the whole pitch at runtime (goals, players, ball, walls, camera)
/// so nothing depends on scene wiring, runs the ready / play / goal / game-over loop, reads
/// the keyboard, drives the optional CPU team and re-rolls a random modifier every round.
///
/// Controls (one-button mode, the default):
///   Team 1 (left)  : W
///   Team 2 (right) : Up arrow
///   T toggles two-button mode (A/D and Left/Right), C toggles a CPU for team 2, R restarts.
/// </summary>
public class Game : MonoBehaviour
{
    public static Game Instance { get; private set; }

    [Header("Prefabs (loaded from Resources/Prefabs when empty)")]
    public GameObject PlayerPrefab;
    public GameObject BallPrefab;
    public GameObject GatePrefab;

    [Header("Rules")]
    public int WinScore = 5;
    public float ReadyDelay = 1.2f;
    public float GoalDelay = 1.6f;
    [Tooltip("The reference game runs at 0.85: slightly slow motion makes the chaos readable.")]
    public float TimeScale = 0.85f;
    public Vector2 Gravity = new Vector2(0f, -20f);
    public float GroundFriction = 0.5f;

    [Header("Controls")]
    public bool TwoButtonMode = false;
    public bool Team2IsCpu = false;
    public KeyCode Team1Key = KeyCode.W;
    public KeyCode Team2Key = KeyCode.UpArrow;
    public KeyCode Team1KeeperKey = KeyCode.A;
    public KeyCode Team1PlayerKey = KeyCode.D;
    public KeyCode Team2KeeperKey = KeyCode.RightArrow;
    public KeyCode Team2PlayerKey = KeyCode.LeftArrow;
    public KeyCode ToggleTwoButtonKey = KeyCode.T;
    public KeyCode ToggleCpuKey = KeyCode.C;
    public KeyCode RestartKey = KeyCode.R;

    [Header("Layout (world units, relative to the grass)")]
    [Tooltip("Distance of the goal centre from the pitch edge.")]
    public float GoalInset = 0.9f;
    [Tooltip("How far in front of the goal the keeper stands.")]
    public float KeeperOffset = 1.0f;
    public float StrikerX = 1.6f;
    [Tooltip("Body centre above the grass at spawn.")]
    public float SpawnHeight = 1.3f;
    public float BallSpawnHeight = 3f;
    public float GateHalfHeight = 1.34f; // from the Gate prefab's frame collider

    [Header("CPU")]
    public float CpuPressChance = 0.02f;
    public float CpuNearBallPressChance = 0.25f;
    public float CpuReleaseChance = 0.4f;
    public float CpuBallRange = 2.5f;

    [Header("Round modifiers (probabilities per round after the first)")]
    public float MiniGoalsChance = 0.10f;
    public float BigGoalsChance = 0.18f;
    public float HeavyBallChance = 0.12f;
    public float BeachBallChance = 0.15f;
    public float IcyPitchChance = 0.20f;
    public float LowGravityChance = 0.08f;

    public int[] Score = new int[2];
    public Player[] Keepers = new Player[2];
    public Player[] Strikers = new Player[2];
    public Ball Ball { get; private set; }

    private enum State { Ready, Playing, Goal, GameOver }

    private State _state = State.Ready;
    private string _message = "";
    private string _modifierName = "";
    private int _round;
    private Collider2D _ground;
    private SpriteRenderer _groundSprite;
    private Color _groundColor = Color.white;
    private float _groundTop;
    private float _halfWidth;
    private PhysicsMaterial2D _groundMaterial;
    private readonly GameObject[] _gates = new GameObject[2];
    private readonly Color[] _teamColors = new Color[2];
    private float _goalScale = 1f;
    private int _ballKind;
    private bool _icy;
    private bool _lowGravity;
    private CameraFollow _cameraFollow;

    void Awake()
    {
        Instance = this;

        if (PlayerPrefab == null) PlayerPrefab = Resources.Load<GameObject>("Prefabs/Player");
        if (BallPrefab == null) BallPrefab = Resources.Load<GameObject>("Prefabs/Ball");
        if (GatePrefab == null) GatePrefab = Resources.Load<GameObject>("Prefabs/Gate");

        Time.timeScale = TimeScale;
        Time.fixedDeltaTime = 0.02f * TimeScale;
        Physics2D.gravity = Gravity;

        SetupGround();
        RemoveSceneFurniture();
        BuildWalls();
        SetupCamera();
    }

    /// <summary>
    /// Main.unity still carries a ball and two goals placed by hand. Everything is spawned at
    /// runtime now, so remove them to avoid a second ball and overlapping goal frames.
    /// </summary>
    private void RemoveSceneFurniture()
    {
        foreach (var circle in FindObjectsOfType<CircleCollider2D>())
        {
            if (circle.GetComponent<Rigidbody2D>() != null) Destroy(circle.gameObject);
        }
        var gates = GameObject.Find("Gates");
        if (gates != null) Destroy(gates);
    }

    void Start()
    {
        StartCoroutine(StartRound());
    }

    void OnDestroy()
    {
        if (Instance == this) Instance = null;
        Time.timeScale = 1f;
        Time.fixedDeltaTime = 0.02f;
    }

    // ---------------------------------------------------------------- pitch

    private void SetupGround()
    {
        var field = FindObjectOfType<FieldManager>();
        if (field != null && field.Ground != null) _ground = field.Ground;
        if (_ground == null)
        {
            var grass = GameObject.FindWithTag("Grass");
            if (grass != null) _ground = grass.GetComponent<Collider2D>();
        }
        if (_ground == null)
        {
            var grass = new GameObject("Grass");
            grass.tag = "Grass";
            grass.transform.position = new Vector3(0f, -0.67f, 0f);
            var box = grass.AddComponent<BoxCollider2D>();
            box.size = new Vector2(11.6f, 1.5f);
            _ground = box;
        }

        _groundMaterial = new PhysicsMaterial2D("GroundRuntime");
        _groundMaterial.friction = GroundFriction;
        _groundMaterial.bounciness = 0f;
        _ground.sharedMaterial = _groundMaterial;

        _groundSprite = _ground.GetComponent<SpriteRenderer>();
        if (_groundSprite != null) _groundColor = _groundSprite.color;

        Bounds bounds = _ground.bounds;
        _groundTop = bounds.max.y;
        _halfWidth = bounds.extents.x;
    }

    private void BuildWalls()
    {
        CreateWall("WallLeft", new Vector2(-_halfWidth - 0.5f, _groundTop + 20f), new Vector2(1f, 60f));
        CreateWall("WallRight", new Vector2(_halfWidth + 0.5f, _groundTop + 20f), new Vector2(1f, 60f));
    }

    private void CreateWall(string name, Vector2 position, Vector2 size)
    {
        var wall = new GameObject(name);
        wall.transform.parent = transform;
        wall.transform.position = position;
        var box = wall.AddComponent<BoxCollider2D>();
        box.size = size;
        box.sharedMaterial = _groundMaterial;
    }

    private void SetupCamera()
    {
        var camera = Camera.main;
        if (camera == null) return;
        _cameraFollow = camera.GetComponent<CameraFollow>();
        if (_cameraFollow == null) _cameraFollow = camera.gameObject.AddComponent<CameraFollow>();
        _cameraFollow.BaseY = _groundTop + 3.4f;
        _cameraFollow.BaseSize = 5f;
        camera.transform.position = new Vector3(0f, _cameraFollow.BaseY, camera.transform.position.z);
        camera.orthographicSize = _cameraFollow.BaseSize;
    }

    // ---------------------------------------------------------------- rounds

    private IEnumerator StartRound()
    {
        ClearField();
        PickModifiers();
        ApplyEnvironmentModifiers();
        PickTeamColors();

        for (int team = 0; team < 2; team++)
        {
            _gates[team] = SpawnGate(team);
            Keepers[team] = SpawnPlayer(team, true);
            Strikers[team] = SpawnPlayer(team, false);
        }

        Ball = SpawnBall();
        Ball.Freeze(true);
        if (_cameraFollow != null) _cameraFollow.Target = Ball.transform;

        _state = State.Ready;
        _message = "READY";
        yield return new WaitForSeconds(ReadyDelay);

        Ball.Freeze(false);
        _message = "";
        _state = State.Playing;
    }

    private void ClearField()
    {
        for (int team = 0; team < 2; team++)
        {
            DestroyPlayer(Keepers[team]);
            DestroyPlayer(Strikers[team]);
            Keepers[team] = null;
            Strikers[team] = null;
            if (_gates[team] != null) Destroy(_gates[team]);
            _gates[team] = null;
        }
        if (Ball != null) Destroy(Ball.gameObject);
        Ball = null;
    }

    private static void DestroyPlayer(Player player)
    {
        if (player != null) Destroy(player.gameObject);
    }

    private void PickModifiers()
    {
        _goalScale = 1f;
        _ballKind = 0;
        _icy = false;
        _lowGravity = false;
        _modifierName = "";
        if (_round == 0) return;

        var names = new System.Collections.Generic.List<string>();

        float roll = Random.value;
        if (roll < MiniGoalsChance) { _goalScale = 0.6f; names.Add("Mini goals"); }
        else if (roll < MiniGoalsChance + BigGoalsChance) { _goalScale = 1.5f; names.Add("Big goals"); }

        roll = Random.value;
        if (roll < HeavyBallChance) { _ballKind = 1; names.Add("Heavy ball"); }
        else if (roll < HeavyBallChance + BeachBallChance) { _ballKind = 2; names.Add("Beach ball"); }

        if (Random.value < IcyPitchChance) { _icy = true; names.Add("Icy pitch"); }
        if (Random.value < LowGravityChance) { _lowGravity = true; names.Add("Low gravity"); }

        _modifierName = string.Join(" + ", names.ToArray());
    }

    private void ApplyEnvironmentModifiers()
    {
        // A fresh material each round: editing an assigned material does not always rebuild the fixture.
        _groundMaterial = new PhysicsMaterial2D("GroundRuntime");
        _groundMaterial.friction = _icy ? 0.02f : GroundFriction;
        _groundMaterial.bounciness = 0f;
        _ground.sharedMaterial = _groundMaterial;
        foreach (Transform child in transform)
        {
            var wall = child.GetComponent<BoxCollider2D>();
            if (wall != null) wall.sharedMaterial = _groundMaterial;
        }
        if (_groundSprite != null) _groundSprite.color = _icy ? new Color(0.75f, 0.9f, 1f) : _groundColor;
        Physics2D.gravity = _lowGravity ? Gravity * 0.55f : Gravity;
    }

    private void PickTeamColors()
    {
        _teamColors[0] = Color.HSVToRGB(Random.Range(0.55f, 0.68f), 0.75f, 1f);
        _teamColors[1] = Color.HSVToRGB(Random.Range(0.96f, 1f), 0.8f, 1f);
    }

    private GameObject SpawnGate(int team)
    {
        float sign = team == 0 ? -1f : 1f;
        float halfHeight = GateHalfHeight * _goalScale;

        var gate = Instantiate(GatePrefab);
        gate.name = team == 0 ? "GateLeft" : "GateRight";
        // The prefab is modelled as the left goal (net on the left, mouth facing right); mirror it for the right side.
        gate.transform.localScale = new Vector3(-sign * _goalScale, _goalScale, 1f);
        gate.transform.position = new Vector3(sign * (_halfWidth - GoalInset * _goalScale), _groundTop + halfHeight, 1f);

        bool hasTrigger = false;
        foreach (var collider in gate.GetComponentsInChildren<Collider2D>())
        {
            if (!collider.isTrigger) continue;
            collider.gameObject.AddComponent<GoalTrigger>().DefendingTeam = team;
            hasTrigger = true;
        }
        if (!hasTrigger)
        {
            var trigger = new GameObject("Trigger");
            trigger.transform.parent = gate.transform;
            trigger.transform.localPosition = new Vector3(-0.1f, 0f, 0f);
            trigger.transform.localScale = Vector3.one;
            var box = trigger.AddComponent<BoxCollider2D>();
            box.isTrigger = true;
            box.size = new Vector2(0.9f, GateHalfHeight * 1.9f);
            trigger.AddComponent<GoalTrigger>().DefendingTeam = team;
        }
        return gate;
    }

    private Player SpawnPlayer(int team, bool keeper)
    {
        float sign = team == 0 ? -1f : 1f;
        float x = keeper
            ? sign * (_halfWidth - GoalInset * _goalScale - KeeperOffset)
            : sign * StrikerX;

        var go = Instantiate(PlayerPrefab);
        go.name = (team == 0 ? "Team1 " : "Team2 ") + (keeper ? "Keeper" : "Striker");
        go.transform.position = new Vector3(x, _groundTop + SpawnHeight, 0f);
        go.transform.rotation = Quaternion.identity;

        var player = go.GetComponent<Player>();
        player.Flip = team == 1;
        player.Goalkeper = keeper;
        player.Team = team;
        player.Id = team * 2 + (keeper ? 0 : 1);
        player.SetColor(_teamColors[team]);
        return player;
    }

    private Ball SpawnBall()
    {
        var go = Instantiate(BallPrefab);
        go.name = "Ball";
        go.transform.position = BallSpawnPosition();
        go.transform.rotation = Quaternion.identity;

        var ball = go.GetComponent<Ball>();
        if (ball == null) ball = go.AddComponent<Ball>();

        switch (_ballKind)
        {
            case 1: // heavy
                ball.SetMass(ball.Mass * 3f);
                ball.SetBounciness(0.2f);
                go.transform.localScale = Vector3.one * 1.15f;
                break;
            case 2: // beach
                ball.SetMass(ball.Mass * 0.3f);
                ball.SetBounciness(0.8f);
                ball.AlwaysMoveSqrSpeed = 0.8f;
                ball.NudgeSpeed = 0.17f;
                go.GetComponent<Rigidbody2D>().gravityScale = 0.6f;
                go.transform.localScale = Vector3.one * 1.4f;
                break;
        }
        return ball;
    }

    private Vector3 BallSpawnPosition()
    {
        return new Vector3(0f, _groundTop + BallSpawnHeight, 0f);
    }

    // ---------------------------------------------------------------- scoring

    public void OnGoal(int scoringTeam, Ball ball)
    {
        if (_state != State.Playing) return;
        Score[scoringTeam]++;
        _state = State.Goal;
        _message = "GOAL!";
        StartCoroutine(AfterGoal());
    }

    private IEnumerator AfterGoal()
    {
        yield return new WaitForSeconds(GoalDelay);

        int winner = -1;
        if (Score[0] >= WinScore) winner = 0;
        else if (Score[1] >= WinScore) winner = 1;

        if (winner >= 0)
        {
            _state = State.GameOver;
            _message = (winner == 0 ? "TEAM 1" : "TEAM 2") + " WINS\npress " + RestartKey + " for a rematch";
            yield break;
        }

        _round++;
        yield return StartCoroutine(StartRound());
    }

    private void ResetMatch()
    {
        StopAllCoroutines();
        Score[0] = 0;
        Score[1] = 0;
        _round = 0;
        StartCoroutine(StartRound());
    }

    // ---------------------------------------------------------------- input

    void Update()
    {
        if (Input.GetKeyDown(ToggleTwoButtonKey)) TwoButtonMode = !TwoButtonMode;
        if (Input.GetKeyDown(ToggleCpuKey)) Team2IsCpu = !Team2IsCpu;
        if (Input.GetKeyDown(RestartKey)) { ResetMatch(); return; }

        if (TwoButtonMode)
        {
            Drive(Keepers[0], Team1KeeperKey);
            Drive(Strikers[0], Team1PlayerKey);
        }
        else
        {
            Drive(Keepers[0], Team1Key);
            Drive(Strikers[0], Team1Key);
        }

        if (!Team2IsCpu)
        {
            if (TwoButtonMode)
            {
                Drive(Keepers[1], Team2KeeperKey);
                Drive(Strikers[1], Team2PlayerKey);
            }
            else
            {
                Drive(Keepers[1], Team2Key);
                Drive(Strikers[1], Team2Key);
            }
        }

        KeepBallInPlay();
    }

    private static void Drive(Player player, KeyCode key)
    {
        if (player == null) return;
        if (Input.GetKey(key)) player.Press();
        else player.Release();
    }

    private void KeepBallInPlay()
    {
        if (Ball == null || _state != State.Playing) return;
        Vector3 position = Ball.transform.position;
        if (position.y < _groundTop - 4f || Mathf.Abs(position.x) > _halfWidth + 4f)
        {
            Ball.ResetTo(BallSpawnPosition());
        }
    }

    void FixedUpdate()
    {
        if (!Team2IsCpu || _state != State.Playing || Ball == null) return;
        DriveCpu(Keepers[1]);
        DriveCpu(Strikers[1]);
    }

    /// <summary>Random-timing CPU, like the reference: mostly random presses, more eager near the ball.</summary>
    private void DriveCpu(Player player)
    {
        if (player == null) return;
        if (player.IsPressed)
        {
            if (Random.value < CpuReleaseChance) player.Release();
            return;
        }
        bool nearBall = Vector2.Distance(player.transform.position, Ball.transform.position) < CpuBallRange;
        float chance = nearBall ? CpuNearBallPressChance : CpuPressChance;
        if (Random.value < chance) player.Press();
    }

    // ---------------------------------------------------------------- UI

    void OnGUI()
    {
        var big = new GUIStyle(GUI.skin.label);
        big.alignment = TextAnchor.MiddleCenter;
        big.fontStyle = FontStyle.Bold;
        big.normal.textColor = Color.white;

        big.fontSize = 48;
        GUI.Label(new Rect(0f, 8f, Screen.width, 60f), Score[0] + " : " + Score[1], big);

        if (!string.IsNullOrEmpty(_modifierName))
        {
            big.fontSize = 22;
            GUI.Label(new Rect(0f, 66f, Screen.width, 32f), _modifierName, big);
        }

        if (!string.IsNullOrEmpty(_message))
        {
            big.fontSize = 56;
            GUI.Label(new Rect(0f, Screen.height * 0.28f, Screen.width, 140f), _message, big);
        }

        var hint = new GUIStyle(GUI.skin.label);
        hint.alignment = TextAnchor.LowerCenter;
        hint.fontSize = 15;
        hint.normal.textColor = new Color(1f, 1f, 1f, 0.85f);
        string controls = TwoButtonMode
            ? "Team 1: " + Team1KeeperKey + " (keeper) " + Team1PlayerKey + " (striker)   Team 2: " + Team2KeeperKey + " (keeper) " + Team2PlayerKey + " (striker)"
            : "Team 1: " + Team1Key + "   Team 2: " + Team2Key;
        string toggles = "   |   " + ToggleTwoButtonKey + ": two-button mode (" + (TwoButtonMode ? "on" : "off") + ")"
                         + "   " + ToggleCpuKey + ": CPU team 2 (" + (Team2IsCpu ? "on" : "off") + ")"
                         + "   " + RestartKey + ": restart";
        GUI.Label(new Rect(0f, Screen.height - 34f, Screen.width, 28f), controls + toggles, hint);
    }
}

/// <summary>
/// Main.unity has no Game component (the old one was never added to the scene), so create one
/// after the scene loads. If the scene gains a Game component later this does nothing.
/// </summary>
public static class GameBootstrap
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void EnsureGame()
    {
        if (Object.FindObjectOfType<Game>() != null) return;
        new GameObject("Game (runtime)").AddComponent<Game>();
    }
}
