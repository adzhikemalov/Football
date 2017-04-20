using System;
using UnityEngine;
using System.Collections;
using System.Reflection;
using System.Runtime.CompilerServices;

public class Leg : MonoBehaviour
{
    public bool IsActive;
    public bool Flip;
    public int MaxMotorTorque;
    public int MotorSpeed;
    private bool _onGround;
    private HingeJoint2D _joint;
    private JointMotor2D _motorHit;
    private JointMotor2D _motorIdle;
    private JointAngleLimits2D _activeLimits;
    private JointAngleLimits2D _passiveLimits;
    public bool isHit;

    public bool OnGround {
        get
        {
            return _onGround;
        }
    }

    public void OnCollisionEnter2D(Collision2D collision)
    {
        if (collision.gameObject.tag == "Grass")
        {
            _onGround = true;
        }
    }

    public void OnCollisionExit2D(Collision2D collision)
    {
        if (collision.gameObject.tag == "Grass")
        {
            _onGround = false;
        }
    }


    void Start()
    {
        _activeLimits = new JointAngleLimits2D { min = Flip ? 90 : -90, max = 0 };
        _passiveLimits = new JointAngleLimits2D{min = 0, max = 0};

        _joint = GetComponent<HingeJoint2D>();
        if (IsActive)
        {
            _joint.limits = _activeLimits;

            _motorHit = new JointMotor2D();
            _motorHit.motorSpeed = Flip ? MotorSpeed : -MotorSpeed;
            _motorHit.maxMotorTorque = MaxMotorTorque;

            _motorIdle = new JointMotor2D();
            _motorIdle.motorSpeed = Flip ? -MotorSpeed : MotorSpeed; ;
            _motorIdle.maxMotorTorque = MaxMotorTorque;
        }
        else
        {
            _joint.limits = _passiveLimits;

            _motorHit = new JointMotor2D();
            _motorHit.motorSpeed = MotorSpeed;
            _motorHit.maxMotorTorque = MaxMotorTorque;

            _motorIdle = new JointMotor2D();
            _motorIdle.motorSpeed = -MotorSpeed;
            _motorIdle.maxMotorTorque = MaxMotorTorque;
        }
    }
    
    public void Hit()
    {
        isHit = true;
        _joint.motor = _motorHit;
    }

    public void StopHit()
    {
        isHit = false;
        _joint.motor = _motorIdle;
    }
}
