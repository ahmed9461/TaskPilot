namespace TaskPilot_Windows;

public enum ConnectionPhase
{
    Disconnected, Connected, Interrupted, Expired, Unauthorized
}

// Only reads are polled again after a transient failure. Mutations are never retried here.
public sealed class ClientConnectionState(TimeProvider? clock = null)
{
    private readonly TimeProvider clock = clock ?? TimeProvider.System;
    public ConnectionPhase Phase { get; private set; } = ConnectionPhase.Disconnected;
    public DateTimeOffset? ExpiresAt
    {
        get; private set;
    }
    public DateTimeOffset RetryAt
    {
        get; private set;
    }
    public int Failures
    {
        get; private set;
    }
    public void Connected(DateTimeOffset? expiresAt)
    {
        ExpiresAt = expiresAt;
        Succeeded();
    }
    public void Succeeded()
    {
        Phase = ConnectionPhase.Connected;
        Failures = 0;
        RetryAt = clock.GetUtcNow();
    }
    public void Disconnect()
    {
        Phase = ConnectionPhase.Disconnected;
        ExpiresAt = null;
        Failures = 0;
    }
    public bool CanPoll()
    {
        if (Phase is ConnectionPhase.Disconnected or ConnectionPhase.Expired or ConnectionPhase.Unauthorized)
            return false;
        if (ExpiresAt <= clock.GetUtcNow())
        {
            Phase = ConnectionPhase.Expired;
            return false;
        }
        return RetryAt <= clock.GetUtcNow();
    }
    public void Failed(Exception error)
    {
        if (error is ApiFailure { StatusCode: 401 })
        {
            Phase = error.Message == "SESSION_EXPIRED" ? ConnectionPhase.Expired : ConnectionPhase.Unauthorized;
            return;
        }
        if (error is not (HttpRequestException or TaskCanceledException or ApiFailure { StatusCode: >= 500 or 429 }))
            return;
        Phase = ConnectionPhase.Interrupted;
        Failures = Math.Min(Failures + 1, 4);
        RetryAt = clock.GetUtcNow().AddSeconds(Math.Min(60, 10 * (1 << (Failures - 1))));
    }
}
