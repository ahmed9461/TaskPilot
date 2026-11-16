using System.Net;
using System.Text;
using TaskPilot_Windows;

static class PersistentConnectionChecks
{
    static void Check(bool value) { if (!value) throw new Exception("Persistent connection contract failed"); }
    static void Reject(Action action) { try { action(); } catch (InvalidOperationException) { return; } throw new Exception("Invalid device profile accepted"); }
    public static async Task Run()
    {
        var profile = new TailscaleProfile("Synthetic", "https://synthetic.example.ts.net:9443", Guid.NewGuid().ToString(), "synthetic-device-" + new string('x', 48), "synthetic-known.example").Validate();
        foreach (var bad in new[] { "http://synthetic.ts.net:9443", "https://example.invalid:9443", "https://synthetic.ts.net:443", "https://secret@synthetic.ts.net:9443", "https://synthetic.ts.net:9443/path" }) Reject(() => (profile with { Address = bad }).Validate());
        Reject(() => (profile with { Alias = "bad;command" }).Validate());
        Reject(() => (profile with { HostKeyAlias = "bad\ncommand" }).Validate());
        Check(!profile.ToString().Contains(profile.Token));
        var info = SshConnection.Info(profile.Alias, route: profile);
        Check(info.ArgumentList.Contains("Hostname=synthetic.example.ts.net") && info.ArgumentList.Contains("HostKeyAlias=synthetic-known.example") && info.ArgumentList.Contains("StrictHostKeyChecking=yes"));
        var connection = SshConnection.Resume(profile); Check(connection.Persistent && connection.ExpiresAt is null); connection.StopTunnel();
        var clock = new FutureClock();
        var state = new ClientConnectionState(clock); state.Connected(null); clock.Now = clock.Now.AddYears(10); Check(state.CanPoll());
        state.Failed(new HttpRequestException()); clock.Now = clock.Now.AddMinutes(2); Check(state.CanPoll());
        using var api = new ApiClient(new SuccessHandler(), clock); api.Configure(profile.Address, profile.Token); Check((await api.Send("GET", "/v1/me"))["id"]!.ToString() == "owner");
        Console.WriteLine("PASS: 4 persistent profile groups (strict endpoint/route, redaction, no time expiry, interrupted-read recovery); synthetic transport only.");
        if (OperatingSystem.IsWindows())
        {
            var directory = Path.Combine(Path.GetTempPath(), "TaskPilot-Profile-Check-" + Guid.NewGuid().ToString("N"));
            if (Directory.Exists(directory)) throw new Exception("Fresh test directory required");
            var path = Path.Combine(directory, "connection.dpapi"); var store = new ProtectedConnectionStore(path);
            try
            {
                Check(store.Load() is null); store.Save(profile);
                var bytes = File.ReadAllBytes(path); Check(!Encoding.UTF8.GetString(bytes).Contains(profile.Token));
                Check(new ProtectedConnectionStore(path).Load() == profile);
                bytes[^1] ^= 1; File.WriteAllBytes(path, bytes); Reject(() => store.Load());
                store.Clear(); Check(!File.Exists(path));
                Console.WriteLine("PASS: 1 actual Windows current-user DPAPI group (opaque at rest, restart read, tamper rejection, explicit removal); isolated fake profile.");
            }
            finally { store.Clear(); if (Directory.Exists(directory)) Directory.Delete(directory); }
        }
    }
    sealed class FutureClock : TimeProvider { public DateTimeOffset Now = new(2030, 1, 1, 0, 0, 0, TimeSpan.Zero); public override DateTimeOffset GetUtcNow() => Now; }
    sealed class SuccessHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"id\":\"owner\"}") });
    }
}
