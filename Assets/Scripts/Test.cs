using System;
using UnityEngine;
using System.Collections;
using System.Text;

public class Test : MonoBehaviour
{
    public float Power = 10;
    public bool ApplyForce = false;
    private Rigidbody2D _rigidbody2d;
	// Use this for initialization
	void Start ()
	{
	    _rigidbody2d = GetComponent<Rigidbody2D>();
	}
	
	// Update is called once per frame
	void FixedUpdate ()
	{
	    if (ApplyForce)
        {
            var angleBetween = Vector3.Angle(transform.up, Vector2.right);
            Debug.Log(Math.Abs(angleBetween - 90) > 15);
            if (Math.Abs(angleBetween - 90) > 15)
	        {
                var sign = transform.rotation.z > 0 ? -1 : 1;
                _rigidbody2d.MoveRotation(_rigidbody2d.rotation + Power * sign);
	        }
	    }
	}
}
