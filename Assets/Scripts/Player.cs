using System;
using UnityEngine;
using System.Collections;
using System.Runtime.CompilerServices;
using System.Text;

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

    public int Id;
    public bool Jump;
    public bool PressedJump;
    public bool JumpReleased;
	void Update ()
	{
        if (PressedJump)
	    {
            Jump = true;
            _acitveLegComponent.Hit();
	    }
        if (JumpReleased)
        {
	        _acitveLegComponent.StopHit();
            JumpReleased = false;
        }
	}

    public string Serialize()
    {
        var col = GetComponent<BoxCollider2D>();
        var actLegCol = ActiveLeg.GetComponent<BoxCollider2D>();
        var pasLegCol = InatciveLeg.GetComponent<BoxCollider2D>();
        PlayerWrapper pw = new PlayerWrapper
        {
            pos = new Vector3(col.transform.position.x, col.transform.position.y),
            rotation = col.transform.eulerAngles.z,
            actLegPos = new Vector3(actLegCol.transform.position.x, actLegCol.transform.position.y),
            actLegRot = actLegCol.transform.eulerAngles.z,
            pasLegPos = new Vector3(pasLegCol.transform.position.x, pasLegCol.transform.position.y),
            pasLegRot = pasLegCol.transform.eulerAngles.z,
            PlayerId = Id
        };
        return JsonUtility.ToJson(pw);
    }

    public class PlayerWrapper
    {
        public Vector3 pos;
        public float rotation;
        public Vector3 actLegPos;
        public float actLegRot;
        public Vector3 pasLegPos;
        public float pasLegRot;
        public int PlayerId;
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
