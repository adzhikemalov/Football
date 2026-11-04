using UnityEngine;

/// <summary>Keeps the pitch framed and pans/zooms out when the ball flies high.</summary>
public class CameraFollow : MonoBehaviour
{
    public Transform Target;
    public float BaseY = 3.5f;
    public float BaseSize = 5f;
    public float MaxX = 1.5f;
    public float Smoothing = 6f;

    private Camera _camera;

    void Awake()
    {
        _camera = GetComponent<Camera>();
    }

    void LateUpdate()
    {
        if (_camera == null) return;

        float targetX = 0f;
        float targetY = BaseY;
        float targetSize = BaseSize;

        if (Target != null)
        {
            targetX = Mathf.Clamp(Target.position.x * 0.3f, -MaxX, MaxX);
            float above = Target.position.y - (BaseY + BaseSize * 0.6f);
            if (above > 0f)
            {
                targetSize = BaseSize + above * 0.6f;
                targetY = BaseY + above * 0.5f;
            }
        }

        float k = 1f - Mathf.Exp(-Smoothing * Time.deltaTime);
        Vector3 position = transform.position;
        transform.position = new Vector3(Mathf.Lerp(position.x, targetX, k), Mathf.Lerp(position.y, targetY, k), position.z);
        _camera.orthographicSize = Mathf.Lerp(_camera.orthographicSize, targetSize, k);
    }
}
