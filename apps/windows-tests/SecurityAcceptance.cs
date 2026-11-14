using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using TaskPilot_Windows;

// Bounded read/rejection checks. Never obtains reauth, previews a mutation, or sends a message.
static class SecurityAcceptance
{
    static void Check(bool condition) { if (!condition) throw new InvalidOperationException("SECURITY_ASSERTION_FAILED"); }
    public static async Task Run(string alias)
    {
        if (alias != "New-VPS") throw new InvalidOperationException("SCOPED_PILOT_REQUIRED");
        var stage = "ssh";
        var requests = 0;
        await using var connection = await SshConnection.Connect(alias);
        using var http = new HttpClient { BaseAddress = new Uri(connection.Address), Timeout = TimeSpan.FromSeconds(15) };
        async Task<(HttpStatusCode Status, JsonNode Body)> Send(string method, string path, string? bearer = null, string? body = null, string? grant = null, bool foreignOrigin = false, bool cookieOnly = false)
        {
            using var request = new HttpRequestMessage(new HttpMethod(method), path);
            if (bearer is not null) request.Headers.TryAddWithoutValidation("Authorization", "Bearer " + bearer);
            if (grant is not null) request.Headers.TryAddWithoutValidation("X-Reauth-Secret", grant);
            if (foreignOrigin) request.Headers.TryAddWithoutValidation("Origin", "https://synthetic-attacker.invalid");
            if (cookieOnly) request.Headers.TryAddWithoutValidation("Cookie", "TaskPilotSession=" + connection.Token);
            if (body is not null) request.Content = new StringContent(body, Encoding.UTF8, "application/json");
            using var response = await http.SendAsync(request);
            requests++;
            Check(response.Headers.CacheControl?.NoStore == true);
            Check(response.Headers.TryGetValues("X-Content-Type-Options", out var values) && values.Single() == "nosniff");
            Check(!response.Headers.Contains("Set-Cookie") && !response.Headers.Contains("Access-Control-Allow-Origin"));
            return (response.StatusCode, JsonNode.Parse(await response.Content.ReadAsStringAsync())!);
        }
        async Task Rejected(string method, string path, HttpStatusCode code, string error, string? bearer = null, string? body = null, string? grant = null)
        {
            var response = await Send(method, path, bearer, body, grant);
            Check(response.Status == code && response.Body.AsObject().Count == 1 && response.Body["code"]?.ToString() == error);
        }
        async Task<string> Snapshot()
        {
            var dashboard = await Send("GET", "/v1/dashboard", connection.Token);
            var operations = await Send("GET", "/v1/operations", connection.Token);
            Check(dashboard.Status == HttpStatusCode.OK && operations.Status == HttpStatusCode.OK);
            var counts = operations.Body["counts"]!;
            var selected = new JsonObject();
            foreach (var key in new[] { "approvedReplies", "sendingReplies", "unknownReplies", "enabledGroups", "pendingIngress", "failedIngress", "connectedSessions" })
                selected[key] = counts[key]!.DeepClone();
            return dashboard.Body.ToJsonString() + selected.ToJsonString();
        }
        try
        {
            stage = "preflight";
            var me = await Send("GET", "/v1/me", connection.Token);
            Check(me.Status == HttpStatusCode.OK && me.Body["liveConnectionEnabled"]!.GetValue<bool>() && !me.Body["liveSendingEnabled"]!.GetValue<bool>());
            var before = await Snapshot();
            stage = "anonymous-surface";
            var health = await Send("GET", "/health");
            Check(health.Status == HttpStatusCode.OK && health.Body["version"]?.ToString() == "0.8.0");
            foreach (var path in new[] { "/ready", "/v1/me", "/v1/accounts", "/v1/assignments", "/v1/inbox", "/v1/sessions", "/v1/groups", "/v1/privacy/retention", "/v1/privacy/runs", "/v1/operations", "/v1/notifications/state", "/v1/ai/config" })
                await Rejected("GET", path, HttpStatusCode.Unauthorized, "PERMISSION_DENIED");
            foreach (var path in new[] { "/v1/sessions", "/v1/privacy/retention-preview", "/v1/reports/export" })
                await Rejected("POST", path, HttpStatusCode.Unauthorized, "PERMISSION_DENIED", body: "{}");
            stage = "invalid-credentials";
            foreach (var token in new[] { "synthetic-invalid-token-000000000000000", new string('x', 257), connection.Token + "suffix" })
                await Rejected("GET", "/v1/accounts", HttpStatusCode.Unauthorized, "PERMISSION_DENIED", token);
            var cookie = await Send("GET", "/v1/me", cookieOnly: true);
            Check(cookie.Status == HttpStatusCode.Unauthorized && cookie.Body["code"]?.ToString() == "PERMISSION_DENIED");
            stage = "sensitive-reauth-boundary";
            var absent = Guid.NewGuid().ToString();
            foreach (var (method, path) in new[] {
                ("PATCH", "/v1/privacy/retention"), ("POST", "/v1/privacy/retention-execute"),
                ("POST", "/v1/privacy/forget-session"), ("POST", $"/v1/accounts/{absent}/reveal"),
                ("POST", "/v1/reports/export"), ("POST", $"/v1/sessions/{absent}/connect"),
                ("PATCH", "/v1/ai/config"), ("POST", $"/v1/inbox/{absent}/ai-suggestion") })
            {
                await Rejected(method, path, HttpStatusCode.Forbidden, "REAUTH_REQUIRED", connection.Token, "{}");
                await Rejected(method, path, HttpStatusCode.Forbidden, "REAUTH_REQUIRED", connection.Token, "{}", connection.Token);
            }
            stage = "bounded-queries";
            foreach (var query in new[] { "limit=501", "offset=-1", "search=" + new string('a', 201) })
                await Rejected("GET", "/v1/accounts?" + query, HttpStatusCode.BadRequest, "VALIDATION_ERROR", connection.Token);
            foreach (var query in new[] {
                "namespace=" + Uri.EscapeDataString("synthetic-' OR 1=1 --"),
                "search=" + Uri.EscapeDataString("' OR 1=1 --"),
                "search=" + Uri.EscapeDataString("%_\\") })
            {
                var result = await Send("GET", "/v1/accounts?page=true&" + query, connection.Token);
                Check(result.Status == HttpStatusCode.OK && result.Body["total"]!.GetValue<int>() == 0 && result.Body["items"]!.AsArray().Count == 0);
            }
            stage = "masked-reads";
            foreach (var resource in new[] { "accounts", "inbox", "sessions" })
            {
                var result = await Send("GET", "/v1/" + resource + "?limit=1", connection.Token);
                Check(result.Status == HttpStatusCode.OK);
                foreach (var row in result.Body.AsArray())
                    Check(!row!.AsObject().Any(p => new[] { "password", "ciphertext", "encrypted_payload", "encrypted_transport_key", "auth_epoch", "qr", "token_hash", "reauth_hash" }.Contains(p.Key)));
            }
            stage = "origin-and-body-boundaries";
            Check((await Send("GET", "/v1/me", connection.Token, foreignOrigin: true)).Status == HttpStatusCode.OK);
            var oversized = await Send("POST", "/v1/privacy/retention-preview", connection.Token, "{\"synthetic\":\"" + new string('x', 33000) + "\"}");
            Check(oversized.Status == HttpStatusCode.RequestEntityTooLarge);
            stage = "unchanged-business-state";
            Check(before == await Snapshot());
            stage = "owned-session-revocation";
            Check((await Send("POST", "/v1/client-session/revoke", connection.Token, "{}")).Status == HttpStatusCode.OK);
            await Rejected("GET", "/v1/me", HttpStatusCode.Unauthorized, "PERMISSION_DENIED", connection.Token);
            Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new {
                security = "PASS", requests, apiVersion = "0.8.0", businessCountsUnchanged = true,
                malformedOrSensitiveMutationsAccepted = 0, reauthGrantsIssued = 0,
                providerConnections = 0, outboundMessages = 0, aiRequests = 0,
                ownSessionRevoked = true, permanentKeyExported = false,
                scope = "bounded SSH/HTTP authentication, rejection, masking, headers, query/body limits; not a full penetration test"
            }));
        }
        catch { Console.Error.WriteLine("SECURITY_ACCEPTANCE_FAILED:" + stage); throw new InvalidOperationException("SECURITY_ACCEPTANCE_FAILED"); }
    }
}
