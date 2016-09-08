using UnityEngine;
using System.Collections;

public class GatesTrigger : MonoBehaviour {

	// Use this for initialization
	void Start () {
	
	}


    void OnTriggerEnter2D(Collider2D coll)
    {
        if (coll.gameObject.name == "Ball") ;
        {

        }
    }
	
	// Update is called once per frame
	void Update () {
	
	}
}
