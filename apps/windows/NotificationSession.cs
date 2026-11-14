namespace TaskPilot_Windows;

// The OS adapter accepts generic summary text only, never a server event or identity.
public interface INotificationPlatform
{
    bool IsSupported { get; }
    bool IsElevated { get; }
    bool IsEnabled { get; }
    event Action? Invoked;
    void Register();
    void Unregister();
    uint Show(string summary);
}

public sealed class NotificationSession(INotificationPlatform platform) : IDisposable
{
    private const string Disabled = "إشعارات Windows متوقفة لهذه الجلسة.";
    private bool registered;
    private Action? invocation;
    private long generation;
    public bool Enabled { get; private set; }
    public string Status { get; private set; } = Disabled;
    public event Action<long>? OpenRequested;
    public bool IsCurrentActivation(long epoch) => Enabled && Volatile.Read(ref generation) == epoch;
    public void Enable(bool enabled)
    {
        if (!enabled) { Dispose(); return; }
        if (Enabled) return;
        try
        {
            if (!platform.IsSupported)
            {
                Status = "إشعارات Windows غير مدعومة في بيئة التشغيل الحالية.";
                return;
            }
            if (platform.IsElevated)
            {
                Status = "إشعارات Windows لا تدعم تشغيل التطبيق بصلاحيات مسؤول. افتح التطبيق بحساب Windows العادي؛ الإشعارات داخل التطبيق متاحة.";
                return;
            }
            var epoch = Interlocked.Increment(ref generation);
            invocation = () =>
            {
                if (Volatile.Read(ref generation) != epoch) return;
                try { OpenRequested?.Invoke(epoch); }
                catch { /* A closing UI must not break a native notification callback. */ }
            };
            platform.Invoked += invocation;
            // Register can fail after partial native registration, so cleanup is still required.
            registered = true;
            platform.Register();
            if (!platform.IsEnabled)
            {
                Dispose();
                Status = "لم يسمح Windows بالإشعارات؛ الإشعارات داخل التطبيق متاحة.";
                return;
            }
            Enabled = true;
            Status = "إشعارات عامة صامتة أثناء تشغيل التطبيق؛ لا أسماء أو بيانات حسابات.";
        }
        catch
        {
            Dispose();
            Status = "تعذر تهيئة إشعارات Windows. الإشعارات داخل التطبيق متاحة.";
        }
    }
    public uint Show(int count)
    {
        if (!Enabled) return 0;
        try
        {
            var id = platform.Show(ChangeFeed.SafeSummary(count));
            if (id == 0) Status = "لم يؤكد Windows قبول الإشعار؛ راجع الإشعارات داخل التطبيق.";
            return id;
        }
        catch
        {
            Status = "تعذر عرض إشعار Windows؛ التنبيه محفوظ داخل التطبيق.";
            return 0;
        }
    }
    public void Dispose()
    {
        Interlocked.Increment(ref generation);
        Enabled = false;
        Status = Disabled;
        var handler = invocation;
        invocation = null;
        if (handler is not null)
            try { platform.Invoked -= handler; }
            catch { /* Invalidate the epoch even if an OS adapter fails cleanup. */ }
        if (!registered) return;
        registered = false;
        try { platform.Unregister(); }
        catch { /* OS notification failures must not interrupt the workspace. */ }
    }
}
