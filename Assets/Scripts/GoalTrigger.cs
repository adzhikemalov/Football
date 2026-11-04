using UnityEngine;

/// <summary>Attached by <see cref="Game"/> to the trigger collider inside each goal net.</summary>
public class GoalTrigger : MonoBehaviour
{
    [Tooltip("Team whose goal this is. The other team scores here.")]
    public int DefendingTeam;

    void OnTriggerEnter2D(Collider2D other)
    {
        var ball = other.GetComponentInParent<Ball>();
        if (ball == null || Game.Instance == null) return;
        Game.Instance.OnGoal(1 - DefendingTeam, ball);
    }
}
