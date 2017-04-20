using UnityEngine;

namespace Assets.Scripts
{
    public class Game : MonoBehaviour {
        public static Game Instance { get; private set; }
        public GameObject PlayerPrefab;
        public GameObject GK1StartPoint;
        public GameObject GK2StartPoint;
        public GameObject Player1StartPoint;
        public GameObject Player2StartPoint;
        public GameObject BallSpawnPoint;

        [HideInInspector]
        public Player GK1;
        [HideInInspector]
        public Player GK2;
        [HideInInspector]
        public Player Player1;
        [HideInInspector]
        public Player Player2;

        // Use this for initialization
        void Start () {
            CreatePlayers();
        }

        public void Restart()
        {
            Destroy(GK1);
            Destroy(GK2);
            Destroy(Player1);
            Destroy(Player2);
            CreatePlayers();
        }

        private void CreatePlayers()
        {
            CreatePlayer1Players();
            CreatePlayer2Players();
        }

        private void CreatePlayer1Players()
        {
            GK1 = Instantiate(PlayerPrefab).GetComponent<Player>();
            GK1.transform.position = GK1StartPoint.transform.position;
            GK1.Goalkeper = true;
            GK1.Key = KeyCode.A;

            Player1 = Instantiate(PlayerPrefab).GetComponent<Player>();
            Player1.transform.position = Player1StartPoint.transform.position;
            Player1.Key = KeyCode.D;
        }

        private void CreatePlayer2Players()
        {
            GK2 = Instantiate(PlayerPrefab).GetComponent<Player>();
            GK2.transform.position = GK2StartPoint.transform.position;
            GK2.Goalkeper = true;
            GK2.Flip = true;
            GK2.Key = KeyCode.RightArrow;

            Player2 = Instantiate(PlayerPrefab).GetComponent<Player>();
            Player2.transform.position = Player2StartPoint.transform.position;
            Player2.Flip = true;
            Player2.Key = KeyCode.LeftArrow;
        }

        // Update is called once per frame
        void Update () {
		
        }
    }
}
