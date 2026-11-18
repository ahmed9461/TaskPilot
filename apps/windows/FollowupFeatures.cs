using Microsoft.UI.Xaml.Controls;
using System.Text.Json.Nodes;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private static string ActivityTaskLabel(JsonNode? row) =>
        V(row, "activity_label") == "" ? V(row, "task_name") : V(row, "task_name") + " — " + V(row, "activity_label");

    private async Task FollowupAccount(string accountId)
    {
        var path = $"/v1/accounts/{accountId}/followups";
        var groups = (await api.Send("GET", path))["items"]!.AsArray();
        if (groups.Count == 0)
        {
            await AssistantNotice("متابعة الحساب", "اربط الحساب بمصدر وارد في مجموعة مفعّلة أولًا.");
            return;
        }
        var group = Choice("المجموعة", groups.Select(g => (V(g, "id"), V(g, "title") +
            (g?["active"]?.GetValue<bool>() == true ? " • متابعة مفعّلة" : " • متابعة متوقفة"))));
        var activity = Choice("الإجراء", [("enable", "تفعيل المتابعة"), ("add", "إضافة نشاط مستقل"), ("pause", "إيقاف المتابعة")]);
        if (!await Dialog("متابعة الحساب", Stack(group, activity), "متابعة")) return;
        var target = groups.First(item => V(item, "id") == Selected(group));
        var groupId = V(target, "id");
        var operation = Selected(activity);
        if (operation != "add")
        {
            var active = operation == "enable";
            await api.Send("PATCH", path, new { groupId, active, version = Ver(target!) });
            await AssistantNotice("متابعة الحساب", active
                ? $"فُعّلت المتابعة في «{V(target, "title")}». يمكنك تسجيل نشاط مستقل لهذا الحساب كلما ظهر."
                : $"أُوقفت المتابعة في «{V(target, "title")}».");
            return;
        }
        if (target?["active"]?.GetValue<bool>() != true)
            throw new InvalidOperationException("FOLLOWUP_NOT_ACTIVE");
        var tasks = (await api.Send("GET", "/v1/task-types")).AsArray();
        var task = Choice("نوع المهمة", tasks.Select(t => (V(t, "id"), V(t, "name"))), V(target, "task_type_id"));
        var name = Field("عنوان النشاط، مثل واجب الأسبوع ٢");
        name.MaxLength = 160;
        var period = Field("الفترة", V(target, "period_key"));
        period.MaxLength = 120;
        if (!await Dialog("نشاط مستقل", Stack(task, name, period), "إنشاء التكليف",
            () => Selected(task) == "" || name.Text.Trim() == "" || period.Text.Trim() == "" ? "حدّد نوع المهمة والعنوان والفترة." : null))
            return;
        var result = await api.Send("POST", $"/v1/accounts/{accountId}/followup-activities",
            new { groupId, taskTypeId = Selected(task), activity = name.Text, periodKey = period.Text });
        await AssistantNotice("نشاط المتابعة", result["created"]?.GetValue<bool>() == true
            ? "أُنشئ تكليف مستقل للحساب." : "هذا النشاط مسجل بالفعل لهذه الفترة.");
        if (page == "account-details") await Render();
    }
}
