using System.Net;
using System.Text;
using TaskPilot_Windows;
if (args is ["--synthetic-utf8-echo"]) { Console.InputEncoding = new UTF8Encoding(false); Console.OutputEncoding = new UTF8Encoding(false); Console.Write(await Console.In.ReadToEndAsync()); return; }
if (args is ["--verify-disabled-sending-control"])
{
    await using var connection = await SshConnection.Connect("New-VPS");
    using var probe = new ApiClient(); probe.Configure(connection.Address, connection.Token, connection.ExpiresAt);
    if ((await probe.Send("GET", "/v1/whatsapp/sending-policy"))["enabled"]?.GetValue<bool>() != false) throw new InvalidOperationException("DISABLED_POLICY_REQUIRED_NO_CHANGE_ATTEMPTED");
    var preview = await connection.SendingPolicy("preview", enabled: false);
    if ((await probe.Send("GET", "/v1/whatsapp/sending-policy"))["enabled"]?.GetValue<bool>() != false)
    {
        await connection.SendingPolicy("discard", token: preview["token"]!.ToString());
        throw new InvalidOperationException("POLICY_CHANGED_NO_CHANGE_ATTEMPTED");
    }
    if (preview["confirmation"]?.ToString() != "إيقاف الردود") throw new InvalidOperationException("ARABIC_SSH_CONFIRMATION_CORRUPTED");
    var policyResult = await connection.SendingPolicy("apply", token: preview["token"]!.ToString(), confirmation: "إيقاف الردود");
    if (policyResult["enabled"]?.GetValue<bool>() != false || (await probe.Send("GET", "/v1/whatsapp/sending-policy"))["enabled"]?.GetValue<bool>() != false) throw new InvalidOperationException("POLICY_RESULT_UNVERIFIED");
    Console.WriteLine("PASS: Windows to SSH/root control Arabic preview and single-use reauth apply; false-to-false no-op, no sending activation or provider call.");
    return;
}
if (args.Length == 2 && args[0] == "--security-acceptance") { await SecurityAcceptance.Run(args[1]); return; }
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
await SshEncodingChecks.Run();
await ClientReliabilityChecks.Run();
ChangeFeedChecks.Run();
WorkspaceViewChecks.Run();
NotificationSessionChecks.Run();
ActionFlowChecks.Run();
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
