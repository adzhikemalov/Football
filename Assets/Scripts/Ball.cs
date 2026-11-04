using UnityEngine;

/// <summary>
/// Match ball. Two tricks from the reference game live here:
/// 1. The ball never settles: below a small speed it gets a constant nudge, so there are no
///    dead stalemates in a corner.
/// 2. While a player touches it the collider uses a no-bounce material, so kicks push the ball
///    instead of pinging it off the shin. Touching the ground restores the normal material.
/// </summary>
[RequireComponent(typeof(Rigidbody2D))]
public class Ball : MonoBehaviour
{
    [Header("Never let the ball stop")]
    [Tooltip("Squared speed below which the ball gets nudged.")]
    public float AlwaysMoveSqrSpeed = 0.5f;
    public float NudgeSpeed = 0.1f;

    [Header("Mass")]
    public float Mass = 0.3f;

    public int LastTouchTeam = -1;
    public bool Grounded { get; private set; }

    private Rigidbody2D _rigidbody;
    private Collider2D _collider;
    private PhysicsMaterial2D _normalMaterial;
    private PhysicsMaterial2D _noBounceMaterial;
    private int _playerContacts;

    void Awake()
    {
        _rigidbody = GetComponent<Rigidbody2D>();
        _collider = GetComponent<Collider2D>();
        _rigidbody.useAutoMass = false;
        _rigidbody.mass = Mass;

        // Runtime copies so tuning never writes into the shared asset.
        var source = _collider.sharedMaterial;
        _normalMaterial = new PhysicsMaterial2D("BallRuntime");
        _normalMaterial.friction = source != null ? source.friction : 0.15f;
        _normalMaterial.bounciness = source != null ? source.bounciness : 0.5f;
        _noBounceMaterial = new PhysicsMaterial2D("BallNoBounce");
        _noBounceMaterial.friction = _normalMaterial.friction;
        _noBounceMaterial.bounciness = 0f;
        _collider.sharedMaterial = _normalMaterial;
    }

    public void SetBounciness(float bounciness)
    {
        var material = new PhysicsMaterial2D("BallRuntime");
        material.friction = _normalMaterial.friction;
        material.bounciness = bounciness;
        _normalMaterial = material;
        if (_playerContacts == 0) _collider.sharedMaterial = _normalMaterial;
    }

    public void SetMass(float mass)
    {
        Mass = mass;
        _rigidbody.mass = mass;
    }

    public void Freeze(bool frozen)
    {
        _rigidbody.isKinematic = frozen;
        if (frozen)
        {
            _rigidbody.velocity = Vector2.zero;
            _rigidbody.angularVelocity = 0f;
        }
    }

    public void ResetTo(Vector3 position)
    {
        transform.position = position;
        transform.rotation = Quaternion.identity;
        _rigidbody.velocity = Vector2.zero;
        _rigidbody.angularVelocity = 0f;
        _playerContacts = 0;
        _collider.sharedMaterial = _normalMaterial;
        LastTouchTeam = -1;
    }

    void FixedUpdate()
    {
        if (_rigidbody.isKinematic || _playerContacts > 0) return;

        Vector2 velocity = _rigidbody.velocity;
        if (velocity.sqrMagnitude >= AlwaysMoveSqrSpeed) return;

        Vector2 direction = velocity.sqrMagnitude > 0.0001f
            ? velocity.normalized
            : new Vector2(Random.value < 0.5f ? -1f : 1f, 0f);
        _rigidbody.velocity = velocity + direction * NudgeSpeed;
    }

    void OnCollisionEnter2D(Collision2D collision)
    {
        var player = collision.collider.GetComponentInParent<Player>();
        if (player != null)
        {
            _playerContacts++;
            LastTouchTeam = player.Team;
            _collider.sharedMaterial = _noBounceMaterial;
            return;
        }

        if (collision.collider.CompareTag("Grass")) Grounded = true;
        _collider.sharedMaterial = _normalMaterial;
    }

    void OnCollisionExit2D(Collision2D collision)
    {
        var player = collision.collider.GetComponentInParent<Player>();
        if (player != null)
        {
            _playerContacts = Mathf.Max(0, _playerContacts - 1);
            if (_playerContacts == 0) _collider.sharedMaterial = _normalMaterial;
            return;
        }

        if (collision.collider.CompareTag("Grass")) Grounded = false;
    }
}
