using System.Net;
using System.Text;
using TaskPilot_Windows;
if (args.Length > 0 && args[0] == "--server-acceptance") { await ServerAcceptance.Run(args.Length > 1 ? args[1] : "New-VPS"); return; }
if (args.Length == 2 && args[0] == "--cleanup-synthetic-namespace") { await ServerAcceptance.Cleanup(args[1]); return; }
static void ExpectRejected(Action action) { try { action(); } catch (InvalidOperationException) { return; } throw new Exception("Expected rejection"); }
using var client = new ApiClient(new FixtureHandler());
ExpectRejected(() => client.Configure("http://example.invalid", "synthetic-test-token-00000000000000"));
ExpectRejected(() => client.Configure("https://user:pass@example.invalid", "synthetic-test-token-00000000000000"));
ExpectRejected(() => client.Configure("https://example.invalid/#fragment", "synthetic-test-token-00000000000000"));
ExpectRejected(() => client.Configure("http://127.0.0.1:8240", "short"));
client.Configure("http://127.0.0.1:8240", "synthetic-test-token-00000000000000");
var result = await client.Send("GET", "/v1/me");
if (result["id"]?.ToString() != "owner") throw new Exception("Response contract mismatch");
try
{
    await client.Send("POST", "/v1/reveal", new
    {
    }, "synthetic-reauth");
    throw new Exception("Expected sanitized API error");
}
catch (InvalidOperationException e) { if (e.Message != "REAUTH_REQUIRED") throw; }
Console.WriteLine("PASS: 6 client checks (transport, address, auth, response, errors); no network used.");
await ClientReliabilityChecks.Run();
sealed class FixtureHandler : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.Headers.Authorization?.Scheme != "Bearer")
            throw new Exception("Missing bearer authentication");
        var reveal = request.RequestUri!.AbsolutePath.EndsWith("reveal");
        if (reveal && !request.Headers.Contains("X-Reauth-Secret"))
            throw new Exception("Missing reauthentication");
        return Task.FromResult(new HttpResponseMessage(reveal ? HttpStatusCode.Forbidden : HttpStatusCode.OK) { Content = new StringContent(reveal ? "{\"code\":\"REAUTH_REQUIRED\"}" : "{\"id\":\"owner\"}", Encoding.UTF8, "application/json") });
    }
}
