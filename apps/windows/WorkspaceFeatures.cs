using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System.Text.Json.Nodes;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private readonly Dictionary<string, Dictionary<string, string>> filters = new();
    private readonly Dictionary<string, int> offsets = new();
    private Dictionary<string, string> Filters(string resource)
    {
        if (!filters.TryGetValue(resource, out var f))
            filters[resource] = f = new();
        return f;
    }
    private string Filter(string resource, string name) => Filters(resource).GetValueOrDefault(name, "");
    private Dictionary<string, string> Query(string resource) => new(Filters(resource)) { ["page"] = "true", ["limit"] = "50", ["offset"] = offsets.GetValueOrDefault(resource).ToString() };
    private async Task<JsonNode> PageData(string resource) => await api.Send("GET", "/v1/" + resource + "?" + string.Join("&", Query(resource).Where(kv => kv.Value != "").Select(kv => kv.Key + "=" + Uri.EscapeDataString(kv.Value))));
    private static ComboBox Choice(string header, IEnumerable<(string Code, string Label)> options, string selected = "")
    {
        var c = new ComboBox { Header = header, MinWidth = 160 };
        foreach (var (code, label) in options)
        {
            var item = new ComboBoxItem { Content = label, Tag = code };
            c.Items.Add(item);
            if (code == selected)
                c.SelectedItem = item;
        }
        if (c.SelectedIndex < 0)
            c.SelectedIndex = 0;
        return c;
    }
    private static string Selected(ComboBox c) => (c.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
    private static readonly string[] StatusCodes = ["NEW", "NEEDS_REVIEW", "IN_PROGRESS", "COMPLETED", "CANCELED"];
    private static string StateLabel(string code) => code switch { "NEW" => "جديد", "NEEDS_REVIEW" => "بحاجة مراجعة", "IN_PROGRESS" => "قيد التنفيذ", "COMPLETED" => "مكتمل", "CANCELED" => "ملغى", "APPROVED" => "مُعتمد", "SENDING" => "قيد الإرسال", "SENT" => "تم الإرسال", "FAILED" => "فشل مؤكد", "UNKNOWN_DELIVERY" => "تسليم يحتاج تحققًا", _ => code };
    private static string ChoiceLabel(JsonNode n, string label) => V(n, label) + " • " + (V(n,"code") != "" ? V(n,"code") : V(n,"namespace") + "/" + V(n,"period_key") + " • " + V(n,"id"));
    private static IEnumerable<(string Code, string Label)> Options(JsonArray list, string label) => new[] { ("", "الكل") }.Concat(list.Select(n => (V(n, "id"), ChoiceLabel(n!, label))));
    private void Pager(string resource, JsonNode result)
    {
        var total = result["total"]!.GetValue<int>();
        var offset = result["offset"]!.GetValue<int>();
        var limit = result["limit"]!.GetValue<int>();
        var prev = Button("السابق", async () => { offsets[resource] = Math.Max(0, offset - limit); await Render(); });
        prev.IsEnabled = offset > 0;
        var next = Button("التالي", async () => { offsets[resource] = offset + limit; await Render(); });
        next.IsEnabled = offset + limit < total;
        Body.Children.Add(Stack(Text($"النتائج {Math.Min(offset + 1, total)}–{Math.Min(offset + limit, total)} من {total}"), new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, Children = { prev, next } }));
    }
    private void TrackDraft(params Control[] controls)
    {
        foreach (var control in controls)
            if (control is TextBox text)
                text.TextChanged += (_, _) => hasDraft = true;
            else if (control is ComboBox choice)
                choice.SelectionChanged += (_, _) => hasDraft = true;
            else if (control is NumberBox number)
                number.ValueChanged += (_, _) => hasDraft = true;
    }
    private void AccountFilters()
    {
        var search = Field("الاسم أو المستخدم", Filter("accounts", "search"));
        var ns = Field("النظام", Filter("accounts", "namespace"));
        var archived = Choice("الأرشفة", [("all", "الكل"), ("active", "نشط"), ("archived", "مؤرشف")], Filter("accounts", "archived"));
        TrackDraft(search, ns, archived);
        Body.Children.Add(Stack(new Expander { Header = "البحث والتصفية", Content = Stack(search, ns, archived, Button("تطبيق التصفية", async () => { filters["accounts"] = new() { ["search"] = search.Text, ["namespace"] = ns.Text, ["archived"] = Selected(archived) }; offsets["accounts"] = 0; await Render(); })) }, Button("تصدير الصفحة CSV", () => ExportPage("accounts"))));
    }
    private async Task AssignmentFilters()
    {
        const string r = "assignments";
        var search = Field("الاسم أو المستخدم", Filter(r, "search"));
        var period = Field("الفترة", Filter(r, "periodKey"));
        var status = Choice("الحالة", new[] { ("", "الكل") }.Concat(StatusCodes.Select(s => (s, StateLabel(s)))), Filter(r, "status"));
        var sessions = Choice("الجلسة", Options((await api.Send("GET", "/v1/sessions")).AsArray(), "label"), Filter(r, "sessionId"));
        var groups = Choice("المجموعة", Options((await api.Send("GET", "/v1/groups")).AsArray(), "title"), Filter(r, "groupId"));
        var tasks = Choice("المهمة", Options((await api.Send("GET", "/v1/task-types")).AsArray(), "name"), Filter(r, "taskTypeId"));
        var priority = Choice("الحد الأدنى للأولوية", [("", "الكل"), ("50", "عالية: 50"), ("80", "حرجة: 80")], Filter(r, "minPriority"));
        TrackDraft(search, period, status, sessions, groups, tasks, priority);
        Body.Children.Add(Stack(new Expander { Header = "البحث وتصفية المهام", Content = Stack(search, period, status, sessions, groups, tasks, priority, Button("تطبيق التصفية", async () => { filters[r] = new() { ["search"] = search.Text, ["periodKey"] = period.Text, ["status"] = Selected(status), ["sessionId"] = Selected(sessions), ["groupId"] = Selected(groups), ["taskTypeId"] = Selected(tasks), ["minPriority"] = Selected(priority) }; offsets[r] = 0; await Render(); })) }, Button("تصدير الصفحة CSV", () => ExportPage(r))));
    }
    private async Task ExportPage(string resource)
    {
        var reauth = ReauthField();
        if (!await Dialog("تصدير الصفحة المصفّاة", Stack(Text("يشمل التقرير الحقول الظاهرة فقط، دون الاعتمادات أو نصوص الرسائل."), reauth), "اختيار ملف"))
            return;
        var picker = new Microsoft.Windows.Storage.Pickers.FileSavePicker(App.CurrentWindow!.AppWindow.Id) { SuggestedFileName = "TaskPilot-" + resource, DefaultFileExtension = ".csv" };
        picker.FileTypeChoices.Add("CSV", new List<string> { ".csv" });
        var file = await picker.PickSaveFileAsync();
        if (file is null)
            return;
        var result = await api.Send("POST", "/v1/reports/export", new
        {
            resource,
            query = Query(resource)
        }, await Reauth(reauth.Password));
        reauth.Password = "";
        await System.IO.File.WriteAllTextAsync(file.Path, V(result, "content"));
        Connection.Message = "تم حفظ التقرير المنقّح.";
    }
    private async Task PurgeAssignment(JsonNode assignment)
    {
        var id = V(assignment, "id");
        var p = await api.Send("POST", "/v1/assignments/" + id + "/deletion-preview", new
        {
        });
        var phrase = Field("اكتب DELETE TASK");
        var reauth = ReauthField();
        if (!await Dialog("حذف التكليف فقط", Stack(Text(V(p, "displayName") + " • " + V(p, "taskName")), Text("سيبقى الحساب وبقية مهامه. الردود المرتبطة: " + V(p, "replies") + " • الرسائل المعلّقة: " + V(p,"pendingIngress")), phrase, reauth), "حذف التكليف"))
            return;
        await api.Send("POST", "/v1/assignments/" + id + "/delete", new
        {
            approvalToken = V(p, "approvalToken"),
            confirmation = phrase.Text
        }, await Reauth(reauth.Password));
        reauth.Password = "";
        await Render();
    }
    private async Task Rules(JsonNode group)
    {
        var list = (await api.Send("GET", "/v1/group-rules?groupId=" + V(group, "id"))).AsArray();
        var panel = Stack(Text("الكلمات تخص نوع المهمة. عند تعادل أعلى أولوية لمهمتين، تُطلب المراجعة."));
        var toggles = new List<(JsonNode Row, CheckBox Toggle)>();
        foreach (var row in list)
        {
            var check = new CheckBox { Content = V(row, "task_name") + " • " + V(row, "priority") + " • " + string.Join("، ", row!["keywords"]!.AsArray().Select(n => n!.ToString())), IsChecked = row!["enabled"]!.GetValue<bool>() };
            toggles.Add((row!, check));
            panel.Children.Add(check);
        }
        var tasks = Choice("مهمة القاعدة الجديدة", Options((await api.Send("GET", "/v1/task-types")).AsArray(), "name"));
        var words = Field("كلمات القاعدة الجديدة، مفصولة بفواصل");
        var priority = new NumberBox { Header = "الأولوية 0–100", Minimum = 0, Maximum = 100, Value = 10 };
        panel.Children.Add(Stack(tasks, words, priority));
        if (!await Dialog("قواعد " + V(group, "title"), panel))
            return;
        foreach (var (row, toggle) in toggles)
            if (toggle.IsChecked != row["enabled"]!.GetValue<bool>())
                await api.Send("PATCH", "/v1/group-rules/" + V(row, "id"), new
                {
                    version = Ver(row),
                    enabled = toggle.IsChecked == true
                });
        if (!string.IsNullOrWhiteSpace(words.Text))
        {
            if (Selected(tasks) == "")
                throw new InvalidOperationException("اختر مهمة للقاعدة الجديدة.");
            await api.Send("POST", "/v1/group-rules", new
            {
                groupId = V(group, "id"),
                taskTypeId = Selected(tasks),
                keywords = words.Text.Split([',', '،'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                priority = (int)priority.Value
            });
        }
        await Render();
    }
}
