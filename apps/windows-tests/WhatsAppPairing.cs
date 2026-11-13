using System.Text.Json.Nodes;
using TaskPilot_Windows;

static class WhatsAppPairing
{
    // Explicit operator mode only. Never fetches QR/auth values, groups from the provider or sends messages.
    public static async Task Run(bool begin)
    {
        await using var connection = await SshConnection.Connect("New-VPS");
        using var api = new ApiClient();
        api.Configure(connection.Address, connection.Token, connection.ExpiresAt);
        static string S(JsonNode? n, string key) => n?[key]?.ToString() ?? "";
        var capabilities = await api.Send("GET", "/v1/whatsapp/capabilities");
        if (capabilities["connectionEnabled"]?.GetValue<bool>() != true || capabilities["sendingEnabled"]?.GetValue<bool>() != false)
            throw new InvalidOperationException("PAIRING_ONLY_POLICY_REQUIRED");
        const string label = "TaskPilot الشخصي";
        var candidates = (await api.Send("GET", "/v1/sessions")).AsArray().Where(n => S(n,"label") == label && S(n,"provider") == "baileys").ToArray();
        if (candidates.Length > 1) throw new InvalidOperationException("AMBIGUOUS_PAIRING_SESSION");
        JsonNode session;
        if (candidates.Length == 0)
        {
            if (!begin) throw new InvalidOperationException("PAIRING_SESSION_NOT_STARTED");
            session = await api.Send("POST", "/v1/sessions", new { label, provider = "baileys" });
        }
        else session = candidates[0]!;
        var id = S(session,"id");
        var groupCount = (await api.Send("GET", "/v1/groups")).AsArray().Count(g => S(g,"session_id") == id);
        if (begin)
        {
            if (groupCount != 0) throw new InvalidOperationException("PAIRING_REQUIRES_UNBOUND_SESSION");
            await api.Send("POST", $"/v1/sessions/{id}/connect", new { confirmation = "CONNECT WHATSAPP", acknowledgeUnofficial = true }, await connection.Reauthorize());
            for (var n=0;n<20;n++)
            {
                session = (await api.Send("GET", "/v1/sessions")).AsArray().Single(s => S(s,"id") == id)!;
                if (S(session,"status") is "QR_AVAILABLE" or "CONNECTED" or "ERROR" or "REAUTH_REQUIRED") break;
                await Task.Delay(1000);
            }
        }
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new {
            pairingSessionId = id,
            status = S(session,"status"),
            errorCode = S(session,"last_error_code"),
            connectionEnabled = true,
            sendingEnabled = false,
            monitoredGroups = groupCount,
            qrOrSecretsExported = false
        }));
    }
}
