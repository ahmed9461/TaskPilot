using System.Text.Json.Nodes;
using TaskPilot_Windows;
static class ExtendedNativeFixtures
{
    public static async Task Seed()
    {
        await using var c=await SshConnection.Connect("New-VPS"); using var api=new ApiClient();api.Configure(c.Address,c.Token,c.ExpiresAt);
        static string S(JsonNode n,string k)=>n[k]!.ToString();
        const string ns="synthetic-ui-acceptance";
        var prior=(await api.Send("GET","/v1/accounts?namespace="+ns)).AsArray();if(prior.Count>0)throw new InvalidOperationException("EXISTING_SYNTHETIC_FIXTURE_REQUIRES_REVIEW");
        var suffix=Guid.NewGuid().ToString("N")[..8];
        var session=await api.Send("POST","/v1/sessions",new {label="اختبار الواجهة الشامل "+suffix});
        var ta=await api.Send("POST","/v1/task-types",new {code="native-a-"+suffix,name="اختبار المهمة أ"});
        var tb=await api.Send("POST","/v1/task-types",new {code="native-b-"+suffix,name="اختبار المهمة ب"});
        async Task<JsonNode> Group(string code,string title,JsonNode task)=>await api.Send("POST","/v1/groups",new {sessionId=S(session,"id"),taskTypeId=S(task,"id"),externalGroupId="native-"+code+"-"+suffix,title,@namespace=ns,periodKey="native-070"});
        var ga=await Group("a","مصدر الواجهة أ",ta);var gb=await Group("b","مصدر الواجهة ب",ta);var gc=await Group("c","المهمة الثانية",tb);
        foreach(var (group,letter) in new[]{(ga,"a"),(gb,"b")})await api.Send("POST","/v1/reply-templates",new {code="native-only-"+letter+"-"+suffix,body="رد الواجهة "+letter+" {taskName}",groupId=S(group,"id"),taskTypeId=S(ta,"id"),enabled=true});
        async Task Message(JsonNode group,string key,string user,string name)=>await api.Send("POST","/v1/mock/messages",new {sessionId=S(session,"id"),groupId=S(group,"id"),externalMessageId="native-"+key+"-"+suffix,text="الاسم: "+name+"\nاليوزر: "+user});
        await Message(ga,"alpha-a","synthetic-ui-051","اختبار ألفا");await Message(gb,"alpha-b","synthetic-ui-051","اختبار ألفا");await Message(gc,"alpha-c","synthetic-ui-051","اختبار ألفا");
        await Message(ga,"beta","native-beta-070","اختبار بيتا");await Message(ga,"delete","native-delete-070","اختبار الحذف الوهمي");
        for(var i=0;i<50;i++)await Message(ga,"page-"+i,"native-page-"+i.ToString("D2"),"اختبار صفحة "+i.ToString("D2"));
        Console.WriteLine("PASS:53 synthetic accounts/54 assignments/55 sources, two scoped source templates; mock only, no secret or live send.");
    }
}
