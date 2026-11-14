using TaskPilot_Windows;

static class NotificationSessionChecks
{
    static void Check(bool value) { if (!value) throw new Exception("NOTIFICATION_SESSION_ASSERTION"); }
    public static void Run()
    {
        var unsupported = new FakePlatform { IsSupported = false };
        using (var session = new NotificationSession(unsupported))
        {
            session.Enable(true);
            Check(!session.Enabled && unsupported.Registers == 0 && unsupported.Subscribers == 0 && session.Show(1) == 0);
        }
        var elevated = new FakePlatform { IsElevated = true };
        using (var session = new NotificationSession(elevated))
        {
            session.Enable(true);
            Check(!session.Enabled && elevated.Registers == 0 && session.Status.Contains("مسؤول"));
        }
        var normal = new FakePlatform { InvokeDuringRegister = true };
        using (var session = new NotificationSession(normal))
        {
            var opens = 0;
            session.OpenRequested += _ => opens++;
            session.Enable(true);
            session.Enable(true);
            Check(session.Enabled && opens == 1 && normal.Registers == 1 && normal.Subscribers == 1);
            Check(session.Show(2) == 17 && normal.Summary == ChangeFeed.SafeSummary(2));
        }
        var denied = new FakePlatform { IsEnabled = false };
        using (var session = new NotificationSession(denied))
        {
            session.Enable(true);
            Check(!session.Enabled && denied.Registers == 1 && denied.Unregisters == 1 && denied.Subscribers == 0);
        }
        var registrationFailure = new FakePlatform { ThrowRegister = true };
        using (var session = new NotificationSession(registrationFailure))
        {
            session.Enable(true);
            Check(!session.Enabled && registrationFailure.Unregisters == 1 && registrationFailure.Subscribers == 0 && !session.Status.Contains("synthetic-private-error"));
        }
        var showFailure = new FakePlatform { ThrowShow = true };
        using (var session = new NotificationSession(showFailure))
        {
            session.Enable(true);
            Check(session.Show(1) == 0 && session.Enabled && showFailure.Shows == 1 && !session.Status.Contains("synthetic-private-error"));
        }
        var lifecycle = new FakePlatform();
        using (var session = new NotificationSession(lifecycle))
        {
            var opens = 0;
            session.OpenRequested += _ => opens++;
            session.Enable(true);
            var late = lifecycle.Capture();
            session.Dispose();
            session.Dispose();
            late();
            Check(opens == 0 && lifecycle.Unregisters == 1 && session.Show(1) == 0);
            session.Enable(true);
            late();
            lifecycle.Capture()();
            Check(opens == 1 && lifecycle.Registers == 2 && lifecycle.Subscribers == 1);
        }
        var bounds = new FakePlatform();
        using (var session = new NotificationSession(bounds))
        {
            session.Enable(true);
            Check(session.Show(0) == 0 && session.Show(501) == 0 && bounds.Shows == 0);
            bounds.AcceptedId = 0;
            Check(session.Show(1) == 0 && bounds.Shows == 1 && session.Status.Contains("لم يؤكد"));
        }
        var cleanupFailure = new FakePlatform { ThrowUnregister = true };
        using (var session = new NotificationSession(cleanupFailure))
        {
            var opens = 0;
            session.OpenRequested += _ => { opens++; throw new Exception("synthetic-ui-closing"); };
            session.Enable(true);
            var callback = cleanupFailure.Capture();
            callback();
            session.Enable(false);
            callback();
            Check(opens == 1 && !session.Enabled && cleanupFailure.Subscribers == 0);
        }
        var queued = new FakePlatform();
        using (var session = new NotificationSession(queued))
        {
            var dispatch = new Queue<Action>();
            var opens = 0;
            session.OpenRequested += epoch => dispatch.Enqueue(() => { if (session.IsCurrentActivation(epoch)) opens++; });
            session.Enable(true);
            queued.Capture()();
            session.Enable(false);
            session.Enable(true);
            dispatch.Dequeue()();
            Check(opens == 0);
            queued.Capture()();
            dispatch.Dequeue()();
            Check(opens == 1);
        }
        Console.WriteLine("PASS: 10 notification session checks (unsupported/elevated, handler ordering, opt-in, permission, partial registration, show failure, stale activation, privacy bounds, cleanup, queued UI dispatch fence); fake OS only.");
    }
    sealed class FakePlatform : INotificationPlatform
    {
        public bool IsSupported { get; init; } = true;
        public bool IsElevated { get; init; }
        public bool IsEnabled { get; init; } = true;
        public bool InvokeDuringRegister, ThrowRegister, ThrowShow, ThrowUnregister;
        public int Registers, Unregisters, Shows;
        public uint AcceptedId = 17;
        public string? Summary;
        private Action? invoked;
        public event Action? Invoked { add => invoked += value; remove => invoked -= value; }
        public int Subscribers => invoked?.GetInvocationList().Length ?? 0;
        public Action Capture() => invoked ?? (() => { });
        public void Register()
        {
            Registers++;
            Check(Subscribers == 1);
            if (InvokeDuringRegister) invoked?.Invoke();
            if (ThrowRegister) throw new Exception("synthetic-private-error");
        }
        public void Unregister() { Unregisters++; if (ThrowUnregister) throw new Exception("synthetic-private-error"); }
        public uint Show(string summary) { Shows++; Summary = summary; if (ThrowShow) throw new Exception("synthetic-private-error"); return AcceptedId; }
    }
}
