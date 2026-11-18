using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System.Text;
using System.Text.Json.Nodes;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private string PrivateVerificationText => sshConnection is null
        ? "أدخل سر إعادة التحقق الخاص بالتطبيق."
        : "اضغط زر المتابعة. يتحقق التطبيق من هويتك عبر الاتصال الخاص.";

    private DropDownButton MoreActions(params (string Label, Func<Task> Action)[] actions) =>
        new() { Content = "المزيد", Flyout = ActionMenu(actions) };

    private MenuFlyout ActionMenu(params (string Label, Func<Task> Action)[] actions)
    {
        var menu = new MenuFlyout();
        foreach (var (label, action) in actions)
        {
            var item = new MenuFlyoutItem { Text = label };
            item.Click += async (_, _) => await Run(action);
            menu.Items.Add(item);
        }
        return menu;
    }

    private async Task ShowAccountCredentials(string id, string name, string username)
    {
        var reauth = ReauthField();
        var identity = Stack(Text(name, 20), AccountValue(username));
        var consent = Stack(identity, Text("ستظهر كلمة المرور مع الاسم واسم المستخدم لمدة 30 ثانية."), Text(PrivateVerificationText), reauth);
        if (!await Dialog("عرض بيانات الحساب", consent, "متابعة إلى العرض")) return;

        JsonNode result;
        try { result = await api.Send("POST", $"/v1/accounts/{id}/reveal", new { }, await Reauth(reauth.Password)); }
        finally { reauth.Password = ""; }
        var password = AccountValue(V(result, "password"));
        var expiry = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        expiry.Tick += (_, _) => { expiry.Stop(); password.Text = "انتهت مدة العرض. افتح البيانات مجددًا عند الحاجة."; password.IsTextSelectionEnabled = false; };
        var hasPassword = result["password"] is not null;
        if (hasPassword) expiry.Start();
        else password.Text = "كلمة المرور غير مسجلة";
        var content = Stack(Text("الاسم"), Text(result["displayName"]?.ToString() ?? name, 19), Text("اسم المستخدم"), AccountValue(result["username"]?.ToString() ?? username), Text("كلمة المرور"), password);
        var dialog = new ContentDialog { Title = "بيانات الحساب الكاملة", XamlRoot = XamlRoot, Content = content, CloseButtonText = "إغلاق", DefaultButton = ContentDialogButton.Close, FlowDirection = FlowDirection.RightToLeft };
        try { await dialog.ShowAsync(); }
        finally { expiry.Stop(); password.Text = ""; }
    }

    private static TextBlock AccountValue(string value) => new()
    {
        Text = value, IsTextSelectionEnabled = true, FontSize = 17,
        FlowDirection = FlowDirection.LeftToRight, HorizontalAlignment = HorizontalAlignment.Right,
        TextWrapping = TextWrapping.Wrap, FontFamily = new Microsoft.UI.Xaml.Media.FontFamily("Consolas")
    };

    private async Task ExportGroupCredentials(string? selectedGroup = null)
    {
        var all = (await api.Send("GET", "/v1/groups")).AsArray();
        if (all.Count == 0) throw new InvalidOperationException("أضف مجموعة قبل التصدير.");
        var group = Choice("المجموعة", new[] { ("", "اختر مجموعة") }.Concat(all.Select(n => (V(n, "id"), V(n, "title") + " • " + V(n, "period_key")))), selectedGroup ?? "");
        var reauth = ReauthField();
        if (!await Dialog("تصدير حسابات المجموعة بصيغة Markdown",
            Stack(group, Text("يضم الملف نصًا صريحًا لكلمات المرور المسجلة لهذه المجموعة. اختر مكانًا خاصًا لحفظه."), Text(PrivateVerificationText), reauth), "اختيار مكان الحفظ",
            () => Selected(group) == "" ? "اختر المجموعة المطلوبة." : null)) return;

        var picker = new Microsoft.Windows.Storage.Pickers.FileSavePicker(App.CurrentWindow!.AppWindow.Id)
        {
            SuggestedFileName = "TaskPilot-حسابات-المجموعة", DefaultFileExtension = ".md"
        };
        picker.FileTypeChoices.Add("Markdown", new List<string> { ".md" });
        try
        {
            var file = await picker.PickSaveFileAsync();
            if (file is null) return;
            var report = await api.Send("POST", $"/v1/groups/{Selected(group)}/accounts-markdown", new { }, await Reauth(reauth.Password));
            await System.IO.File.WriteAllTextAsync(file.Path, V(report, "content"), new UTF8Encoding(false));
            await AssistantNotice("حُفظ ملف الحسابات", $"عدد الحسابات المصدّرة: {V(report, "count")}");
        }
        finally { reauth.Password = ""; }
    }

    private async Task ChangeAccountArchive(string id, string name, string username, int version, bool restore)
    {
        var title = restore ? "استرجاع الحساب" : "أرشفة الحساب";
        var explanation = restore ? "سيعود الحساب إلى القائمة النشطة." : "سيصبح الحساب مؤرشفًا، وتُلغى ردوده المعتمدة التي تنتظر الإرسال. يمكنك استرجاع الحساب لاحقًا.";
        if (!await Dialog(title, Stack(Text(name, 20), AccountValue(username), Text(explanation)), title)) return;
        await api.Send("POST", $"/v1/accounts/{id}/{(restore ? "restore" : "archive")}", new { version });
        await Render();
    }
}
