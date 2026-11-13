using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using System.Text.Json.Nodes;
namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private readonly ChangeFeed changes = new();
    private readonly DesktopNotifications desktop = new();
    private string? syncWorkspace;
    private async Task InitializeSync(string workspace)
    {
        var state = await api.Send("GET", "/v1/notifications/state");
        if (syncWorkspace != workspace)
        {
            changes.Seed(V(state, "newestId"));
            syncWorkspace = workspace;
        }
        UpdateUnread(state);
    }
    private void UpdateUnread(JsonNode state)
    {
        var count = state["unreadCount"]!.GetValue<int>();
        UnreadBadge.Value = Math.Min(999, count);
        UnreadBadge.Visibility = count > 0 ? Visibility.Visible : Visibility.Collapsed;
        AutomationProperties.SetName(NotificationsNav, $"الإشعارات، غير المقروء {count}");
    }
    private void DesktopSettings()
    {
        var toggle = new ToggleSwitch { Header = "إشعارات Windows العامة", IsOn = desktop.Enabled, OnContent = "مفعّلة لهذه الجلسة", OffContent = "متوقفة" };
        var status = Text(desktop.Status);
        var changing = false;
        toggle.Toggled += (_, _) => { if (changing) return; desktop.Enable(toggle.IsOn); changing = true; toggle.IsOn = desktop.Enabled; changing = false; status.Text = desktop.Status; };
        Body.Children.Add(Stack(Text("الإشعارات", 24), Text("تعرض عدد التحديثات فقط دون أسماء أو بيانات حسابات. لا يوجد استقبال على Windows بعد إغلاق التطبيق؛ السجل يبقى على الخادم."), toggle, status,
            Button("إشعار اختباري عام", () => { if (!desktop.Enabled) throw new InvalidOperationException("فعّل إشعارات Windows لهذه الجلسة أولًا."); var accepted = desktop.Show(1); status.Text = accepted > 0 ? "قبل Windows الإشعار الاختباري؛ ظهوره يعتمد على إعدادات النظام." : desktop.Status; return Task.CompletedTask; })));
    }
    private static string ActivityLabel(string code) => code switch
    {
        "MESSAGE_PROCESSED" => "تمت معالجة رسالة",
        "MESSAGE_MISSING_FIELDS" => "رسالة تحتاج مراجعة",
        "CREDENTIAL_REVIEW_REQUIRED" => "اعتماد يحتاج مراجعة",
        "ACCOUNT_SAVED" => "حُفظ حساب",
        "ACCOUNT_UPDATED" => "عُدلت بيانات حساب",
        "ACCOUNT_ARCHIVE" => "أُرشف حساب",
        "ACCOUNT_RESTORE" => "استُعيد حساب",
        "ASSIGNMENT_STATUS_CHANGED" => "تغيرت حالة مهمة",
        "CREDENTIAL_ERROR_VERIFIED" => "سُجل خطأ اعتماد مثبت",
        "ACCOUNT_CREDENTIALS_UNVERIFIED" => "اعتماد غير متحقق",
        "REPLY_APPROVED" => "اعتُمد رد",
        "REPLY_SENT" => "سُجل إرسال رد",
        "REPLY_DELIVERY_UNKNOWN" => "تسليم يحتاج تحققًا",
        "REPLY_RECONCILED_SENT" => "حُسم التسليم: وصل",
        "REPLY_RECONCILED_NOT_SENT" => "حُسم التسليم: لم يُرسل",
        "CLIENT_SESSION_CREATED" => "بدأت جلسة عميل",
        "CLIENT_SESSION_REVOKED" => "أُلغيت جلسة عميل",
        "ACCOUNTS_PURGED" => "حُذفت حسابات محددة",
        "ASSIGNMENT_PURGED" => "حُذف تكليف",
        "TEMPLATE_CREATED" => "أُضيف قالب رد",
        "TEMPLATE_UPDATED" => "عُدل قالب رد",
        "REPORT_EXPORTED" => "صُدر تقرير",
        _ => "نشاط في مساحة العمل"
    };
    private async Task Notifications()
    {
        const string resource = "notifications";
        var read = Choice("حالة القراءة", [("all", "الكل"), ("unread", "غير مقروء"), ("read", "مقروء")], Filter(resource, "read"));
        TrackDraft(read);
        Body.Children.Add(Stack(read, Button("تطبيق حالة القراءة", async () => { filters[resource] = new() { ["read"] = Selected(read) }; offsets[resource] = 0; await Render(); })));
        var result = await PageData(resource);
        var rows = result["items"]!.AsArray();
        if (rows.Count > 0)
            Body.Children.Add(Button("تعليم هذه الصفحة كمقروءة", async () => { await api.Send("POST", "/v1/notifications/read", new { ids = rows.Select(n => V(n, "id")).ToArray() }); await Render(); }));
        foreach (var row in rows)
        {
            var n = row!;
            Card(ActivityLabel(V(n, "type")), $"{V(n, "created_at")} • {(V(n, "read_at") == "" ? "غير مقروء" : "مقروء")}",
                Button("تمت القراءة", async () => { await api.Send("POST", "/v1/notifications/" + V(n, "id") + "/read", new { }); await Render(); }));
        }
        if (rows.Count == 0)
            Body.Children.Add(Text("لا توجد إشعارات مطابقة."));
        Pager(resource, result);
    }
    private async Task Audit()
    {
        const string resource = "audit";
        var actions = new[] { "ACCOUNT_SAVED", "ACCOUNT_UPDATED", "ASSIGNMENT_STATUS_CHANGED", "MESSAGE_MISSING_FIELDS", "CREDENTIAL_ERROR_VERIFIED", "REPLY_APPROVED", "REPLY_SENT", "REPLY_DELIVERY_UNKNOWN", "ACCOUNTS_PURGED", "ASSIGNMENT_PURGED", "REPORT_EXPORTED" };
        var action = Choice("نوع النشاط", new[] { ("", "الكل") }.Concat(actions.Select(code => (code, ActivityLabel(code)))), Filter(resource, "action"));
        var target = Field("معرّف السجل (اختياري)", Filter(resource, "targetId"));
        target.FlowDirection = FlowDirection.LeftToRight;
        TrackDraft(action, target);
        Body.Children.Add(Stack(Text("سجل منقّح: الإجراء والمعرّف والوقت فقط. لا تُعرض نصوص الرسائل أو الاعتمادات."), action, target,
            Button("تطبيق التصفية", async () => { filters[resource] = new() { ["action"] = Selected(action), ["targetId"] = target.Text.Trim() }; offsets[resource] = 0; await Render(); })));
        var result = await PageData(resource);
        foreach (var n in result["items"]!.AsArray())
            Card(ActivityLabel(V(n, "action")), V(n, "created_at") + "\n" + V(n, "target_id"));
        if (result["items"]!.AsArray().Count == 0)
            Body.Children.Add(Text("لا يوجد نشاط مطابق."));
        Pager(resource, result);
    }
    private async Task Operations()
    {
        var n = await api.Send("GET", "/v1/operations");
        var counts = n["counts"]!;
        Card("حالة التشغيل التجريبي", TransportSummary);
        foreach (var (key, title) in new[] { ("review", "رسائل تحتاج مراجعة"), ("unread", "إشعارات غير مقروءة"), ("approvedReplies", "ردود معتمدة"), ("sendingReplies", "قيد الإرسال"), ("unknownReplies", "تسليم يحتاج تحققًا"), ("failedReplies", "ردود فشلت"), ("enabledGroups", "مجموعات مفعّلة"), ("pendingIngress", "رسائل واتساب معلّقة"), ("failedIngress", "رسائل وارد معزولة بسبب فشل المعالجة"), ("connectedSessions", "جلسات واتساب متصلة") })
            Card(V(counts, key), title);
        Card("عمر قوائم الانتظار", $"أقدم مراجعة: {V(n, "oldestReviewSeconds")} ثانية • أقدم رد معتمد: {V(n, "oldestApprovedSeconds")} ثانية");
        Card("آخر قراءة من الخادم", V(n, "observedAt") + $"\nزمن عملية API: {V(n, "processUptimeSeconds")} ثانية • المهاجرات: {V(n, "migrations")}");
        foreach (var row in (await api.Send("GET", "/v1/whatsapp/ingress-errors")).AsArray())
        {
            var error = row!;
            Card("رسالة وارد معزولة", "المعرّف: " + V(error,"id") + " • محاولات: " + V(error,"attempts") + " • " + V(error,"last_error_code"), Button("إعادة المعالجة الداخلية", async () =>
            {
                var reauth = ReauthField();
                if (!await Dialog("إعادة معالجة وارد معزول", Stack(Text("تعيد هذه العملية المعالجة الداخلية فقط. لا تُرسل رسالة إلى واتساب. عالج سبب الفشل أولًا."),reauth),"إعادة المعالجة")) return;
                try { await api.Send("POST","/v1/whatsapp/ingress-errors/" + V(error,"id") + "/retry",new {confirmation="RETRY INGRESS"},await Reauth(reauth.Password)); }
                finally { reauth.Password=""; }
                await Render();
            }));
        }
        Body.Children.Add(Text("هذه قراءة للحالة الآن؛ لا تثبت اكتمال النسخ خارج الخادم أو الاستقبال الحقيقي. لا تغيّر هذه الشاشة إعدادات خدمات الخادم."));
    }
}
