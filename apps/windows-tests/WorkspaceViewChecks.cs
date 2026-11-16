using TaskPilot_Windows;
static class WorkspaceViewChecks
{
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = DateTimeOffset.UnixEpoch;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private static void Check(bool value) { if (!value) throw new Exception("Workspace navigation cache contract failed"); }
    public static void Run()
    {
        var clock = new Clock();
        var cache = new WorkspaceViewCache<object>(clock);
        var content = new object();
        cache.Save("accounts", new(content, 125, true, clock.Now, 1));
        Check(cache.TryGet("accounts", 1, out var view) && ReferenceEquals(view!.Content, content) && view.Offset == 125 && view.HasDraft);
        cache.Invalidate(["CLIENT_SESSION_CREATED", "REVIEW_REVEALED"]);
        Check(cache.TryGet("accounts", 1, out view) && !view!.Dirty);
        cache.Invalidate(["ACCOUNT_UPDATED"]);
        Check(cache.TryGet("accounts", 1, out view) && view!.Dirty && view.HasDraft);
        Check(!cache.TryGet("accounts", 2, out _));
        cache.Save("groups", new(content, 0, false, clock.Now, 2));
        cache.Invalidate(["ASSIGNMENT_STATUS_CHANGED"]);
        Check(cache.TryGet("groups", 2, out _));
        cache.Invalidate(["GROUP_UPDATED"]);
        Check(!cache.TryGet("groups", 2, out _));
        cache.Save("groups", new(content, 0, false, clock.Now, 2));
        clock.Now += TimeSpan.FromSeconds(31);
        Check(!cache.TryGet("groups", 2, out _));
        cache.Save("accounts", new(content, 33, true, DateTimeOffset.UnixEpoch, 2));
        Check(cache.TryGet("accounts", 2, out view) && view!.Dirty);
        foreach (var sensitive in new[] { "settings", "privacy", "ai", "account-details" })
        {
            cache.Save(sensitive, new(content, 0, true, clock.Now, 2));
            Check(!cache.TryGet(sensitive, 2, out _));
        }
        cache.Clear();
        Check(!cache.TryGet("accounts", 2, out _));
        Check(WorkspaceViewCache<object>.Affects("AI_SUGGESTION_READY", "inbox") && !WorkspaceViewCache<object>.Affects("AI_SUGGESTION_READY", "groups"));
        Check(WorkspaceViewCache<object>.Affects("NEW_UNKNOWN_EVENT", "accounts"));
        Check(!WorkspaceViewCache<object>.Affects("CLIENT_DEVICE_CREATED", "notifications") && !ChangeFeed.NeedsAttention("REPORT_EXPORTED"));
        Check(WorkspaceViewCache<object>.Affects("REPLY_FAILED", "notifications") && ChangeFeed.NeedsAttention("AI_SUGGESTION_READY"));
        var feed = new ChangeFeed();
        feed.Seed("1");
        feed.Consume(System.Text.Json.Nodes.JsonNode.Parse("{\"cursor\":\"2\",\"items\":[{\"id\":\"1\",\"type\":\"ACCOUNT_UPDATED\"},{\"id\":\"2\",\"type\":\"CLIENT_SESSION_CREATED\"}]}")!);
        Check(feed.FreshTypes.SetEquals(["CLIENT_SESSION_CREATED"]));
        feed.Seed("9"); Check(feed.FreshTypes.Count == 0);
        Console.WriteLine("PASS: 12 workspace-cache/change-scope groups (instant reuse, drafts, offsets, TTL, revisions, sensitive exclusion, fresh event types); memory only, no UI/network claim.");
    }
}
