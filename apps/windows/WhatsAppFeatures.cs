using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;
using System.Text.Json.Nodes;
using Windows.Storage.Streams;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private bool liveSendingEnabled;
    private bool liveConnectionEnabled;
    private bool mockToolsEnabled;
    private string TransportSummary => $"المزامنة تعمل • اتصال واتساب {(liveConnectionEnabled ? "مسموح" : "متوقف")} • الإرسال الحقيقي {(liveSendingEnabled ? "مسموح بعد الإقرار" : "متوقف")}";
    private static string SessionState(string code) => code switch
    {
        "MOCK" => "محاكاة", "STOPPED" => "متوقفة", "CONNECTING" => "جارٍ الاتصال",
        "QR_AVAILABLE" => "رمز الربط متاح", "CONNECTED" => "متصلة", "RECONNECTING" => "جارٍ استعادة الاتصال",
        "REAUTH_REQUIRED" => "تحتاج إعادة ربط", "FORGOTTEN" => "منسية محليًا", "ERROR" => "متوقفة بسبب خطأ", _ => code
    };
    private async Task WhatsAppSessions()
    {
        var capabilities = await api.Send("GET", "/v1/whatsapp/capabilities");
        var allowed = capabilities["connectionEnabled"]?.GetValue<bool>() == true;
        Body.Children.Add(Text("موصل Baileys غير رسمي. إنشاء إعداد جلسة لا يتصل بواتساب. الربط يتطلب تفعيلًا مستقلًا على الخادم وموافقتك؛ الإرسال له مفتاح مستقل."));
        Body.Children.Add(Button("إضافة إعداد جلسة واتساب", async () =>
        {
            var label = Field("اسم الجلسة");
            if (await Dialog("إعداد جلسة دون اتصال", label))
            {
                await api.Send("POST", "/v1/sessions", new { label = label.Text, provider = "baileys" });
                await Render();
            }
        }));
        if (mockToolsEnabled) Body.Children.Add(Button("إضافة جلسة محاكاة", async () =>
        {
            var label = Field("اسم الجلسة");
            if (await Dialog("جلسة وهمية", label))
            {
                await api.Send("POST", "/v1/sessions", new { label = label.Text });
                await Render();
            }
        }));
        var forgotten = new StackPanel { Spacing = 12 };
        foreach (var row in (await api.Send("GET", "/v1/sessions")).AsArray())
        {
            var n = row!;
            if (V(n, "provider") == "mock") { if (mockToolsEnabled) Card(V(n, "label"), "محاكاة • " + V(n, "id")); continue; }
            var id = V(n, "id");
            if (V(n, "forgotten_at") != "") { forgotten.Children.Add(Stack(Text(V(n, "label")), Text("منسية محليًا؛ يبقى التاريخ محفوظًا، والربط الجديد يحتاج إعداد جلسة جديدًا."))); continue; }
            var connect = Button("بدء الاتصال أو الربط", () => ConnectWhatsApp(id));
            connect.IsEnabled = allowed && n["connect_requested"]?.GetValue<bool>() != true;
            var qr = Button("عرض رمز الربط مؤقتًا", () => WhatsAppQr(id));
            qr.IsEnabled = allowed && V(n, "status") == "QR_AVAILABLE";
            var groups = Button("اختيار مجموعة للاستقبال", () => BindWhatsAppGroup(id));
            groups.IsEnabled = allowed && V(n, "status") == "CONNECTED";
            var forget = Button("نسيان مصادقة الجلسة", () => ForgetSession(id));
            forget.IsEnabled = n["connect_requested"]?.GetValue<bool>() != true;
            Card(V(n, "label"), SessionState(V(n, "status")) + " • Baileys\n" + id + (V(n, "last_error_code") == "" ? "" : "\n" + V(n, "last_error_code")), connect, qr, groups,
                Button("إيقاف الاتصال", async () =>
                {
                    var reauth = ReauthField();
                    if (!await Dialog("إيقاف جلسة واتساب", Stack(Text("يتوقف الاستقبال والإرسال لهذه الجلسة. تبقى حالة المصادقة مشفرة والبيانات السابقة محفوظة."), reauth), "إيقاف")) return;
                    try { await api.Send("POST", $"/v1/sessions/{id}/disconnect", new { }, await Reauth(reauth.Password)); }
                    finally { reauth.Password = ""; }
                    await Render();
                }), forget);
        }
        if (forgotten.Children.Count > 0) Body.Children.Add(new Expander { Header = "سجل الجلسات المنسية", Content = forgotten, HorizontalAlignment = HorizontalAlignment.Stretch });
    }
    private async Task GroupDefaultTask(JsonNode group)
    {
        var id = V(group, "id");
        var current = (await api.Send("GET", "/v1/groups")).AsArray().Single(n => V(n, "id") == id)!;
        var tasks = (await api.Send("GET", "/v1/task-types")).AsArray();
        if (tasks.Count == 0) throw new InvalidOperationException("أضف نوع مهمة أولًا.");
        var choice = Choice("المهمة الافتراضية", tasks.Select(n => (V(n, "id"), ChoiceLabel(n!, "name"))), V(current, "task_type_id"));
        var reauth = ReauthField();
        if (!await Dialog("المهمة الافتراضية للمجموعة", Stack(choice, Text("تُستخدم للرسائل الجديدة التي لا تطابق قاعدة. لا تتغير المهام المسجلة سابقًا."), reauth))) return;
        if (Selected(choice) == V(current, "task_type_id")) return;
        var session = (await api.Send("GET", "/v1/sessions")).AsArray().Single(n => V(n, "id") == V(current, "session_id"));
        try { await api.Send("PATCH", "/v1/groups/" + id, new { version = Ver(current), taskTypeId = Selected(choice) }, V(session, "provider") == "baileys" ? await Reauth(reauth.Password) : null); }
        finally { reauth.Password = ""; }
        await Render();
    }
    private async Task ToggleGroup(JsonNode n, bool enabled)
    {
        var session = (await api.Send("GET", "/v1/sessions")).AsArray().Single(s => V(s,"id") == V(n,"session_id"));
        string? grant = null;
        var reauth = ReauthField();
        if (V(session,"provider") == "baileys")
        {
            if (!await Dialog(enabled ? "تفعيل استقبال المجموعة" : "إيقاف استقبال المجموعة", Stack(Text(V(n,"title")), reauth), "تأكيد")) return;
            grant = await Reauth(reauth.Password);
        }
        try { await api.Send("PATCH", "/v1/groups/" + V(n,"id"), new {version=Ver(n), enabled}, grant); }
        finally { reauth.Password = ""; }
        await Render();
    }
    private async Task ConnectWhatsApp(string id)
    {
        var phrase = Field("اكتب CONNECT WHATSAPP");
        var acknowledged = new CheckBox { Content = "أوافق على استخدام موصل غير رسمي وأفهم مخاطر تعليق الحساب وتغيّر الخدمة" };
        var reauth = ReauthField();
        if (!await Dialog("بدء اتصال واتساب الحقيقي", Stack(Text("سينشئ الخادم اتصالًا بواتساب. تُعالج فقط رسائل النص الجديدة في المجموعات التي تختارها لاحقًا. لا يُفعّل هذا الإرسال."), acknowledged, phrase, reauth), "بدء الاتصال")) return;
        if (acknowledged.IsChecked != true || phrase.Text != "CONNECT WHATSAPP") throw new InvalidOperationException("يلزم قبول المخاطر وكتابة عبارة التأكيد.");
        try { await api.Send("POST", $"/v1/sessions/{id}/connect", new { confirmation = phrase.Text, acknowledgeUnofficial = true }, await Reauth(reauth.Password)); }
        finally { reauth.Password = phrase.Text = ""; }
        await Render();
    }
    private async Task WhatsAppQr(string id)
    {
        var reauth = ReauthField();
        if (!await Dialog("عرض رمز ربط محمي", Stack(Text("امسح الرمز بنفسك. سيُخفى تلقائيًا؛ لا يُحفظ في ملف أو الحافظة."), reauth), "عرض")) return;
        JsonNode result;
        try { result = await api.Send("POST", $"/v1/sessions/{id}/pairing", new { }, await Reauth(reauth.Password)); }
        finally { reauth.Password = ""; }
        var value = V(result, "image");
        const string prefix = "data:image/png;base64,";
        if (!value.StartsWith(prefix, StringComparison.Ordinal) || value.Length > 150000) throw new InvalidOperationException("تعذر عرض رمز الربط.");
        var image = new Image { Width = 320, Height = 320, FlowDirection = FlowDirection.LeftToRight };
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(image, "رمز ربط واتساب مؤقت");
        var seconds = Math.Clamp(result["expiresInSeconds"]!.GetValue<int>(), 1, 45);
        var expiry = Text($"يُخفى الرمز خلال {seconds} ثانية. حدّث الجلسات لطلب الرمز الحالي.");
        var hide = new DispatcherTimer { Interval = TimeSpan.FromSeconds(seconds) };
        hide.Tick += (_, _) => { image.Source = null; expiry.Text = "انتهت مهلة العرض. أغلق ثم اطلب الرمز الحالي."; hide.Stop(); };
        try
        {
            using var stream = new InMemoryRandomAccessStream();
            using (var writer = new DataWriter(stream)) { writer.WriteBytes(Convert.FromBase64String(value[prefix.Length..])); await writer.StoreAsync(); writer.DetachStream(); }
            stream.Seek(0);
            var bitmap = new BitmapImage(); await bitmap.SetSourceAsync(stream); image.Source = bitmap;
            result["image"] = null; value = "";
            hide.Start();
            await new ContentDialog { Title = "رمز ربط واتساب", Content = Stack(image, expiry), CloseButtonText = "إغلاق وإخفاء", XamlRoot = XamlRoot, FlowDirection = FlowDirection.RightToLeft }.ShowAsync();
        }
        finally { hide.Stop(); image.Source = null; result["image"] = null; value = ""; }
    }
    private async Task BindWhatsAppGroup(string id)
    {
        var tasks = (await api.Send("GET", "/v1/task-types")).AsArray();
        if (tasks.Count == 0) throw new InvalidOperationException("أضف نوع مهمة من صفحة المجموعات أولًا، ثم اربط المجموعة.");
        var reauth = ReauthField();
        if (!await Dialog("قراءة مجموعات الجلسة", Stack(Text("تُعرض أسماء المجموعات لتختار واحدة فقط؛ لا تُستقبل بياناتها قبل ربطها."), reauth), "قراءة المجموعات")) return;
        JsonArray available;
        try { available = (await api.Send("POST", $"/v1/sessions/{id}/available-groups", new { }, await Reauth(reauth.Password))).AsArray(); }
        finally { reauth.Password = ""; }
        var linked = (await api.Send("GET", "/v1/groups")).AsArray().Where(n => V(n, "session_id") == id).Select(n => V(n, "external_group_id")).ToHashSet();
        available = new JsonArray(available.Where(n => !linked.Contains(V(n, "externalGroupId"))).Select(n => n!.DeepClone()).ToArray());
        if (available.Count == 0)
        {
            await new ContentDialog { Title = "لا توجد مجموعات جديدة", Content = Text("لم تظهر مجموعات جديدة لإضافتها. المجموعات المضافة موجودة في صفحة المجموعات لتعديل مهمتها وقواعدها. تأكد أن رقم واتساب المرتبط عضو في المجموعة المطلوبة، ثم أعد قراءة المجموعات."), CloseButtonText = "إغلاق", XamlRoot = XamlRoot, FlowDirection = FlowDirection.RightToLeft }.ShowAsync();
            return;
        }
        var group = Choice("المجموعة", available.Select(n => (V(n, "externalGroupId"), V(n, "title"))));
        var task = Choice("المهمة الافتراضية", tasks.Select(n => (V(n, "id"), ChoiceLabel(n!, "name"))));
        var ns = Field("مساحة الحسابات", "work"); var period = Field("الفترة", DateTime.Today.ToString("yyyy-MM", System.Globalization.CultureInfo.InvariantCulture)); reauth = ReauthField();
        if (!await Dialog("تفعيل استقبال المجموعة المختارة", Stack(group, task, ns, period, Text("المهمة الافتراضية تُستخدم عند عدم مطابقة قاعدة. استخدام مساحة الحسابات نفسها يدمج الحساب المتكرر بين المجموعات؛ اختر مساحة مختلفة لفصل الأنظمة. تُعالج الرسائل الجديدة حتى عند إغلاق التطبيق."), reauth), "ربط وتفعيل الاستقبال")) return;
        var selected = available.Single(n => V(n, "externalGroupId") == Selected(group))!;
        try { await api.Send("POST", "/v1/groups", new { sessionId = id, externalGroupId = Selected(group), title = V(selected,"title"), taskTypeId = Selected(task), @namespace = ns.Text, periodKey = period.Text }, await Reauth(reauth.Password)); }
        finally { reauth.Password = ""; }
        await Render();
    }
}
