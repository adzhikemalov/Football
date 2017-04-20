using UnityEngine.Networking;

namespace Assets.Scripts.Network
{
    public class WorldMessage : MessageBase
    {
        public const int WorldUpdate = 100;
        public const int PlayerInput = 101;
        public string MessageContent = "empty";
        public string[] Players;
    }
}