using System;
using UnityEditor;
using UnityEngine;
using System.Collections;
using System.Runtime.CompilerServices;

public class Player : MonoBehaviour
{
    public GameObject HeadGameObject;
    public int JumpPower = 400;
    public int VstankaPower = 0;
    public GameObject ActiveLeg;
    public GameObject InatciveLeg;

    private bool _onGround;
    private SpriteRenderer _headSprite;
    private Leg _acitveLegComponent;
    private Leg _inAcitveLegComponent;
    private Rigidbody2D _rigidbody;

	void Start ()
	{
        _headSprite = HeadGameObject.GetComponent<SpriteRenderer>();
	    _rigidbody = GetComponent<Rigidbody2D>();
        if (ActiveLeg != null && InatciveLeg != null)
        {
            Physics2D.IgnoreCollision(ActiveLeg.GetComponent<Collider2D>(), InatciveLeg.GetComponent<Collider2D>());
            _acitveLegComponent = ActiveLeg.GetComponent<Leg>();
            _inAcitveLegComponent = InatciveLeg.GetComponent<Leg>();
        }
	}

    void OnCollisionEnter2D(Collision2D coll)
    {
        if (coll.gameObject.name == "Grass");
        {
            _onGround = true;
        }
    }

    void OnCollisionExit2D(Collision2D coll)
    {
        if (coll.gameObject.name == "Grass");
        {
            _onGround = false;
        }
    }

    public bool OnGround {
        get
        {
            return _onGround || _acitveLegComponent.OnGround || _inAcitveLegComponent.OnGround;
        }
    }
    

    void OnDrawGizmos()
    {
//        Gizmos.color = Color.red;
//        Gizmos.DrawLine(new Vector3(0,0,0), new Vector3(10, 0, 0));
    }

    public float stability = 0.3f;
    public float speed = 2.0f;
    void AddStandPower()
    {
        var angleBetween = Vector3.Angle(transform.up, Vector2.right);
        var multiplier = 1;
        if (OnGround)
        {
            if (angleBetween > 120)
            {
                multiplier = 1;
            }
            else if (angleBetween < 70)
            {
                multiplier = -1;
            }
        }

    }

	void Update ()
	{
	    AddStandPower();
	    if (Input.GetKeyDown(KeyCode.W))
	    {
	        if (CanJump)
	        {
                _rigidbody.AddForce(transform.up * JumpPower);
	        }
	        _acitveLegComponent.Hit();
	    }
	    if (Input.GetKeyUp(KeyCode.W))
        {
	        _acitveLegComponent.StopHit();
	    }
	}

    public bool CanJump
    {
        get
        {
            var angleBetween = Vector3.Angle(transform.up, Vector2.right);
            return OnGround && (angleBetween < 100 || angleBetween > 80);
        }
    }
}
