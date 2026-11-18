using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System.Globalization;
using System.Text.Json.Nodes;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private async Task WorkflowsMenu()
    {
        var choice = Choice("الإجراء", [
            ("triage", "فرز صندوق المراجعة"), ("briefing", "تقرير نهاية اليوم"),
            ("work", "إنشاء تكليفات لمجموعة"), ("replies", "تجهيز ردود المكتمل"),
            ("rule", "تجربة قاعدة للمجموعة"), ("note", "ملاحظة وتذكير على مهمة"),
            ("followup", "متابعة الحساب المحدد")]);
        if (!await Dialog("إجراءات العمل", choice, "فتح الإجراء")) return;
        switch (Selected(choice))
        {
            case "triage": await WorkBriefing(true); break;
            case "briefing": await WorkBriefing(false); break;
            case "work": await CreateGroupTasks(); break;
            case "replies": await ReplyBatch(completedOnly: true); break;
            case "rule": await TryRoutingRule(); break;
            case "note": await ChooseTaskNote(); break;
            case "followup":
                if (assistantFocus is string accountId) await FollowupAccount(accountId);
                else await AssistantNotice("متابعة الحساب", "ابحث عن الحساب وحدّده أولًا.");
                break;
        }
    }

    private ComboBox WorkGroupPicker(JsonArray groups) =>
        Choice("المجموعة", [("", "اختر المجموعة"), ..groups.Where(g => g?["enabled"]?.GetValue<bool>() == true)
            .Select(g => (V(g, "id"), V(g, "title") + " • " + V(g, "period_key")))], assistantGroup ?? "");

    private async Task CreateGroupTasks()
    {
        var groupsRead = api.Send("GET", "/v1/groups");
        var typesRead = api.Send("GET", "/v1/task-types");
        await Task.WhenAll(groupsRead, typesRead);
        var group = WorkGroupPicker((await groupsRead).AsArray());
        var type = Choice("نوع المهمة", (await typesRead).AsArray().Select(row => (V(row, "id"), V(row, "name"))));
        var title = Field("عنوان التكليف، مثل مناقشة الأسبوع ٢");
        title.MaxLength = 160;
        var today = new CheckBox { Content = "حسابات استلمتها اليوم فقط", IsChecked = true };
        if (!await Dialog("إنشاء تكليفات لمجموعة", Stack(group, type, title, today), "عرض المعاينة",
            () => Selected(group) == "" || Selected(type) == "" || title.Text.Trim() == "" ? "حدّد المجموعة ونوع المهمة واكتب عنوان التكليف." : null))
            return;
        var preview = await api.Send("POST", "/v1/workflows/tasks/preview",
            new { groupId = Selected(group), taskTypeId = Selected(type), activity = title.Text, todayOnly = today.IsChecked == true });
        var rows = preview["targets"]!.AsArray();
        var pending = rows.Where(item => item?["existing"]?.GetValue<bool>() == false).ToArray();
        var scope = preview["group"];
        var summary = $"«{V(scope, "title")}» • {V(scope, "task_name")} • {V(scope, "period_key")}\n{title.Text.Trim()}\n{pending.Length} تكليف جديد • {rows.Count - pending.Length} مسجل مسبقًا";
        if (pending.Length == 0) { await AssistantNotice("معاينة التكليفات", summary); return; }
        var names = Text(string.Join("\n", pending.Select(row => V(row, "display_name"))));
        var reauth = ReauthField();
        try
        {
            if (!await Dialog("معاينة التكليفات", Stack(Text(summary), new ScrollViewer { Content = names, MaxHeight = 190 }, reauth), "إنشاء التكليفات"))
                return;
            var result = await api.Send("POST", "/v1/workflows/tasks/apply", new { approvalToken = V(preview, "approvalToken") }, await Reauth(reauth.Password));
            await AssistantNotice("أضيفت التكليفات", $"عدد التكليفات الجديدة {V(result, "created")}.");
        }
        finally { reauth.Password = ""; }
    }

    private async Task WorkBriefing(bool triage)
    {
        var data = await api.Send("GET", "/v1/workflows/briefing" + (assistantGroup is null ? "" : "?groupId=" + assistantGroup));
        var inbox = data["inbox"];
        var summary = $"الوارد للمراجعة {V(inbox, "total")}\nمجمّع من رسائل {V(inbox, "combined")} • اقتراح AI جاهز {V(inbox, "suggested")}\nتعارض اعتماد {V(inbox, "credential_conflict")} • توجيه ملتبس {V(inbox, "routing")}";
        var details = Stack(Text(summary));
        if (!triage)
        {
            var task = data["task"];
            details.Children.Add(Text($"مكتمل اليوم {V(task, "completed")} • مفتوح {V(task, "open")} • مكتمل اليوم بلا رد محسوم أو جارٍ {V(task, "without_reply")}"));
            var top = data["first"]!.AsArray();
            if (top.Count > 0) details.Children.Add(Text("ابدأ بهذه المهام\n" +
                string.Join("\n", top.Select(row => $"{ActivityTaskLabel(row)} • {V(row, "display_name")} • أولوية {V(row, "priority")}"))));
        }
        if (await Dialog(triage ? "فرز المراجعة" : "تقرير العمل بتوقيت الرياض",
            new ScrollViewer { Content = details, MaxHeight = 360 }, triage ? "فتح المراجعة" : "فتح المهام"))
        {
            var section = triage ? "inbox" : "assignments";
            filters[section] = assistantGroup is null ? new() : new() { ["groupId"] = assistantGroup };
            offsets[section] = 0;
            currentViewBuiltAt = DateTimeOffset.MinValue;
            await OpenSection(section);
        }
    }

    private async Task TryRoutingRule()
    {
        var groupsRead = api.Send("GET", "/v1/groups");
        var typesRead = api.Send("GET", "/v1/task-types");
        await Task.WhenAll(groupsRead, typesRead);
        var group = WorkGroupPicker((await groupsRead).AsArray());
        var type = Choice("المهمة التي ستنشئها القاعدة", (await typesRead).AsArray().Select(row => (V(row, "id"), V(row, "name"))));
        var keywords = Field("الكلمات المطابقة، افصل بينها بفاصلة");
        var priority = new NumberBox { Header = "أولوية القاعدة", Minimum = 0, Maximum = 100, Value = 50 };
        var examples = new TextBox { Header = "أمثلة اختبارية، كل مثال في سطر", AcceptsReturn = true, Height = 90, MaxLength = 5000 };
        var split = StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries;
        if (!await Dialog("تجربة قاعدة مجموعة", Stack(group, type, keywords, priority, examples), "جرّب القاعدة",
            () => Selected(group) == "" || Selected(type) == "" || keywords.Text.Trim() == "" || examples.Text.Trim() == "" ||
                !double.IsFinite(priority.Value) || priority.Value != Math.Truncate(priority.Value) ? "أكمل بيانات القاعدة وأمثلة الاختبار." : null))
            return;
        var groupId = Selected(group);
        var values = keywords.Text.Split(new[] { ',', '،' }, split);
        var cases = examples.Text.Split(new[] { '\r', '\n' }, split);
        var taskTypeId = Selected(type);
        var result = await api.Send("POST", $"/v1/groups/{groupId}/rules/simulate", new { taskTypeId, keywords = values, priority = (int)priority.Value, examples = cases });
        string Route(JsonNode? route) => route?["ambiguous"]?.GetValue<bool>() == true
            ? "أكثر من قاعدة بنفس الأولوية" : V(route, "name") + " • أولوية " + V(route, "priority");
        var lines = result["items"]!.AsArray().Select((row, i) =>
            $"{i + 1}. {cases[i]}\nقبل {Route(row?["before"])}\nبعد {Route(row?["after"])}");
        if (!await Dialog("نتيجة تجربة القاعدة", new ScrollViewer { MaxHeight = 275, Content = Text(string.Join("\n\n", lines)) }, "إضافة القاعدة"))
            return;
        await api.Send("POST", $"/v1/groups/{groupId}/rules", new
        {
            groupVersion = result["groupVersion"]!.GetValue<int>(),
            updates = Array.Empty<object>(),
            create = new { taskTypeId, keywords = values, priority = (int)priority.Value }
        });
        await AssistantNotice("أُضيفت القاعدة", "تُطبّق على الرسائل الجديدة في المجموعة.");
    }

    private async Task ChooseTaskNote(string request = "")
    {
        var query = assistantFocus is string accountId ? "&accountId=" + accountId : "";
        if (assistantGroup is string groupId) query += "&groupId=" + groupId;
        var rows = (await api.Send("GET", "/v1/assignments?limit=100&archived=active" + query)).AsArray();
        if (rows.Count == 0) { await AssistantNotice("اختيار مهمة", "لا توجد مهام في النطاق المحدد."); return; }
        var choice = Choice("المهمة", rows.Select(row => (V(row, "id"), V(row, "display_name") + " • " + ActivityTaskLabel(row))));
        if (await Dialog("ملاحظة وتذكير على مهمة", choice, "متابعة"))
            await TaskNote(Selected(choice), request);
    }

    private async Task TaskNote(string assignmentId, string request = "")
    {
        var path = $"/v1/assignments/{assignmentId}/note";
        var reauth = ReauthField();
        try
        {
            if (reauth.Visibility == Visibility.Visible && !await Dialog("فتح ملاحظة المهمة", reauth, "فتح")) return;
            var item = await api.Send("POST", path + "/read", new { }, await Reauth(reauth.Password));
            reauth.Password = "";
            var prefill = System.Text.RegularExpressions.Regex.Match(request, @"^سج(?:ّ)?ل ملاحظة\s*[:：]?\s*(?<note>.+?)(?:\s+وذك(?:ّ)?رني.*)?$");
            var existing = V(item, "note");
            var suggestedNote = prefill.Success ? prefill.Groups["note"].Value.Trim() : "";
            var note = new TextBox { Header = "ملاحظة العمل", Text = suggestedNote != "" ? (existing == "" ? suggestedNote : existing + "\n" + suggestedNote) : existing, AcceptsReturn = true, Height = 95, MaxLength = 2000, TextWrapping = TextWrapping.Wrap };
            var riyadh = TimeSpan.FromHours(3);
            var scheduled = DateTimeOffset.TryParse(V(item, "due_at"), out var date);
            var local = scheduled ? date.ToOffset(riyadh) : DateTimeOffset.UtcNow.ToOffset(riyadh).AddDays(1);
            var suggested = request.Contains("بكرة") || request.Contains("غد");
            var on = new CheckBox { Content = "تفعيل تذكير بتوقيت الرياض", IsChecked = scheduled || request.Contains("ذكرني") || request.Contains("ذكّرني") };
            var day = new CalendarDatePicker { Header = "التاريخ", Date = local };
            var time = new TimePicker { Header = "الوقت", Time = scheduled ? local.TimeOfDay : TimeSpan.FromHours(9), ClockIdentifier = "24HourClock" };
            if (V(item, "fired_at") != "") on.Content = "التذكير السابق ظهر في الإشعارات";
            if (suggested) day.Date = DateTimeOffset.UtcNow.ToOffset(riyadh).AddDays(1);
            var hour = System.Text.RegularExpressions.Regex.Match(request, @"الساعة\s+(?<hour>[0-9٠-٩]{1,2})(?:[:٫](?<minute>[0-9٠-٩]{2}))?");
            int Number(string input) => int.TryParse(new string(input.Select(ch => ch >= '٠' && ch <= '٩' ? (char)('0' + ch - '٠') : ch).ToArray()), out var value) ? value : 0;
            if (hour.Success && Number(hour.Groups["hour"].Value) < 24 && Number(hour.Groups["minute"].Value) < 60)
                time.Time = new TimeSpan(Number(hour.Groups["hour"].Value), Number(hour.Groups["minute"].Value), 0);
            var inputs = Stack(Text(V(item, "display_name") + " • " + ActivityTaskLabel(item)), note, on, day, time, reauth);
            if (!await Dialog("ملاحظة وتذكير", inputs, "حفظ", () =>
                on.IsChecked == true && day.Date is null ? "حدّد تاريخ التذكير." : null))
                return;
            DateTimeOffset? dueAt = on.IsChecked == true && day.Date is DateTimeOffset selectedDay
                ? new DateTimeOffset(selectedDay.Date + time.Time, riyadh) : null;
            if (dueAt is not null && !hour.Success && scheduled && dueAt.Value.ToOffset(riyadh).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) ==
                date.ToOffset(riyadh).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)) dueAt = date;
            await api.Send("PUT", path, new { note = note.Text, dueAt, version = Ver(item) }, await Reauth(reauth.Password));
            note.Text = "";
            await AssistantNotice("حُفظت الملاحظة", dueAt is null ? "حُفظت إعدادات المهمة." : $"موعد التذكير {dueAt:yyyy-MM-dd HH:mm} بتوقيت الرياض.");
        }
        finally { reauth.Password = ""; }
    }

    private async Task OpenReminderAssignment(string assignmentId)
    {
        filters["assignments"] = new() { ["assignmentId"] = assignmentId };
        offsets["assignments"] = 0;
        currentViewBuiltAt = DateTimeOffset.MinValue;
        await OpenSection("assignments");
    }
}
