using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System.Text.Json.Nodes;
namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private static ComboBox ScopeChoice(string header, JsonArray rows, string label, string selected, string storedLabel)
    {
        var options = Options(rows, label).ToList();
        if (selected != "" && !options.Any(x => x.Code == selected))
            options.Add((selected, storedLabel == "" ? "النطاق المحفوظ" : storedLabel));
        return Choice(header, options, selected);
    }
    private async Task TemplateForm(JsonNode? template)
    {
        var groups = (await api.Send("GET", "/v1/groups")).AsArray();
        var tasks = (await api.Send("GET", "/v1/task-types")).AsArray();
        var code = Field("رمز القالب", V(template, "code"));
        code.IsReadOnly = template is not null;
        var body = new TextBox { Header = "نص الرد", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MaxLength = 2000, MinWidth = 300, Height = 120, Text = V(template, "body") };
        var group = ScopeChoice("المجموعة (الكل = قالب عام)", groups, "title", V(template, "group_id"), V(template, "group_title"));
        var task = ScopeChoice("نوع المهمة (الكل = قالب عام)", tasks, "name", V(template, "task_type_id"), V(template, "task_name"));
        var enabled = new CheckBox { Content = "متاح للمعاينات الجديدة", IsChecked = template?["enabled"]?.GetValue<bool>() ?? true };
        if (!await Dialog(template is null ? "قالب جديد" : "تعديل القالب", Stack(Text("المتغيرات المسموحة: {displayName} و{taskName}. التعديل يبطل المعاينات السابقة؛ لا يغيّر نص رد اعتُمد سابقًا ولا يعيد إرساله."), code, body, group, task, enabled)))
            return;
        var payload = new JsonObject { ["body"] = body.Text, ["enabled"] = enabled.IsChecked == true, ["groupId"] = Selected(group) == "" ? null : Selected(group), ["taskTypeId"] = Selected(task) == "" ? null : Selected(task) };
        if (template is null)
            payload["code"] = code.Text;
        else
            payload["version"] = Ver(template);
        await api.Send(template is null ? "POST" : "PATCH", "/v1/reply-templates" + (template is null ? "" : "/" + V(template, "id")), payload);
        await Render();
    }
    private async Task TemplateList()
    {
        const string resource = "reply-templates";
        var search = Field("رمز القالب", Filter(resource, "search"));
        var enabled = Choice("الإتاحة", [("all", "الكل"), ("true", "متاح"), ("false", "متوقف")], Filter(resource, "enabled"));
        TrackDraft(search, enabled);
        Body.Children.Add(Stack(search, enabled, Button("تصفية القوالب", async () => { filters[resource] = new() { ["search"] = search.Text, ["enabled"] = Selected(enabled) }; offsets[resource] = 0; await Render(); }), Button("إضافة قالب", () => TemplateForm(null))));
        var result = await PageData(resource);
        foreach (var row in result["items"]!.AsArray())
        {
            var n = row!;
            var active = n["enabled"]!.GetValue<bool>();
            Card(V(n, "code"), V(n, "body") + "\n" + (V(n, "group_title") == "" ? "كل المجموعات" : V(n, "group_title")) + " • " + (V(n, "task_name") == "" ? "كل المهام" : V(n, "task_name")) + " • " + (active ? "متاح" : "متوقف"),
                Button("تعديل القالب", () => TemplateForm(n)), Button(active ? "إيقاف القالب" : "تفعيل القالب", async () => { await api.Send("PATCH", "/v1/reply-templates/" + V(n, "id"), new { version = Ver(n), enabled = !active }); await Render(); }));
        }
        if (result["items"]!.AsArray().Count == 0)
            Body.Children.Add(Text("لا توجد قوالب مطابقة."));
        Pager(resource, result);
    }
    private async Task<(JsonNode Source, JsonNode Template)?> ChooseReply(JsonNode assignment)
    {
        var sources = assignment["sources"]!.AsArray();
        if (sources.Count == 0)
            throw new InvalidOperationException("لا توجد رسالة مصدر لهذا التكليف.");
        var source = new ComboBox { Header = "رسالة المصدر", ItemsSource = sources.Select(n => $"{V(n, "sessionId")} / {V(n, "groupId")} / {V(n, "externalMessageId")}").ToArray(), SelectedIndex = 0, MaxWidth = 440 };
        var template = new ComboBox { Header = "القالب المتاح لهذه المهمة والمجموعة", MinWidth = 300 };
        var hint = Text("");
        var matching = new List<JsonNode>();
        var generation = 0;
        var closed = false;
        async Task UpdateTemplates()
        {
            var mine = ++generation;
            template.IsEnabled = false;
            template.ItemsSource = null;
            template.SelectedIndex = -1;
            matching = new();
            hint.Text = "جارٍ تحميل القوالب المطابقة…";
            var groupId = V(sources[source.SelectedIndex], "groupId");
            var taskId = V(assignment, "task_type_id");
            var templates = (await api.Send("GET", "/v1/reply-templates?enabled=true&limit=500&groupId=" + groupId + "&taskTypeId=" + taskId)).AsArray();
            if (closed || mine != generation)
                return;
            matching = templates.Where(n => n is not null && (V(n, "group_id") == "" || V(n, "group_id") == groupId) && (V(n, "task_type_id") == "" || V(n, "task_type_id") == taskId))
                .Select(n => n!).OrderByDescending(n => (V(n, "group_id") == "" ? 0 : 1) + (V(n, "task_type_id") == "" ? 0 : 1)).ToList();
            template.ItemsSource = matching.Select(n => V(n, "code")).ToArray();
            template.SelectedIndex = matching.Count > 0 ? 0 : -1;
            template.IsEnabled = matching.Count > 0;
            hint.Text = matching.Count > 0 ? "تُعرض القوالب المتاحة والمطابقة للمصدر المحدد فقط." : "أضف أو فعّل قالبًا عامًا أو مطابقًا لهذه المهمة والمجموعة.";
        }
        source.SelectionChanged += async (_, _) => { if (source.SelectedIndex < 0) return; try { await UpdateTemplates(); } catch (Exception error) { if (!closed) { hint.Text = "تعذر تحميل القوالب. أغلق الحوار وحدّث الاتصال قبل المحاولة."; connectionState.Failed(error); ShowConnectionProblem(); } } };
        await UpdateTemplates();
        var confirmed = await Dialog("اختيار الرد", Stack(source, template, hint), "معاينة");
        closed = true;
        if (!confirmed)
            return null;
        if (template.SelectedIndex < 0)
            throw new InvalidOperationException("لا يوجد قالب متاح يطابق المصدر المحدد.");
        return (sources[source.SelectedIndex]!, matching[template.SelectedIndex]);
    }
}
