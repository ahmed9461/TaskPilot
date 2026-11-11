using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using System.Text.Json.Nodes;
namespace TaskPilot_Windows;

public sealed partial class MainPage : Page
{
    private readonly ApiClient api = new();
    private string page = "dashboard", cursor = "0";
    private bool busy, polling, renderPending;
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(10) };
    private static string FriendlyError(string code) => code switch
    {
        "CONFLICT" or "STALE_PREVIEW" => "تغيرت البيانات. حدّث القائمة وأنشئ معاينة جديدة.",
        "REAUTH_REQUIRED" or "PERMISSION_DENIED" => "تحقق من رمز الوصول أو سر إعادة التحقق.",
        "VALIDATION_ERROR" => "راجع الحقول المطلوبة وصيغتها.",
        "DELETION_REQUIRES_CONFIRMATION" => "اكتب عبارة التأكيد مطابقة للمعاينة.",
        "DELIVERY_REQUIRES_RECONCILIATION" => "احسم حالة الرد المجهولة قبل الحذف.",
        "APPROVAL_EXPIRED_OR_CONSUMED" => "انتهت المعاينة أو استُخدمت. أنشئ معاينة جديدة.",
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
        if (busy)
            return;
        busy = true;
        try
        {
            await action();
        }
        catch (Exception ex) { Connection.Severity = InfoBarSeverity.Warning; Connection.Title = "تعذر تنفيذ العملية"; Connection.Message = ex is InvalidOperationException ? FriendlyError(ex.Message) : "تعذر الاتصال بالخدمة. تحقق من النفق ثم أعد المحاولة."; }
        finally
        {
            busy = false;
            if (renderPending)
            {
                renderPending = false;
                await Run(Render);
            }
        }
    }
    public MainPage()
    {
        InitializeComponent();
        Loaded += async (_, _) => await Run(async () =>
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
            await Render();
            timer.Start();
        });
        Unloaded += (_, _) => { timer.Stop(); api.Dispose(); };
        timer.Tick += async (_, _) =>
        {
            if (polling || busy || !api.Connected)
                return;
            polling = true;
            try
            {
                var n = await api.Send("GET", "/v1/changes?cursor=" + cursor);
                cursor = V(n, "cursor");
                Connection.Severity = InfoBarSeverity.Success;
                Connection.Title = "متصل بالخادم";
                Connection.Message = "المزامنة تعمل • الإرسال الحقيقي غير مفعّل";
                if ((n["items"]?.AsArray().Count ?? 0) > 0 && page != "settings")
                    await Run(Render);
            }
            catch { Connection.Severity = InfoBarSeverity.Warning; Connection.Title = "الاتصال منقطع"; Connection.Message = "البيانات محفوظة على الخادم. ستستأنف المزامنة بعد عودة الاتصال."; }
            finally { polling = false; }
        };
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
        Body.Children.Clear();
        if (page == "settings" || !api.Connected)
        {
            Settings();
            return;
        }
        await api.Send("GET", "/v1/me");
        Connection.Severity = InfoBarSeverity.Success;
        Connection.Title = "متصل بالخادم";
        Connection.Message = "المزامنة تعمل • موصل وهمي فقط";
        Body.Children.Add(Button("تحديث", Render));
        switch (page)
        {
            case "dashboard":
                await Dashboard();
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
        }
    }
    private void Settings()
    {
        var address = Field("عنوان الخدمة الآمن", api.Address);
        address.FlowDirection = FlowDirection.LeftToRight;
        var token = Secret("رمز وصول المالك");
        var theme = new ComboBox { Header = "المظهر", ItemsSource = new[] { "النظام", "داكن", "فاتح" }, SelectedIndex = 0 };
        theme.SelectionChanged += (_, _) => RequestedTheme = theme.SelectedIndex switch { 1 => ElementTheme.Dark, 2 => ElementTheme.Light, _ => ElementTheme.Default };
        Body.Children.Add(Stack(Text("الاتصال بمساحة العمل", 24), Text("استخدم HTTPS أو نفق SSH محلي. لا تحفظ الواجهة بيانات الحسابات أو رمز الوصول على القرص."), address, token, theme, Button("اتصال", async () => { api.Configure(address.Text, token.Password); token.Password = ""; cursor = "0"; page = "dashboard"; await Render(); })));
    }
    private async Task Dashboard()
    {
        var n = await api.Send("GET", "/v1/dashboard");
        Card("كل أعمالك في مكان واحد", "الحساب مستقل عن المهام؛ إكمال المهمة لا يرسل ردًا تلقائيًا.");
        foreach (var (key, title) in new[] { ("accounts", "الحسابات"), ("open", "المهام المفتوحة"), ("completed", "المكتملة"), ("review", "بحاجة مراجعة"), ("unknown_delivery", "ردود تحتاج تحققًا") })
            Card(V(n, key), title);
    }
    private async Task Accounts(string search = "")
    {
        var q = Field("ابحث بالاسم أو المستخدم", search);
        var selectedIds = new HashSet<string>();
        Body.Children.Add(Button("معاينة حذف المحدد", async () => { if (selectedIds.Count == 0) throw new InvalidOperationException("حدد حسابًا واحدًا على الأقل."); await Purge(null, selectedIds.ToArray()); }));
        Body.Children.Add(Stack(q, Button("بحث", async () => { Body.Children.Clear(); await Accounts(q.Text); }), Button("إضافة حساب", () => AccountForm(null)), Button("معاينة حذف الكل", () => Purge(null))));
        var rows = (await api.Send("GET", "/v1/accounts?limit=500&search=" + Uri.EscapeDataString(search))).AsArray();
        foreach (var r in rows)
        {
            var n = r!;
            var select = new CheckBox { Content = "تحديد" };
            select.Checked += (_, _) => selectedIds.Add(V(n, "id"));
            select.Unchecked += (_, _) => selectedIds.Remove(V(n, "id"));
            Card(V(n, "display_name"), $"{V(n, "namespace")} / {V(n, "username_normalized")} • {(V(n, "archived_at") == "" ? "نشط" : "مؤرشف")}", select, Button("تعديل", () => AccountForm(n)), Button("عرض الاعتماد", () => Reveal(n)), Button(V(n, "archived_at") == "" ? "أرشفة" : "استرجاع", async () => { await api.Send("POST", $"/v1/accounts/{V(n, "id")}/{(V(n, "archived_at") == "" ? "archive" : "restore")}", new { version = Ver(n) }); await Render(); }), Button("حذف", () => Purge(V(n, "id"))));
        }
        if (rows.Count == 0)
            Body.Children.Add(Text("لا توجد حسابات مطابقة."));
    }
    private async Task AccountForm(JsonNode? n)
    {
        var ns = Field("النظام", n is null ? "synthetic" : V(n, "namespace"));
        var user = Field("المستخدم", V(n, "username_normalized"));
        ns.IsEnabled = user.IsEnabled = n is null;
        var name = Field("الاسم", V(n, "display_name"));
        var pass = Secret("كلمة المرور (اختياري)");
        var reauth = Secret("سر إعادة التحقق لتحديث الاعتماد");
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
            await api.Send("PATCH", "/v1/accounts/" + V(n, "id"), payload, reauth.Password);
        }
        pass.Password = reauth.Password = "";
        await Render();
    }
    private async Task Reveal(JsonNode n)
    {
        var reauth = Secret("سر إعادة التحقق");
        if (!await Dialog("عرض مؤقت لمدة 30 ثانية", reauth, "تحقق"))
            return;
        var result = await api.Send("POST", "/v1/accounts/" + V(n, "id") + "/reveal", new
        {
        }, reauth.Password);
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
        var reauth = Secret("سر إعادة التحقق");
        var names = string.Join("، ", p["accounts"]!.AsArray().Select(a => V(a, "display_name")));
        if (!await Dialog("حذف نهائي", Stack(Text(names), Text($"المهام: {V(p, "assignments")} • الردود: {V(p, "replies")}\nتُحذف البيانات المرتبطة في TaskPilot؛ النسخ الاحتياطية لها احتفاظ منفصل. لا تُحذف رسائل واتساب من أجهزة الآخرين."), phrase, reauth), "حذف نهائي"))
            return;
        await api.Send("POST", "/v1/deletions/confirm", new
        {
            approvalToken = V(p, "approvalToken"),
            confirmation = phrase.Text
        }, reauth.Password);
        reauth.Password = "";
        await Render();
    }
    private async Task Assignments()
    {
        foreach (var r in (await api.Send("GET", "/v1/assignments?limit=500")).AsArray())
        {
            var n = r!;
            var status = new ComboBox { ItemsSource = new[] { "NEW", "NEEDS_REVIEW", "IN_PROGRESS", "COMPLETED", "CANCELED" }, SelectedItem = V(n, "status") };
            Card(V(n, "display_name"), $"{V(n, "task_name")} • {V(n, "period_key")} • {V(n, "status")}", status, Button("حفظ الحالة", async () => { await api.Send("PATCH", "/v1/assignments/" + V(n, "id") + "/status", new { status = status.SelectedItem?.ToString(), version = Ver(n) }); await Render(); }), Button("معاينة رد", () => Reply(n)), Button("مشكلة اعتماد", () => Flag(n)));
        }
    }
    private async Task Flag(JsonNode a)
    {
        var kind = new ComboBox { Header = "النوع", ItemsSource = new[] { "UNVERIFIED_CREDENTIALS", "INVALID_ACCOUNT_PASSWORD", "INVALID_ACCOUNT_CODE" }, SelectedIndex = 0 };
        var evidence = new ComboBox { Header = "الدليل", ItemsSource = new[] { "UNVERIFIED", "MANUAL", "AUTHORIZED_CHECK" }, SelectedIndex = 0 };
        var reauth = Secret("سر إعادة التحقق للخطأ المؤكد");
        if (await Dialog("مشكلة بيانات الدخول", Stack(Text("MANUAL إقرار منك بأن الخطأ مثبت؛ لا تختَره بناءً على التخمين."), kind, evidence, reauth)))
        {
            await api.Send("POST", "/v1/issue-flags", new
            {
                accountId = V(a, "account_id"),
                kind = kind.SelectedItem.ToString(),
                evidenceKind = evidence.SelectedItem.ToString()
            }, reauth.Password);
            reauth.Password = "";
            await Render();
        }
    }
    private async Task Reply(JsonNode a)
    {
        var sources = a["sources"]!.AsArray();
        var templates = (await api.Send("GET", "/v1/reply-templates")).AsArray();
        if (sources.Count == 0 || templates.Count == 0)
            throw new InvalidOperationException("أضف قالبًا وتأكد من وجود مصدر.");
        var s = new ComboBox { Header = "رسالة المصدر", ItemsSource = sources.Select(n => $"{V(n, "sessionId")} / {V(n, "groupId")} / {V(n, "externalMessageId")}").ToArray(), SelectedIndex = 0, MaxWidth = 440 };
        var t = new ComboBox { Header = "القالب", ItemsSource = templates.Select(n => V(n, "code")).ToArray(), SelectedIndex = 0 };
        if (!await Dialog("اختيار الرد", Stack(s, t), "معاينة"))
            return;
        var p = await api.Send("POST", "/v1/reply-jobs/preview", new
        {
            assignmentId = V(a, "id"),
            sourceMessageId = V(sources[s.SelectedIndex], "id"),
            templateId = V(templates[t.SelectedIndex], "id")
        });
        var reauth = Secret("سر إعادة التحقق");
        if (!await Dialog("إقرار رد محاكى", Stack(Text(V(p, "body"), 20), Text($"المجموعة: {V(p, "groupTitle")}\nالجلسة: {V(p, "sessionId")}\nالرسالة: {V(p, "externalMessageId")}\nموصل mock؛ لا إرسال واتساب حقيقي."), reauth), "إقرار المحاكاة"))
            return;
        await api.Send("POST", "/v1/reply-jobs/approve", new
        {
            approvalToken = V(p, "approvalToken"),
            idempotencyKey = Guid.NewGuid().ToString()
        }, reauth.Password);
        reauth.Password = "";
        await Render();
    }
    private async Task Inbox()
    {
        Body.Children.Add(Button("إدخال رسالة اختبار وهمية", async () =>
        {
            var groups = (await api.Send("GET", "/v1/groups")).AsArray();
            if (groups.Count == 0)
                throw new InvalidOperationException("أضف مجموعة محاكاة من قسم المجموعات أولًا.");
            var group = new ComboBox { Header = "المجموعة", ItemsSource = groups.Select(g => V(g, "title")).ToArray(), SelectedIndex = 0 };
            var content = new TextBox { Header = "بيانات وهمية فقط", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinWidth = 320, Height = 150, MaxLength = 16000, Text = "الاسم: حساب اختبار\nاليوزر: demo-new\nكلمة المرور: synthetic-only" };
            if (!await Dialog("محاكاة استلام رسالة", Stack(Text("تُحفظ الرسالة في بيئة الاختبار؛ لا تُرسل إلى واتساب."), group, content), "استقبال محاكى"))
                return;
            var selected = groups[group.SelectedIndex]!;
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
        var rows = (await api.Send("GET", "/v1/inbox?limit=500")).AsArray();
        foreach (var r in rows)
        {
            var n = r!;
            Card("بيانات تحتاج مراجعة", $"{V(n, "group_title")} • {V(n, "external_message_id")}", Button("مراجعة", async () =>
            {
                var reauth = Secret("سر إعادة التحقق لفتح المحتوى المحمي");
                if (!await Dialog("مراجعة الوارد", reauth, "فتح"))
                    return;
                var raw = await api.Send("POST", "/v1/inbox/" + V(n, "id") + "/reveal", new
                {
                }, reauth.Password);
                var name = Field("الاسم");
                var user = Field("المستخدم");
                var ns = Field("النظام");
                var pass = Secret("كلمة المرور (اختياري)");
                var view = new TextBox { Header = "محتوى محمي — يُخفى بعد 30 ثانية", Text = V(raw, "text"), IsReadOnly = true, TextWrapping = TextWrapping.Wrap, MaxHeight = 120 };
                var hide = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
                hide.Tick += (_, _) => { view.Text = ""; hide.Stop(); };
                hide.Start();
                var ok = await Dialog("تصحيح البيانات", Stack(view, ns, name, user, pass));
                hide.Stop();
                view.Text = "";
                if (ok)
                {
                    var account = new JsonObject { ["namespace"] = ns.Text, ["username"] = user.Text, ["displayName"] = name.Text };
                    if (pass.Password != "")
                        account["password"] = pass.Password;
                    await api.Send("POST", "/v1/inbox/" + V(n, "id") + "/resolve", new
                    {
                        version = Ver(n),
                        account
                    }, reauth.Password);
                }
                reauth.Password = pass.Password = "";
                await Render();
            }));
        }
        if (rows.Count == 0)
            Body.Children.Add(Text("صندوق المراجعة فارغ."));
    }
    private async Task Sessions()
    {
        Body.Children.Add(Button("إضافة جلسة محاكاة", async () => { var label = Field("اسم الجلسة"); if (await Dialog("جلسة وهمية", label)) { await api.Send("POST", "/v1/sessions", new { label = label.Text }); await Render(); } }));
        foreach (var n in (await api.Send("GET", "/v1/sessions")).AsArray())
            Card(V(n, "label"), $"{V(n, "status")} • {V(n, "provider")}\n{V(n, "id")}");
        Body.Children.Add(Text("ربط واتساب الحقيقي متوقف حتى موافقة المالك واعتماد الموصل."));
    }
    private async Task Groups()
    {
        Body.Children.Add(Button("إضافة نوع مهمة", async () => { var code = Field("رمز النوع"); var name = Field("الاسم"); if (await Dialog("نوع مهمة", Stack(code, name))) { await api.Send("POST", "/v1/task-types", new { code = code.Text, name = name.Text }); await Render(); } }));
        Body.Children.Add(Button("ربط مجموعة محاكاة", async () =>
        {
            var sessions = (await api.Send("GET", "/v1/sessions")).AsArray();
            var tasks = (await api.Send("GET", "/v1/task-types")).AsArray();
            if (sessions.Count == 0 || tasks.Count == 0)
                throw new InvalidOperationException("أضف جلسة ونوع مهمة أولًا.");
            var s = new ComboBox { Header = "الجلسة", ItemsSource = sessions.Select(n => V(n, "label")).ToArray(), SelectedIndex = 0 };
            var t = new ComboBox { Header = "المهمة", ItemsSource = tasks.Select(n => V(n, "name")).ToArray(), SelectedIndex = 0 };
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
            Card(V(n, "title"), $"{V(n, "namespace")} • {V(n, "period_key")} • {(enabled ? "مفعّلة" : "متوقفة")}", Button(enabled ? "إيقاف" : "تفعيل", async () => { await api.Send("PATCH", "/v1/groups/" + V(n, "id"), new { version = Ver(n), enabled = !enabled }); await Render(); }));
        }
    }
    private async Task Replies()
    {
        Body.Children.Add(Button("إضافة قالب", async () => { var code = Field("رمز القالب"); var body = Field("نص الرد"); body.MaxLength = 2000; body.AcceptsReturn = true; if (await Dialog("قالب رد", Stack(Text("المتغيرات المسموحة: {displayName} و{taskName}"), code, body))) { await api.Send("POST", "/v1/reply-templates", new { code = code.Text, body = body.Text }); await Render(); } }));
        foreach (var n in (await api.Send("GET", "/v1/reply-templates")).AsArray())
            Card(V(n, "code"), V(n, "body"));
        Body.Children.Add(Text("سجل الردود", 24));
        foreach (var n in (await api.Send("GET", "/v1/reply-jobs")).AsArray())
        {
            if (V(n, "status") == "UNKNOWN_DELIVERY")
                Card("تسليم يحتاج تحققًا", V(n, "body"), Button("حسم حالة التسليم", () => Reconcile(n!)));
            else
                Card(V(n, "status"), V(n, "body") + "\n" + V(n, "provider_message_id"));
        }
    }
    private async Task Reconcile(JsonNode job)
    {
        var outcome = new ComboBox { Header = "نتيجة تحققك الفعلي", ItemsSource = new[] { "تأكدت أن الرد وصل", "تأكدت أن الرد لم يُرسل" }, SelectedIndex = 0 };
        var confirmed = new CheckBox { Content = "تحققت من النتيجة بنفسي؛ ليست تخمينًا" };
        var reauth = Secret("سر إعادة التحقق");
        if (!await Dialog("حسم حالة تسليم مجهولة", Stack(Text("لن يُعاد إرسال الرد تلقائيًا بعد الحسم."), outcome, confirmed, reauth), "تسجيل التحقق"))
            return;
        if (confirmed.IsChecked != true)
            throw new InvalidOperationException("يلزم تأكيد تحققك من التسليم.");
        await api.Send("POST", "/v1/reply-jobs/" + V(job, "id") + "/reconcile", new
        {
            outcome = outcome.SelectedIndex == 0 ? "CONFIRMED_SENT" : "CONFIRMED_NOT_SENT",
            evidenceKind = "MANUAL"
        }, reauth.Password);
        reauth.Password = "";
        await Render();
    }
    private async Task Notifications()
    {
        foreach (var r in (await api.Send("GET", "/v1/notifications")).AsArray())
        {
            var n = r!;
            Card(V(n, "type"), V(n, "created_at"), Button("تمت القراءة", async () => { await api.Send("POST", "/v1/notifications/" + V(n, "id") + "/read", new { }); await Render(); }));
        }
    }
}
