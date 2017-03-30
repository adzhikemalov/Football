using UnityEngine;

namespace Assets.Scripts
{
    public class Game : MonoBehaviour {
        public static Game Instance { get; private set; }
        // Use this for initialization
        void Start () {
            DontDestroyOnLoad(this);
        }
	
        // Update is called once per frame
        void Update () {
		
        }
    }
}
