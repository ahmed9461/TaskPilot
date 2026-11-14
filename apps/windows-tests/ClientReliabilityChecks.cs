using System.Net;
using System.Text;
using TaskPilot_Windows;

static class ClientReliabilityChecks
{
    static void Check(bool value, string message)
    {
        if (!value)
            throw new Exception(message);
    }
    public static async Task Run()
    {
        var clock = new ManualClock();
        var handler = new CountingHandler();
        using var api = new ApiClient(handler, clock);
        api.Configure("http://127.0.0.1:8240", "synthetic-test-token-00000000000000", clock.GetUtcNow().AddSeconds(30));
        await api.Send("GET", "/v1/me");
        clock.Advance(30);
        try
        {
            await api.Send("POST", "/v1/change", new
            {
            });
            throw new Exception("Expired session accepted");
        }
        catch (ApiFailure e) { Check(e.StatusCode == 401 && e.Message == "SESSION_EXPIRED", "Expiry was not explicit"); }
        Check(handler.Calls == 1, "Expired mutation reached transport");

        using var uncertain = new ApiClient(new CountingHandler(fail: true));
        uncertain.Configure("http://127.0.0.1:8240", "synthetic-test-token-00000000000000");
        try
        {
            await uncertain.Send("POST", "/v1/approve", new
            {
            });
            throw new Exception("Expected transport failure");
        }
        catch (HttpRequestException) { }
        Check(CountingHandler.FailedCalls == 1, "Uncertain mutation retried automatically");

        var state = new ClientConnectionState(clock);
        Check(!state.CanPoll(), "Disconnected client polled");
        var expires = clock.GetUtcNow().AddMinutes(30);
        state.Connected(expires);
        foreach (var seconds in new[] { 10, 20, 40, 60, 60 })
        {
            state.Failed(new HttpRequestException());
            Check(state.Phase == ConnectionPhase.Interrupted && !state.CanPoll(), "No backoff after failure");
            clock.Advance(seconds - 1);
            Check(!state.CanPoll(), "Backoff retried too early");
            clock.Advance(1);
            Check(state.CanPoll(), "Read retry never resumed");
        }

        state.Failed(new ApiFailure("PERMISSION_DENIED", 401));
        clock.Advance(120);
        Check(state.Phase == ConnectionPhase.Unauthorized && !state.CanPoll(), "Revoked session retried");
        state.Connected(expires);
        state.Failed(new ApiFailure("REAUTH_REQUIRED", 403));
        Check(state.Phase == ConnectionPhase.Connected && state.CanPoll(), "One-use grant failure ended whole session");

        state.Failed(new ApiFailure("SERVICE_UNAVAILABLE", 503));
        state.Succeeded();
        Check(state.CanPoll() && state.Failures == 0 && state.ExpiresAt == expires, "Read recovery renewed session or kept backoff");
        clock.Advance(3600);
        Check(!state.CanPoll() && state.Phase == ConnectionPhase.Expired, "Absolute expiry ignored");
        state.Connected(clock.GetUtcNow().AddMinutes(30));
        Check(state.CanPoll(), "Explicit reconnect did not recover");
        state.Disconnect();
        Check(!state.CanPoll() && state.ExpiresAt is null, "Logout retained active session state");
        await DelayedPollDoesNotRestoreOldSession(clock);
        Console.WriteLine("PASS: 8 reliability checks (expiry, no mutation retry, read backoff, revoke, reauth separation, recovery, explicit reconnect, obsolete polling); simulated time/transport only.");
    }
    static async Task DelayedPollDoesNotRestoreOldSession(TimeProvider clock)
    {
        var state = new ClientConnectionState(clock);
        var handler = new DelayedHandler();
        using var api = new ApiClient(handler, clock);
        api.Configure("http://127.0.0.1:8240", "synthetic-test-token-00000000000000");
        state.Connected(null);
        var oldRevision = state.Revision;
        var pending = api.Send("GET", "/v1/changes?cursor=0");
        await handler.Started.Task;
        api.Disconnect();
        state.Disconnect();
        handler.Release.SetResult();
        await pending;
        Check(!state.TrySucceeded(oldRevision) && state.Phase == ConnectionPhase.Disconnected && !state.CanPoll(), "Late poll restored logged-out session");
        state.Connected(null);
        Check(!state.TrySucceeded(oldRevision) && !state.TryFailed(oldRevision, new ApiFailure("PERMISSION_DENIED", 401)) && state.Phase == ConnectionPhase.Connected && state.Failures == 0, "Old result or error changed new connection");
        var current = state.Revision;
        Check(state.TryFailed(current, new HttpRequestException()) && state.Phase == ConnectionPhase.Interrupted, "Current transient failure ignored");
        Check(state.TrySucceeded(current) && state.Phase == ConnectionPhase.Connected && state.Failures == 0, "Current polling recovery ignored");
    }
    sealed class DelayedHandler : HttpMessageHandler
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Started.SetResult();
            await Release.Task.WaitAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}", Encoding.UTF8, "application/json") };
        }
    }
    sealed class ManualClock : TimeProvider
    {
        private DateTimeOffset now = DateTimeOffset.UnixEpoch;
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(int seconds) => now = now.AddSeconds(seconds);
    }
    sealed class CountingHandler(bool fail = false) : HttpMessageHandler
    {
        public int Calls;
        public static int FailedCalls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            if (fail)
            {
                FailedCalls++;
                throw new HttpRequestException("synthetic uncertain delivery");
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}", Encoding.UTF8, "application/json") });
        }
    }
}
