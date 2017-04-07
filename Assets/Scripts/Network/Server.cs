using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.Networking.NetworkSystem;

public class Server : MonoBehaviour
{
    public int ServerPort = 9999;
    public GameObject PlayerPrefab;
    public GameObject GoalKeeperPrefab;

    private NetworkServerSimple _server;
    private List<PlayerData> _players;

    public GameObject GoalKeeperSpawnPoint1;
    public GameObject GoalKeeperSpawnPoint2;
    public GameObject PlayerSpawnPoint1;
    public GameObject PlayerSpawnPoint2;

    private bool _playerSwap;

    public void Start()
    {
        _players = new List<PlayerData>();
        _server = new NetworkServerSimple();
        _server.RegisterHandler(MsgType.Connect, OnConnect);
        _server.RegisterHandler(MsgType.Disconnect, OnDisconnect);
        _server.RegisterHandler(WorldMessage.PlayerInput, OnPlayerInput);
        _server.Listen(ServerPort);
    }

    private void OnPlayerInput(NetworkMessage netmsg)
    {
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
        _server.Update();

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
        if (_players.Count > 1)
        {
            Debug.Log("Full");
            return;
        }

        for (int i = 0; i < _players.Count; i++)
        {
            var player = _players[i];
            if (player.Connection.connectionId == netmsg.conn.connectionId)
            {
                RemovePlayer(_players[i]);
            }
        }
    }

    private void RemovePlayer(PlayerData player)
    {
        Destroy(player.Player.gameObject);
        Destroy(player.GoalKeeper.gameObject);
        _players.Remove(player);
    }

    private void OnConnect(NetworkMessage netmsg)
    {
        var player = GameObject.Instantiate(PlayerPrefab);
        player.transform.position = _playerSwap ? PlayerSpawnPoint1.transform.position : PlayerSpawnPoint2.transform.position;
        var playerScr = player.GetComponent<Player>();
        playerScr.Id = netmsg.conn.connectionId;

        var goalKeeper = Instantiate(GoalKeeperPrefab);
        var goalKeeperScr = goalKeeper.GetComponent<Player>();
        goalKeeper.transform.position = _playerSwap ? GoalKeeperSpawnPoint1.transform.position : GoalKeeperSpawnPoint2.transform.position;
        goalKeeperScr.Id = netmsg.conn.connectionId;

        _players.Add(new PlayerData{Connection = netmsg.conn, Id = netmsg.conn.connectionId, Player = playerScr});
        _playerSwap = !_playerSwap;
    }

    public class PlayerData
    {
        public NetworkConnection Connection;
        public int Id;
        public Player Player;
        public Player GoalKeeper;
    }

    public class WorldMessage : MessageBase
    {
        public const int WorldUpdate = 100;
        public const int PlayerInput = 101;
        public string MessageContent = "empty";
        public string[] Players;
    }

}
