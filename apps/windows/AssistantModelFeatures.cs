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
        var providers = Choice("المزود", [("", "تلقائي"), ("deepseek", "DeepSeek"), ("openrouter", "OpenRouter")], current?.Provider ?? "");
        string ResolveProvider(string input)
        {
            var selected = Selected(providers);
            if (selected.Length > 0) return selected;
            if (input.Contains('/')) return "openrouter";
            return configured.Contains("openrouter") && !input.StartsWith("deepseek-", StringComparison.OrdinalIgnoreCase)
                ? "openrouter" : V(options, "defaultProvider");
        }
        Task<string[]> Load(string provider) => configured.Contains(provider)
            ? ReadModelCatalog(provider)
            : Task.FromException<string[]>(new InvalidOperationException("AI_CONFIGURATION_REQUIRED"));

        var picker = new ModelIdPicker(ResolveProvider, Load, current?.Model);
        providers.SelectionChanged += (_, _) => picker.ChangeProvider(load: Selected(providers) != "");
        bool UseDefault() => Selected(providers) == "" && picker.IsEmpty;
        var applied = await Dialog("نموذج المحادثة", Stack(providers, picker.View), "استخدام النموذج", () =>
            UseDefault() || picker.Model != null ? null : "أدخل معرّفًا متاحًا كاملًا أو اختر نموذجًا من النتائج.");
        if (!applied || !CurrentAssistant(revision)) return;
        if (UseDefault()) assistantModels.Remove(thread);
        else assistantModels[thread] = new AssistantModelSelection(picker.Provider, picker.Model!);
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
