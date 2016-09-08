using System;
using UnityEngine;
using System.Collections;
using System.Reflection;
using System.Runtime.CompilerServices;

public class Leg : MonoBehaviour {
    private bool _onGround;
    private HingeJoint2D _joint;
    private JointMotor2D _motorHit;
    private JointMotor2D _motorIdle;

    public bool OnGround {
        get
        {
            return _onGround;
        }
    }

    void Start()
    {
        _joint = GetComponent<HingeJoint2D>();
        _motorHit = new JointMotor2D();
        _motorHit.motorSpeed = -700;
        _motorHit.maxMotorTorque = 10;

        _motorIdle = new JointMotor2D();
        _motorIdle.motorSpeed = 700;
        _motorIdle.maxMotorTorque = 10;
    }

    void OnCollisionEnter2D(Collision2D coll)
    {
        if (coll.gameObject.name == "Grass") ;
        {
            _onGround = true;
        }
    }

    void OnCollisionExit2D(Collision2D coll)
    {
        if (coll.gameObject.name == "Grass") ;
        {
            _onGround = false;
        }
    }

    public void Hit()
    {
        _joint.motor = _motorHit;
    }

    public void StopHit()
    {
        _joint.motor = _motorIdle;
    }
}
