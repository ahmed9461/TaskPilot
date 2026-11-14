using Microsoft.UI.Xaml.Controls;
using System.Text.Json.Nodes;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private static string PrivacyCounts(JsonNode p) => string.Join("\n", new[] {
        ("reviews", "نصوص وارد المراجعة المنتهية"), ("failedIngress", "نصوص الوارد المعزول المنتهية"),
        ("expiredApprovals", "موافقات منتهية"), ("expiredClients", "جلسات وصول منتهية"),
        ("readNotifications", "إشعارات مقروءة قديمة"), ("diagnostics", "سجلات تشخيص قديمة")
    }.Select(x => $"{x.Item2}: {V(p, x.Item1)}"));
    private static int WholeDays(NumberBox field)
    {
        if (!double.IsFinite(field.Value) || field.Value != Math.Truncate(field.Value)) throw new InvalidOperationException("VALIDATION_ERROR");
        return checked((int)field.Value);
    }
    private async Task PrivacySettings()
    {
        var p = await api.Send("GET", "/v1/privacy/retention");
        Body.Children.Add(Text("سياسة الاحتفاظ", 24));
        Body.Children.Add(Text("الحسابات والمهام والاعتمادات وتاريخ المصادر والردود والمصادقة محفوظة حتى الحذف المقصود. النسخ الاحتياطية تبقى حتى تقرر إتلافها، وقد تحتوي بيانات حُذفت لاحقًا. التنظيف هنا يحتاج معاينة وتأكيدًا لكل دفعة."));
        NumberBox Days(string label, string key, int min, int max) => new() { Header = label, Value = p[key]!.GetValue<int>(), Minimum = min, Maximum = max, SmallChange = 1 };
        var reviews = Days("نص المراجعة بالأيام — يغلق الوارد القديم عند تنظيفه", "review_days", 1, 365);
        var ingress = Days("نص الوارد المعزول بالأيام", "failed_ingress_days", 1, 90);
        var access = Days("الموافقات وجلسات الوصول بعد انتهائها بالأيام", "expired_access_days", 1, 30);
        var notifications = Days("الإشعارات بعد قراءتها بالأيام", "read_notification_days", 7, 365);
        TrackDraft(reviews, ingress, access, notifications);
        Body.Children.Add(Stack(reviews, ingress, access, notifications, Button("حفظ سياسة الاحتفاظ", async () =>
        {
            var input = new { version = Ver(p), reviewDays = WholeDays(reviews), failedIngressDays = WholeDays(ingress), expiredAccessDays = WholeDays(access), readNotificationDays = WholeDays(notifications) };
            var reauth = ReauthField();
            if (!await Dialog("حفظ المدد", Stack(Text("تغيير المدد لا ينفّذ تنظيفًا. راجع معاينة التنظيف قبل المحو."), reauth), "حفظ السياسة")) return;
            try { await api.Send("PATCH", "/v1/privacy/retention", input, await Reauth(reauth.Password)); }
            finally { reauth.Password = ""; }
            await Render();
        })));
        Body.Children.Add(Button("معاينة تنظيف البيانات المنتهية", async () =>
        {
            var preview = await api.Send("POST", "/v1/privacy/retention-preview", new { });
            var phrase = Field("اكتب " + V(preview, "confirmation"));
            var reauth = ReauthField();
            var more = preview["more"]!.AsObject().Any(x => x.Value?.GetValue<bool>() == true);
            if (!await Dialog("معاينة التنظيف", Stack(Text(PrivacyCounts(preview["counts"]!)), Text("تُنزع نصوص المراجعة المنتهية ويغلق واردها. الوارد الجاري والإشعارات غير المقروءة وسجل العمل لا يشملها هذا التنظيف."), Text(more ? "توجد بيانات إضافية؛ الحد ألف سجل لكل فئة في الدفعة. عاين دفعة جديدة بعد هذه." : "هذه الدفعة تشمل السجلات الظاهرة في الأعداد أعلاه."), phrase, reauth), "تنظيف الدفعة")) return;
            try { await api.Send("POST", "/v1/privacy/retention-execute", new { approvalToken = V(preview, "approvalToken"), confirmation = phrase.Text }, await Reauth(reauth.Password)); }
            finally { reauth.Password = ""; }
            await Render();
        }));
        Body.Children.Add(Text("سجل التنظيف والنسيان", 22));
        foreach (var run in (await api.Send("GET", "/v1/privacy/runs")).AsArray())
            Card(V(run, "kind") == "RETENTION" ? "تنظيف بيانات منتهية" : "نسيان جلسة محليًا", V(run, "created_at") + "\n" + (V(run, "kind") == "RETENTION" ? PrivacyCounts(run!["counts"]!) : $"مصادقة منسية: {V(run!["counts"], "auth")} • مفاتيح اقتباس: {V(run["counts"], "quotes")}"));
    }
    private async Task ForgetSession(string id)
    {
        var p = await api.Send("POST", $"/v1/sessions/{id}/forget-preview", new { });
        var counts = p["counts"]!;
        var phrase = Field("اكتب " + V(p, "confirmation"));
        var reauth = ReauthField();
        if (!await Dialog("نسيان الجلسة محليًا", Stack(Text(V(p, "label"), 22), Text(id), Text($"مصادقة مشفرة: {V(counts, "auth")}\nمفاتيح اقتباس: {V(counts, "quotes")}\nوارد سيُمحى نصه: {V(counts, "queuedRaw")}\nمجموعات ستتوقف: {V(counts, "enabledGroups")}\nردود معتمدة ستُلغى: {V(counts, "approvedReplies")}"), Text("يبقى تاريخ الحسابات والمهام والرسائل والردود. هذا نسيان محلي لا يزيل الجهاز من هاتفك ولا يمحو النسخ السابقة. للربط لاحقًا أو لرقم مختلف أنشئ إعداد جلسة جديدًا؛ لا يُستخدم هذا السجل مجددًا."), phrase, reauth), "نسيان المصادقة")) return;
        try { await api.Send("POST", "/v1/privacy/forget-session", new { approvalToken = V(p, "approvalToken"), confirmation = phrase.Text }, await Reauth(reauth.Password)); }
        finally { reauth.Password = ""; }
        await Render();
    }
}
