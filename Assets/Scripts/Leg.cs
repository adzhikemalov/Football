using UnityEngine;

/// <summary>
/// One leg of a player. The owning <see cref="Player"/> configures it; it only drives
/// its HingeJoint2D motor and reports ground contacts back to the owner.
///
/// Motor speeds follow the reference game: the kicking leg swings forward fast while the
/// button is held and returns at half speed after release; the standing leg does a small
/// counter-swing the other way so the body stays balanced.
/// </summary>
public class Leg : MonoBehaviour
{
    [Header("Motor (degrees per second)")]
    public float MaxMotorTorque = 700f;
    public float KickSpeed = 800f;
    public float ReturnSpeed = 400f;
    public float BackLegSpeed = 300f;

    [Header("Limits (degrees)")]
    public float KickLimit = 90f;
    public float BackLegLimit = 6f;

    [Header("State (set by Player)")]
    public bool IsKickLeg;
    public bool Flip;

    private Player _owner;
    private HingeJoint2D _joint;
    private float _dir = -1f; // kick direction sign: -1 for the left team, +1 for the mirrored right team

    public void Configure(Player owner, bool isKickLeg, bool flip)
    {
        _owner = owner;
        IsKickLeg = isKickLeg;
        Flip = flip;
        _dir = flip ? 1f : -1f;

        _joint = GetComponent<HingeJoint2D>();
        if (_joint == null) return;

        _joint.useLimits = true;
        _joint.useMotor = true;

        var limits = new JointAngleLimits2D();
        if (isKickLeg)
        {
            limits.min = flip ? 0f : -KickLimit;
            limits.max = flip ? KickLimit : 0f;
        }
        else
        {
            limits.min = -BackLegLimit;
            limits.max = BackLegLimit;
        }
        _joint.limits = limits;

        Relax();
    }

    /// <summary>Button pressed: swing the kicking leg forward, the standing leg slightly back.</summary>
    public void Kick()
    {
        SetMotor(IsKickLeg ? KickSpeed * _dir : -BackLegSpeed * _dir);
    }

    /// <summary>Button released: bring the legs back at half speed.</summary>
    public void Relax()
    {
        SetMotor(IsKickLeg ? -ReturnSpeed * _dir : BackLegSpeed * _dir);
    }

    private void SetMotor(float speed)
    {
        if (_joint == null) return;
        var motor = new JointMotor2D();
        motor.motorSpeed = speed;
        motor.maxMotorTorque = MaxMotorTorque;
        _joint.motor = motor;
    }

    void OnCollisionStay2D(Collision2D collision)
    {
        if (_owner != null) _owner.ReportContact(collision);
    }
}
