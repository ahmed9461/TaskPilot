using System.Text.Json;
using System.Text.Json.Nodes;
using TaskPilot_Windows;

static class WhatsAppQuotedAcceptance
{
    private static string S(JsonNode? n, string key) => n?[key]?.ToString() ?? "";
    private static void Require(bool condition) { if (!condition) throw new InvalidOperationException("SCOPED_QUOTED_TEST_ASSERTION_FAILED"); }
    public static async Task Run(string title)
    {
        await using var connection = await SshConnection.Connect("New-VPS");
        using var api = new ApiClient(); api.Configure(connection.Address,connection.Token,connection.ExpiresAt);
        var caps = await api.Send("GET","/v1/whatsapp/capabilities");
        Require(caps["connectionEnabled"]?.GetValue<bool>()==true && caps["sendingEnabled"]?.GetValue<bool>()==true);
        var sessions=(await api.Send("GET","/v1/sessions")).AsArray();
        var live=sessions.Where(s=>S(s,"provider")=="baileys").Select(s=>S(s,"id")).ToHashSet();
        var groups=(await api.Send("GET","/v1/groups")).AsArray(); Require(groups.Count<500);
        var enabled=groups.Where(g=>live.Contains(S(g,"session_id")) && g?["enabled"]?.GetValue<bool>()==true).ToArray();
        Require(enabled.Length==1);
        var group=enabled[0]!;var groupId=S(group,"id");var sessionId=S(group,"session_id");
        Require(S(group,"namespace")=="whatsapp-test-acceptance" && S(group,"period_key")=="pilot-receive-v1" && S(group,"title")==title);
        for(var i=0;i<30;i++)
        {
            var state=(await api.Send("GET","/v1/sessions")).AsArray().Single(s=>S(s,"id")==sessionId);
            if(S(state,"status")=="CONNECTED") break;
            Require(i<29);await Task.Delay(1000);
        }
        var accounts=(await api.Send("GET","/v1/accounts?namespace=whatsapp-test-acceptance&search=taskpilot-receive-001")).AsArray();
        var account=accounts.Single(a=>S(a,"namespace")=="whatsapp-test-acceptance" && S(a,"username_normalized")=="taskpilot-receive-001")!;
        var assignments=(await api.Send("GET",$"/v1/assignments?namespace=whatsapp-test-acceptance&groupId={groupId}&accountId={S(account,"id")}")).AsArray();
        Require(assignments.Count==1);var assignment=assignments[0]!;
        Require(S(assignment,"task_type_id")==S(group,"task_type_id") && S(assignment,"period_key")=="pilot-receive-v1");
        var sources=assignment["sources"]!.AsArray();Require(sources.Count==1);var source=sources[0]!;
        Require(S(source,"sessionId")==sessionId && S(source,"groupId")==groupId);
        const string code="owner-test-quoted-reply-v1", body="تم اختبار TaskPilot بنجاح ✅";
        var templates=(await api.Send("GET","/v1/reply-templates?search="+code)).AsArray();
        var template=templates.SingleOrDefault(t=>S(t,"code")==code) ?? await api.Send("POST","/v1/reply-templates",new{code,body,groupId,taskTypeId=S(group,"task_type_id")});
        Require(S(template,"body")==body && S(template,"group_id")==groupId && S(template,"task_type_id")==S(group,"task_type_id") && template["enabled"]?.GetValue<bool>()==true);
        var request=new {assignmentId=S(assignment,"id"),sourceMessageId=S(source,"id"),templateId=S(template,"id")};
        var preview=await api.Send("POST","/v1/reply-jobs/preview",request);
        Require(S(preview,"provider")=="baileys" && S(preview,"body")==body && S(preview,"sessionId")==sessionId && S(preview,"groupId")==groupId && S(preview,"externalMessageId")==S(source,"externalMessageId"));
        var key="owner-test-quoted-v1:"+S(source,"id");
        var job=await api.Send("POST","/v1/reply-jobs/approve",new {approvalToken=S(preview,"approvalToken"),idempotencyKey=key},await connection.Reauthorize());
        var again=await api.Send("POST","/v1/reply-jobs/preview",request);
        var replay=await api.Send("POST","/v1/reply-jobs/approve",new {approvalToken=S(again,"approvalToken"),idempotencyKey=key},await connection.Reauthorize());
        Require(S(replay,"id")==S(job,"id"));
        string status="";bool receipt=false;
        for(var i=0;i<30;i++)
        {
            var jobs=(await api.Send("GET","/v1/reply-jobs")).AsArray();Require(jobs.Count<500);
            var current=jobs.Single(j=>S(j,"id")==S(job,"id"))!;status=S(current,"status");receipt=!string.IsNullOrEmpty(S(current,"provider_message_id"));
            if(status is "SENT" or "FAILED" or "UNKNOWN_DELIVERY" or "CANCELED")break;
            await Task.Delay(1000);
        }
        Console.WriteLine(JsonSerializer.Serialize(new {quotedTestStatus=status,approvalReplaySameJob=true,providerAccepted=receipt,realTransport=true,recipientVisibility="VERIFY_SEPARATELY",automaticSendRetry=false,privateMetadataExported=false}));
        Require(status=="SENT" && receipt);
    }
}
