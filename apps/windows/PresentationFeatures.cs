using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using System.Text.Json.Nodes;
using Windows.Foundation;
using Windows.UI;

namespace TaskPilot_Windows;
public sealed partial class MainPage
{
    private static ActionFlowPanel Toolbar(params UIElement[] actions)
    {
        var panel = new ActionFlowPanel { Spacing = 10 };
        foreach (var action in actions) panel.Children.Add(action);
        return panel;
    }
    private Task OpenSection(string destination)
    {
        var item = Nav.MenuItems.OfType<NavigationViewItem>().FirstOrDefault(x => x.Tag?.ToString() == destination);
        if (item is not null) Nav.SelectedItem = item;
        return Task.CompletedTask;
    }
    private async Task ConnectTailscale(string alias)
    {
        var next = await SshConnection.ConnectPersistent(alias);
        if (shuttingDown) { await next.DisposeAsync(); return; }
        try { if (sshConnection?.Persistent == true) await sshConnection.Revoke(); profileStore.Save(next.Profile!); }
        catch { await next.DisposeAsync(); throw new InvalidOperationException("DEVICE_PROFILE_UNAVAILABLE"); }
        if (sshConnection is not null) await sshConnection.DisposeAsync();
        sshConnection = next; lastSshAlias = alias;
        api.Configure(next.Address, next.Token); connectionState.Connected(null); viewCache.Clear(); identityRevision = -1;
        ReconnectButton.Visibility = Visibility.Collapsed;
        await InitializeSync("tailscale:" + next.Address);
    }
    private void BuildDashboard(JsonNode state)
    {
        var intro = Text("نظرة سريعة على أعمالك وما يحتاج انتباهك", 16);
        intro.Foreground = (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"];
        PageBody.Children.Add(intro);
        var tiles = new MetricGridPanel();
        var orange = Color.FromArgb(255, 240, 143, 87);
        foreach (var (key, label, icon, destination, accent) in new[] {
            ("accounts", "الحسابات", Symbol.People, "accounts", orange),
            ("open", "المهام المفتوحة", Symbol.AllApps, "assignments", orange),
            ("completed", "المهام المكتملة", Symbol.Accept, "assignments", Color.FromArgb(255, 126, 207, 118)),
            ("review", "بحاجة مراجعة", Symbol.Sync, "inbox", Color.FromArgb(255, 241, 181, 84)),
            ("groups", "المجموعات المفعّلة", Symbol.World, "groups", orange),
            ("unread", "إشعارات غير مقروءة", Symbol.Important, "notifications", orange) })
        {
            var value = V(state, key); if (value == "") value = "0";
            var number = Text(value, 48); number.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold; number.HorizontalAlignment = HorizontalAlignment.Center;
            IconElement symbol = key == "unread" ? new FontIcon { Glyph = "\uEA8F", FontFamily = new FontFamily("Segoe Fluent Icons"), FontSize = 27, Foreground = new SolidColorBrush(accent), Width = 27, Height = 27 } : new SymbolIcon(icon) { Foreground = new SolidColorBrush(accent), Width = 27, Height = 27 };
            var badge = new Border { Child = symbol, Padding = new Thickness(13), CornerRadius = new CornerRadius(16), Background = new SolidColorBrush(Color.FromArgb(30, accent.R, accent.G, accent.B)), HorizontalAlignment = HorizontalAlignment.Center };
            var title = Text(label, 19); title.HorizontalAlignment = HorizontalAlignment.Center; title.TextAlignment = TextAlignment.Center;
            var content = Stack(number, badge, title); content.Spacing = 8; content.HorizontalAlignment = HorizontalAlignment.Center; content.VerticalAlignment = VerticalAlignment.Center;
            var glow = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
            glow.GradientStops.Add(new GradientStop { Color = Color.FromArgb(0, accent.R, accent.G, accent.B), Offset = 0.65 });
            glow.GradientStops.Add(new GradientStop { Color = Color.FromArgb(65, accent.R, accent.G, accent.B), Offset = 1 });
            var composition = new Grid(); composition.Children.Add(new Border { Background = glow, CornerRadius = new CornerRadius(23) }); composition.Children.Add(content);
            var border = new Border { Child = composition, CornerRadius = new CornerRadius(24), BorderThickness = new Thickness(1), BorderBrush = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"], Background = (Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"] };
            var button = new Button { Content = border, Padding = new Thickness(0), BorderThickness = new Thickness(0), Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent), CornerRadius = new CornerRadius(24), HorizontalAlignment = HorizontalAlignment.Stretch, VerticalAlignment = VerticalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch, VerticalContentAlignment = VerticalAlignment.Stretch };
            AutomationProperties.SetName(button, label + ": " + value);
            button.Click += async (_, _) => await OpenSection(destination);
            tiles.Children.Add(button);
        }
        PageBody.Children.Add(tiles);
        if (V(state, "unknown_delivery") != "0" && V(state, "unknown_delivery") != "")
            Card("ردود تحتاج حسم التسليم", "تحقق من نتيجة التسليم قبل محاولة إرسال جديدة.", Button("مراجعة الردود", () => OpenSection("replies")));
    }
}
