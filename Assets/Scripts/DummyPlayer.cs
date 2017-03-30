using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

public class DummyPlayer : NetworkBehaviour
{

    public void Start()
    {
        transform.position = new Vector3(NetManager.ConnectedPlayers*1.5f, 0,0);
        NetManager.ConnectedPlayers++;
    }
}
