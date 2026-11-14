using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;
using System.Security.Principal;
namespace TaskPilot_Windows;

public sealed class DesktopNotifications : IDisposable
{
    private readonly NotificationSession session = new(new WindowsNotificationPlatform());
    public bool Enabled => session.Enabled;
    public string Status => session.Status;
    public event Action<long>? OpenRequested
    {
        add => session.OpenRequested += value;
        remove => session.OpenRequested -= value;
    }
    public void Enable(bool enabled) => session.Enable(enabled);
    public uint Show(int count) => session.Show(count);
    public bool IsCurrentActivation(long epoch) => session.IsCurrentActivation(epoch);
    public void Dispose() => session.Dispose();
}

internal sealed class WindowsNotificationPlatform : INotificationPlatform
{
    public bool IsSupported => AppNotificationManager.IsSupported();
    public bool IsElevated
    {
        get
        {
            using var identity = WindowsIdentity.GetCurrent();
            return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
        }
    }
    public bool IsEnabled => AppNotificationManager.Default.Setting == AppNotificationSetting.Enabled;
    public event Action? Invoked;
    public void Register()
    {
        var manager = AppNotificationManager.Default;
        manager.NotificationInvoked += OnInvoked;
        manager.Register();
    }
    private void OnInvoked(AppNotificationManager sender, AppNotificationActivatedEventArgs args) => Invoked?.Invoke();
    public uint Show(string summary)
    {
        var notification = new AppNotificationBuilder().AddArgument("action", "notifications")
            .AddText("TaskPilot").AddText(summary).MuteAudio()
            .SetTag("workspace-updates").SetGroup("TaskPilot").BuildNotification();
        notification.Expiration = DateTimeOffset.UtcNow.AddMinutes(2);
        notification.ExpiresOnReboot = true;
        AppNotificationManager.Default.Show(notification);
        return notification.Id;
    }
    public void Unregister()
    {
        var manager = AppNotificationManager.Default;
        try { manager.NotificationInvoked -= OnInvoked; }
        finally { manager.Unregister(); }
    }
}
