using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace TaskPilot_Windows;

public sealed class SshConnection : IAsyncDisposable
{
    private readonly string alias;
    private readonly Process tunnel;
    private readonly string sessionId;
    private int stopped;
    public string Alias => alias;
    public bool IsTunnelAlive => Volatile.Read(ref stopped) == 0 && !tunnel.HasExited;
    public string Address
    {
        get;
    }
    public string Token
    {
        get;
    }
    public DateTimeOffset ExpiresAt
    {
        get;
    }
    private SshConnection(string alias, Process tunnel, string address, JsonNode issued)
    {
        this.alias = alias;
        this.tunnel = tunnel;
        Address = address;
        sessionId = issued["id"]!.GetValue<string>();
        Token = issued["token"]!.GetValue<string>();
        ExpiresAt = DateTimeOffset.Parse(issued["expiresAt"]!.GetValue<string>());
    }
    private static ProcessStartInfo Info(string alias)
    {
        if (!Regex.IsMatch(alias, "^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,80}$"))
            throw new InvalidOperationException("INVALID_SSH_ALIAS");
        var info = new ProcessStartInfo("ssh.exe") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true };
        foreach (var arg in new[] { "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2" })
            info.ArgumentList.Add(arg);
        return info;
    }
    private static async Task<JsonNode> Issue(string alias, string? id = null)
    {
        var info = Info(alias);
        info.ArgumentList.Add(alias);
        var command = "node /opt/taskpilot/current/dist/services/api/src/issue-client-session.js";
        if (id is not null)
        {
            if (!Guid.TryParse(id, out _))
                throw new InvalidOperationException("INVALID_SESSION");
            command += " --reauth " + id;
        }
        info.ArgumentList.Add(command);
        using var process = Process.Start(info) ?? throw new InvalidOperationException("SSH_UNAVAILABLE");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        var output = process.StandardOutput.ReadToEndAsync(deadline.Token);
        var error = process.StandardError.ReadToEndAsync(deadline.Token);
        try
        {
            await process.WaitForExitAsync(deadline.Token);
            await error;
            if (process.ExitCode != 0)
                throw new InvalidOperationException("SSH_SESSION_FAILED");
            return JsonNode.Parse(await output) ?? throw new InvalidOperationException("SSH_SESSION_FAILED");
        }
        catch { if (!process.HasExited) process.Kill(true); throw new InvalidOperationException("SSH_SESSION_FAILED"); }
    }
    public static async Task<SshConnection> Connect(string alias)
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        var info = Info(alias);
        foreach (var arg in new[] { "-N", "-o", "ExitOnForwardFailure=yes", "-L", $"127.0.0.1:{port}:127.0.0.1:8240", alias })
            info.ArgumentList.Add(arg);
        var tunnel = Process.Start(info) ?? throw new InvalidOperationException("SSH_UNAVAILABLE");
        try
        {
            _ = tunnel.StandardError.ReadToEndAsync();
            _ = tunnel.StandardOutput.ReadToEndAsync();
            var address = $"http://127.0.0.1:{port}";
            using var probe = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(2) };
            var ready = false;
            var deadline = Stopwatch.StartNew();
            while (deadline.Elapsed < TimeSpan.FromSeconds(25))
            {
                if (tunnel.HasExited)
                    break;
                try
                {
                    ready = (await probe.GetAsync(address + "/health")).IsSuccessStatusCode;
                    if (ready)
                        break;
                }
                catch (HttpRequestException) { }
                catch (TaskCanceledException) { }
                await Task.Delay(250);
            }
            if (!ready)
                throw new InvalidOperationException("SSH_TUNNEL_FAILED");
            return new SshConnection(alias, tunnel, address, await Issue(alias));
        }
        catch { if (!tunnel.HasExited) tunnel.Kill(true); tunnel.Dispose(); throw; }
    }
    public async Task<string> Reauthorize()
    {
        if (ExpiresAt <= DateTimeOffset.UtcNow)
            throw new ApiFailure("SESSION_EXPIRED", 401);
        if (!IsTunnelAlive)
            throw new HttpRequestException("SSH_TUNNEL_FAILED");
        return (await Issue(alias, sessionId))["grant"]!.GetValue<string>();
    }
    public async Task<JsonNode> SendingPolicy(string action, bool? enabled = null, string? token = null, string? confirmation = null)
    {
        if (ExpiresAt <= DateTimeOffset.UtcNow) throw new ApiFailure("SESSION_EXPIRED", 401);
        if (!IsTunnelAlive) throw new HttpRequestException("SSH_TUNNEL_FAILED");
        var payload = new JsonObject { ["action"] = action, ["clientToken"] = Token };
        if (enabled is not null) payload["enabled"] = enabled.Value;
        if (token is not null) payload["token"] = token;
        if (confirmation is not null) { payload["confirmation"] = confirmation; payload["reauth"] = await Reauthorize(); }
        var info = Info(alias);
        info.RedirectStandardInput = true;
        info.ArgumentList.Add(alias);
        info.ArgumentList.Add("node /opt/taskpilot/current/ops/sending-policy.mjs");
        using var process = Process.Start(info) ?? throw new InvalidOperationException("SSH_UNAVAILABLE");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        var output = process.StandardOutput.ReadToEndAsync(deadline.Token);
        var error = process.StandardError.ReadToEndAsync(deadline.Token);
        try
        {
            await process.StandardInput.WriteAsync(payload.ToJsonString().AsMemory(), deadline.Token);
            process.StandardInput.Close();
            await process.WaitForExitAsync(deadline.Token);
            await error;
            var raw = await output;
            if (raw.Length > 65536) throw new InvalidOperationException();
            var result = JsonNode.Parse(raw) ?? throw new InvalidOperationException();
            if (process.ExitCode != 0)
            {
                var code = result["code"]?.ToString() ?? "SENDING_POLICY_UNAVAILABLE";
                if (!Regex.IsMatch(code, "^(SENDING_POLICY_[A-Z_]+|SESSION_EXPIRED|REAUTH_REQUIRED)$")) code = "SENDING_POLICY_UNAVAILABLE";
                throw new ApiFailure(code, 409);
            }
            return result;
        }
        catch (ApiFailure) { throw; }
        catch { if (!process.HasExited) process.Kill(true); throw new InvalidOperationException("SENDING_POLICY_UNAVAILABLE"); }
    }
    public async ValueTask DisposeAsync()
    {
        if (Volatile.Read(ref stopped) != 0)
            return;
        try
        {
            using var client = new ApiClient();
            client.Configure(Address, Token);
            await client.Send("POST", "/v1/client-session/revoke", new
            {
            });
        }
        catch { /* Expiry is the fail-safe when the tunnel is lost. */ }
        StopTunnel();
    }
    public void StopTunnel()
    {
        if (Interlocked.Exchange(ref stopped, 1) != 0)
            return;
        if (!tunnel.HasExited)
            tunnel.Kill(true);
        tunnel.Dispose();
    }
}
