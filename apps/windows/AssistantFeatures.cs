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
    private readonly Dictionary<string, AssistantModelSelection> assistantModels = new();
    private void ClearAssistant()
    {
        assistantThread = Guid.NewGuid().ToString(); assistantDraft = "";
        assistantParent = assistantFocus = assistantGroup = assistantPendingTurn = assistantPendingAction = null;
        assistantQuestions.Clear(); assistantModels.Clear(); assistantRevision = connectionState.Revision;
        assistantGeneration++;
    }
    private bool CurrentAssistant(long revision) => !shuttingDown && assistantGeneration == revision && assistantRevision == connectionState.Revision;
    private async Task OpenAssistantThread(string id)
    {
        if (id == assistantThread) return;
        if (assistantPendingTurn is not null) throw new InvalidOperationException("ASSISTANT_REQUEST_PENDING");
        assistantThread = id;
        assistantParent = assistantFocus = assistantGroup = null;
        assistantDraft = "";
        assistantGeneration++;
        await RenderCore();
    }

    private async Task Assistant()
    {
        if (assistantRevision != connectionState.Revision) ClearAssistant();
        var revision = assistantGeneration;
        var historyRead = api.Send("GET", "/v1/assistant/threads/" + assistantThread);
        var threadsRead = api.Send("GET", "/v1/assistant/threads");
        var groupsRead = api.Send("GET", "/v1/groups");
        var modelsRead = GetAssistantModels();
        await Task.WhenAll((Task)historyRead, threadsRead, groupsRead, modelsRead);
        var history = await historyRead;
        if (!CurrentAssistant(revision)) return;
        if (assistantParent is null && history["items"]!.AsArray().LastOrDefault() is JsonNode last && V(last, "state") != "PLANNING") { assistantParent = V(last, "id"); assistantFocus = string.IsNullOrEmpty(V(last, "contextAccountId")) ? null : V(last, "contextAccountId"); }
        var threads = await threadsRead;
        var groups = await groupsRead;
        var models = await modelsRead;
        var workspace = new Grid { ColumnSpacing = 22, RowSpacing = 10 };
        workspace.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(204) });
        workspace.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        workspace.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        workspace.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        var historyList = new StackPanel { Spacing = 6 };
        void AddConversation(string id, string title, string time, bool first = false)
        {
            var button = Button(title, () => OpenAssistantThread(id));
            ToolTipService.SetToolTip(button, LocalAssistantTime(time));
            button.HorizontalAlignment = HorizontalAlignment.Stretch;
            button.IsEnabled = id != assistantThread;
            if (first) historyList.Children.Insert(0, button);
            else historyList.Children.Add(button);
        }
        foreach (var item in threads["items"]!.AsArray()) AddConversation(V(item, "threadId"), V(item, "title"), V(item, "updatedAt"));
        var historyPanel = new Expander
        {
            Header = "سجل المحادثات", IsExpanded = true, HorizontalAlignment = HorizontalAlignment.Stretch, VerticalAlignment = VerticalAlignment.Top,
            Content = Stack(Button("محادثة جديدة", () => OpenAssistantThread(Guid.NewGuid().ToString())),
                new ScrollViewer { Content = historyList, MaxHeight = 460, VerticalScrollBarVisibility = ScrollBarVisibility.Auto },
                Button("إيصالات التغييرات", AssistantReceipts))
        };
        var chat = new Grid { RowSpacing = 14 };
        chat.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        chat.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        chat.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        var timeline = new StackPanel { Spacing = 16, Padding = new Thickness(10, 8, 10, 14), MaxWidth = 880 };
        var scroll = new ScrollViewer { Content = timeline, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
        Grid.SetRow(scroll, 1);
        chat.Children.Add(scroll);
        FrameworkElement? latestTurn = null;
        void ScrollToLatest(FrameworkElement? start = null) => DispatcherQueue.TryEnqueue(() =>
        {
            if (!scroll.IsLoaded) return;
            scroll.UpdateLayout();
            var offset = start is null ? scroll.ScrollableHeight : start.TransformToVisual(timeline).TransformPoint(new Windows.Foundation.Point()).Y;
            scroll.ChangeView(null, Math.Clamp(offset, 0, scroll.ScrollableHeight), null, true);
        });
        chat.Loaded += (_, _) => ScrollToLatest(latestTurn);
        var modelLabel = Text(AssistantModelLabel(models, assistantModels.GetValueOrDefault(assistantThread)), 13);
        modelLabel.TextWrapping = TextWrapping.NoWrap;
        modelLabel.TextTrimming = TextTrimming.CharacterEllipsis;
        modelLabel.MaxWidth = 205;
        var modelButton = Button("اختيار النموذج", async () =>
        {
            await PickAssistantModel(models, revision);
            modelLabel.Text = AssistantModelLabel(models, assistantModels.GetValueOrDefault(assistantThread));
        });
        modelButton.Content = Toolbar(modelLabel, Text("⌄", 13));
        var composer = new TextBox { PlaceholderText = "اكتب سؤالك أو طلبك…", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MaxLength = 1200, MinHeight = 58, MaxHeight = 98, Text = assistantDraft };
        AutomationProperties.SetName(composer, "اطلب من المساعد");
        composer.TextChanged += (_, _) => { if (CurrentAssistant(revision)) { assistantDraft = composer.Text; MarkDraft(); } };
        var examples = new[] { ("ملخص يومي", "ملخص العمل اليوم"), ("استقبال اليوم", "ماهي الحسابات التي استلمتها اليوم وما مهامها"), ("أولويات العمل", "اعرض المهام المفتوحة حسب الأولوية"), ("المراجعات", "ما الذي يحتاج مراجعة"), ("الردود", "اعرض الردود"), ("أعمال قديمة", "اقترح متابعة الأعمال القديمة"), ("الاستهلاك", "كم استهلاك الذكاء الاصطناعي اليوم") };
        async Task ShowAssistantSuggestions()
        {
            var options = Choice("اقتراحات الأسئلة", examples.Select(x => (x.Item2, x.Item1)));
            if (await Dialog("اقتراحات الأسئلة", options, "استخدام السؤال"))
            {
                composer.Text = Selected(options);
                composer.Focus(FocusState.Programmatic);
            }
        }
        var contextMenu = new Button { Content = new SymbolIcon(Symbol.More), Flyout = ActionMenu(("نطاق المحادثة", () => PickAssistantScope(groups)),
            ("إلغاء تحديد الحساب", () => { assistantFocus = null; assistantParent = null; return Task.CompletedTask; }),
            ("اقتراحات الأسئلة", ShowAssistantSuggestions), ("إجراءات العمل", WorkflowsMenu), ("تحديث المحادثة", RenderCore)) };
        AutomationProperties.SetName(contextMenu, "خيارات المحادثة");
        var heading = Text("المساعد الشخصي", 23);
        heading.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
        AutomationProperties.SetHeadingLevel(heading, Microsoft.UI.Xaml.Automation.Peers.AutomationHeadingLevel.Level1);
        chat.Children.Add(Toolbar(heading, modelButton, contextMenu));
        var pendingQuestion = Toolbar(Text("طلب يحتاج متابعة"), Button("التحقق من نتيجة الطلب", CheckAssistantPending));
        pendingQuestion.Visibility = assistantPendingTurn is null ? Visibility.Collapsed : Visibility.Visible;
        var welcome = Text("كيف أساعدك اليوم؟", 26);
        welcome.HorizontalAlignment = HorizontalAlignment.Center;
        var chips = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Center };
        foreach (var example in examples.Take(3)) chips.Children.Add(Button(example.Item1, () =>
        {
            composer.Text = example.Item2;
            composer.Focus(FocusState.Programmatic);
            return Task.CompletedTask;
        }));
        var prompt = history["items"]!.AsArray().Count == 0 ? Stack(welcome, chips) : null;
        if (prompt is not null) prompt.Margin = new Thickness(0, 86, 0, 0);
        var newConversation = true;
        Button? askButton = null;
        askButton = Button("إرسال", async () => {
            if (string.IsNullOrWhiteSpace(composer.Text)) throw new InvalidOperationException("VALIDATION_ERROR");
            if (assistantPendingTurn is not null) throw new InvalidOperationException("ASSISTANT_REQUEST_PENDING");
            var send = BatchReplyCommand.Match(composer.Text);
            if (send.Success)
            {
                await ReplyBatch(send.Groups["group"].Value, send.Groups["template"].Value);
                return;
            }
            if (composer.Text.TrimStart().StartsWith("جهز ردود") || composer.Text.TrimStart().StartsWith("جهّز ردود"))
            {
                await ReplyBatch(completedOnly: true);
                return;
            }
            var work = composer.Text.Trim().Replace("أ", "ا").Replace("إ", "ا");
            if (work.StartsWith("راجع وارد") || work.StartsWith("افرز المراجعة") || work.StartsWith("راجع رسائل اليوم"))
            {
                await WorkBriefing(true);
                return;
            }
            if (work.StartsWith("تقرير نهاية اليوم") || work.StartsWith("اقفل لي شغل اليوم"))
            {
                await WorkBriefing(false);
                return;
            }
            if (work.StartsWith("انشئ تكليفات") || work.StartsWith("اضف واجب") || work.StartsWith("جهز التكليفات"))
            {
                await CreateGroupTasks();
                return;
            }
            if (work.StartsWith("جرب قاعدة") || work.StartsWith("جرّب قاعدة") || work.StartsWith("اقترح قاعدة"))
            {
                await TryRoutingRule();
                return;
            }
            if (work.StartsWith("ذكرني") || work.StartsWith("ذكّرني") || work.StartsWith("سجل ملاحظة") || work.StartsWith("سجّل ملاحظة"))
            {
                await ChooseTaskNote(work);
                return;
            }
            var requestId = Guid.NewGuid().ToString(); assistantPendingTurn = requestId;
            askButton!.IsEnabled = composer.IsEnabled = false;
            var waiting = Text("جارٍ تجهيز الإجابة…");
            timeline.Children.Add(waiting);
            ScrollToLatest();
            assistantQuestions[requestId] = composer.Text;
            while (assistantQuestions.Count > 20) assistantQuestions.Remove(assistantQuestions.Keys.First());
            try {
                object payload = new { requestId, threadId = assistantThread, parentId = assistantParent, question = composer.Text, focusAccountId = assistantFocus, groupId = assistantGroup };
                if (assistantModels.TryGetValue(assistantThread, out var choice))
                    payload = new { requestId, threadId = assistantThread, parentId = assistantParent, question = composer.Text, focusAccountId = assistantFocus, groupId = assistantGroup, modelChoice = new { provider = choice.Provider, model = choice.Model } };
                var answer = await api.Send("POST", "/v1/assistant/turns", payload);
                if (!CurrentAssistant(revision)) return;
                AcceptAssistantTurn(answer);
                if (prompt is not null) timeline.Children.Remove(prompt);
                latestTurn = AddAssistantTurn(timeline, answer, revision);
                if (!threads["items"]!.AsArray().Any(item => V(item, "threadId") == assistantThread) && history["items"]!.AsArray().Count == 0 && newConversation)
                {
                    AddConversation(assistantThread, V(answer, "title"), V(answer, "requestedAt"), first: true);
                    newConversation = false;
                }
                if (assistantPendingTurn is null) composer.Text = "";
                pendingQuestion.Visibility = assistantPendingTurn is null ? Visibility.Collapsed : Visibility.Visible;
                ScrollToLatest(latestTurn);
            } catch (ApiFailure e) when (e.StatusCode is >= 400 and < 500 && e.StatusCode != 408) {
                if (CurrentAssistant(revision)) { assistantPendingTurn = null; assistantQuestions.Remove(requestId); askButton!.IsEnabled = true; if (e.Message == "ASSISTANT_CREDENTIAL_INPUT_REJECTED") { composer.Text = ""; assistantDraft = ""; } }
                throw;
            } catch {
                if (CurrentAssistant(revision)) pendingQuestion.Visibility = Visibility.Visible;
                throw;
            } finally {
                timeline.Children.Remove(waiting);
                if (CurrentAssistant(revision)) { composer.IsEnabled = true; askButton.IsEnabled = assistantPendingTurn is null; }
            }
        });
        askButton.IsEnabled = assistantPendingTurn is null;
        if (prompt is not null) timeline.Children.Add(prompt);
        foreach (var turn in history["items"]!.AsArray()) latestTurn = AddAssistantTurn(timeline, turn!, revision);
        var entry = new Grid { ColumnSpacing = 8 };
        entry.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        entry.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(askButton, 1);
        entry.Children.Add(composer);
        entry.Children.Add(askButton);
        var footer = Stack(entry, pendingQuestion);
        footer.MaxWidth = 880;
        if (assistantPendingAction is not null) footer.Children.Add(Button("التحقق من نتيجة التغيير", CheckAssistantAction));
        Grid.SetRow(footer, 2);
        chat.Children.Add(footer);
        workspace.Children.Add(historyPanel);
        workspace.Children.Add(chat);
        bool? wasCompact = null;
        void Layout()
        {
            var width = ContentScroll.ActualWidth;
            var compact = width < 740;
            workspace.ColumnDefinitions[0].Width = new GridLength(compact ? 0 : 204);
            Grid.SetColumn(historyPanel, compact ? 1 : 0);
            Grid.SetColumn(chat, 1);
            Grid.SetRow(chat, compact ? 1 : 0);
            if (wasCompact != compact) historyPanel.IsExpanded = !compact;
            wasCompact = compact;
            chips.Children[2].Visibility = width < 410 ? Visibility.Collapsed : Visibility.Visible;
            chat.Height = Math.Max(360, ContentScroll.ActualHeight - (compact ? 100 : 28));
        }
        void Resize(object sender, SizeChangedEventArgs args) => Layout();
        workspace.Loaded += (_, _) => { Layout(); ContentScroll.SizeChanged += Resize; };
        workspace.Unloaded += (_, _) => ContentScroll.SizeChanged -= Resize;
        Layout();
        PageBody.Children.Add(workspace);
    }

    private async Task PickAssistantScope(JsonNode groups)
    {
        var group = Choice("المجموعة", Options(groups.AsArray(), "title"), assistantGroup ?? "");
        if (!await Dialog("نطاق المحادثة", Stack(group, Text("يستخدم المساعد سجلات المجموعة المختارة في الطلبات التالية.")), "اختيار النطاق")) return;
        assistantGroup = Selected(group) == "" ? null : Selected(group);
        assistantFocus = assistantParent = null;
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
    private static string LocalAssistantTime(string time) => DateTimeOffset.TryParse(time, out var value) ? value.ToOffset(TimeSpan.FromHours(3)).ToString("yyyy-MM-dd HH:mm", System.Globalization.CultureInfo.InvariantCulture) + " (الرياض)" : time;
    private FrameworkElement AddAssistantTurn(StackPanel timeline, JsonNode turn, long revision)
    {
        var id = V(turn, "id");
        var question = assistantQuestions.GetValueOrDefault(id) ?? V(turn, "requestLabel");
        if (string.IsNullOrWhiteSpace(question)) question = V(turn, "title");
        var text = Text(question, 16); text.IsTextSelectionEnabled = true;
        var userBubble = new Border { MaxWidth = 510, HorizontalAlignment = HorizontalAlignment.Left, Padding = new Thickness(14), CornerRadius = new CornerRadius(16), Background = (Brush)Application.Current.Resources["AccentFillColorSecondaryBrush"], Child = Stack(Text("أنت", 13), text) };
        timeline.Children.Add(userBubble);
        var content = Stack(Text(V(turn, "title"), 21), Text(V(turn, "summary"), 16));
        var model = V(turn, "origin") == "AI_TOOL_PLAN" ? "اختار AI الأدوات؛ النتائج من قاعدة المشروع" : "أدوات المشروع المحلية • " + (V(turn, "modelStatus") switch { "AI_DAILY_LIMIT" => "بلغ الحد اليومي؛ لم يُستدعَ النموذج", "AI_DISABLED" => "AI معطل", "AI_CONFIGURATION_REQUIRED" => "مفتاح المزود غير متاح", "AI_MODEL_UNAVAILABLE" => "النموذج غير متاح في قائمة المزود", "UNAVAILABLE" => "تعذر AI دون إعادة تلقائية", "INTERRUPTED" => "استعادة طلب توقف سابقًا", _ => "قراءة محلية" });
        content.Children.Add(Text(model + (V(turn, "model") == "" ? "" : " • " + V(turn, "model")) + "\nقراءة السجلات: " + LocalAssistantTime(V(turn, "observedAt")) + (V(turn, "period") != "ALL" ? " • مرجع الفترة: " + V(turn, "anchorDate") : ""), 12));
        if (turn["accountReference"] is JsonObject account) content.Children.Add(Button("عرض بيانات الحساب", () => ShowAccountCredentials(V(account, "id"), V(account, "name"), V(account, "username"))));
        if (turn["accountAction"] is JsonObject accountAction) content.Children.Add(Button(V(accountAction, "kind") == "restore" ? "معاينة استرجاع الحساب" : "معاينة أرشفة الحساب",
            () => ChangeAccountArchive(V(accountAction, "id"), V(accountAction, "name"), V(accountAction, "username"), Ver(accountAction), V(accountAction, "kind") == "restore")));
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
        timeline.Children.Add(new Border { Child = content, Padding = new Thickness(18), CornerRadius = new CornerRadius(18), Background = (Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"], BorderThickness = new Thickness(1), BorderBrush = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"] });
        return userBubble;
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
