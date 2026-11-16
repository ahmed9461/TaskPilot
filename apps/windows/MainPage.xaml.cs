using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Media;
using System.Text.Json.Nodes;
namespace TaskPilot_Windows;

public sealed partial class MainPage : Page
{
    private readonly ApiClient api = new();
    private SshConnection? sshConnection;
    private readonly ProtectedConnectionStore profileStore = new(IsolatedProfilePath());
    private static string? IsolatedProfilePath()
    {
        var fixture = Environment.GetEnvironmentVariable("TASKPILOT_CLIENT_CONFIG_FILE");
        return fixture is null ? null : System.IO.Path.GetFullPath(fixture) + ".dpapi";
    }
    private readonly ClientConnectionState connectionState = new();
    private string? lastSshAlias;
    private bool shuttingDown;
    public void Shutdown()
    {
        if (shuttingDown)
            return;
        shuttingDown = true;
        viewCache.Clear();
        timer.Stop();
        sshConnection?.StopTunnel();
        desktop.Dispose();
        api.Dispose();
    }
    private async Task<string?> Reauth(string value) => sshConnection is null ? value : await sshConnection.Reauthorize();
    private string page = "dashboard";
    private bool busy, polling, renderPending, pendingChanges, hasDraft;
    private long workRevision;
    private bool Editing() => hasDraft || Microsoft.UI.Xaml.Input.FocusManager.GetFocusedElement(XamlRoot) is TextBox or PasswordBox or ComboBox or NumberBox or CheckBox;
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(10) };
    private static string FriendlyError(string code) => code switch
    {
        "CONFLICT" or "STALE_PREVIEW" => "تغيرت البيانات. حدّث القائمة وأنشئ معاينة جديدة.",
        "LIVE_WHATSAPP_NOT_AUTHORIZED" => "الاتصال الحقيقي معطّل على الخادم بانتظار موافقتك المنفصلة.",
        "LIVE_SENDING_NOT_AUTHORIZED" => "الإرسال الحقيقي معطّل. لم يُعتمد الرد.",
        "REPLY_NOT_PENDING" => "الرد لم يعد منتظرًا؛ حدّث السجل لمعرفة نتيجته. لا يُلغى إرسال بدأ بالفعل.",
        "SENDING_POLICY_NOT_SAFE" => "يتطلب التفعيل جلسة متصلة ومجموعة مفعّلة، دون ردود منتظرة أو قيد الإرسال أو مجهولة التسليم. راجع سجل الردود أولًا.",
        "SENDING_POLICY_RECOVERY_REQUIRED" => "تغيير الإرسال السابق غير مكتمل. استعد وضع الإرسال المعطّل من الإعدادات، ثم أنشئ معاينة جديدة.",
        "SENDING_POLICY_STALE" or "SENDING_POLICY_BUSY" => "تغيرت إعدادات الإرسال أو انتهت المعاينة. افتح معاينة جديدة.",
        "SENDING_POLICY_DISABLED_AFTER_FAILURE" => "تعذر تثبيت التغيير؛ عُطّل الإرسال احترازيًا. حدّث الحالة قبل المتابعة.",
        "SENDING_POLICY_SERVICE_STOPPED" => "تعذر التحقق من تعطيل الإرسال؛ أُوقفت خدمة TaskPilot احترازيًا. يلزم فحص الخادم قبل استئنافها.",
        "SENDING_POLICY_UNAVAILABLE" => "تعذر التحقق من إعداد الإرسال. حدّث الاتصال والحالة قبل المحاولة؛ لا تفترض نجاح التغيير.",
        "PAIRING_QR_EXPIRED" => "انتهى رمز الربط. حدّث الجلسات واطلب الرمز الحالي.",
        "WHATSAPP_NOT_CONNECTED" or "WHATSAPP_CONNECT_FAILED" => "جلسة واتساب غير متصلة. راجع حالتها قبل المحاولة.",
        "WHATSAPP_SESSION_IN_USE" => "الجلسة قيد الاستخدام في عملية أخرى.",
        "SESSION_FORGOTTEN" => "نُسيت مصادقة هذه الجلسة. أنشئ إعداد جلسة جديدًا للربط؛ يبقى التاريخ السابق محفوظًا.",
        "STOP_SESSION_BEFORE_FORGETTING" => "أوقف اتصال الجلسة أولًا قبل معاينة نسيان مصادقتها.",
        "WHATSAPP_GROUP_NOT_DISCOVERED" => "اقرأ المجموعات المتاحة من الجلسة ثم اختر المجموعة المطلوبة.",
        "REAUTH_REQUIRED" => "انتهى التحقق أو استُخدم. أعد فتح معاينة العملية للتحقق من جديد.",
        "PERMISSION_DENIED" or "SESSION_EXPIRED" => "انتهت جلسة الاتصال أو أُلغيت. أعد الاتصال للمتابعة.",
        "AI_DISABLED" => "فعّل الاقتراحات والموافقة على اتصال المزود من صفحة الذكاء الاصطناعي.",
        "AI_CONFIGURATION_REQUIRED" => "مفتاح المزود غير مضبوط على الخادم.",
        "AI_DAILY_LIMIT" => "بلغت الحد اليومي للطلبات أو حجز التوكنات. راجع الاستخدام والحدود.",
        "AI_UNAVAILABLE" or "AI_MODEL_UNAVAILABLE" => "تعذر استخدام المزود أو النموذج. تستمر القواعد والمراجعة المحلية.",
        "AI_REVIEW_SOURCE_REQUIRED" or "AI_IDEMPOTENCY_CONFLICT" => "تغير المصدر أو إعداد التحليل. حدّث صندوق المراجعة.",
        "RATE_LIMITED" => "وصلت إلى حد الطلبات المؤقت. انتظر قليلًا قبل المحاولة.",
        "SSH_SESSION_FAILED" or "SSH_TUNNEL_FAILED" => "تعذر الاتصال عبر SSH. تحقق من الاتصال المحفوظ ثم أعد المحاولة.",
        "VALIDATION_ERROR" => "راجع الحقول المطلوبة وصيغتها.",
        "DELETION_REQUIRES_CONFIRMATION" => "اكتب عبارة التأكيد مطابقة للمعاينة.",
        "DELIVERY_REQUIRES_RECONCILIATION" => "احسم حالة الرد المجهولة قبل الحذف.",
        "APPROVAL_EXPIRED_OR_CONSUMED" => "انتهت المعاينة أو استُخدمت. أنشئ معاينة جديدة.",
        "TEMPLATE_NOT_AVAILABLE" or "TEMPLATE_SCOPE_MISMATCH" => "القالب متوقف أو لا يطابق المهمة والمجموعة. اختر قالبًا مطابقًا وأنشئ معاينة جديدة.",
        "UNSAFE_TEMPLATE" => "القالب يتضمن متغيرًا غير مسموح. استخدم اسم الحساب واسم المهمة فقط.",
        "UNVERIFIED_CREDENTIALS" => "لم يثبت خطأ الاعتماد. اختر بلاغًا غير متحقق، أو قدّم دليل تحقق مؤكدًا.",
        "CREDENTIAL_CONFLICT" => "الاعتماد يختلف عن المحفوظ. حدّثه صراحة من الحساب بعد التحقق.",
        "SECURE_CONNECTION_REQUIRED" => "استخدم HTTPS أو نفق SSH محليًا.",
        "INVALID_API_TOKEN" => "رمز الوصول غير مكتمل.",
        "CONNECTION_REQUIRED" => "أدخل بيانات الاتصال من الإعدادات.",
        "DEVICE_PROFILE_UNAVAILABLE" => "تعذر قراءة ملف ربط الجهاز المحمي. افتح الإعدادات لإعادة الربط عبر Tailscale.",
        "INVALID_DEVICE_PROFILE" => "ملف ربط الجهاز غير صالح. أعد الربط من الإعدادات.",
        _ => code.Any(c => c >= '\u0600' && c <= '\u06ff') ? code : "تعذرت العملية. تحقق من الاتصال والبيانات ثم أعد المحاولة."
    };
    private static string V(JsonNode? n, string key) => n?[key]?.ToString() ?? "";
    private static int Ver(JsonNode n) => n["version"]!.GetValue<int>();
    private static TextBlock Text(string s, int size = 14) => new() { Text = s, FontSize = size, TextWrapping = TextWrapping.Wrap };
    internal static TextBox Field(string label, string s = "") => new() { Header = label, Text = s, MaxLength = 200 };
    private static PasswordBox Secret(string label) => new() { Header = label, PasswordRevealMode = PasswordRevealMode.Hidden };
    private PasswordBox ReauthField() => new() { Header = sshConnection is null ? "سر إعادة التحقق" : "ستُؤكد العملية تلقائيًا عبر الاتصال الخاص", IsEnabled = sshConnection is null, PasswordRevealMode = PasswordRevealMode.Hidden };
    private static StackPanel Stack(params UIElement[] items)
    {
        var p = new StackPanel { Spacing = 12 };
        foreach (var x in items)
            p.Children.Add(x);
        return p;
    }
    internal static Button ActionButton(string title)
    {
        var b = new Button { Content = Text(title) };
        AutomationProperties.SetName(b, title);
        return b;
    }
    private Button Button(string title, Func<Task> action)
    {
        var b = ActionButton(title);
        b.Click += async (_, _) => await Run(action);
        return b;
    }
    private void Card(string title, string detail, params UIElement[] actions)
    {
        var row = new ActionFlowPanel { Spacing = 8 };
        foreach (var a in actions)
            row.Children.Add(a);
        var heading = Text(title, 19); heading.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
        var description = Text(detail); description.Foreground = (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"];
        PageBody.Children.Add(new Border { Padding = new Thickness(22), CornerRadius = new CornerRadius(18), BorderThickness = new Thickness(1), BorderBrush = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"], Background = (Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"], Child = Stack(heading, description, row) });
    }
    private async Task Run(Func<Task> action, bool background = false)
    {
        if (busy || shuttingDown)
            return;
        busy = true;
        var work = ++workRevision;
        var progress = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(200) };
        progress.Tick += (_, _) => { progress.Stop(); if (busy && work == workRevision && !shuttingDown) { BusyIndicator.IsActive = true; BusyIndicator.Visibility = Visibility.Visible; } };
        if (!background) progress.Start();
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
            progress.Stop();
            busy = false;
            if (!shuttingDown)
            {
                BusyIndicator.IsActive = false;
                BusyIndicator.Visibility = Visibility.Collapsed;
                if (renderPending)
                {
                    renderPending = false;
                    if (renderedPage != page) RememberCurrentView();
                    if (renderedPage != page && !RestoreView()) await Run(RenderCore);
                }
            }
        }
    }
    public MainPage()
    {
        InitializeComponent();
        desktop.OpenRequested += epoch => DispatcherQueue.TryEnqueue(async () =>
        {
            if (shuttingDown || !desktop.IsCurrentActivation(epoch)) return;
            App.CurrentWindow?.Activate();
            if (!ReferenceEquals(Nav.SelectedItem, NotificationsNav))
            {
                // SelectionChanged owns heading/content and coalesces a busy render.
                Nav.SelectedItem = NotificationsNav;
                return;
            }
            page = "notifications";
            Heading.Text = "الإشعارات";
            if (busy) renderPending = true;
            else await Run(Render);
        });
        Loaded += async (_, _) =>
        {
            var probeFile = Environment.GetEnvironmentVariable("TASKPILOT_NOTIFICATION_PROBE_FILE");
            var closeAfterProbe = Environment.GetEnvironmentVariable("TASKPILOT_NOTIFICATION_PROBE_AUTOCLOSE") == "1";
            Environment.SetEnvironmentVariable("TASKPILOT_NOTIFICATION_PROBE_FILE", null);
            Environment.SetEnvironmentVariable("TASKPILOT_NOTIFICATION_PROBE_AUTOCLOSE", null);
            if (probeFile is not null)
            {
                // Local OS probe never consumes injected client configuration or opens SSH/API.
                await Run(async () => { await Render(); await NotificationProbe.Run(desktop, probeFile, PageBody); });
                if (closeAfterProbe) App.CurrentWindow?.Close();
                else if (!shuttingDown) timer.Start();
                return;
            }
            await Run(async () =>
        {
            var file = Environment.GetEnvironmentVariable("TASKPILOT_CLIENT_CONFIG_FILE");
            var bootstrapAlias = Environment.GetEnvironmentVariable("TASKPILOT_TAILSCALE_ALIAS");
            if (file is null && Environment.GetEnvironmentVariable("TASKPILOT_CLIENT_API_TOKEN") is null && Environment.GetEnvironmentVariable("TASKPILOT_SSH_ALIAS") is null)
            {
                var saved = profileStore.Load();
                if (saved is not null)
                {
                    sshConnection = SshConnection.Resume(saved); lastSshAlias = saved.Alias;
                    api.Configure(saved.Address, saved.Token); connectionState.Connected(null);
                    await InitializeSync("tailscale:" + saved.Address);
                }
                else if (bootstrapAlias is not null) await ConnectTailscale(bootstrapAlias);
            }
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
        };
        Unloaded += async (_, _) => { timer.Stop(); if (sshConnection is not null) await sshConnection.DisposeAsync(); api.Dispose(); };
        timer.Tick += async (_, _) => await PollChanges();
    }
    private void ShowConnectionProblem()
    {
        ReconnectButton.Visibility = connectionState.Phase is ConnectionPhase.Interrupted or ConnectionPhase.Expired or ConnectionPhase.Unauthorized ? Visibility.Visible : Visibility.Collapsed;
        if (connectionState.Phase is ConnectionPhase.Expired or ConnectionPhase.Unauthorized)
        {
            viewCache.Clear();
            sshConnection?.StopTunnel();
            Connection.Severity = InfoBarSeverity.Warning;
            Connection.Title = "تحتاج إعادة الاتصال";
            Connection.Message = "انتهت الجلسة أو أُلغيت. تبقى البيانات على الخادم؛ اضغط إعادة الاتصال للمتابعة.";
        }
        else if (connectionState.Phase == ConnectionPhase.Interrupted)
        {
            Connection.Severity = InfoBarSeverity.Warning;
            Connection.Title = "الاتصال متوقف مؤقتًا";
            Connection.Message = "سأستعيد الاتصال تلقائيًا عند عودة الشبكة. تبقى أعمالك محفوظة.";
        }
    }
    private async void Reconnect_Click(object sender, RoutedEventArgs args) => await Run(async () =>
    {
        if (lastSshAlias is null || (sshConnection?.Persistent == true && connectionState.Phase is ConnectionPhase.Unauthorized or ConnectionPhase.Expired))
        {
            if (connectionState.Phase is ConnectionPhase.Unauthorized or ConnectionPhase.Expired) api.Disconnect();
            page = "settings";
            Heading.Text = "الإعدادات";
            Nav.SelectedItem = Nav.SettingsItem;
            await Render();
            return;
        }
        if (sshConnection?.Persistent == true)
        {
            connectionState.Connected(null);
            await InitializeSync("tailscale:" + api.Address);
        }
        else await ConnectSsh(lastSshAlias);
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
        var revision = connectionState.Revision;
        try
        {
            if (sshConnection is not null && !sshConnection.IsTunnelAlive)
                throw new HttpRequestException("SSH_TUNNEL_FAILED");
            var n = await api.Send("GET", "/v1/changes?cursor=" + changes.Cursor);
            if (shuttingDown || !connectionState.IsCurrent(revision))
                return;
            var notificationState = await api.Send("GET", "/v1/notifications/state");
            if (shuttingDown || !connectionState.TrySucceeded(revision))
                return;
            var batch = changes.Consume(n);
            viewCache.Invalidate(changes.FreshTypes);
            pendingChanges |= batch.NewItems > 0 && changes.FreshTypes.Any(type => WorkspaceViewCache<StackPanel>.Affects(type, page));
            UpdateUnread(notificationState);
            if (batch.AttentionItems > 0) desktop.Show(batch.AttentionItems);
            if (identityRevision == -1 || changes.FreshTypes.Any(type => type == "LIVE_SENDING_CHANGE_AUTHORIZED" || type.StartsWith("WHATSAPP_", StringComparison.Ordinal)))
            {
                await ReadWorkspaceIdentity(force: true);
                if (shuttingDown || !connectionState.IsCurrent(revision)) return;
            }
            ReconnectButton.Visibility = Visibility.Collapsed;
            Connection.Severity = InfoBarSeverity.Success;
            Connection.Title = "متصل بالخادم";
            Connection.Message = TransportSummary;
            if (visibleContent is null && !Editing()) await Run(RenderCore, background: true);
            else if (pendingChanges && page != "settings" && !Editing())
                await Run(RefreshFromChanges, background: true);
            else if (pendingChanges)
                Connection.Message = "توجد تغييرات جديدة؛ اضغط تحديث بعد الانتهاء من التحرير.";
        }
        catch (Exception error) { if (!shuttingDown && connectionState.TryFailed(revision, error)) ShowConnectionProblem(); }
        finally { polling = false; }
    }

    private async Task RefreshFromChanges()
    {
        var offset = ContentScroll.VerticalOffset;
        var currentPage = page;
        await RenderCore();
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
        var nextPage = e.IsSettingsSelected ? "settings" : e.SelectedItemContainer?.Tag?.ToString() ?? "dashboard";
        if (nextPage == page && renderedPage == page) return;
        if (!busy) RememberCurrentView();
        page = nextPage;
        if (busy)
        {
            renderPending = true;
            return;
        }
        if (!RestoreView()) await Run(RenderCore);
    }
    private async Task<bool> Dialog(string title, UIElement content, string primary = "حفظ", Func<string?>? validate = null)
    {
        var error = new InfoBar { Severity = InfoBarSeverity.Error, IsOpen = false, IsClosable = false };
        var dialog = new ContentDialog { Title = title, Content = validate is null ? content : Stack(content, error), PrimaryButtonText = primary, CloseButtonText = "إلغاء", DefaultButton = ContentDialogButton.Close, XamlRoot = XamlRoot, FlowDirection = FlowDirection.RightToLeft };
        if (validate is not null)
            dialog.PrimaryButtonClick += (_, args) =>
            {
                var message = validate();
                if (message is null) return;
                args.Cancel = true;
                error.Message = message;
                error.IsOpen = true;
            };
        return await dialog.ShowAsync() == ContentDialogResult.Primary;
    }
    private async Task BuildPage(string target)
    {
        if (shuttingDown)
            return;
        if (target == "settings" || !api.Connected)
        {
            if (!api.Connected)
            {
                Connection.Severity = InfoBarSeverity.Informational;
                Connection.Title = "غير متصل بالخادم";
                Connection.Message = "اتصل من الإعدادات لبدء المزامنة.";
                ReconnectButton.Visibility = Visibility.Collapsed;
            }
            if (api.Connected) await SendingSettings();
            Settings();
            return;
        }
        await ReadWorkspaceIdentity();
        if (shuttingDown)
            return;
        Connection.Severity = InfoBarSeverity.Success;
        Connection.Title = "متصل بالخادم";
        Connection.Message = TransportSummary;
        PageBody.Children.Add(Button("تحديث", Render));
        switch (target)
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
            case "ai":
                await AiSettings();
                break;
            case "operations":
                await Operations();
                break;
            case "privacy":
                await PrivacySettings();
                break;
        }
    }
    private void Settings()
    {
        var alias = Field("اسم اتصال SSH المحفوظ", lastSshAlias ?? "New-VPS");
        Card("اتصال دائم عبر Tailscale", sshConnection?.Persistent == true ? "هذا الجهاز مرتبط. يتصل التطبيق تلقائيًا عند فتحه ويستعيد الاتصال عند عودة الشبكة، دون مهلة للجلسة." : "اربط هذا الجهاز مرة واحدة عبر اتصالك الموثوق. يلزم تشغيل Tailscale على الجهاز والخادم.", alias, Button("ربط هذا الجهاز عبر Tailscale", async () => { await ConnectTailscale(alias.Text); SelectDashboard(); await Render(); }));
        if (api.Connected)
            PageBody.Children.Add(Button("تسجيل الخروج من هذا الجهاز", async () => { if (sshConnection is not null) await sshConnection.Revoke(); profileStore.Clear(); sshConnection = null; lastSshAlias = null; api.Disconnect(); connectionState.Disconnect(); syncWorkspace = null; changes.Seed("0"); UnreadBadge.Visibility = Visibility.Collapsed; ReconnectButton.Visibility = Visibility.Collapsed; await Render(); }));
        var address = Field("عنوان الخدمة الآمن", api.Address);
        address.FlowDirection = FlowDirection.LeftToRight;
        var token = Secret("رمز وصول المالك");
        var theme = new ComboBox { Header = "المظهر", ItemsSource = new[] { "النظام", "داكن", "فاتح" }, SelectedIndex = 0 };
        theme.SelectionChanged += (_, _) => RequestedTheme = theme.SelectedIndex switch { 1 => ElementTheme.Dark, 2 => ElementTheme.Light, _ => ElementTheme.Default };
        PageBody.Children.Add(theme);
        PageBody.Children.Add(new Expander { Header = "خيارات اتصال متقدمة", HorizontalAlignment = HorizontalAlignment.Stretch, Content = Stack(Text("الاتصال اليدوي أو نفق SSH المؤقت بدائل للتشخيص. ملف الربط الدائم محمي بتشفير Windows لهذا المستخدم؛ لا تُحفظ بيانات الحسابات محليًا."), Button("اتصال SSH مؤقت", async () => { await ConnectSsh(alias.Text); SelectDashboard(); await Render(); }), address, token, Button("اتصال يدوي", async () => { api.Configure(address.Text, token.Password); connectionState.Connected(null); token.Password = ""; if (sshConnection is not null) await sshConnection.DisposeAsync(); profileStore.Clear(); sshConnection = null; lastSshAlias = null; syncWorkspace = null; ReconnectButton.Visibility = Visibility.Collapsed; await InitializeSync("manual:" + api.Address); SelectDashboard(); await Render(); })) });
        DesktopSettings();
    }
    private void SelectDashboard()
    {
        page = "dashboard";
        Heading.Text = "لوحة التحكم";
        Nav.SelectedItem = DashboardNav;
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
        profileStore.Clear();
        api.Configure(next.Address, next.Token, next.ExpiresAt);
        lastSshAlias = alias;
        connectionState.Connected(next.ExpiresAt);
        viewCache.Clear();
        ReconnectButton.Visibility = Visibility.Collapsed;
        await InitializeSync("ssh:" + alias);
    }
    private async Task Dashboard()
    {
        var n = await api.Send("GET", "/v1/dashboard");
        BuildDashboard(n);
    }
    private async Task Accounts()
    {
        AccountFilters();
        var selectedIds = new HashSet<string>();
        PageBody.Children.Add(Toolbar(Button("إضافة حساب", () => AccountForm(null)), Button("معاينة حذف المحدد", async () => { if (selectedIds.Count == 0) throw new InvalidOperationException("حدد حسابًا واحدًا على الأقل."); await Purge(null, selectedIds.ToArray()); }), Button("معاينة حذف الكل", () => Purge(null))));
        var result = await PageData("accounts");
        var rows = result["items"]!.AsArray();
        foreach (var r in rows)
        {
            var n = r!;
            var select = new CheckBox { Content = "تحديد" };
            select.Checked += (_, _) => { selectedIds.Add(V(n, "id")); MarkDraft(); };
            select.Unchecked += (_, _) => { selectedIds.Remove(V(n, "id")); MarkDraft(); };
            Card(V(n, "display_name"), $"{V(n, "namespace")} / {V(n, "username_normalized")} • {(V(n, "archived_at") == "" ? "نشط" : "مؤرشف")}", select, Button("التفاصيل والسجل", async () => { detailAccountId = V(n,"id"); detailSection = "tasks"; detailOffset = 0; page = "account-details"; await Render(); }), Button("تعديل", () => AccountForm(n)), Button("عرض الاعتماد", () => Reveal(n)), Button(V(n, "archived_at") == "" ? "أرشفة" : "استرجاع", async () => { await api.Send("POST", $"/v1/accounts/{V(n, "id")}/{(V(n, "archived_at") == "" ? "archive" : "restore")}", new { version = Ver(n) }); await Render(); }), Button("حذف", () => Purge(V(n, "id"))));
        }
        if (rows.Count == 0)
            PageBody.Children.Add(Text("لا توجد حسابات مطابقة."));
        Pager("accounts", result);
    }
    private async Task AccountForm(JsonNode? n)
    {
        var ns = Field("مساحة الحسابات", n is null ? "work" : V(n, "namespace"));
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
        var kind = Choice("النوع", [("UNVERIFIED_CREDENTIALS", "اعتماد يحتاج تحققًا"), ("INVALID_ACCOUNT_PASSWORD", "كلمة مرور خاطئة مثبتة"), ("INVALID_ACCOUNT_CODE", "رمز حساب خاطئ مثبت")], "UNVERIFIED_CREDENTIALS");
        var evidence = Choice("الدليل", [("UNVERIFIED", "غير متحقق"), ("MANUAL", "تحقق يدوي مؤكد"), ("AUTHORIZED_CHECK", "فحص مأذون")], "UNVERIFIED");
        var reauth = ReauthField();
        if (await Dialog("مشكلة بيانات الدخول", Stack(Text("اختر تحققًا يدويًا مؤكدًا فقط بعد إثبات الخطأ؛ لا تستخدمه بناءً على التخمين."), kind, evidence, reauth)))
        {
            await api.Send("POST", "/v1/issue-flags", new
            {
                accountId = V(a, "account_id"),
                kind = Selected(kind),
                evidenceKind = Selected(evidence)
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
        var target = $"المجموعة: {V(p, "groupTitle")}\nالجلسة: {V(p, "sessionLabel")}\nاستلام المصدر: {V(p, "receivedAt")}";
        if (real && !liveSendingEnabled)
        {
            await new ContentDialog { Title = "معاينة الرد — الإرسال معطّل", Content = Stack(Text(V(p, "body"), 20), Text(target), Text("هذه معاينة فقط؛ لم يُعتمد الرد ولم يُدرج في طابور الإرسال.")), CloseButtonText = "إغلاق", XamlRoot = XamlRoot, FlowDirection = FlowDirection.RightToLeft }.ShowAsync();
            return;
        }
        if (!await Dialog(real ? "إقرار إرسال رد واتساب حقيقي" : "إقرار رد محاكى", Stack(Text(V(p, "body"), 20), Text(target + "\n" + (real ? "سيُرسل النص إلى رسالة المصدر في واتساب بعد الإقرار." : "موصل mock؛ لا إرسال واتساب حقيقي.")), reauth), real ? "إرسال الرد الحقيقي" : "إقرار المحاكاة"))
            return;
        await api.Send("POST", "/v1/reply-jobs/approve", new
        {
            approvalToken = V(p, "approvalToken"),
            idempotencyKey = Guid.NewGuid().ToString()
        }, await Reauth(reauth.Password));
        reauth.Password = "";
        await Render();
        Connection.Message = "أُدرج طلب الرد في الطابور؛ تابع نتيجته في سجل الردود.";
    }
    private async Task Inbox()
    {
        if (mockToolsEnabled) PageBody.Children.Add(Button("إدخال رسالة اختبار وهمية", async () =>
        {
            var mockIds = (await api.Send("GET", "/v1/sessions")).AsArray().Where(n=>V(n,"provider")=="mock").Select(n=>V(n,"id")).ToHashSet();
            var groups = new JsonArray((await api.Send("GET", "/v1/groups")).AsArray().Where(n=>mockIds.Contains(V(n,"session_id"))).Select(n=>n!.DeepClone()).ToArray());
            if (groups.Count == 0)
                throw new InvalidOperationException("أضف مجموعة محاكاة أولًا.");
            var group = Choice("المجموعة", groups.Select(g => (V(g, "id"), ChoiceLabel(g!, "title"))));
            var content = new TextBox { Header = "بيانات وهمية فقط", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 150, MaxLength = 16000, Text = "الاسم: حساب اختبار\nاليوزر: demo-new\nكلمة المرور: synthetic-only" };
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
            Card("بيانات تحتاج مراجعة", V(n, "group_title") + " • " + V(n, "external_message_id") + (V(n,"ai_status")=="SUCCEEDED" ? "\nاقتراح AI جاهز؛ افتح المراجعة للتحقق من الحقول." : V(n,"ai_status")=="UNAVAILABLE" ? "\nتعذر تحليل AI؛ تبقى الرسالة محفوظة للمراجعة." : ""),
                Button("مراجعة", () => ReviewSource(n)), Button("اقتراح بالذكاء الاصطناعي", () => AiSuggest(n)));
        }
        if (rows.Count == 0)
            PageBody.Children.Add(Text("صندوق المراجعة فارغ."));
        Pager("inbox", result);
    }
    private async Task ReviewSource(JsonNode n, string? suggestedTask = null)
    {
                var reauth = ReauthField();
                if (!await Dialog("مراجعة الوارد", reauth, "فتح"))
                    return;
                var raw = await api.Send("POST", "/v1/inbox/" + V(n, "id") + "/reveal", new
                {
                }, await Reauth(reauth.Password));
                var suggested = raw["fields"];
                var name = Field("الاسم", V(suggested,"displayName"));
                var user = Field("المستخدم", V(suggested,"username"));
                var ns = Field("النظام", V(n, "namespace"));
                var pass = Secret("كلمة المرور (اختياري)");
                pass.Password = V(suggested,"password");
                var task = Choice("المهمة", Options((await api.Send("GET", "/v1/task-types")).AsArray(), "name"), suggestedTask ?? V(n, "routing_task_type_id"));
                var view = new TextBox { Header = "محتوى محمي — يُخفى بعد 30 ثانية", IsReadOnly = true, AcceptsReturn = true, Text = V(raw, "text"), TextWrapping = TextWrapping.Wrap, MinHeight = 90, MaxHeight = 180 };
                var hide = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
                // Raw reveal expiry must not silently remove the credential being edited.
                // The masked editor is scoped to this dialog and always cleared on exit.
                hide.Tick += (_, _) => { view.Text = ""; hide.Stop(); };
                hide.Start();
                try
                {
                    var ok = await Dialog("تصحيح البيانات", Stack(Text(V(suggested,"origin") == "ai-review-only" ? "اقتراح AI ربط الحقول محليًا دون إرسال قيمها؛ راجعها قبل الحفظ." : "الحقول المعروفة عُبئت محليًا؛ راجع البيانات قبل الحفظ."), view, Text("يُخفى النص الأصلي بعد 30 ثانية؛ تبقى كلمة المرور في حقلها المخفي حتى الحفظ أو إغلاق المراجعة."), ns, name, user, pass, task));
                    hide.Stop();
                    view.Text = "";
                    if (ok)
                    {
                        var account = new JsonObject { ["namespace"] = ns.Text, ["username"] = user.Text, ["displayName"] = name.Text };
                        if (pass.Password != "") account["password"] = pass.Password;
                        var payload = new JsonObject { ["version"] = Ver(n), ["account"] = account };
                        if (Selected(task) != "") payload["taskTypeId"] = Selected(task);
                        await api.Send("POST", "/v1/inbox/" + V(n, "id") + "/resolve", payload, await Reauth(reauth.Password));
                    }
                }
                finally { hide.Stop(); view.Text = ""; reauth.Password = pass.Password = ""; raw["text"] = ""; raw["fields"] = null; }
                await Render();
    }
    private async Task Sessions() => await WhatsAppSessions();
    private async Task Groups()
    {
        PageBody.Children.Add(Text("ابدأ بإضافة أنواع المهام، ثم اربط مجموعة واتساب وحدد مهمتها الافتراضية. من زر القواعد تختار الكلمات والأولوية لكل مهمة."));
        PageBody.Children.Add(Button("إضافة نوع مهمة", async () => { var code = Field("رمز المهمة (اسم قصير فريد)"); var name = Field("اسم المهمة"); if (await Dialog("نوع مهمة", Stack(code, name))) { await api.Send("POST", "/v1/task-types", new { code = code.Text, name = name.Text }); await Render(); } }));
        PageBody.Children.Add(Button("إضافة مجموعة واتساب", async () =>
        {
            var sessions = (await api.Send("GET", "/v1/sessions")).AsArray().Where(n => V(n, "provider") == "baileys" && V(n, "status") == "CONNECTED" && V(n, "forgotten_at") == "").ToArray();
            if (sessions.Length == 0) throw new InvalidOperationException("افتح الجلسات واربط واتساب أولًا، ثم عد لإضافة المجموعة.");
            if (sessions.Length != 1) throw new InvalidOperationException("اختر الجلسة المطلوبة من صفحة الجلسات ثم اضغط اختيار مجموعة للاستقبال.");
            await BindWhatsAppGroup(V(sessions[0], "id"));
        }));
        if (mockToolsEnabled) PageBody.Children.Add(Button("ربط مجموعة محاكاة", async () =>
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
        var taskNames = (await api.Send("GET", "/v1/task-types")).AsArray().ToDictionary(n => V(n, "id"), n => V(n, "name"));
        foreach (var r in (await api.Send("GET", "/v1/groups")).AsArray())
        {
            var n = r!;
            var enabled = n["enabled"]!.GetValue<bool>();
            Card(V(n, "title"), $"المهمة الافتراضية: {taskNames.GetValueOrDefault(V(n, "task_type_id"), "غير متاحة")}\nمساحة الحسابات: {V(n, "namespace")} • الفترة: {V(n, "period_key")} • {(enabled ? "مفعّلة" : "متوقفة")}", Button("المهمة الافتراضية", () => GroupDefaultTask(n)), Button("القواعد", () => Rules(n)), Button(enabled ? "إيقاف" : "تفعيل", () => ToggleGroup(n, !enabled)));
        }
    }
    private async Task Replies()
    {
        await TemplateList();
        PageBody.Children.Add(Text("سجل الردود", 24));
        foreach (var n in (await api.Send("GET", "/v1/reply-jobs")).AsArray())
        {
            var detail = $"{V(n, "display_name")} • {V(n, "task_name")}\nالمجموعة: {V(n, "group_title")} • الجلسة: {V(n, "session_label")}\n{V(n, "body")}";
            if (V(n, "status") == "UNKNOWN_DELIVERY")
                Card("تسليم يحتاج تحققًا", detail, Button("حسم حالة التسليم", () => Reconcile(n!)));
            else if (V(n, "status") == "APPROVED")
                Card("معتمد وينتظر الإرسال", detail, Button("إلغاء الرد المنتظر", () => CancelReply(n!)));
            else
                Card(StateLabel(V(n, "status")), detail);
        }
    }
    private async Task CancelReply(JsonNode job)
    {
        var reauth = ReauthField();
        if (!await Dialog("إلغاء الرد المنتظر", Stack(Text(V(job, "body")), Text("يُلغى فقط إذا لم يبدأ إرساله. تبقى حالة المهمة وسجلها كما هما."), reauth), "إلغاء الرد")) return;
        await api.Send("POST", "/v1/reply-jobs/" + V(job, "id") + "/cancel", new { }, await Reauth(reauth.Password));
        reauth.Password = "";
        await Render();
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
