using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private string detailAccountId = "", detailSection = "tasks";
    private int detailOffset;
    private async Task AccountDetails()
    {
        var result = await api.Send("GET", $"/v1/accounts/{detailAccountId}/details?section={detailSection}&limit=50&offset={detailOffset}");
        var account = result["account"]!;
        Card(V(account,"display_name"), V(account,"namespace") + " / " + V(account,"username_normalized") + " • " + (V(account,"archived_at")=="" ? "نشط" : "مؤرشف"));
        Body.Children.Add(Button("العودة للحسابات", async () => { page="accounts"; await Render(); }));
        var section = Choice("عرض التفاصيل", [("tasks","المهام"),("sources","مصادر الرسائل"),("flags","بلاغات الاعتماد المسجلة"),("history","نشاط السجلات الحالية")],detailSection);
        TrackDraft(section);
        Body.Children.Add(Stack(section,Button("عرض القسم",async () => {detailSection=Selected(section);detailOffset=0;await Render();})));
        foreach (var row in result["items"]!.AsArray())
        {
            var n=row!;
            switch(detailSection)
            {
                case "tasks":
                    Card(V(n,"task_name") + " • " + V(n,"task_code"), $"{StateLabel(V(n,"status"))} • الفترة: {V(n,"period_key")} • أولوية {V(n,"priority")}\nالمصادر: {V(n,"source_count")} • الردود: {V(n,"reply_count")} • الإنشاء: {V(n,"created_at")}\n{V(n,"id")}");
                    break;
                case "sources":
                    Card(V(n,"group_title"), $"الجلسة: {V(n,"session_label")} • {V(n,"provider")} • {V(n,"state")}\nالاستلام: {V(n,"received_at")} • مهام مرتبطة: {V(n,"task_count")}\nرسالة المصدر: {V(n,"external_message_id")}\n{V(n,"id")}");
                    break;
                case "flags":
                    var kind=V(n,"kind") switch {"INVALID_ACCOUNT_PASSWORD"=>"بلاغ كلمة مرور خاطئة","INVALID_ACCOUNT_CODE"=>"بلاغ رمز حساب خاطئ",_=>"اعتماد يحتاج تحققًا"};
                    var evidence=V(n,"evidence_kind") switch {"MANUAL"=>"تأكيد يدوي","AUTHORIZED_CHECK"=>"تحقق مصرح",_=>"غير متحقق"};
                    Card(kind,$"الدليل المسجل: {evidence} • {V(n,"created_at")}\nهذه واقعة مسجلة؛ لا يُجرى تحقق جديد من بيانات الدخول عند عرضها.");
                    break;
                case "history":
                    Card(ActivityLabel(V(n,"action")),V(n,"created_at") + "\n" + V(n,"target_id"));
                    break;
            }
        }
        var total=result["total"]!.GetValue<int>();
        var previous=Button("السابق",async()=>{detailOffset=Math.Max(0,detailOffset-50);await Render();}); previous.IsEnabled=detailOffset>0;
        var next=Button("التالي",async()=>{detailOffset+=50;await Render();}); next.IsEnabled=detailOffset+50<total;
        Body.Children.Add(Stack(Text(total==0 ? "لا توجد سجلات في هذا القسم." : $"النتائج {Math.Min(detailOffset+1,total)}–{Math.Min(detailOffset+50,total)} من {total}"),new StackPanel {Orientation=Orientation.Horizontal,Spacing=12,Children={previous,next}}));
        Body.Children.Add(Text("تُعرض بيانات المصدر الوصفية فقط. يعرض النشاط السجلات المرتبطة الموجودة حاليًا؛ الحذف النهائي يزيل روابط البيانات المحذوفة، ويبقى سجل التدقيق العام منقّحًا."));
    }
}
