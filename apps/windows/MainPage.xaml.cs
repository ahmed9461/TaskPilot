using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using System.Text.Json.Nodes;
namespace TaskPilot_Windows;

public sealed partial class MainPage : Page
{
    private readonly ApiClient api = new();
    private SshConnection? sshConnection;
    private readonly ClientConnectionState connectionState = new();
    private string? lastSshAlias;
    private bool shuttingDown;
    public void Shutdown()
    {
        if (shuttingDown)
            return;
        shuttingDown = true;
        timer.Stop();
        sshConnection?.StopTunnel();
        desktop.Dispose();
        api.Dispose();
    }
    private async Task<string?> Reauth(string value) => sshConnection is null ? value : await sshConnection.Reauthorize();
    private string page = "dashboard";
    private bool busy, polling, renderPending, pendingChanges, hasDraft;
    private bool Editing() => hasDraft || Microsoft.UI.Xaml.Input.FocusManager.GetFocusedElement(XamlRoot) is TextBox or PasswordBox or ComboBox or NumberBox or CheckBox;
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(10) };
    private static string FriendlyError(string code) => code switch
    {
        "CONFLICT" or "STALE_PREVIEW" => "تغيرت البيانات. حدّث القائمة وأنشئ معاينة جديدة.",
        "LIVE_WHATSAPP_NOT_AUTHORIZED" => "الاتصال الحقيقي معطّل على الخادم بانتظار موافقتك المنفصلة.",
        "LIVE_SENDING_NOT_AUTHORIZED" => "الإرسال الحقيقي معطّل. لم يُعتمد الرد.",
        "PAIRING_QR_EXPIRED" => "انتهى رمز الربط. حدّث الجلسات واطلب الرمز الحالي.",
        "WHATSAPP_NOT_CONNECTED" or "WHATSAPP_CONNECT_FAILED" => "جلسة واتساب غير متصلة. راجع حالتها قبل المحاولة.",
        "WHATSAPP_SESSION_IN_USE" => "الجلسة قيد الاستخدام في عملية أخرى.",
        "WHATSAPP_GROUP_NOT_DISCOVERED" => "اقرأ المجموعات المتاحة من الجلسة ثم اختر المجموعة المطلوبة.",
        "REAUTH_REQUIRED" => "انتهى التحقق أو استُخدم. أعد فتح معاينة العملية للتحقق من جديد.",
        "PERMISSION_DENIED" or "SESSION_EXPIRED" => "انتهت جلسة الاتصال أو أُلغيت. أعد الاتصال للمتابعة.",
        "RATE_LIMITED" => "وصلت إلى حد الطلبات المؤقت. انتظر قليلًا قبل المحاولة.",
        "SSH_SESSION_FAILED" or "SSH_TUNNEL_FAILED" => "تعذر الاتصال عبر SSH. تحقق من الاتصال المحفوظ ثم أعد المحاولة.",
        "VALIDATION_ERROR" => "راجع الحقول المطلوبة وصيغتها.",
        "DELETION_REQUIRES_CONFIRMATION" => "اكتب عبارة التأكيد مطابقة للمعاينة.",
        "DELIVERY_REQUIRES_RECONCILIATION" => "احسم حالة الرد المجهولة قبل الحذف.",
        "APPROVAL_EXPIRED_OR_CONSUMED" => "انتهت المعاينة أو استُخدمت. أنشئ معاينة جديدة.",
        "TEMPLATE_NOT_AVAILABLE" or "TEMPLATE_SCOPE_MISMATCH" => "القالب متوقف أو لا يطابق المهمة والمجموعة. اختر قالبًا مطابقًا وأنشئ معاينة جديدة.",
        "UNSAFE_TEMPLATE" => "القالب يتضمن متغيرًا غير مسموح. استخدم اسم الحساب واسم المهمة فقط.",
        "CREDENTIAL_CONFLICT" => "الاعتماد يختلف عن المحفوظ. حدّثه صراحة من الحساب بعد التحقق.",
        "SECURE_CONNECTION_REQUIRED" => "استخدم HTTPS أو نفق SSH محليًا.",
        "INVALID_API_TOKEN" => "رمز الوصول غير مكتمل.",
        "CONNECTION_REQUIRED" => "أدخل بيانات الاتصال من الإعدادات.",
        _ => code.Any(c => c >= '\u0600' && c <= '\u06ff') ? code : "تعذرت العملية. تحقق من الاتصال والبيانات ثم أعد المحاولة."
    };
    private static string V(JsonNode? n, string key) => n?[key]?.ToString() ?? "";
    private static int Ver(JsonNode n) => n["version"]!.GetValue<int>();
    private static TextBlock Text(string s, int size = 14) => new() { Text = s, FontSize = size, TextWrapping = TextWrapping.Wrap };
    private static TextBox Field(string label, string s = "") => new() { Header = label, Text = s, MinWidth = 300, MaxLength = 200 };
    private static PasswordBox Secret(string label) => new() { Header = label, PasswordRevealMode = PasswordRevealMode.Hidden };
    private PasswordBox ReauthField() => new() { Header = sshConnection is null ? "سر إعادة التحقق" : "ستتم إعادة المصادقة عبر SSH عند الموافقة", IsEnabled = sshConnection is null, PasswordRevealMode = PasswordRevealMode.Hidden };
    private static StackPanel Stack(params UIElement[] items)
    {
        var p = new StackPanel { Spacing = 12 };
        foreach (var x in items)
            p.Children.Add(x);
        return p;
    }
    private Button Button(string title, Func<Task> action)
    {
        var b = new Button { Content = title };
        b.Click += async (_, _) => await Run(action);
        return b;
    }
    private void Card(string title, string detail, params UIElement[] actions)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        foreach (var a in actions)
            row.Children.Add(a);
        Body.Children.Add(new Border { Padding = new Thickness(20), CornerRadius = new CornerRadius(12), BorderThickness = new Thickness(1), BorderBrush = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"], Background = (Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"], Child = Stack(Text(title, 20), Text(detail), row) });
    }
    private async Task Run(Func<Task> action)
    {
        if (busy || shuttingDown)
            return;
        busy = true;
        BusyIndicator.IsActive = true;
        BusyIndicator.Visibility = Visibility.Visible;
        try
        {
            await action();
        }
        catch (Exception ex)
        {
            connectionState.Failed(ex);
            if (!shuttingDown)
            {
                Connection.Severity = InfoBarSeverity.Warning;
                Connection.Title = "تعذر تنفيذ العملية";
                Connection.Message = ex is InvalidOperationException ? FriendlyError(ex.Message) : "تعذر الاتصال بالخدمة. لم تُعد العملية تلقائيًا؛ حدّث البيانات قبل المحاولة.";
                ShowConnectionProblem();
            }
        }
        finally
        {
            busy = false;
            if (!shuttingDown)
            {
                BusyIndicator.IsActive = false;
                BusyIndicator.Visibility = Visibility.Collapsed;
                if (renderPending)
                {
                    renderPending = false;
                    await Run(Render);
                }
            }
        }
    }
    public MainPage()
    {
        InitializeComponent();
        desktop.OpenRequested += () => DispatcherQueue.TryEnqueue(async () => { if (shuttingDown) return; App.CurrentWindow?.Activate(); page = "notifications"; Heading.Text = "الإشعارات"; if (busy) renderPending = true; else await Run(Render); });
        Loaded += async (_, _) =>
        {
            await Run(async () =>
        {
            var file = Environment.GetEnvironmentVariable("TASKPILOT_CLIENT_CONFIG_FILE");
            if (file is not null)
            {
                var n = JsonNode.Parse(await System.IO.File.ReadAllTextAsync(file))!;
                api.Configure(V(n, "address"), V(n, "token"));
            }
            var injectedToken = Environment.GetEnvironmentVariable("TASKPILOT_CLIENT_API_TOKEN");
            if (injectedToken is not null)
            {
                api.Configure(Environment.GetEnvironmentVariable("TASKPILOT_CLIENT_ADDRESS") ?? api.Address, injectedToken);
                Environment.SetEnvironmentVariable("TASKPILOT_CLIENT_API_TOKEN", null);
            }
            var sshAlias = Environment.GetEnvironmentVariable("TASKPILOT_SSH_ALIAS");
            if (sshAlias is not null)
                await ConnectSsh(sshAlias);
            if (api.Connected && sshConnection is null)
                connectionState.Connected(null);
            if (api.Connected && sshConnection is null)
                await InitializeSync("manual:" + api.Address);
            await Render();
        });
            if (!shuttingDown)
                timer.Start();
            var probeFile = Environment.GetEnvironmentVariable("TASKPILOT_NOTIFICATION_PROBE_FILE");
            Environment.SetEnvironmentVariable("TASKPILOT_NOTIFICATION_PROBE_FILE", null);
            if (probeFile is not null)
                await Run(() => NotificationProbe.Run(desktop, probeFile));
        };
        Unloaded += async (_, _) => { timer.Stop(); if (sshConnection is not null) await sshConnection.DisposeAsync(); api.Dispose(); };
        timer.Tick += async (_, _) => await PollChanges();
    }
    private void ShowConnectionProblem()
    {
        ReconnectButton.Visibility = connectionState.Phase is ConnectionPhase.Interrupted or ConnectionPhase.Expired or ConnectionPhase.Unauthorized ? Visibility.Visible : Visibility.Collapsed;
        if (connectionState.Phase is ConnectionPhase.Expired or ConnectionPhase.Unauthorized)
        {
            sshConnection?.StopTunnel();
            Connection.Severity = InfoBarSeverity.Warning;
            Connection.Title = "تحتاج إعادة الاتصال";
            Connection.Message = "انتهت الجلسة أو أُلغيت. تبقى البيانات على الخادم؛ اضغط إعادة الاتصال للمتابعة.";
        }
        else if (connectionState.Phase == ConnectionPhase.Interrupted)
        {
            Connection.Severity = InfoBarSeverity.Warning;
            Connection.Title = "الاتصال متوقف مؤقتًا";
            Connection.Message = "تُعاد محاولة القراءة تدريجيًا. العمليات التي تغيّر البيانات لا تُعاد تلقائيًا.";
        }
    }
    private async void Reconnect_Click(object sender, RoutedEventArgs args) => await Run(async () =>
    {
        if (lastSshAlias is null)
        {
            page = "settings";
            Heading.Text = "الإعدادات";
            await Render();
            return;
        }
        await ConnectSsh(lastSshAlias);
        if (!Editing())
            await Render();
        else
        {
            Connection.Severity = InfoBarSeverity.Success;
            Connection.Title = "أعيد الاتصال";
            Connection.Message = "احتُفظ بما تحرره. اضغط تحديث بعد الانتهاء لرؤية أحدث البيانات.";
        }
    });
    private async Task PollChanges()
    {
        if (shuttingDown || polling || busy || !api.Connected)
            return;
        if (!connectionState.CanPoll())
        {
            ShowConnectionProblem();
            return;
        }
        polling = true;
        try
        {
            if (sshConnection is not null && !sshConnection.IsTunnelAlive)
                throw new HttpRequestException("SSH_TUNNEL_FAILED");
            var n = await api.Send("GET", "/v1/changes?cursor=" + changes.Cursor);
            if (shuttingDown)
                return;
            var notificationState = await api.Send("GET", "/v1/notifications/state");
            if (shuttingDown)
                return;
            var batch = changes.Consume(n);
            UpdateUnread(notificationState);
            if (batch.AttentionItems > 0)
                desktop.Show(batch.AttentionItems);
            connectionState.Succeeded();
            ReconnectButton.Visibility = Visibility.Collapsed;
            Connection.Severity = InfoBarSeverity.Success;
            Connection.Title = "متصل بالخادم";
            Connection.Message = TransportSummary;
            pendingChanges |= batch.NewItems > 0;
            if (pendingChanges && page != "settings" && !Editing())
                await Run(RefreshFromChanges);
            else if (pendingChanges)
                Connection.Message = "توجد تغييرات جديدة؛ اضغط تحديث بعد الانتهاء من التحرير.";
        }
        catch (Exception error) { connectionState.Failed(error); if (!shuttingDown) ShowConnectionProblem(); }
        finally { polling = false; }
    }

    private async Task RefreshFromChanges()
    {
        var offset = ContentScroll.VerticalOffset;
        var currentPage = page;
        await Render();
        if (currentPage == page && !shuttingDown)
        {
            ContentScroll.UpdateLayout();
            ContentScroll.ChangeView(null, offset, null, true);
        }
    }

    private async void Navigate(NavigationView sender, NavigationViewSelectionChangedEventArgs e)
    {
        if (Body is null)
            return;
        page = e.IsSettingsSelected ? "settings" : e.SelectedItemContainer?.Tag?.ToString() ?? "dashboard";
        Heading.Text = e.IsSettingsSelected ? "الإعدادات" : e.SelectedItemContainer?.Content?.ToString() ?? "لوحة التحكم";
        if (busy)
        {
            renderPending = true;
            return;
        }
        await Run(Render);
    }
    private async Task<bool> Dialog(string title, UIElement content, string primary = "حفظ") => await new ContentDialog { Title = title, Content = content, PrimaryButtonText = primary, CloseButtonText = "إلغاء", DefaultButton = ContentDialogButton.Close, XamlRoot = XamlRoot, FlowDirection = FlowDirection.RightToLeft }.ShowAsync() == ContentDialogResult.Primary;
    private async Task Render()
    {
        if (shuttingDown)
            return;
        pendingChanges = false;
        hasDraft = false;
        Body.Children.Clear();
        if (page == "settings" || !api.Connected)
        {
            Settings();
            return;
        }
        var identity = await api.Send("GET", "/v1/me");
        liveSendingEnabled = identity["liveSendingEnabled"]?.GetValue<bool>() == true;
        liveConnectionEnabled = identity["liveConnectionEnabled"]?.GetValue<bool>() == true;
        var notificationState = await api.Send("GET", "/v1/notifications/state");
        if (shuttingDown)
            return;
        UpdateUnread(notificationState);
        Connection.Severity = InfoBarSeverity.Success;
        Connection.Title = "متصل بالخادم";
        Connection.Message = TransportSummary;
        Body.Children.Add(Button("تحديث", Render));
        switch (page)
        {
            case "dashboard":
                await Dashboard();
                break;
            case "account-details":
                await AccountDetails();
                break;
            case "accounts":
                await Accounts();
                break;
            case "assignments":
                await Assignments();
                break;
            case "inbox":
                await Inbox();
                break;
            case "groups":
                await Groups();
                break;
            case "sessions":
                await Sessions();
                break;
            case "replies":
                await Replies();
                break;
            case "notifications":
                await Notifications();
                break;
            case "audit":
                await Audit();
                break;
            case "operations":
                await Operations();
                break;
        }
    }
    private void Settings()
    {
        var alias = Field("اسم اتصال SSH المحفوظ", lastSshAlias ?? "New-VPS");
        Body.Children.Add(Stack(Text("اتصال خاص بجلسة مؤقتة", 24), Text("يتطلب اتصال SSH محفوظًا وموثوقًا. مدة الجلسة 30 دقيقة؛ الموافقة على العملية الحساسة تطلب تحققًا جديدًا عبر SSH."), alias, Button("اتصال عبر SSH", async () => { await ConnectSsh(alias.Text); page = "dashboard"; await Render(); })));
        if (sshConnection is not null)
            Body.Children.Add(Text("انتهاء الجلسة: " + sshConnection.ExpiresAt.ToLocalTime().ToString("HH:mm:ss")));
        if (api.Connected)
            Body.Children.Add(Button("تسجيل الخروج", async () => { if (sshConnection is not null) await sshConnection.DisposeAsync(); sshConnection = null; lastSshAlias = null; api.Disconnect(); connectionState.Disconnect(); syncWorkspace = null; changes.Seed("0"); UnreadBadge.Visibility = Visibility.Collapsed; ReconnectButton.Visibility = Visibility.Collapsed; await Render(); }));
        var address = Field("عنوان الخدمة الآمن", api.Address);
        address.FlowDirection = FlowDirection.LeftToRight;
        var token = Secret("رمز وصول المالك");
        var theme = new ComboBox { Header = "المظهر", ItemsSource = new[] { "النظام", "داكن", "فاتح" }, SelectedIndex = 0 };
        theme.SelectionChanged += (_, _) => RequestedTheme = theme.SelectedIndex switch { 1 => ElementTheme.Dark, 2 => ElementTheme.Light, _ => ElementTheme.Default };
        Body.Children.Add(Stack(Text("الاتصال بمساحة العمل", 24), Text("استخدم HTTPS أو نفق SSH محلي. لا تحفظ الواجهة بيانات الحسابات أو رمز الوصول على القرص."), address, token, theme, Button("اتصال", async () => { api.Configure(address.Text, token.Password); token.Password = ""; if (sshConnection is not null) await sshConnection.DisposeAsync(); sshConnection = null; lastSshAlias = null; syncWorkspace = null; connectionState.Connected(null); ReconnectButton.Visibility = Visibility.Collapsed; await InitializeSync("manual:" + api.Address); page = "dashboard"; await Render(); })));
        DesktopSettings();
    }
    private async Task ConnectSsh(string alias)
    {
        var next = await SshConnection.Connect(alias);
        if (shuttingDown)
        {
            await next.DisposeAsync();
            return;
        }
        if (sshConnection is not null)
            await sshConnection.DisposeAsync();
        sshConnection = next;
        api.Configure(next.Address, next.Token, next.ExpiresAt);
        lastSshAlias = alias;
        connectionState.Connected(next.ExpiresAt);
        ReconnectButton.Visibility = Visibility.Collapsed;
        await InitializeSync("ssh:" + alias);
    }
    private async Task Dashboard()
    {
        var n = await api.Send("GET", "/v1/dashboard");
        Card("كل أعمالك في مكان واحد", "الحساب مستقل عن المهام؛ إكمال المهمة لا يرسل ردًا تلقائيًا.");
        foreach (var (key, title) in new[] { ("accounts", "الحسابات"), ("open", "المهام المفتوحة"), ("completed", "المكتملة"), ("review", "بحاجة مراجعة"), ("unknown_delivery", "ردود تحتاج تحققًا") })
            Card(V(n, key), title);
    }
    private async Task Accounts()
    {
        AccountFilters();
        var selectedIds = new HashSet<string>();
        Body.Children.Add(Stack(Button("إضافة حساب", () => AccountForm(null)), Button("معاينة حذف المحدد", async () => { if (selectedIds.Count == 0) throw new InvalidOperationException("حدد حسابًا واحدًا على الأقل."); await Purge(null, selectedIds.ToArray()); }), Button("معاينة حذف الكل", () => Purge(null))));
        var result = await PageData("accounts");
        var rows = result["items"]!.AsArray();
        foreach (var r in rows)
        {
            var n = r!;
            var select = new CheckBox { Content = "تحديد" };
            select.Checked += (_, _) => { selectedIds.Add(V(n, "id")); hasDraft = true; };
            select.Unchecked += (_, _) => { selectedIds.Remove(V(n, "id")); hasDraft = true; };
            Card(V(n, "display_name"), $"{V(n, "namespace")} / {V(n, "username_normalized")} • {(V(n, "archived_at") == "" ? "نشط" : "مؤرشف")}", select, Button("التفاصيل والسجل", async () => { detailAccountId = V(n,"id"); detailSection = "tasks"; detailOffset = 0; page = "account-details"; await Render(); }), Button("تعديل", () => AccountForm(n)), Button("عرض الاعتماد", () => Reveal(n)), Button(V(n, "archived_at") == "" ? "أرشفة" : "استرجاع", async () => { await api.Send("POST", $"/v1/accounts/{V(n, "id")}/{(V(n, "archived_at") == "" ? "archive" : "restore")}", new { version = Ver(n) }); await Render(); }), Button("حذف", () => Purge(V(n, "id"))));
        }
        if (rows.Count == 0)
            Body.Children.Add(Text("لا توجد حسابات مطابقة."));
        Pager("accounts", result);
    }
    private async Task AccountForm(JsonNode? n)
    {
        var ns = Field("النظام", n is null ? "synthetic" : V(n, "namespace"));
        var user = Field("المستخدم", V(n, "username_normalized"));
        ns.IsEnabled = user.IsEnabled = n is null;
        var name = Field("الاسم", V(n, "display_name"));
        var pass = Secret("كلمة المرور (اختياري)");
        var reauth = ReauthField();
        if (!await Dialog(n is null ? "حساب جديد" : "تعديل الحساب", Stack(ns, user, name, pass, reauth)))
            return;
        var payload = new JsonObject { ["displayName"] = name.Text };
        if (pass.Password != "")
            payload["password"] = pass.Password;
        if (n is null)
        {
            payload["namespace"] = ns.Text;
            payload["username"] = user.Text;
            await api.Send("POST", "/v1/accounts", payload);
        }
        else
        {
            payload["version"] = Ver(n);
            await api.Send("PATCH", "/v1/accounts/" + V(n, "id"), payload, await Reauth(reauth.Password));
        }
        pass.Password = reauth.Password = "";
        await Render();
    }
    private async Task Reveal(JsonNode n)
    {
        var reauth = ReauthField();
        if (!await Dialog("عرض مؤقت لمدة 30 ثانية", reauth, "تحقق"))
            return;
        var result = await api.Send("POST", "/v1/accounts/" + V(n, "id") + "/reveal", new
        {
        }, await Reauth(reauth.Password));
        reauth.Password = "";
        var secret = new PasswordBox { Header = "الاعتماد", Password = V(result, "password"), PasswordRevealMode = PasswordRevealMode.Peek };
        var expiry = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        expiry.Tick += (_, _) => { secret.Password = ""; expiry.Stop(); };
        expiry.Start();
        await Dialog("بيانات الحساب", secret, "إغلاق");
        secret.Password = "";
        expiry.Stop();
    }
    private async Task Purge(string? id, string[]? selected = null)
    {
        var targets = selected ?? (id is null ? null : new[] { id });
        var p = await api.Send("POST", "/v1/deletions/preview", targets is null ? new
        {
            all = true
        } : (object)new
        {
            ids = targets
        });
        var phrase = Field("اكتب " + V(p, "confirmation"));
        var reauth = ReauthField();
        var names = string.Join("، ", p["accounts"]!.AsArray().Select(a => V(a, "display_name")));
        if (!await Dialog("حذف نهائي", Stack(Text(names), Text($"المهام: {V(p, "assignments")} • الردود: {V(p, "replies")} • الرسائل المعلّقة: {V(p,"pendingIngress")}\nتُحذف البيانات المرتبطة في TaskPilot؛ النسخ الاحتياطية لها احتفاظ منفصل. لا تُحذف رسائل واتساب من أجهزة الآخرين."), phrase, reauth), "حذف نهائي"))
            return;
        await api.Send("POST", "/v1/deletions/confirm", new
        {
            approvalToken = V(p, "approvalToken"),
            confirmation = phrase.Text
        }, await Reauth(reauth.Password));
        reauth.Password = "";
        await Render();
    }
    private async Task Assignments()
    {
        await AssignmentFilters();
        var result = await PageData("assignments");
        foreach (var r in result["items"]!.AsArray())
        {
            var n = r!;
            var status = Choice("الحالة", StatusCodes.Select(c => (c, StateLabel(c))), V(n, "status"));
            TrackDraft(status);
            Card(V(n, "display_name"), $"{V(n, "task_name")} • {V(n, "period_key")} • {StateLabel(V(n, "status"))} • أولوية {V(n, "priority")}", status,
            Button("حفظ الحالة", async () => { await api.Send("PATCH", "/v1/assignments/" + V(n, "id") + "/status", new { status = Selected(status), version = Ver(n) }); await Render(); }), Button("معاينة رد", () => Reply(n)), Button("مشكلة اعتماد", () => Flag(n)), Button("حذف التكليف", () => PurgeAssignment(n)));
        }
        Pager("assignments", result);
    }
    private async Task Flag(JsonNode a)
    {
        var kind = new ComboBox { Header = "النوع", ItemsSource = new[] { "UNVERIFIED_CREDENTIALS", "INVALID_ACCOUNT_PASSWORD", "INVALID_ACCOUNT_CODE" }, SelectedIndex = 0 };
        var evidence = new ComboBox { Header = "الدليل", ItemsSource = new[] { "UNVERIFIED", "MANUAL", "AUTHORIZED_CHECK" }, SelectedIndex = 0 };
        var reauth = ReauthField();
        if (await Dialog("مشكلة بيانات الدخول", Stack(Text("MANUAL إقرار منك بأن الخطأ مثبت؛ لا تختَره بناءً على التخمين."), kind, evidence, reauth)))
        {
            await api.Send("POST", "/v1/issue-flags", new
            {
                accountId = V(a, "account_id"),
                kind = kind.SelectedItem.ToString(),
                evidenceKind = evidence.SelectedItem.ToString()
            }, await Reauth(reauth.Password));
            reauth.Password = "";
            await Render();
        }
    }
    private async Task Reply(JsonNode a)
    {
        var selection = await ChooseReply(a);
        if (selection is null)
            return;
        var p = await api.Send("POST", "/v1/reply-jobs/preview", new
        {
            assignmentId = V(a, "id"),
            sourceMessageId = V(selection.Value.Source, "id"),
            templateId = V(selection.Value.Template, "id")
        });
        var reauth = ReauthField();
        var real = V(p,"provider") == "baileys";
        if (real && !liveSendingEnabled) throw new InvalidOperationException("الإرسال الحقيقي معطّل على الخادم. لم يُعتمد أي رد.");
        if (!await Dialog(real ? "إقرار إرسال رد واتساب حقيقي" : "إقرار رد محاكى", Stack(Text(V(p, "body"), 20), Text($"المجموعة: {V(p, "groupTitle")}\nالجلسة: {V(p, "sessionId")}\nالرسالة: {V(p, "externalMessageId")}\n" + (real ? "سيُرسل النص إلى رسالة المصدر في واتساب بعد الإقرار." : "موصل mock؛ لا إرسال واتساب حقيقي.")), reauth), real ? "إرسال الرد الحقيقي" : "إقرار المحاكاة"))
            return;
        await api.Send("POST", "/v1/reply-jobs/approve", new
        {
            approvalToken = V(p, "approvalToken"),
            idempotencyKey = Guid.NewGuid().ToString()
        }, await Reauth(reauth.Password));
        reauth.Password = "";
        await Render();
    }
    private async Task Inbox()
    {
        Body.Children.Add(Button("إدخال رسالة اختبار وهمية", async () =>
        {
            var mockIds = (await api.Send("GET", "/v1/sessions")).AsArray().Where(n=>V(n,"provider")=="mock").Select(n=>V(n,"id")).ToHashSet();
            var groups = new JsonArray((await api.Send("GET", "/v1/groups")).AsArray().Where(n=>mockIds.Contains(V(n,"session_id"))).Select(n=>n!.DeepClone()).ToArray());
            if (groups.Count == 0)
                throw new InvalidOperationException("أضف مجموعة محاكاة أولًا.");
            var group = Choice("المجموعة", groups.Select(g => (V(g, "id"), ChoiceLabel(g!, "title"))));
            var content = new TextBox { Header = "بيانات وهمية فقط", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinWidth = 320, Height = 150, MaxLength = 16000, Text = "الاسم: حساب اختبار\nاليوزر: demo-new\nكلمة المرور: synthetic-only" };
            if (!await Dialog("محاكاة استلام رسالة", Stack(Text("تُحفظ الرسالة في الخادم؛ لا تُرسل إلى واتساب."), group, content), "استقبال محاكى"))
                return;
            var selected = groups.Single(g => V(g, "id") == Selected(group))!;
            await api.Send("POST", "/v1/mock/messages", new
            {
                sessionId = V(selected, "session_id"),
                groupId = V(selected, "id"),
                externalMessageId = "ui-fixture-" + Guid.NewGuid(),
                text = content.Text
            });
            content.Text = "";
            await Render();
        }));
        var result = await PageData("inbox");
        var rows = result["items"]!.AsArray();
        foreach (var row in rows)
        {
            var n = row!;
            Card("بيانات تحتاج مراجعة", V(n, "group_title") + " • " + V(n, "external_message_id"), Button("مراجعة", async () =>
            {
                var reauth = ReauthField();
                if (!await Dialog("مراجعة الوارد", reauth, "فتح"))
                    return;
                var raw = await api.Send("POST", "/v1/inbox/" + V(n, "id") + "/reveal", new
                {
                }, await Reauth(reauth.Password));
                var name = Field("الاسم");
                var user = Field("المستخدم");
                var ns = Field("النظام", V(n, "namespace"));
                var pass = Secret("كلمة المرور (اختياري)");
                var task = Choice("المهمة", Options((await api.Send("GET", "/v1/task-types")).AsArray(), "name"), V(n, "routing_task_type_id"));
                var view = new TextBox { Header = "محتوى محمي — يُخفى بعد 30 ثانية", IsReadOnly = true, AcceptsReturn = true, Text = V(raw, "text"), TextWrapping = TextWrapping.Wrap, MinHeight = 90, MaxHeight = 180 };
                var hide = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
                hide.Tick += (_, _) => { view.Text = ""; hide.Stop(); };
                hide.Start();
                var ok = await Dialog("تصحيح البيانات", Stack(view, ns, name, user, pass, task));
                hide.Stop();
                view.Text = "";
                if (ok)
                {
                    var account = new JsonObject { ["namespace"] = ns.Text, ["username"] = user.Text, ["displayName"] = name.Text };
                    if (pass.Password != "")
                        account["password"] = pass.Password;
                    var payload = new JsonObject { ["version"] = Ver(n), ["account"] = account };
                    if (Selected(task) != "")
                        payload["taskTypeId"] = Selected(task);
                    await api.Send("POST", "/v1/inbox/" + V(n, "id") + "/resolve", payload, await Reauth(reauth.Password));
                }
                reauth.Password = pass.Password = "";
                await Render();
            }));
        }
        if (rows.Count == 0)
            Body.Children.Add(Text("صندوق المراجعة فارغ."));
        Pager("inbox", result);
    }
    private async Task Sessions() => await WhatsAppSessions();
    private async Task Groups()
    {
        Body.Children.Add(Button("إضافة نوع مهمة", async () => { var code = Field("رمز النوع"); var name = Field("الاسم"); if (await Dialog("نوع مهمة", Stack(code, name))) { await api.Send("POST", "/v1/task-types", new { code = code.Text, name = name.Text }); await Render(); } }));
        Body.Children.Add(Button("ربط مجموعة محاكاة", async () =>
        {
            var sessions = new JsonArray((await api.Send("GET", "/v1/sessions")).AsArray().Where(n => V(n,"provider") == "mock").Select(n=>n!.DeepClone()).ToArray());
            var tasks = (await api.Send("GET", "/v1/task-types")).AsArray();
            if (sessions.Count == 0 || tasks.Count == 0)
                throw new InvalidOperationException("أضف جلسة ونوع مهمة أولًا.");
            var s = new ComboBox { Header = "الجلسة", ItemsSource = sessions.Select(n => ChoiceLabel(n!, "label")).ToArray(), SelectedIndex = 0 };
            var t = new ComboBox { Header = "المهمة", ItemsSource = tasks.Select(n => ChoiceLabel(n!, "name")).ToArray(), SelectedIndex = 0 };
            var title = Field("اسم المجموعة");
            var ext = Field("معرّف المجموعة الوهمي");
            var ns = Field("النظام", "synthetic");
            var period = Field("الفترة", "2026-T1");
            if (await Dialog("مجموعة محاكاة", Stack(s, t, title, ext, ns, period)))
            {
                await api.Send("POST", "/v1/groups", new
                {
                    sessionId = V(sessions[s.SelectedIndex], "id"),
                    taskTypeId = V(tasks[t.SelectedIndex], "id"),
                    externalGroupId = ext.Text,
                    title = title.Text,
                    @namespace = ns.Text,
                    periodKey = period.Text
                });
                await Render();
            }
        }));
        foreach (var r in (await api.Send("GET", "/v1/groups")).AsArray())
        {
            var n = r!;
            var enabled = n["enabled"]!.GetValue<bool>();
            Card(V(n, "title"), $"{V(n, "namespace")} • {V(n, "period_key")} • {(enabled ? "مفعّلة" : "متوقفة")}", Button("القواعد", () => Rules(n)), Button(enabled ? "إيقاف" : "تفعيل", () => ToggleGroup(n, !enabled)));
        }
    }
    private async Task Replies()
    {
        await TemplateList();
        Body.Children.Add(Text("سجل الردود", 24));
        foreach (var n in (await api.Send("GET", "/v1/reply-jobs")).AsArray())
        {
            if (V(n, "status") == "UNKNOWN_DELIVERY")
                Card("تسليم يحتاج تحققًا", V(n, "body"), Button("حسم حالة التسليم", () => Reconcile(n!)));
            else
                Card(StateLabel(V(n, "status")), V(n, "body") + "\n" + V(n, "provider_message_id"));
        }
    }
    private async Task Reconcile(JsonNode job)
    {
        var outcome = new ComboBox { Header = "نتيجة تحققك الفعلي", ItemsSource = new[] { "تأكدت أن الرد وصل", "تأكدت أن الرد لم يُرسل" }, SelectedIndex = 0 };
        var confirmed = new CheckBox { Content = "تحققت من النتيجة بنفسي؛ ليست تخمينًا" };
        var reauth = ReauthField();
        if (!await Dialog("حسم حالة تسليم مجهولة", Stack(Text("لن يُعاد إرسال الرد تلقائيًا بعد الحسم."), outcome, confirmed, reauth), "تسجيل التحقق"))
            return;
        if (confirmed.IsChecked != true)
            throw new InvalidOperationException("يلزم تأكيد تحققك من التسليم.");
        await api.Send("POST", "/v1/reply-jobs/" + V(job, "id") + "/reconcile", new
        {
            outcome = outcome.SelectedIndex == 0 ? "CONFIRMED_SENT" : "CONFIRMED_NOT_SENT",
            evidenceKind = "MANUAL"
        }, await Reauth(reauth.Password));
        reauth.Password = "";
        await Render();
    }

}
