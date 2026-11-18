using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private async Task<string[]> ReadModelCatalog(string provider)
    {
        var response = await api.Send("GET", "/v1/ai/models?provider=" + provider);
        return response["models"]!.AsArray().Select(item => item!.GetValue<string>()).ToArray();
    }

    private sealed class ModelIdPicker
    {
        private readonly Func<string, string> resolveProvider;
        private readonly Func<string, Task<string[]>> readCatalog;
        private readonly TextBox query = new() { PlaceholderText = "vendor/model", MaxLength = 200, FlowDirection = FlowDirection.LeftToRight };
        private readonly ListView matches = new() { IsItemClickEnabled = true, SelectionMode = ListViewSelectionMode.None, MaxHeight = 140, FlowDirection = FlowDirection.LeftToRight };
        private readonly TextBlock status = Text("");
        private readonly Button browse = ActionButton("عرض النماذج المتاحة");
        private string? initialModel;
        private string[]? catalog;
        private string? error;
        private int generation;
        private bool loading;
        private bool resetting;
        public string Provider { get; private set; } = "";
        public string? Model { get; private set; }
        public bool IsEmpty => Query.Length == 0;
        private string Query => query.Text.Trim();
        public StackPanel View { get; }

        public ModelIdPicker(Func<string, string> resolveProvider, Func<string, Task<string[]>> readCatalog, string? saved)
        {
            this.resolveProvider = resolveProvider;
            this.readCatalog = readCatalog;
            const string label = "اسم النموذج أو معرّفه";
            AutomationProperties.SetName(query, label);
            AutomationProperties.SetName(matches, "النماذج المطابقة");
            View = Stack(Text(label), query, status, matches, browse);
            query.TextChanged += (_, _) =>
            {
                if (resetting) return;
                var provider = resolveProvider(Query);
                if (provider != Provider) ResetCatalog(provider);
                if (!IsEmpty && catalog is null && !loading && error is null && Query != initialModel) _ = Load();
                else RenderMatches();
            };
            matches.ItemClick += (_, args) =>
            {
                if (args.ClickedItem is string id) query.Text = id;
            };
            browse.Click += async (_, _) => await Load();
            ChangeProvider(saved);
        }

        private void ResetCatalog(string provider)
        {
            generation++;
            Provider = provider;
            catalog = null;
            loading = false;
            error = null;
            initialModel = null;
        }

        public void ChangeProvider(string? saved = null, bool load = false)
        {
            ResetCatalog(resolveProvider(saved ?? ""));
            initialModel = saved;
            resetting = true;
            query.Text = saved ?? "";
            resetting = false;
            RenderMatches();
            if (load) _ = Load();
        }

        private async Task Load()
        {
            if (loading) return;
            var version = generation;
            loading = true;
            error = null;
            RenderMatches();
            try
            {
                var ids = await readCatalog(Provider);
                if (version == generation) catalog = ids;
            }
            catch (Exception ex)
            {
                if (version == generation) error = FriendlyError(ex.Message);
            }
            finally
            {
                if (version == generation)
                {
                    loading = false;
                    RenderMatches();
                }
            }
        }

        private void RenderMatches()
        {
            Model = null;
            matches.Visibility = Visibility.Collapsed;
            browse.Visibility = catalog is null && !loading ? Visibility.Visible : Visibility.Collapsed;
            if (loading) { status.Text = "جارٍ جلب النماذج المتاحة…"; return; }
            if (catalog is null)
            {
                if (Query == initialModel && !IsEmpty) Model = initialModel;
                status.Text = error ?? (Model is null ? "اكتب جزءًا من الاسم أو الصق المعرّف الكامل." : "النموذج المحدد حاليًا.");
                return;
            }
            var search = Query;
            Model = catalog.FirstOrDefault(id => id.Equals(search, StringComparison.OrdinalIgnoreCase));
            if (Model != null)
            {
                status.Text = "النموذج المحدد: " + Model;
                return;
            }
            var filtered = catalog.Where(id => id.Contains(search, StringComparison.OrdinalIgnoreCase)).ToArray();
            matches.ItemsSource = filtered;
            matches.Visibility = filtered.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
            status.Text = filtered.Length > 0 ? $"اختر نموذجًا من النتائج ({filtered.Length})."
                : catalog.Length == 0 ? "لم يُرجع المزود نماذج متاحة لهذا المفتاح." : "لا يوجد نموذج بهذا المعرّف ضمن النماذج المتاحة لمفتاح المزود.";
        }
    }
}
