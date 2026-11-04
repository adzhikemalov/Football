using UnityEngine;

/// <summary>
/// A physics ragdoll footballer driven by a single button.
///
/// Press: the kicking leg swings forward, the arms flail, and if the player is standing on
/// something (and released the button since the last hop) it jumps along a blend of its own
/// up vector and world up, with a flip torque toward the opponent's goal. That torque is the
/// only horizontal movement there is, exactly like the reference game.
///
/// The jump impulse is split: 75% at once, the remaining 25% three physics ticks later while
/// the button is still held. A quick tap therefore gives a short hop and a hold a full jump.
///
/// Release: the leg returns at half speed, the arms go limp, and the next jump is re-armed.
///
/// The body is bottom-heavy while standing (mass 45, low centre of mass) so it rights itself,
/// and lighter with a higher centre of mass in the air so it can flip.
/// </summary>
public class Player : MonoBehaviour
{
    [Header("Jump")]
    [Tooltip("Impulse for a field player. Applied as a force over one physics tick, so it is independent of the time step.")]
    public float JumpPowerPlayer = 375f;
    [Tooltip("Goalkeepers jump higher than field players in the reference game.")]
    public float JumpPowerKeeper = 495f;
    [Range(0f, 1f)] public float FirstImpulseShare = 0.75f;
    public int SecondImpulseDelayTicks = 3;
    [Tooltip("Physics ticks that must pass before the next jump.")]
    public int JumpLimiterTicks = 10;
    [Tooltip("Flip torque toward the opponent. This is what moves the player across the pitch.")]
    public float JumpTorque = 5f;

    [Header("Body")]
    public float GroundedMass = 45f;
    public float AirborneMass = 30f;
    public Vector2 GroundedCenterOfMass = new Vector2(0f, -1.4f);
    public Vector2 AirborneCenterOfMass = new Vector2(0f, -0.2f);
    [Tooltip("Random angular velocity at spawn so matches never start symmetric.")]
    public float StartWobble = 25f;
    public float LegFriction = 1f;

    [Header("Arms")]
    public float ArmSpeed = 400f;
    public float ArmTorque = 5f;

    [Header("Legs")]
    public GameObject ActiveLeg;
    public GameObject InatciveLeg; // misspelled on purpose: this is the serialized prefab reference

    [Header("Hands")]
    public GameObject LeftHand;
    public GameObject RightHand;

    [Header("Identity (set by Game)")]
    public bool Flip;
    public bool Goalkeper;
    public int Team;
    public int Id;

    public bool IsPressed { get; private set; }
    public bool Grounded { get; private set; }

    private Rigidbody2D _rigidbody;
    private Leg _kickLeg;
    private Leg _backLeg;
    private HingeJoint2D _leftArm;
    private HingeJoint2D _rightArm;
    private bool _contactThisTick;
    private bool _released = true;
    private bool _jumped;
    private bool _secondImpulseDone;
    private int _secondImpulseDelay;
    private int _jumpLimiter;

    void Awake()
    {
        _rigidbody = GetComponent<Rigidbody2D>();
    }

    void Start()
    {
        _rigidbody.useAutoMass = false;
        _airborne = true;
        SetAirborne(false);

        if (ActiveLeg != null && InatciveLeg != null)
        {
            var legA = ActiveLeg.GetComponent<Leg>();
            var legB = InatciveLeg.GetComponent<Leg>();
            Physics2D.IgnoreCollision(ActiveLeg.GetComponent<Collider2D>(), InatciveLeg.GetComponent<Collider2D>());

            // The mirrored (right) team kicks with the other leg so the kick faces the opponent's goal.
            _kickLeg = Flip ? legB : legA;
            _backLeg = Flip ? legA : legB;
            _kickLeg.Configure(this, true, Flip);
            _backLeg.Configure(this, false, Flip);

            var legMaterial = new PhysicsMaterial2D("LegRuntime");
            legMaterial.friction = LegFriction;
            legMaterial.bounciness = 0f;
            ActiveLeg.GetComponent<Collider2D>().sharedMaterial = legMaterial;
            InatciveLeg.GetComponent<Collider2D>().sharedMaterial = legMaterial;
        }

        if (LeftHand != null && RightHand != null)
        {
            _leftArm = LeftHand.GetComponent<HingeJoint2D>();
            _rightArm = RightHand.GetComponent<HingeJoint2D>();
            IgnoreHandCollisions(LeftHand);
            IgnoreHandCollisions(RightHand);

            if (Goalkeper)
            {
                // Keepers hold their arms up rigidly.
                if (_leftArm != null) _leftArm.enabled = false;
                if (_rightArm != null) _rightArm.enabled = false;
                var leftFixed = LeftHand.GetComponent<FixedJoint2D>();
                var rightFixed = RightHand.GetComponent<FixedJoint2D>();
                if (leftFixed != null) leftFixed.enabled = true;
                if (rightFixed != null) rightFixed.enabled = true;
            }
            else
            {
                SetArmMotors(false);
            }
        }

        float wobble = Random.Range(StartWobble * 0.8f, StartWobble * 1.2f);
        _rigidbody.angularVelocity = Random.value < 0.5f ? wobble : -wobble;
    }

    private void IgnoreHandCollisions(GameObject hand)
    {
        var handCollider = hand.GetComponent<Collider2D>();
        if (handCollider == null) return;
        var bodyCollider = GetComponent<Collider2D>();
        if (bodyCollider != null) Physics2D.IgnoreCollision(handCollider, bodyCollider);
        if (ActiveLeg != null) Physics2D.IgnoreCollision(handCollider, ActiveLeg.GetComponent<Collider2D>());
        if (InatciveLeg != null) Physics2D.IgnoreCollision(handCollider, InatciveLeg.GetComponent<Collider2D>());
    }

    /// <summary>Button down. Safe to call every frame while the button is held.</summary>
    public void Press()
    {
        if (IsPressed) return;
        IsPressed = true;

        if (_kickLeg != null) _kickLeg.Kick();
        if (_backLeg != null) _backLeg.Kick();
        SetArmMotors(true);

        if (!_jumped && Grounded && _released && _jumpLimiter <= 0)
        {
            StartJump();
        }
    }

    /// <summary>Button up. Safe to call every frame while the button is not held.</summary>
    public void Release()
    {
        if (!IsPressed) return;
        IsPressed = false;

        _jumped = false;
        _released = true;

        if (_kickLeg != null) _kickLeg.Relax();
        if (_backLeg != null) _backLeg.Relax();
        SetArmMotors(false);
    }

    private void StartJump()
    {
        // Switch to the airborne mass first so the impulse and the flip torque act on the lighter body.
        SetAirborne(true);
        ApplyJumpImpulse(FirstImpulseShare);
        _rigidbody.AddTorque((Flip ? JumpTorque : -JumpTorque) / Time.fixedDeltaTime);

        Grounded = false;
        _jumped = true;
        _secondImpulseDone = false;
        _secondImpulseDelay = SecondImpulseDelayTicks;
        _jumpLimiter = JumpLimiterTicks;
        _released = false;
    }

    private bool _airborne;

    private void SetAirborne(bool airborne)
    {
        if (_airborne == airborne) return;
        _airborne = airborne;
        _rigidbody.centerOfMass = airborne ? AirborneCenterOfMass : GroundedCenterOfMass;
        _rigidbody.mass = airborne ? AirborneMass : GroundedMass;
    }

    private void ApplyJumpImpulse(float share)
    {
        float power = Goalkeper ? JumpPowerKeeper : JumpPowerPlayer;
        Vector2 direction = ((Vector2)transform.up * 1.3f + Vector2.up * 1.2f) * 0.5f;
        _rigidbody.AddForce(direction * (power * share / Time.fixedDeltaTime));
    }

    private void JumpMore()
    {
        if (_secondImpulseDone) return;
        if (_secondImpulseDelay > 0)
        {
            _secondImpulseDelay--;
            return;
        }
        ApplyJumpImpulse(1f - FirstImpulseShare);
        _secondImpulseDone = true;
    }

    private void SetArmMotors(bool on)
    {
        if (Goalkeper || _leftArm == null || _rightArm == null) return;
        _leftArm.useMotor = on;
        _rightArm.useMotor = on;
        if (!on) return;
        var motor = new JointMotor2D();
        motor.motorSpeed = Flip ? -ArmSpeed : ArmSpeed;
        motor.maxMotorTorque = ArmTorque;
        _leftArm.motor = motor;
        _rightArm.motor = motor;
    }

    /// <summary>
    /// Called by the body and the legs for every contact. Anything except the ball counts as
    /// ground, so players can jump off each other, the keeper and the goal frame.
    /// </summary>
    public void ReportContact(Collision2D collision)
    {
        if (collision.collider.GetComponentInParent<Ball>() != null) return;
        _contactThisTick = true;
    }

    void OnCollisionStay2D(Collision2D collision)
    {
        ReportContact(collision);
    }

    void FixedUpdate()
    {
        // Contacts are reported after the previous physics step, so this is "was touching something last step".
        bool wasGrounded = Grounded;
        Grounded = _contactThisTick;
        _contactThisTick = false;

        if (_jumped)
        {
            if (!Grounded) JumpMore();
            else if (!wasGrounded && _secondImpulseDelay <= 0) _jumped = false; // landed again: the hop is over
        }

        // Bottom-heavy while touching something, lighter with a higher centre of mass in the air.
        SetAirborne(!Grounded);

        if (_jumpLimiter > 0) _jumpLimiter--;
    }

    /// <summary>Tints the body sprite with the team colour.</summary>
    public void SetColor(Color color)
    {
        var body = transform.Find("BodySprite");
        if (body == null) return;
        var renderer = body.GetComponent<SpriteRenderer>();
        if (renderer != null) renderer.color = color;
    }

    public void ResetMotion()
    {
        if (_rigidbody == null) return;
        _rigidbody.velocity = Vector2.zero;
        _rigidbody.angularVelocity = 0f;
    }

    // Used by the network server to broadcast the pose.
    public string Serialize()
    {
        var col = GetComponent<BoxCollider2D>();
        var actLegCol = ActiveLeg.GetComponent<BoxCollider2D>();
        var pasLegCol = InatciveLeg.GetComponent<BoxCollider2D>();
        PlayerWrapper pw = new PlayerWrapper
        {
            PlayerPosition = new Vector3(col.transform.position.x, col.transform.position.y),
            PlayerRotation = col.transform.eulerAngles.z,
            PlayerActiveLegPosition = new Vector3(actLegCol.transform.position.x, actLegCol.transform.position.y),
            PlayerActiveLegRotation = actLegCol.transform.eulerAngles.z,
            PlayerPassiveLegPosition = new Vector3(pasLegCol.transform.position.x, pasLegCol.transform.position.y),
            PlayerPassiveLegRotation = pasLegCol.transform.eulerAngles.z,
            PlayerId = Id
        };
        return JsonUtility.ToJson(pw);
    }

    public class PlayerWrapper
    {
        public Vector3 PlayerPosition, PlayerActiveLegPosition, PlayerPassiveLegPosition;
        public float PlayerRotation, PlayerActiveLegRotation, PlayerPassiveLegRotation;
        public Vector3 GoalKeeperPosition, GoalKeeperActiveLegPosition, GoalKeeperPassiveLegPosition;
        public float GoalKeeperRotation, GoalKeeperActiveLegRotation, GoalKeeperPassiveLegRotation;
        public int PlayerId;
    }
}
