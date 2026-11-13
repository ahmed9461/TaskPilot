using System.Net;
using System.Text;
using TaskPilot_Windows;
if (args.Length == 1 && args[0] == "--seed-native-matrix") { await ExtendedNativeFixtures.Seed(); return; }
if (args.Length > 0 && args[0] == "--whatsapp-test-quoted-reply") { if (args.Length != 2) throw new InvalidOperationException("EXACT_TEST_GROUP_TITLE_REQUIRED"); await WhatsAppQuotedAcceptance.Run(args[1]); return; }
if (args.Length > 0 && args[0] is "--bind-whatsapp-test-group" or "--whatsapp-test-group-status") { if (args.Length != 2) throw new InvalidOperationException("EXACT_TEST_GROUP_TITLE_REQUIRED"); await WhatsAppReceiveAcceptance.Run(args[0] == "--bind-whatsapp-test-group", args[1]); return; }
if (args.Length == 1 && args[0] == "--native-ui-change") { await NativeUiFixtures.Change(); return; }
if (args.Length == 1 && args[0] is "--begin-whatsapp-pairing" or "--whatsapp-pairing-status") { await WhatsAppPairing.Run(args[0] == "--begin-whatsapp-pairing"); return; }
if (args.Length == 1 && args[0] is "--seed-native-ui" or "--seed-native-ui-extended") { await NativeUiFixtures.Seed(args[0].EndsWith("extended",StringComparison.Ordinal)); return; }
if (args.Length > 0 && args[0] == "--server-acceptance") { if (args.Length > 3 || (args.Length == 3 && args[2] != "--connection-enabled")) throw new InvalidOperationException("INVALID_ACCEPTANCE_MODE"); await ServerAcceptance.Run(args.Length > 1 ? args[1] : "New-VPS", args.Length == 3); return; }
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
ChangeFeedChecks.Run();
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
