using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System.Text.Json.Nodes;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private sealed record AssistantModelSelection(string Provider, string Model);

    private async Task<JsonNode?> GetAssistantModels()
    {
        try { return await api.Send("GET", "/v1/assistant/models"); }
        catch (ApiFailure ex) when (ex.StatusCode == 404) { return null; }
    }

    private static string AssistantModelLabel(JsonNode? options, AssistantModelSelection? selection)
    {
        if (options is null) return "نموذج الخادم الافتراضي";
        if (options["enabled"]?.GetValue<bool>() != true) return "أدوات المشروع المحلية • AI معطّل";
        var provider = selection?.Provider ?? V(options, "defaultProvider");
        var model = selection?.Model ?? V(options, "defaultModel");
        return (provider == "openrouter" ? "OpenRouter" : "DeepSeek") + " • " + model;
    }

    private async Task PickAssistantModel(JsonNode? options, long revision)
    {
        if (options is null)
        {
            await AssistantNotice("اختيار النموذج", "يستخدم هذا الخادم إعداد AI الافتراضي. اختيار نموذج المحادثة يتطلب تحديث الخادم.");
            return;
        }
        var thread = assistantThread;
        var current = assistantModels.GetValueOrDefault(thread);
        var configured = options["providers"]!.AsArray().Where(p => p?["configured"]?.GetValue<bool>() == true)
            .Select(p => V(p, "provider")).ToHashSet();
        var providers = Choice("المزود", [("", "الإعداد الافتراضي"), ("deepseek", "DeepSeek"), ("openrouter", "OpenRouter")], current?.Provider ?? "");
        var models = new ComboBox { Header = "النموذج", HorizontalAlignment = HorizontalAlignment.Stretch, IsEnabled = false };
        var message = Text("اختر مزودًا ثم اجلب النماذج المتاحة لمفتاحه على الخادم.");
        var load = ActionButton("جلب النماذج");
        string? loadedProvider = null;
        var loading = false;
        var search = new TextBox { Header = "بحث عن نموذج", PlaceholderText = "اسم النموذج أو جزء من المعرّف", IsEnabled = false };
        string[] catalog = [];
        void FilterModels()
        {
            var previous = models.SelectedItem as string ?? (current?.Provider == loadedProvider ? current.Model : null);
            var matches = catalog.Where(id => id.Contains(search.Text.Trim(), StringComparison.OrdinalIgnoreCase)).ToArray();
            models.ItemsSource = matches;
            models.SelectedItem = matches.FirstOrDefault(id => id == previous);
            models.IsEnabled = matches.Length > 0;
            message.Text = catalog.Length == 0 ? "لم يُرجع المزود نماذج متاحة." : matches.Length == 0 ? "لا توجد نماذج تطابق البحث." : $"النماذج المطابقة: {matches.Length}";
        }
        search.TextChanged += (_, _) => { if (loadedProvider != null) FilterModels(); };
        void ResetCatalog()
        {
            loadedProvider = null;
            catalog = [];
            search.Text = "";
            models.ItemsSource = null;
            search.IsEnabled = models.IsEnabled = false;
        }
        providers.SelectionChanged += (_, _) => { ResetCatalog(); message.Text = "اجلب النماذج المتاحة لهذا المزود."; };
        load.Click += async (_, _) =>
        {
            var provider = Selected(providers);
            if (loading || provider == "") return;
            if (!configured.Contains(provider)) { message.Text = "مفتاح هذا المزود غير مضبوط على الخادم."; return; }
            loading = true;
            load.IsEnabled = providers.IsEnabled = false;
            ResetCatalog();
            message.Text = "جارٍ جلب النماذج…";
            try
            {
                var result = await api.Send("GET", "/v1/ai/models?provider=" + provider);
                if (!CurrentAssistant(revision)) return;
                catalog = result["models"]!.AsArray().Select(item => item!.ToString()).ToArray();
                loadedProvider = provider;
                search.IsEnabled = catalog.Length > 0;
                FilterModels();
            }
            catch (Exception ex) { message.Text = FriendlyError(ex.Message); }
            finally { loading = false; load.IsEnabled = providers.IsEnabled = true; }
        };
        if (!await Dialog("نموذج المحادثة", Stack(providers, load, search, models, message), "استخدام النموذج", () =>
            loading ? "انتظر جلب النماذج." : Selected(providers) == "" || (Selected(providers) == loadedProvider && models.SelectedItem is string) ? null : "اجلب النماذج واختر أحدها.")) return;
        if (!CurrentAssistant(revision)) return;
        if (Selected(providers) == "") assistantModels.Remove(thread);
        else assistantModels[thread] = new AssistantModelSelection(Selected(providers), (string)models.SelectedItem);
    }

    private async Task AssistantReceipts()
    {
        var receipts = (await api.Send("GET", "/v1/assistant/actions"))["items"]!.AsArray();
        var list = new StackPanel { Spacing = 10 };
        if (receipts.Count == 0) list.Children.Add(Text("لا توجد إيصالات محفوظة."));
        foreach (var receipt in receipts)
            list.Children.Add(Text($"{LocalAssistantTime(V(receipt, "created_at"))} • {V(receipt?["result"], "count")} مهام"));
        await new ContentDialog { Title = "إيصالات تغييرات المهام", XamlRoot = XamlRoot,
            Content = new ScrollViewer { Content = list, MaxHeight = 350 }, CloseButtonText = "إغلاق" }.ShowAsync();
    }
}
