using System.Text.Json.Nodes;
using TaskPilot_Windows;

static class ServerAcceptance
{
    private static string S(JsonNode? n,string key)=>n?[key]?.ToString()??"";
    private static void Check(bool value){if(!value)throw new InvalidOperationException("ACCEPTANCE_ASSERTION_FAILED");}
    public static async Task Run(string alias)
    {
        var stage="ssh";var checks=0;
        await using var connection=await SshConnection.Connect(alias);
        using var api=new ApiClient();api.Configure(connection.Address,connection.Token);
        async Task<JsonNode> Call(string method,string path,object? payload=null,bool sensitive=false)=>await api.Send(method,path,payload,sensitive?await connection.Reauthorize():null);
        var suffix=Guid.NewGuid().ToString("N")[..10];var ns="synthetic-acceptance-"+suffix;var user="e2e-"+suffix;
        try
        {
            stage="authenticated-read";Check(S(await Call("GET","/ready"),"status")=="ready");Check((await Call("GET","/v1/me"))["liveSendingEnabled"]!.GetValue<bool>()==false);checks+=2;
            stage="setup";var session=await Call("POST","/v1/sessions",new{label=ns});var task=await Call("POST","/v1/task-types",new{code=ns,name="مهمة قبول Windows"});
            var group=await Call("POST","/v1/groups",new{sessionId=S(session,"id"),taskTypeId=S(task,"id"),externalGroupId=ns,title="مجموعة قبول وهمية",@namespace=ns,periodKey="2026-test"});
            var template=await Call("POST","/v1/reply-templates",new{code=ns,body="تمت {taskName} ✅"});
            var routedType=await Call("POST","/v1/task-types",new{code=ns+"-route",name="مهمة ذات أولوية"});
            await Call("POST","/v1/group-rules",new{groupId=S(group,"id"),taskTypeId=S(routedType,"id"),keywords=new[]{"مهمةاختبار"},priority=70});
            var message=new{sessionId=S(session,"id"),groupId=S(group,"id"),externalMessageId=ns+"-1",text=$"الاسم: حساب قبول Windows\nاليوزر: {user}\nكلمة المرور: synthetic-canary"};
            stage="ingest-replay";await Call("POST","/v1/mock/messages",message);Check((await Call("POST","/v1/mock/messages",message))["duplicate"]!.GetValue<bool>());checks++;
            var account=(await Call("GET","/v1/accounts?search="+user)).AsArray().Single()!;Check(!account.ToJsonString().Contains("synthetic-canary"));checks++;
            var page=await Call("GET","/v1/accounts?page=true&namespace="+ns+"&limit=1");Check(page["total"]!.GetValue<int>()==1);checks++;
            stage="reveal-update";Check(S(await Call("POST","/v1/accounts/"+S(account,"id")+"/reveal",new{},true),"password")=="synthetic-canary");checks++;
            account=await Call("PATCH","/v1/accounts/"+S(account,"id"),new{version=account["version"]!.GetValue<int>(),displayName="حساب قبول معدل",password="synthetic-updated"},true);
            stage="inbox-review";var review=await Call("POST","/v1/mock/messages",new{sessionId=S(session,"id"),groupId=S(group,"id"),externalMessageId=ns+"-review",text="user: "+user+"-review"});
            Check(S(await Call("POST","/v1/inbox/"+S(review,"id")+"/reveal",new{},true),"text").Contains(user));checks++;
            var inbox=(await Call("GET","/v1/inbox?limit=500")).AsArray().Single(x=>S(x,"id")==S(review,"id"))!;
            await Call("POST","/v1/inbox/"+S(review,"id")+"/resolve",new{version=inbox["version"]!.GetValue<int>(),account=new{@namespace=ns,username=user+"-review",displayName="حساب مراجعة وهمي"}},true);checks++;
            stage="task-completion";var assignment=(await Call("GET","/v1/assignments?search="+user)).AsArray().Single(x=>S(x,"account_id")==S(account,"id"))!;
            await Call("PATCH","/v1/assignments/"+S(assignment,"id")+"/status",new{version=assignment["version"]!.GetValue<int>(),status="COMPLETED"});
            Check(!(await Call("GET","/v1/reply-jobs")).AsArray().Any(j=>S(j,"assignment_id")==S(assignment,"id")));checks++;
            var filtered=await Call("GET",$"/v1/assignments?page=true&sessionId={S(session,"id")}&groupId={S(group,"id")}&taskTypeId={S(routedType,"id")}&status=COMPLETED&minPriority=70");Check(filtered["total"]!.GetValue<int>()==1);checks++;
            stage="quoted-mock-reply";var preview=await Call("POST","/v1/reply-jobs/preview",new{assignmentId=S(assignment,"id"),sourceMessageId=S(assignment["sources"]!.AsArray()[0],"id"),templateId=S(template,"id")});
            Check(S(preview,"sessionId")==S(session,"id")&&S(preview,"groupId")==S(group,"id"));checks++;
            var job=await Call("POST","/v1/reply-jobs/approve",new{approvalToken=S(preview,"approvalToken"),idempotencyKey=ns},true);
            for(var i=0;i<20;i++){job=(await Call("GET","/v1/reply-jobs")).AsArray().Single(j=>S(j,"id")==S(job,"id"))!;if(S(job,"status")=="SENT")break;await Task.Delay(500);}
            Check(S(job,"status")=="SENT"&&S(job,"provider_message_id").StartsWith("mock:"));checks++;
            stage="archive-restore";account=(await Call("GET","/v1/accounts?search="+user)).AsArray().Single(a=>S(a,"id")==S(account,"id"))!;
            account=await Call("POST","/v1/accounts/"+S(account,"id")+"/archive",new{version=account["version"]!.GetValue<int>()});Check(S(account,"archived_at")!="");
            account=await Call("POST","/v1/accounts/"+S(account,"id")+"/restore",new{version=account["version"]!.GetValue<int>()});Check(S(account,"archived_at")=="");checks+=2;
            stage="verified-flag";await Call("POST","/v1/issue-flags",new{accountId=S(account,"id"),kind="INVALID_ACCOUNT_CODE",evidenceKind="MANUAL"},true);checks++;
            stage="filtered-export";var report=await Call("POST","/v1/reports/export",new{resource="accounts",query=new{@namespace=ns,limit=1}},true);Check(report["rowsCount"]!.GetValue<int>()==1&&!S(report,"content").Contains("synthetic-updated"));checks++;
            stage="task-only-purge";var taskDeletion=await Call("POST","/v1/assignments/"+S(assignment,"id")+"/deletion-preview",new{});Check((await Call("POST","/v1/assignments/"+S(assignment,"id")+"/delete",new{approvalToken=S(taskDeletion,"approvalToken"),confirmation="DELETE TASK"},true))["accountPreserved"]!.GetValue<bool>());Check((await Call("GET","/v1/accounts?search="+user)).AsArray().Count==2);checks++;
            stage="scoped-cleanup";var ids=(await Call("GET","/v1/accounts?search="+user)).AsArray().Where(a=>S(a,"namespace")==ns).Select(a=>S(a,"id")).ToArray();Check(ids.Length==2);
            var deletion=await Call("POST","/v1/deletions/preview",new{ids});var result=await Call("POST","/v1/deletions/confirm",new{approvalToken=S(deletion,"approvalToken"),confirmation=S(deletion,"confirmation")},true);Check(result["deleted"]!.GetValue<int>()==2);checks++;
            stage="revocation";await Call("POST","/v1/client-session/revoke",new{});try{await Call("GET","/v1/me");throw new Exception("REVOKED_TOKEN_ACCEPTED");}catch(InvalidOperationException e){Check(e.Message=="PERMISSION_DENIED");}checks++;
            Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new{status="PASS",checks,transport="Windows C# ApiClient -> SSH -> New-VPS pilot API",fixtureNamespace=ns,realSending=false,permanentKeyExported=false}));
        }
        catch{Console.Error.WriteLine("SERVER_ACCEPTANCE_FAILED: "+stage);throw new InvalidOperationException("SERVER_ACCEPTANCE_FAILED");}
    }
}
