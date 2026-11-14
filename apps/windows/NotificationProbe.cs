using Microsoft.Windows.AppNotifications;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.UI.Xaml.Controls;
namespace TaskPilot_Windows;

// Opt-in local acceptance hook. Does not connect to a server or transmit account data.
internal static class NotificationProbe
{
    public static async Task Run(DesktopNotifications desktop, string resultFile, Panel host)
    {
        object layout;
        try { layout = NativeLayoutChecks.Run(host); }
        catch (InvalidOperationException e) when (e.Message.StartsWith("NATIVE_", StringComparison.Ordinal))
        { layout = new { status = "FAIL", code = e.Message, scope = "in-process WinUI component check" }; }
        var platform = new WindowsNotificationPlatform();
        var supported = platform.IsSupported;
        var elevated = platform.IsElevated;
        desktop.Enable(true);
        var acceptedId = desktop.Show(1);
        var stored = false;
        var generic = false;
        if (acceptedId > 0)
        {
            var notifications = await AppNotificationManager.Default.GetAllAsync();
            var own = notifications.FirstOrDefault(n => n.Id == acceptedId);
            stored = own is not null;
            if (own is not null)
            {
                var xml = XDocument.Parse(own.Payload);
                generic = xml.Descendants("text").Select(x => x.Value).SequenceEqual(new[] { "TaskPilot", ChangeFeed.SafeSummary(1) }) && xml.Descendants("audio").Any(x => (string?)x.Attribute("silent") == "true");
            }
        }
        var result = new
        {
            supported,
            elevated,
            enabled = desktop.Enabled,
            accepted = acceptedId > 0,
            stored,
            generic,
            layout,
            status = desktop.Status,
            scope = "local generic test only; visible popup not inferred from API receipt"
        };
        await using var file = new FileStream(resultFile, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
        await JsonSerializer.SerializeAsync(file, result);
    }
}
