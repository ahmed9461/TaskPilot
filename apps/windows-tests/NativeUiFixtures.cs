using System.Text.Json.Nodes;
using TaskPilot_Windows;

static class NativeUiFixtures
{
    public static async Task Seed()
    {
        await using var connection = await SshConnection.Connect("New-VPS");
        using var api = new ApiClient();
        api.Configure(connection.Address, connection.Token, connection.ExpiresAt);
        static string S(JsonNode n, string key) => n[key]!.ToString();
        const string ns = "synthetic-ui-acceptance";
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var session = await api.Send("POST", "/v1/sessions", new
        {
            label = "قبول واجهة 0.3 " + suffix
        });
        var task = await api.Send("POST", "/v1/task-types", new
        {
            code = "synthetic-ui-" + suffix,
            name = "مهمة قبول الواجهة 0.3"
        });
        var group = await api.Send("POST", "/v1/groups", new
        {
            sessionId = S(session, "id"),
            taskTypeId = S(task, "id"),
            externalGroupId = "synthetic-ui-" + suffix,
            title = "مجموعة قبول الواجهة 0.3 " + suffix,
            @namespace = ns,
            periodKey = "synthetic-2026-030"
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
            text = "الاسم: حساب قبول الواجهة 0.3\nاليوزر: synthetic-ui-030"
        });
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new
        {
            fixture = "SEEDED",
            fixtureNamespace = ns,
            task = "مهمة قبول الواجهة 0.3",
            realSending = false,
            secrets = false
        }));
    }
}
