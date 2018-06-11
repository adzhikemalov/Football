using System;
using UnityEngine;
using System.Collections;
using System.Runtime.CompilerServices;
using System.Text;
using UnityEditor;
using UnityEngine.UI;

public class Player : MonoBehaviour
{

    public Image Scroll;
    [Header("Physics parameters")] public int JumpPower = 495;
    public Vector2 OnGrroundCenterOfMass;
    public Vector2 JumpCenterOfMass;
    public bool ChangeCenterOfMass = true;

    [Header("Legs")] public GameObject ActiveLeg;
    public GameObject InatciveLeg;

    [Header("Hands")] public GameObject LeftHand;
    public GameObject RightHand;

    public bool Flip;
    public bool Goalkeper;

    public KeyCode Key;
    public int Id;
    public bool Jump;
    public bool PressedJump;
    public bool JumpReleased = true;

    private Leg _acitveLegComponent;
    private Leg _inAcitveLegComponent;
    private Rigidbody2D _rigidbody;

    void Start()
    {
        _rigidbody = GetComponent<Rigidbody2D>();
        _rigidbody.useAutoMass = false;

        if (ActiveLeg != null && InatciveLeg != null)
        {
            Physics2D.IgnoreCollision(ActiveLeg.GetComponent<Collider2D>(), InatciveLeg.GetComponent<Collider2D>());
            _acitveLegComponent = ActiveLeg.GetComponent<Leg>();
            _inAcitveLegComponent = InatciveLeg.GetComponent<Leg>();

            if (Goalkeper)
            {
                RightHand.GetComponent<HingeJoint2D>().enabled = false;
                LeftHand.GetComponent<HingeJoint2D>().enabled = false;
                RightHand.GetComponent<FixedJoint2D>().enabled = true;
                LeftHand.GetComponent<FixedJoint2D>().enabled = true;
            }

            if (Flip)
            {
                _acitveLegComponent.IsActive = false;
                _inAcitveLegComponent.IsActive = true;
                _inAcitveLegComponent.Flip = true;
            }
        }
    }

    public Leg GetActiveLeg
    {
        get { return Flip ? _inAcitveLegComponent : _acitveLegComponent; }
    }

    public Leg GetInActiveLeg
    {
        get { return Flip ? _acitveLegComponent : _inAcitveLegComponent; }
    }

    public bool OnGround
    {
        get
        {
            return _inAcitveLegComponent != null &&
                   (_acitveLegComponent != null && (_acitveLegComponent.OnGround && _inAcitveLegComponent.OnGround));
        }
    }

    public bool OneLegOnGround
    {
        get
        {
            if (!_inAcitveLegComponent || !_acitveLegComponent) return false;
            return (_acitveLegComponent.OnGround && !_inAcitveLegComponent.OnGround) ||
                   (!_acitveLegComponent.OnGround && _inAcitveLegComponent.OnGround);
        }
    }

    void OnDrawGizmos()
    {

#if UNITY_EDITOR
        if (!EditorApplication.isPlaying) return;
#endif
        if (OneLegOnGround || (GetInActiveLeg.OnGround && GetActiveLeg.isHit))
            Gizmos.color = Color.cyan;
        else
            Gizmos.color = Color.red;
        Gizmos.DrawSphere(transform.TransformPoint(GetCenterOffMass()), 0.1f);
    }

    public void UpdateCenterOfMass()
    {
        var result = GetCenterOffMass();
        _rigidbody.centerOfMass = result;
    }

    private Vector3 GetCenterOffMass()
    {
        if (GetInActiveLeg.OnGround && GetActiveLeg.isHit)
            return JumpCenterOfMass;
        if (OneLegOnGround)
            return OnGrroundCenterOfMass;
        return JumpCenterOfMass;
    }

    private void ResetScroll()
    {
        Scroll.transform.localScale = new Vector3(0, 1, 1);
    }

    private void AddScroll()
    {
        Scroll.transform.localScale = new Vector3(Scroll.transform.localScale.x + 0.1f, 1, 1);
    }

    void Update ()
	{
	    var keyCode = Key;
	    
        if (Input.GetKeyDown(keyCode))
	    {
	        PressedJump = true;
	    }

	    if (PressedJump)
	    {
            AddScroll();
        }

        if (Input.GetKeyUp(keyCode))
	    {
	        PressedJump = false;
	        JumpReleased = true;
            ResetScroll();
	    }
        
        if (PressedJump)
	    {
            _acitveLegComponent.Hit();
            _inAcitveLegComponent.Hit();
	    }
        if (JumpReleased)
        {
	        _acitveLegComponent.StopHit();
            _inAcitveLegComponent.StopHit();
            JumpReleased = false;
            Jump = false;
        }
	}

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
    
    public Vector2 MaxVelocity = new Vector2(50, 50);
    void FixedUpdate()
    {
        if (ChangeCenterOfMass)
            UpdateCenterOfMass();

        if (_rigidbody.velocity.magnitude > MaxVelocity.magnitude)
        {
            _rigidbody.velocity = _rigidbody.velocity.normalized*MaxVelocity.magnitude;
        }

        if (Jump)
        {
            Jump = false;
            if (OneLegOnGround || OnGround)
            {
                _rigidbody.AddForce(transform.up * JumpPower/Time.fixedDeltaTime);
                _rigidbody.AddTorque(Flip ? 5 / Time.fixedDeltaTime : -5 / Time.fixedDeltaTime);
            }
        }
    }
}
