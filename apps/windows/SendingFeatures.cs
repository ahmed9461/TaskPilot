using System.Text.Json.Nodes;

namespace TaskPilot_Windows;
public sealed partial class MainPage
{
    private async Task SendingSettings()
    {
        var status = await api.Send("GET", "/v1/whatsapp/sending-policy");
        var enabled = status["enabled"]!.GetValue<bool>();
        liveSendingEnabled = enabled;
        var recovery = status["recoveryRequired"]?.GetValue<bool>() == true;
        var detail = (enabled ? "الإرسال اليدوي مفعّل." : "الإرسال الفعلي معطّل؛ الاستقبال والمعاينة مستمران.") + $"\nالجلسات المتصلة: {V(status, "connected")} • المجموعات المفعّلة: {V(status, "groups")} • الردود غير المحسومة: {V(status, "unsettled")}\nإكمال المهمة لا يرسل ردًا. كل رد يحتاج معاينة وإقرارًا مستقلًا.";
        if (recovery) detail += "\nيوجد تغيير غير مكتمل أو إعداد غير صالح؛ أعد تثبيت وضع التعطيل الآمن قبل محاولة التفعيل.";
        if (sshConnection is not null && status["controlAvailable"]?.GetValue<bool>() == true)
            Card("إرسال ردود واتساب", detail, Button(recovery ? "استعادة وضع الإرسال المعطّل" : enabled ? "إيقاف الإرسال اليدوي" : "إعداد تفعيل الإرسال اليدوي", () => ChangeSending(!recovery && !enabled)));
        else Card("إرسال ردود واتساب", detail + "\nتغيير الإعداد يتطلب اتصال SSH وخادمًا يدعم التحكم الآمن.");
    }
    private async Task ChangeSending(bool enabled)
    {
        var connection = sshConnection ?? throw new InvalidOperationException("SENDING_POLICY_UNAVAILABLE");
        var preview = await connection.SendingPolicy("preview", enabled);
        var token = V(preview, "token");
        try
        {
            var phrase = Field("اكتب: " + V(preview, "confirmation"));
            var explanation = enabled
                ? "يسمح هذا بإرسال الردود التي تقرّها يدويًا بعد المعاينة. لا يرسل ردًا الآن ولا يرسل عند إكمال مهمة."
                : "يمنع بدء إرسال ردود جديدة. الرسالة التي بدأ إرسالها قد تصل؛ لا يمكن سحبها بهذا الإعداد.";
            if (!await Dialog(enabled ? "تفعيل الردود اليدوية" : "إيقاف الردود", Stack(Text(explanation), Text($"الجلسات المتصلة: {V(preview, "connected")} • المجموعات: {V(preview, "groups")} • الردود غير المحسومة: {V(preview, "unsettled")}\nالمعاينة صالحة 60 ثانية. يُطلب تحقق جديد عبر SSH عند الحفظ."), phrase), enabled ? "تفعيل الإرسال اليدوي" : "إيقاف الإرسال", () => phrase.Text == V(preview, "confirmation") ? null : "اكتب عبارة التأكيد كما تظهر.")) return;
            await connection.SendingPolicy("apply", token: token, confirmation: phrase.Text);
            await Render();
        }
        finally { try { await connection.SendingPolicy("discard", token: token); } catch { /* Expiring server preview is the fallback. */ } }
    }
}
