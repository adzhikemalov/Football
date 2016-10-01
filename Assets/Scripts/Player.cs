using System;
using UnityEditor;
using UnityEngine;
using System.Collections;
using System.Runtime.CompilerServices;

public class Player : MonoBehaviour
{
    [Header("Physics parameters")]
    public int JumpPower = 10;
    public Vector2 OnGrroundCenterOfMass;
    public Vector2 JumpCenterOfMass;
    public bool ChangeCenterOfMass;

    [Header("Legs")]
    public GameObject ActiveLeg;
    public GameObject InatciveLeg;

    private bool _onGround;
    private SpriteRenderer _headSprite;
    private Leg _acitveLegComponent;
    private Leg _inAcitveLegComponent;
    private Rigidbody2D _rigidbody;

    public bool CanJump
    {
        get { return OnGround; }
    }
	void Start ()
	{
	    _rigidbody = GetComponent<Rigidbody2D>();
	    _rigidbody.useAutoMass = false;
        if (ActiveLeg != null && InatciveLeg != null)
        {
            Physics2D.IgnoreCollision(ActiveLeg.GetComponent<Collider2D>(), InatciveLeg.GetComponent<Collider2D>());
            _acitveLegComponent = ActiveLeg.GetComponent<Leg>();
            _inAcitveLegComponent = InatciveLeg.GetComponent<Leg>();
        }
	}
    
    public bool OnGround {
        get
        {
            return _inAcitveLegComponent != null && (_acitveLegComponent != null && ( _acitveLegComponent.OnGround || _inAcitveLegComponent.OnGround));
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

    void OnDrawGizmos()
    {
        if (CanJump)
            Gizmos.color = Color.cyan;
        else
            Gizmos.color = Color.red;
        Gizmos.DrawSphere(transform.TransformPoint(GetCenterOffMass()), 0.1f);
    }

    public void UpdateCenterOfMass()
    {
        var result = GetCenterOffMass();
        if (result != (Vector3)_rigidbody.centerOfMass)
            _rigidbody.centerOfMass = result;
    }

    private Vector3 GetCenterOffMass()
    {
        if (CanJump)
          return OnGrroundCenterOfMass;
        return JumpCenterOfMass;
    }
    
    public bool Jump;
	void Update ()
	{
	    if (Input.GetKeyDown(KeyCode.W))
	    {
            Jump = true;
            _acitveLegComponent.Hit();
	    }
	    if (Input.GetKeyUp(KeyCode.W))
        {
	        _acitveLegComponent.StopHit();
	    }
	}

    void FixedUpdate()
    {
        if (ChangeCenterOfMass)
            UpdateCenterOfMass();

        if (Jump)
        {
            _rigidbody.AddForce(transform.up * JumpPower);
            Jump = false;
        }
    }
    
}
