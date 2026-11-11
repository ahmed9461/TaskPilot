using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;
namespace TaskPilot_Windows;

public sealed class DesktopNotifications : IDisposable
{
    private bool registered;
    public bool Enabled
    {
        get; private set;
    }
    public string Status { get; private set; } = "إشعارات Windows متوقفة لهذه الجلسة.";
    public event Action? OpenRequested;
    public void Enable(bool enabled)
    {
        if (!enabled)
        {
            Dispose();
            Status = "إشعارات Windows متوقفة لهذه الجلسة.";
            return;
        }
        if (Enabled)
            return;
        try
        {
            if (!AppNotificationManager.IsSupported())
            {
                Status = "إشعارات Windows غير مدعومة في بيئة التشغيل الحالية.";
                return;
            }
            var manager = AppNotificationManager.Default;
            manager.NotificationInvoked += OnInvoked;
            try
            {
                manager.Register();
                registered = true;
            }
            catch { manager.NotificationInvoked -= OnInvoked; throw; }
            Enabled = manager.Setting == AppNotificationSetting.Enabled;
            Status = Enabled ? "إشعارات عامة صامتة أثناء تشغيل التطبيق؛ لا أسماء أو بيانات حسابات." : "لم يسمح Windows بالإشعارات؛ الإشعارات داخل التطبيق متاحة.";
            if (!Enabled)
                Dispose();
        }
        catch { Dispose(); Status = "تعذر تهيئة إشعارات Windows. الإشعارات داخل التطبيق متاحة."; }
    }
    private void OnInvoked(AppNotificationManager sender, AppNotificationActivatedEventArgs args) => OpenRequested?.Invoke();
    public uint Show(int count)
    {
        if (!Enabled)
            return 0;
        try
        {
            var notification = new AppNotificationBuilder().AddArgument("action", "notifications")
                .AddText("TaskPilot").AddText(ChangeFeed.SafeSummary(count)).MuteAudio()
                .SetTag("workspace-updates").SetGroup("TaskPilot").BuildNotification();
            notification.Expiration = DateTimeOffset.UtcNow.AddMinutes(2);
            notification.ExpiresOnReboot = true;
            AppNotificationManager.Default.Show(notification);
            if (notification.Id == 0)
                Status = "لم يؤكد Windows قبول الإشعار؛ راجع الإشعارات داخل التطبيق.";
            return notification.Id;
        }
        catch { Status = "تعذر عرض إشعار Windows؛ التنبيه محفوظ داخل التطبيق."; return 0; }
    }
    public void Dispose()
    {
        Enabled = false;
        if (!registered)
            return;
        try
        {
            AppNotificationManager.Default.NotificationInvoked -= OnInvoked;
            AppNotificationManager.Default.UnregisterAll();
        }
        catch { /* Notification availability must never interrupt the workspace. */ }
        registered = false;
    }
}
