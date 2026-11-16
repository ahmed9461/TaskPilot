using TaskPilot_Windows;

static class PersistentServerChecks
{
    public static async Task Run()
    {
        var profile = new ProtectedConnectionStore().Load() ?? throw new InvalidOperationException("SAVED_DEVICE_REQUIRED");
        var connection = SshConnection.Resume(profile);
        using var api = new ApiClient(); api.Configure(profile.Address, profile.Token);
        try
        {
            if ((await api.Send("GET", "/v1/me"))["id"]?.ToString() != "owner") throw new InvalidOperationException("DEVICE_ACCESS_FAILED");
            var policy = await api.Send("GET", "/v1/whatsapp/sending-policy");
            var grant = await connection.Reauthorize();
            var payload = new { approvalToken = "synthetic-nonexistent-approval-" + Guid.NewGuid().ToString("N"), idempotencyKey = Guid.NewGuid().ToString() };
            try { await api.Send("POST", "/v1/reply-jobs/approve", payload, grant); throw new InvalidOperationException("NONEXISTENT_PREVIEW_ACCEPTED"); }
            catch (ApiFailure error) when (error.Message == "APPROVAL_EXPIRED_OR_CONSUMED" && error.StatusCode == 409) { }
            try { await api.Send("POST", "/v1/reply-jobs/approve", payload, grant); throw new InvalidOperationException("GRANT_REPLAY_ACCEPTED"); }
            catch (ApiFailure error) when (error.Message == "REAUTH_REQUIRED" && error.StatusCode == 403) { }
            var after = await api.Send("GET", "/v1/whatsapp/sending-policy");
            if (policy["enabled"]?.ToString() != after["enabled"]?.ToString() || policy["unsettled"]?.ToString() != after["unsettled"]?.ToString()) throw new InvalidOperationException("POLICY_OR_QUEUE_CHANGED");
            Console.WriteLine("PASS: saved DPAPI device -> validated private HTTPS -> owner reads; real trusted SSH over Tailscale -> single-use reauth consumed/replay rejected; nonexistent reply preview created no job or message. Device remains authorized.");
        }
        finally { connection.StopTunnel(); } // Do not revoke the owner's persistent profile.
    }
}
