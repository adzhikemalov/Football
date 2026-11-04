using UnityEngine;

/// <summary>
/// Legacy component that lives on the "Game" object in Main.unity and only holds a reference
/// to the grass collider. <see cref="Game"/> uses it when present and falls back to the
/// "Grass" tag otherwise.
/// </summary>
public class FieldManager : MonoBehaviour
{
    public BoxCollider2D Ground;
}
