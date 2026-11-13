using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using TaskPilot_Windows;

static class WhatsAppReceiveAcceptance
{
    private const string Scope = "whatsapp-test-acceptance";
    private const string TaskCode = "owner-test-receive-v1";
    private const string Period = "pilot-receive-v1";
    private static string S(JsonNode? n, string key) => n?[key]?.ToString() ?? "";
    private static string Title(string s) => s.Trim().Normalize(NormalizationForm.FormKC);

    // Explicit owner-selected receive-only operator mode. Never prints group/session IDs,
    // other memberships, raw messages or credentials; never invokes an outbound endpoint.
    public static async Task Run(bool bind, string title)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Length > 200 || title.Any(char.IsControl))
            throw new InvalidOperationException("EXACT_TEST_GROUP_TITLE_REQUIRED");
        await using var connection = await SshConnection.Connect("New-VPS");
        using var api = new ApiClient();
        api.Configure(connection.Address, connection.Token, connection.ExpiresAt);
        var capabilities = await api.Send("GET", "/v1/whatsapp/capabilities");
        if (capabilities["connectionEnabled"]?.GetValue<bool>() != true || capabilities["sendingEnabled"]?.GetValue<bool>() != false)
            throw new InvalidOperationException("RECEIVE_ONLY_POLICY_REQUIRED");
        var sessions = (await api.Send("GET", "/v1/sessions")).AsArray();
        var candidates = sessions.Where(s => S(s,"provider") == "baileys" && S(s,"label") == "TaskPilot الشخصي").ToArray();
        if (candidates.Length != 1 || S(candidates[0],"status") != "CONNECTED")
            throw new InvalidOperationException("CONNECTED_PERSONAL_SESSION_REQUIRED");
        var sessionId = S(candidates[0],"id");
        var groups = (await api.Send("GET", "/v1/groups")).AsArray();
        if (groups.Count >= 500) throw new InvalidOperationException("GROUP_INVENTORY_LIMIT");
        var liveIds = sessions.Where(s => S(s,"provider") == "baileys").Select(s => S(s,"id")).ToHashSet();
        var liveGroups = groups.Where(g => liveIds.Contains(S(g,"session_id"))).ToArray();
        JsonNode? group;
        if (bind)
        {
            var discovered = (await api.Send("POST", $"/v1/sessions/{sessionId}/available-groups", new {}, await connection.Reauthorize())).AsArray();
            var matches = discovered.Where(g => Title(S(g,"title")) == Title(title)).ToArray();
            if (matches.Length != 1)
            {
                Console.WriteLine(JsonSerializer.Serialize(new {lookup = "NO_UNIQUE_MATCH", discoveredGroups = discovered.Count, exactTitleMatches = matches.Length, groupMetadataExported = false}));
                throw new InvalidOperationException(matches.Length == 0 ? "TEST_GROUP_NOT_FOUND" : "TEST_GROUP_TITLE_AMBIGUOUS");
            }
            var external = S(matches[0],"externalGroupId");
            if (liveGroups.Any(g => S(g,"session_id") != sessionId || S(g,"external_group_id") != external))
                throw new InvalidOperationException("UNEXPECTED_LIVE_GROUP_BINDING");
            var tasks = (await api.Send("GET", "/v1/task-types")).AsArray();
            if (tasks.Count >= 100) throw new InvalidOperationException("TASK_INVENTORY_LIMIT");
            var selected = tasks.Where(t => S(t,"code") == TaskCode).ToArray();
            if (selected.Length > 1) throw new InvalidOperationException("TEST_TASK_AMBIGUOUS");
            var task = selected.SingleOrDefault() ?? await api.Send("POST", "/v1/task-types", new { code = TaskCode, name = "مهمة اختبار الاستقبال" });
            group = liveGroups.SingleOrDefault();
            if (group is null)
                group = await api.Send("POST", "/v1/groups", new {sessionId, externalGroupId = external, title = S(matches[0],"title"), taskTypeId = S(task,"id"), @namespace = Scope, periodKey = Period}, await connection.Reauthorize());
            if (S(group,"namespace") != Scope || S(group,"task_type_id") != S(task,"id") || S(group,"period_key") != Period || group["enabled"]?.GetValue<bool>() != true)
                throw new InvalidOperationException("TEST_GROUP_SCOPE_MISMATCH");
        }
        else
        {
            if (liveGroups.Length != 1) throw new InvalidOperationException("ONE_BOUND_TEST_GROUP_REQUIRED");
            group = liveGroups[0] ?? throw new InvalidOperationException("TEST_GROUP_SCOPE_MISMATCH");
            if (S(group,"session_id") != sessionId || Title(S(group,"title")) != Title(title) || S(group,"namespace") != Scope || S(group,"period_key") != Period || group["enabled"]?.GetValue<bool>() != true)
                throw new InvalidOperationException("TEST_GROUP_SCOPE_MISMATCH");
        }
        var groupId = S(group,"id");
        var accounts = await api.Send("GET", $"/v1/accounts?namespace={Scope}&page=true&limit=100");
        var assignments = await api.Send("GET", $"/v1/assignments?namespace={Scope}&groupId={groupId}&page=true&limit=100");
        var review = await api.Send("GET", $"/v1/inbox?groupId={groupId}&page=true&limit=100");
        var sources = assignments["items"]!.AsArray().SelectMany(a => a?["sources"]?.AsArray() ?? new JsonArray()).Select(s => S(s,"id")).Distinct().Count();
        var diagnostics = await api.Send("GET", $"/v1/sessions/{sessionId}/receive-diagnostics");
        Console.WriteLine(JsonSerializer.Serialize(new {
            operation = bind ? "BOUND_RECEIVE_ONLY" : "RECEIVE_STATUS",
            status = S(candidates[0],"status"), sendingEnabled = false,
            monitoredLiveGroups = 1, testNamespace = Scope,
            accounts = accounts["total"]!.GetValue<int>(), assignments = assignments["total"]!.GetValue<int>(),
            processedLinkedSources = sources, reviewMessages = review["total"]!.GetValue<int>(),
            receiveDiagnostics = diagnostics,
            groupMetadataExported = false, outboundEndpointInvoked = false
        }));
    }
}
