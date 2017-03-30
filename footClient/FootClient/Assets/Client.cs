using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

public class Client : MonoBehaviour
{
    public class WorldMessage : MessageBase
    {
        public const int WorldUpdate = 100;
        public const int PlayerInput = 101;
        public string MessageContent = "temp";
        public string[] Players;
    }

    public class ClientPlayer
    {
        public int Id;
        public GameObject Player;
        public GameObject Body;
        public GameObject ActiveLeg;
        public GameObject Leg;
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

    public GameObject PlayerPrefab;
    private Dictionary<int, ClientPlayer> _players;
    private NetworkClient _client;
    public void Connect()
    {
        if (_client == null)
        {
            _client = new NetworkClient();
        }
        _players = new Dictionary<int, ClientPlayer>();
        _client.RegisterHandler(MsgType.Connect, OnConnected);
        _client.RegisterHandler(MsgType.Disconnect, OnDisconnected);
        _client.RegisterHandler(WorldMessage.WorldUpdate, OnWorldUpdate);
        _client.Connect("192.168.2.122", 9999);
    }

    private void Update()
    {
        if (Input.GetKey(KeyCode.A))
        {
            _client.Send(WorldMessage.PlayerInput, new WorldMessage{MessageContent = "A"});
        }
        if (Input.GetKeyUp(KeyCode.A))
        {
            _client.Send(WorldMessage.PlayerInput, new WorldMessage{MessageContent = "B"});
        }
    }

    private void OnWorldUpdate(NetworkMessage netmsg)
    {
        var message = netmsg.ReadMessage<WorldMessage>();
        for (int i = 0; i < message.Players.Length; i++)
        {
            PlayerWrapper playerWrapper = JsonUtility.FromJson<PlayerWrapper>(message.Players[i]);
            ClientPlayer clientPlayer;
            if (!_players.TryGetValue(i, out clientPlayer))
                clientPlayer = AddNewPlayer(i);
             clientPlayer.Body.transform.position = playerWrapper.pos;
             clientPlayer.Body.transform.localRotation = Quaternion.Euler(0.0f, 0.0f, playerWrapper.rotation);
             clientPlayer.Leg.transform.position = playerWrapper.pasLegPos;
             clientPlayer.Leg.transform.localRotation = Quaternion.Euler(0.0f, 0.0f, playerWrapper.pasLegRot);
             clientPlayer.ActiveLeg.transform.position = playerWrapper.actLegPos;
             clientPlayer.ActiveLeg.transform.localRotation = Quaternion.Euler(0.0f, 0.0f, playerWrapper.actLegRot);
        }
    }

    private ClientPlayer AddNewPlayer(int i)
    {
        var client = new ClientPlayer();
        client.Player = Instantiate(PlayerPrefab);
        client.Leg = client.Player.transform.FindChild("Leg").gameObject;
        client.ActiveLeg = client.Player.transform.FindChild("ActiveLeg").gameObject;
        client.Body = client.Player.transform.FindChild("Body").gameObject;
        _players[i] = client;
        return client;
    }

    private void OnDisconnected(NetworkMessage netmsg)
    {
        Debug.Log("User disconnected");
    }

    private void OnConnected(NetworkMessage netmsg)
    {
        Debug.Log("User connected");
    }
}
