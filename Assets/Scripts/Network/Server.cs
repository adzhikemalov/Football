using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

public class Server : MonoBehaviour
{
    public NetworkServerSimple server;
    public int serverPort = 9999;
    public int maxConnections = 2;
    public GameObject PlayerPrefab;
    private List<PlayerData> _players;
    public void Start()
    {
        _players = new List<PlayerData>();
        server = new NetworkServerSimple();
        server.RegisterHandler(MsgType.Connect, OnConnect);
        server.RegisterHandler(MsgType.Disconnect, OnDisconnect);
        server.RegisterHandler(WorldMessage.PlayerInput, OnPlayerInput);
        server.Listen(serverPort);
    }

    private void OnPlayerInput(NetworkMessage netmsg)
    {
        Debug.Log("PlayerId:"+netmsg.conn.connectionId);
        var message = netmsg.ReadMessage<WorldMessage>();
        for (int i = 0; i < _players.Count; i++)
        {
            if (_players[i].Id == netmsg.conn.connectionId)
            {
                if (message.MessageContent == "A")
                {
                    _players[i].Player.PressedJump = true;
                }
                if (message.MessageContent == "B")
                {
                    _players[i].Player.PressedJump = false;
                    _players[i].Player.JumpReleased = true;
                }
            }
        }
    }

    private int _tick;
    private void Update()
    {
        if (_players == null) return;
        _tick++;
        server.Update();

        var message = new WorldMessage {};
        message.Players = new string[_players.Count];
        for (int i = 0; i < _players.Count; i++)
        {
            message.Players[i] = _players[i].Player.Serialize();
        }
        for (int i = 0; i < _players.Count; i++)
        {
            _players[i].Connection.Send(WorldMessage.WorldUpdate, message);
        }
    }


    private void OnDisconnect(NetworkMessage netmsg)
    {
        Debug.Log("client disconnected");
    }

    private void OnConnect(NetworkMessage netmsg)
    {
        Debug.Log("client connected");
        var player = GameObject.Instantiate(PlayerPrefab);
        var playerScr = player.GetComponent<Player>();
        playerScr.Id = netmsg.conn.connectionId;
        _players.Add(new PlayerData{Connection = netmsg.conn, Id = netmsg.conn.connectionId, Player = playerScr});
    }

    public class PlayerData
    {
        public NetworkConnection Connection;
        public int Id;
        public Player Player;
    }

    public class WorldMessage : MessageBase
    {
        public const int WorldUpdate = 100;
        public const int PlayerInput = 101;
        public string MessageContent = "empty";
        public string[] Players;
    }

}
