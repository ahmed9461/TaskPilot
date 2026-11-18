using Microsoft.UI.Xaml.Controls;
using System.Text.Json.Nodes;
namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private static string Money(JsonNode? n) => n is null ? "غير معلومة" : n.ToString() + " USD";
    private static string SuggestionLabel(JsonNode? n) => string.IsNullOrWhiteSpace(n?.ToString()) ? "لم يرجّح النموذج مهمة؛ اخترها يدويًا." : n.ToString();
    private async Task EditOpenRouterKey(int version)
    {
        var key = new PasswordBox { Header = "مفتاح OpenRouter الجديد", MaxLength = 512, PasswordRevealMode = PasswordRevealMode.Hidden };
        var reauth = ReauthField();
        try
        {
            if (!await Dialog("مفتاح OpenRouter", Stack(key, Text("يتحقق TaskPilot من المفتاح لدى OpenRouter ثم يحفظه مشفّرًا على الخادم."), reauth), "تحقق واحفظ",
                () => string.IsNullOrWhiteSpace(key.Password) ? "أدخل مفتاح OpenRouter." : null)) return;
            await api.Send("PUT", "/v1/ai/providers/openrouter/key", new { key = key.Password.Trim(), version }, await Reauth(reauth.Password));
        }
        finally { key.Password = ""; reauth.Password = ""; }
        await Render();
        await AssistantNotice("تم حفظ مفتاح OpenRouter", "يمكنك الآن جلب النماذج من المساعد الشخصي واختيار نموذج للمحادثة.");
    }
    private async Task AiSettings()
    {
        var c = await api.Send("GET", "/v1/ai/config");
        var usage = await api.Send("GET", "/v1/ai/usage");
        var keyConfigured = c["openRouterKeyConfigured"]?.GetValue<bool>() == true;
        Card("مفتاح OpenRouter", keyConfigured ? "المفتاح مضبوط على الخادم." : "لم يُضف مفتاح بعد.",
            Button(keyConfigured ? "تغيير مفتاح OpenRouter" : "إضافة مفتاح OpenRouter", () => EditOpenRouterKey(Ver(c))));
        var provider = new ComboBox { Header = "المزود", ItemsSource = new[] { "deepseek", "openrouter" }, SelectedItem = V(c,"provider") };
        var model = new ComboBox { Header = "النموذج", ItemsSource = new[] { V(c,"model") }, SelectedIndex = 0 };
        var enabled = new CheckBox { Content = "تفعيل AI للمساعد واقتراحات الوارد", IsChecked = c["enabled"]?.GetValue<bool>() };
        var outbound = new CheckBox { Content = "السماح بالتحليل المنقّح ومفردات المساعد المحددة", IsChecked = c["outboundApproved"]?.GetValue<bool>() };
        var automatic = new CheckBox { Content = "تحليل الرسائل الملتبسة تلقائيًا للمراجعة", IsChecked = c["automaticFallback"]?.GetValue<bool>() };
        var requests = new NumberBox { Header = "الحد اليومي للطلبات (UTC)", Minimum = 1, Maximum = 100, Value = c["dailyRequestLimit"]!.GetValue<int>() };
        var tokens = new NumberBox { Header = "حد التوكنات والحجوزات يوميًا", Minimum = 1000, Maximum = 100000, Value = c["dailyTokenLimit"]!.GetValue<int>() };
        PageBody.Children.Add(Stack(Text("استخراج محلي مع اقتراحات AI للمراجعة",24),Text("الصيغ الواضحة تُستخرج محليًا. للحالات الملتبسة ترسل رموز المهام وأنواع الحقول وترتيبها فقط؛ لا ترسل النص أو الاسم أو المستخدم أو كلمة المرور. يقترح AI مواضع الحقول وتبقى قيمها على الخادم للمراجعة قبل الحفظ. لا يرسل ردًا."),Text(c["keyConfigured"]?.GetValue<bool>() == true ? "مفتاح المزود مضبوط على الخادم." : "مفتاح المزود غير مضبوط على الخادم."),provider,model,
            Button("جلب النماذج من المزود", async () => {
                var catalog = await api.Send("GET", "/v1/ai/models?provider=" + provider.SelectedItem);
                var items = catalog["models"]!.AsArray().Select(n=>n!.ToString()).ToArray();
                model.ItemsSource=items;
                model.SelectedItem=items.Contains(V(c,"model")) ? V(c,"model") : items.FirstOrDefault();
            }),enabled,outbound,automatic,requests,tokens,
            Button("حفظ إعدادات الذكاء الاصطناعي", async () => {
                if (model.SelectedItem is null || !double.IsFinite(requests.Value) || !double.IsFinite(tokens.Value)) throw new InvalidOperationException("VALIDATION_ERROR");
                var reauth=ReauthField();
                if (!await Dialog("حفظ المزود والحدود",Stack(Text("التحليل التلقائي اختياري للحالات الملتبسة فقط، مع حدود يومية وطلب واحد لكل إصدار. النتيجة تحتاج مراجعتك ولا تحفظ حسابًا أو ترسل ردًا تلقائيًا."),reauth))) return;
                await api.Send("PATCH","/v1/ai/config",new { version=Ver(c),provider=provider.SelectedItem?.ToString(),model=model.SelectedItem.ToString(),enabled=enabled.IsChecked==true,outboundApproved=outbound.IsChecked==true,automaticFallback=automatic.IsChecked==true,dailyRequestLimit=(int)requests.Value,dailyTokenLimit=(int)tokens.Value },await Reauth(reauth.Password));
                reauth.Password=""; await Render();
            })));
        var today=usage["today"]!;
        Card("استخدام اليوم (UTC)",$"الطلبات: {V(today,"requests")} • نجحت: {V(today,"succeeded")}\nتوكنات المزود: إدخال {V(today,"promptTokens")} / إخراج {V(today,"completionTokens")}\nحجوزات لم تُحسم: {V(today,"unresolvedReservedTokens")} توكن\nالتكلفة التقديرية: {Money(today["estimatedCostUsd"])}\nتكلفة أبلغ بها المزود: {Money(today["reportedCostUsd"])}\nالتقدير بسعر الذروة المتحقق في 2026-11-14، وليس مبلغًا مفوترًا. الحجز ليس إنفاقًا فعليًا.");
        foreach(var row in usage["recent"]!.AsArray()) if(V(row,"request_purpose")=="ASSISTANT") Card("المساعد الشخصي • "+V(row,"status"),$"{V(row,"created_at")}\n{V(row,"model")}\nالتقدير: {Money(row?["estimated_cost_usd"])} • مبلغ المزود: {Money(row?["reported_cost_usd"])}"); else Card(V(row,"model")+" • "+V(row,"status"),$"{V(row,"created_at")}\nرمز المهمة المقترحة: {SuggestionLabel(row?["task_code"])} • الثقة: {V(row,"confidence")}\nالتقدير: {Money(row?["estimated_cost_usd"])} • المبلغ الذي أبلغه المزود: {Money(row?["reported_cost_usd"])}");
    }
    private async Task AiSuggest(JsonNode source)
    {
        var id=V(source,"id");
        var preview=await api.Send("POST","/v1/inbox/"+id+"/ai-preview",new {});
        var codes=preview["candidateCodes"]!.AsArray().Select(n=>n!.ToString()).ToArray();
        if(codes.Length==0 && (preview["fieldCandidates"]?.GetValue<int>() ?? 0)==0) { await Dialog("لا توجد حقول كافية للاقتراح",Text("الرسالة محفوظة للمراجعة. لا يخمّن AI أرقامًا أو اعتمادات ناقصة؛ افتح المراجعة وأكمل البيانات."),"إغلاق"); return; }
        var reauth=ReauthField();
        if(!await Dialog("معاينة البيانات المرسلة للمزود",Stack(Text("ترسل أنواع الحقول وترتيبها ورموز المهام التالية فقط، دون قيم الاسم أو اليوزر أو كلمة المرور:\n"+string.Join("\n",codes)+"\nالنتيجة اقتراح للمراجعة فقط، ويعاد استخدام الاقتراح السابق إن وجد."),reauth),"طلب اقتراح"))return;
        var result=await api.Send("POST","/v1/inbox/"+id+"/ai-suggestion",new {idempotencyKey=$"ai-ui:{id}:{V(preview,"sourceVersion")}:{V(preview,"settingsVersion")}"},await Reauth(reauth.Password));
        reauth.Password="";
        if(V(result,"status")!="SUCCEEDED") { await Dialog("لم يكتمل الاقتراح",Text("تستمر المراجعة المحلية. لم يُعد طلب المزود تلقائيًا. الحالة: "+V(result,"status")),"إغلاق"); return; }
        var open=await Dialog("اقتراح يحتاج مراجعتك",Text($"رمز المهمة: {SuggestionLabel(result["taskCode"])}\nالثقة: {V(result,"confidence")}\nالتقدير: {Money(result["estimatedCostUsd"])}\nالمبلغ الذي أبلغه المزود: {Money(result["reportedCostUsd"])}\nلم تتغير بيانات الحساب أو المهمة. تحقق من الاختيار قبل الحفظ."),"فتح المراجعة");
        if(open) await ReviewSource(source,string.IsNullOrEmpty(V(result,"taskTypeId"))?null:V(result,"taskTypeId"));
    }
}
