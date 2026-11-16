using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using System.Text.Json.Nodes;

namespace TaskPilot_Windows;
public sealed partial class MainPage
{
    private long assistantRevision = -1;
    private long assistantGeneration;
    private string assistantThread = Guid.NewGuid().ToString(), assistantDraft = "";
    private string? assistantParent, assistantFocus, assistantGroup, assistantPendingTurn, assistantPendingAction;
    private readonly Dictionary<string, string> assistantQuestions = new();
    private void ClearAssistant()
    {
        assistantThread = Guid.NewGuid().ToString(); assistantDraft = "";
        assistantParent = assistantFocus = assistantGroup = assistantPendingTurn = assistantPendingAction = null;
        assistantQuestions.Clear(); assistantRevision = connectionState.Revision;
        assistantGeneration++;
    }
    private bool CurrentAssistant(long revision) => !shuttingDown && assistantGeneration == revision && assistantRevision == connectionState.Revision;
    private async Task Assistant()
    {
        if (assistantRevision != connectionState.Revision) ClearAssistant();
        var revision = assistantGeneration;
        var history = await api.Send("GET", "/v1/assistant/threads/" + assistantThread);
        if (!CurrentAssistant(revision)) return;
        if (assistantParent is null && history["items"]!.AsArray().LastOrDefault() is JsonNode last && V(last, "state") != "PLANNING") { assistantParent = V(last, "id"); assistantFocus = string.IsNullOrEmpty(V(last, "contextAccountId")) ? null : V(last, "contextAccountId"); }
        PageBody.Children.Add(Text("مساعدك لإدارة العمل", 23));
        PageBody.Children.Add(Text("اسأل عن الحسابات ومجموعاتها ومهامها، أو اطلب ملخصًا وأولويات. الإجراءات تُعرض للتأكيد قبل تطبيقها."));
        PageBody.Children.Add(new Expander { Header = "مصادر الإجابة والخصوصية", HorizontalAlignment = HorizontalAlignment.Stretch, Content = Text("الإجابات من سجلات TaskPilot الحالية مع وقت القراءة وروابطها. النموذج يستقبل مفردات عمل محددة ومؤشرات وأعدادًا فقط؛ لا يستقبل الأسماء أو اليوزرات أو كلمات المرور أو نصوص واتساب. يحفظ الخادم نوع الطلب ومراجع السجلات، وتُقرأ البيانات من جديد عند فتح المحادثة. نص سؤالك يبقى في ذاكرة التطبيق أثناء الاتصال؛ لا تلصق كلمات المرور هنا.") });
        var threads = await api.Send("GET", "/v1/assistant/threads");
        var selector = new ComboBox { Header = "محادثات سابقة", PlaceholderText = "اختر محادثة", HorizontalAlignment = HorizontalAlignment.Stretch };
        foreach (var thread in threads["items"]!.AsArray()) selector.Items.Add(new ComboBoxItem { Content = V(thread, "title") + " • " + LocalAssistantTime(V(thread, "updatedAt")), Tag = V(thread, "threadId") });
        selector.SelectionChanged += async (_, _) => { if (selector.SelectedItem is ComboBoxItem item) await Run(async () => { ClearAssistant(); assistantThread = item.Tag.ToString()!; await Render(); }); };
        PageBody.Children.Add(Toolbar(Button("محادثة جديدة", async () => { ClearAssistant(); await Render(); }), selector));
        var groups = await api.Send("GET", "/v1/groups");
        var groupFilter = new ComboBox { Header = "نطاق المجموعة", HorizontalAlignment = HorizontalAlignment.Stretch };
        groupFilter.Items.Add(new ComboBoxItem { Content = "كل المجموعات", Tag = "" });
        foreach (var group in groups.AsArray()) groupFilter.Items.Add(new ComboBoxItem { Content = V(group, "title"), Tag = V(group, "id") });
        groupFilter.SelectedItem = groupFilter.Items.Cast<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == (assistantGroup ?? "")) ?? groupFilter.Items[0];
        groupFilter.SelectionChanged += (_, _) => { assistantGroup = (groupFilter.SelectedItem as ComboBoxItem)?.Tag?.ToString(); if (assistantGroup == "") assistantGroup = null; MarkDraft(); };
        PageBody.Children.Add(groupFilter);
        if (assistantFocus is not null) PageBody.Children.Add(Toolbar(Text("متابعة الحساب المحدد في هذه المحادثة"), Button("إلغاء تحديد الحساب", async () => { assistantFocus = null; assistantParent = null; await Render(); })));
        var composer = new TextBox { Header = "اطلب من المساعد", PlaceholderText = "مثال: الحسابات التي وصلتني اليوم وما مهامها؟", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MaxLength = 1200, MinHeight = 88, MaxHeight = 180, Text = assistantDraft };
        AutomationProperties.SetName(composer, "اطلب من المساعد");
        composer.TextChanged += (_, _) => { if (CurrentAssistant(revision)) { assistantDraft = composer.Text; MarkDraft(); } };
        var quick = new ActionFlowPanel { Spacing = 8 };
        foreach (var (label, question) in new[] { ("ملخص يومي", "ملخص العمل اليوم"), ("استقبال اليوم", "ماهي الحسابات التي استلمتها اليوم وما مهامها"), ("أولويات العمل", "اعرض المهام المفتوحة حسب الأولوية"), ("المراجعات", "ما الذي يحتاج مراجعة"), ("الردود", "اعرض الردود"), ("أعمال قديمة", "اقترح متابعة الأعمال القديمة"), ("الاستهلاك", "كم استهلاك الذكاء الاصطناعي اليوم") })
            quick.Children.Add(Button(label, () => { composer.Text = question; composer.Focus(FocusState.Programmatic); return Task.CompletedTask; }));
        PageBody.Children.Add(quick); PageBody.Children.Add(composer);
        var askButton = Button("اسأل المساعد", async () => {
            if (string.IsNullOrWhiteSpace(composer.Text)) throw new InvalidOperationException("VALIDATION_ERROR");
            if (assistantPendingTurn is not null) throw new InvalidOperationException("ASSISTANT_REQUEST_PENDING");
            var requestId = Guid.NewGuid().ToString(); assistantPendingTurn = requestId;
            assistantQuestions[requestId] = composer.Text;
            while (assistantQuestions.Count > 20) assistantQuestions.Remove(assistantQuestions.Keys.First());
            try {
                var answer = await api.Send("POST", "/v1/assistant/turns", new { requestId, threadId = assistantThread, parentId = assistantParent, question = composer.Text, focusAccountId = assistantFocus, groupId = assistantGroup });
                if (!CurrentAssistant(revision)) return;
                AcceptAssistantTurn(answer); await Render();
            } catch (ApiFailure e) when (e.StatusCode is >= 400 and < 500 && e.StatusCode != 408) {
                if (CurrentAssistant(revision)) { assistantPendingTurn = null; assistantQuestions.Remove(requestId); }
                throw;
            } catch {
                if (CurrentAssistant(revision)) await RenderAssistantPending();
                throw;
            }
        });
        askButton.IsEnabled = assistantPendingTurn is null;
        PageBody.Children.Add(askButton);
        if (assistantPendingTurn is not null) PageBody.Children.Add(Stack(Text("لم تُحسم نتيجة الطلب. لن يعاد استدعاء النموذج تلقائيًا."), Button("التحقق من نتيجة الطلب", CheckAssistantPending)));
        if (assistantPendingAction is not null) PageBody.Children.Add(Stack(Text("تحقق من إيصال التغيير السابق قبل أي تغيير آخر."), Button("التحقق من نتيجة التغيير", CheckAssistantAction)));
        var receipts = await api.Send("GET", "/v1/assistant/actions");
        if (!CurrentAssistant(revision)) return;
        var receiptList = new StackPanel { Spacing = 10 };
        foreach (var receipt in receipts["items"]!.AsArray()) receiptList.Children.Add(Button($"{LocalAssistantTime(V(receipt, "created_at"))} • {V(receipt?["result"], "count")} مهام • عرض الإيصال", async () => { if (CurrentAssistant(revision)) await ShowAssistantReceipt(await api.Send("GET", "/v1/assistant/actions/" + V(receipt, "request_id"))); }));
        if (receiptList.Children.Count > 0) PageBody.Children.Add(new Expander { Header = "التغييرات المنفذة وإيصالاتها", Content = receiptList, HorizontalAlignment = HorizontalAlignment.Stretch });
        foreach (var turn in history["items"]!.AsArray().Reverse()) AddAssistantTurn(turn!, revision);
    }
    private Task RenderAssistantPending() => page == "assistant" ? Render() : Task.CompletedTask;
    private void AcceptAssistantTurn(JsonNode answer)
    {
        if (V(answer, "state") == "PLANNING") return;
        assistantParent = V(answer, "id"); assistantPendingTurn = null; assistantDraft = "";
        assistantFocus = string.IsNullOrEmpty(V(answer, "contextAccountId")) ? null : V(answer, "contextAccountId");
    }
    private async Task CheckAssistantPending()
    {
        if (assistantPendingTurn is null) return;
        var revision = assistantGeneration;
        try { var answer = await api.Send("GET", "/v1/assistant/turns/" + assistantPendingTurn); if (!CurrentAssistant(revision)) return; AcceptAssistantTurn(answer); }
        catch (ApiFailure e) when (e.StatusCode == 404) { if (CurrentAssistant(revision)) assistantPendingTurn = null; else return; }
        if (CurrentAssistant(revision)) await Render();
    }
    private static string LocalAssistantTime(string time) => DateTimeOffset.TryParse(time, out var value) ? value.ToOffset(TimeSpan.FromHours(3)).ToString("yyyy-MM-dd HH:mm") + " (الرياض)" : time;
    private void AddAssistantTurn(JsonNode turn, long revision)
    {
        var id = V(turn, "id");
        if (assistantQuestions.TryGetValue(id, out var question)) {
            var text = Text(question, 16); text.IsTextSelectionEnabled = true;
            PageBody.Children.Add(new Border { Padding = new Thickness(16), CornerRadius = new CornerRadius(16), Background = (Brush)Application.Current.Resources["AccentFillColorSecondaryBrush"], Child = Stack(Text("أنت", 13), text) });
        }
        var content = Stack(Text(V(turn, "title"), 21), Text(V(turn, "summary"), 16));
        var model = V(turn, "origin") == "AI_TOOL_PLAN" ? "اختار AI الأدوات؛ النتائج من قاعدة المشروع" : "أدوات المشروع المحلية • " + (V(turn, "modelStatus") switch { "AI_DAILY_LIMIT" => "بلغ الحد اليومي؛ لم يُستدعَ النموذج", "AI_DISABLED" => "AI معطل", "AI_CONFIGURATION_REQUIRED" => "مفتاح المزود غير متاح", "UNAVAILABLE" => "تعذر AI دون إعادة تلقائية", "INTERRUPTED" => "استعادة طلب توقف سابقًا", _ => "قراءة محلية" });
        content.Children.Add(Text(model + "\nقراءة السجلات: " + LocalAssistantTime(V(turn, "observedAt")) + (V(turn, "period") != "ALL" ? " • مرجع الفترة: " + V(turn, "anchorDate") : ""), 12));
        if (V(turn, "state") == "PLANNING") content.Children.Add(Button("التحقق من نتيجة الطلب", async () => { assistantPendingTurn = id; await CheckAssistantPending(); }));
        foreach (var section in turn["sections"]!.AsArray()) {
            content.Children.Add(Text(V(section, "title"), 17));
            foreach (var item in section!["items"]!.AsArray()) {
                var row = Stack(Text(V(item, "title"), 16), Text(V(item, "detail")));
                var actions = new ActionFlowPanel { Spacing = 8 };
                if (V(item, "kind") == "account") actions.Children.Add(Button("متابعة هذا الحساب", async () => {
                    if (!CurrentAssistant(revision)) return;
                    assistantFocus = V(item, "accountId"); assistantParent = id; assistantDraft = "تفاصيل الحساب"; await Render();
                }));
                var destination = V(item, "destination"); var accountId = V(item, "accountId");
                if (destination != "") actions.Children.Add(Button(destination == "account-details" ? "فتح سجل الحساب" : "فتح القسم", async () => {
                    if (destination == "account-details" && accountId != "") { detailAccountId = accountId; detailSection = "tasks"; detailOffset = 0; page = "account-details"; await Render(); }
                    else await OpenSection(destination);
                }));
                if (actions.Children.Count > 0) row.Children.Add(actions);
                content.Children.Add(new Border { Child = row, Padding = new Thickness(14), CornerRadius = new CornerRadius(12), BorderThickness = new Thickness(1), BorderBrush = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"] });
            }
        }
        if (turn["action"] is JsonObject action) content.Children.Add(Button("معاينة: " + V(action, "description"), async () => { if (CurrentAssistant(revision)) await AssistantAction(action, revision); }));
        PageBody.Children.Add(new Border { Child = content, Padding = new Thickness(22), CornerRadius = new CornerRadius(18), Background = (Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"], BorderThickness = new Thickness(1), BorderBrush = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"] });
    }
    private async Task AssistantAction(JsonNode action, long revision)
    {
        if (assistantPendingAction is not null) throw new InvalidOperationException("ASSISTANT_ACTION_PENDING");
        var preview = await api.Send("POST", "/v1/assistant/actions/preview", new { kind = V(action, "kind"), status = action["status"]?.ToString(), priority = action["priority"]?.GetValue<int>(), targets = action["targets"] });
        if (!CurrentAssistant(revision)) return;
        var phrase = Field("اكتب: تطبيق التغييرات"); var reauth = ReauthField();
        var changes = string.Join("\n\n", preview["changes"]!.AsArray().Select(row => $"{V(row, "account")} • {V(row, "username")}\n{V(row, "task")}: {V(row, "before")} ← {V(row, "after")}"));
        var previewRows = new ScrollViewer { Content = Text($"التغييرات: {V(preview, "count")}\n{changes}"), MaxHeight = 260, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
        if (!await Dialog("تأكيد تغيير مهام محددة", Stack(previewRows, Text("تُطبّق جميع التغييرات معًا إذا بقيت إصدارات السجلات مطابقة. لا يُنشأ أو يُرسل أي رد واتساب."), phrase, reauth), "تطبيق التغييرات", () => phrase.Text == "تطبيق التغييرات" ? null : "اكتب عبارة التأكيد كما هي.")) return;
        if (!CurrentAssistant(revision)) return;
        var requestId = Guid.NewGuid().ToString();
        var grant = await Reauth(reauth.Password); reauth.Password = "";
        if (!CurrentAssistant(revision)) return;
        assistantPendingAction = requestId;
        try {
            var receipt = await api.Send("POST", "/v1/assistant/actions/apply", new { requestId, approvalToken = V(preview, "approvalToken"), confirmation = phrase.Text }, grant);
            if (!CurrentAssistant(revision)) return;
            assistantPendingAction = null; await ShowAssistantReceipt(receipt); await Render();
        } catch (ApiFailure e) when (e.StatusCode is >= 400 and < 500 && e.StatusCode != 408) { if (CurrentAssistant(revision)) assistantPendingAction = null; throw; }
        catch { if (CurrentAssistant(revision)) await RenderAssistantPending(); throw; }
    }
    private async Task CheckAssistantAction()
    {
        if (assistantPendingAction is null) return;
        var revision = assistantGeneration;
        try { var receipt = await api.Send("GET", "/v1/assistant/actions/" + assistantPendingAction); if (!CurrentAssistant(revision)) return; assistantPendingAction = null; await ShowAssistantReceipt(receipt); }
        catch (ApiFailure e) when (e.StatusCode == 404) {
            if (!CurrentAssistant(revision)) return;
            // A concurrent request can still be committing. Keep the key and offer readback again.
            await AssistantNotice("لا يوجد إيصال مؤكد بعد", "لم أتحقق من تطبيق التغيير. حدّث النتيجة لاحقًا وراجع المهام؛ لن يعاد التغيير تلقائيًا.");
        }
        if (CurrentAssistant(revision)) await Render();
    }
    private async Task ShowAssistantReceipt(JsonNode receipt)
    {
        await AssistantNotice("تم التحقق من تطبيق التغيير", $"إيصال محفوظ على الخادم • {V(receipt, "count")} مهام\nلم يُنشأ رد أو إرسال واتساب. تُقرأ النتائج الحالية عند تحديث المحادثة.");
    }
    private async Task AssistantNotice(string title, string detail) => await new ContentDialog { Title = title, Content = Text(detail), CloseButtonText = "إغلاق", DefaultButton = ContentDialogButton.Close, XamlRoot = XamlRoot, FlowDirection = FlowDirection.RightToLeft }.ShowAsync();
}
