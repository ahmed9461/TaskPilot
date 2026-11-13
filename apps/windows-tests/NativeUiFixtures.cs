using System.Text.Json.Nodes;
using TaskPilot_Windows;

static class NativeUiFixtures
{
    public static async Task Change()
    {
        await using var connection = await SshConnection.Connect("New-VPS");
        using var api = new ApiClient(); api.Configure(connection.Address,connection.Token,connection.ExpiresAt);
        var account=(await api.Send("GET","/v1/accounts?namespace=synthetic-ui-acceptance&search=synthetic-ui-051")).AsArray().Single(n=>n?["username_normalized"]?.ToString()=="synthetic-ui-051")!;
        await api.Send("PATCH","/v1/accounts/"+account["id"],new {version=account["version"]!.GetValue<int>(),displayName="حساب قبول الواجهة 0.5.1"});
        Console.WriteLine("PASS: synthetic UI change event emitted; no live provider call.");
    }
    public static async Task Seed(bool extended = false)
    {
        await using var connection = await SshConnection.Connect("New-VPS");
        using var api = new ApiClient();
        api.Configure(connection.Address, connection.Token, connection.ExpiresAt);
        static string S(JsonNode n, string key) => n[key]!.ToString();
        const string ns = "synthetic-ui-acceptance";
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var session = await api.Send("POST", "/v1/sessions", new
        {
            label = "قبول واجهة 0.5.1 " + suffix
        });
        var task = await api.Send("POST", "/v1/task-types", new
        {
            code = "synthetic-ui-" + suffix,
            name = "مهمة قبول الواجهة 0.5.1"
        });
        var group = await api.Send("POST", "/v1/groups", new
        {
            sessionId = S(session, "id"),
            taskTypeId = S(task, "id"),
            externalGroupId = "synthetic-ui-" + suffix,
            title = "مجموعة قبول الواجهة 0.5.1 " + suffix,
            @namespace = ns,
            periodKey = "synthetic-2026-051"
        });
        await api.Send("POST", "/v1/reply-templates", new
        {
            code = "synthetic-ui-" + suffix,
            body = "تمت {taskName} ✅"
        });
        await api.Send("POST", "/v1/mock/messages", new
        {
            sessionId = S(session, "id"),
            groupId = S(group, "id"),
            externalMessageId = "synthetic-ui-message-" + suffix,
            text = "الاسم: حساب قبول الواجهة 0.5.1\nاليوزر: synthetic-ui-051"
        });
        if (extended)
        {
            var second = await api.Send("POST", "/v1/groups", new { sessionId = S(session,"id"), taskTypeId = S(task,"id"), externalGroupId = "synthetic-ui-extra-" + suffix, title = "مصدر اختبار إضافي " + suffix, @namespace = ns, periodKey = "synthetic-2026-051" });
            await api.Send("POST", "/v1/mock/messages", new { sessionId = S(session,"id"), groupId = S(second,"id"), externalMessageId = "synthetic-ui-second-" + suffix, text = "الاسم: حساب قبول الواجهة 0.5.1\nاليوزر: synthetic-ui-051" });
            await api.Send("POST", "/v1/mock/messages", new { sessionId = S(session,"id"), groupId = S(group,"id"), externalMessageId = "synthetic-ui-review-" + suffix, text = "اليوزر: synthetic-ui-review-051\nنص اختبار مراجعة وهمي" });
            var account = (await api.Send("GET","/v1/accounts?namespace="+ns+"&search=synthetic-ui-051")).AsArray().Single(n=>n?["username_normalized"]?.ToString()=="synthetic-ui-051")!;
            await api.Send("POST","/v1/issue-flags",new {accountId=S(account,"id"),kind="UNVERIFIED_CREDENTIALS",evidenceKind="UNVERIFIED"});
        }
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new
        {
            fixture = "SEEDED",
            fixtureNamespace = ns,
            task = "مهمة قبول الواجهة 0.5.1",
            realSending = false,
            secrets = false,
            extended
        }));
    }
}
