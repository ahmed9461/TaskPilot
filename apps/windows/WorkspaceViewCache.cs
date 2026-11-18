namespace TaskPilot_Windows;

public sealed record CachedWorkspaceView<T>(T Content, double Offset, bool HasDraft, DateTimeOffset BuiltAt, long Revision, bool Dirty = false);

// Memory only, never serializes account data, form values or access credentials.
public sealed class WorkspaceViewCache<T>(TimeProvider? clock = null)
{
    private readonly TimeProvider clock = clock ?? TimeProvider.System;
    private readonly Dictionary<string, CachedWorkspaceView<T>> views = new();
    public static bool Cacheable(string page) => page is "dashboard" or "accounts" or "assignments" or "inbox" or "groups" or "sessions" or "replies" or "notifications" or "audit" or "operations";
    public void Clear() => views.Clear();
    public void Save(string page, CachedWorkspaceView<T> value)
    {
        if (Cacheable(page)) views[page] = value;
    }
    public bool TryGet(string page, long revision, out CachedWorkspaceView<T>? value)
    {
        value = null;
        if (!views.TryGetValue(page, out var found)) return false;
        if (found.Revision != revision) { views.Remove(page); return false; }
        var expired = clock.GetUtcNow() - found.BuiltAt > TimeSpan.FromSeconds(30);
        if ((expired || found.Dirty) && !found.HasDraft) { views.Remove(page); return false; }
        value = expired ? found with { Dirty = true } : found;
        return true;
    }
    public void Invalidate(IEnumerable<string> types)
    {
        var events = types.ToArray();
        foreach (var (page, view) in views.ToArray())
        {
            if (!events.Any(type => Affects(type, page))) continue;
            if (view.HasDraft) views[page] = view with { Dirty = true };
            else views.Remove(page);
        }
    }
    public static bool Affects(string type, string page)
    {
        if (page == "assistant") return type is "ACCOUNTS_PURGED" or "ASSIGNMENT_PURGED";
        if (page is "audit" or "operations") return true;
        if (page == "notifications") return ChangeFeed.NeedsAttention(type);
        if (type.StartsWith("CLIENT_", StringComparison.Ordinal) || type is "REVIEW_REVEALED" or "CREDENTIAL_REVEALED" or "REPORT_EXPORTED" or "GROUP_CREDENTIALS_EXPORTED") return false;
        if (type is "MESSAGE_MISSING_FIELDS" or "CREDENTIAL_REVIEW_REQUIRED") return page is "inbox" or "dashboard";
        if (type.StartsWith("AI_", StringComparison.Ordinal)) return page is "ai" or "inbox" or "dashboard";
        if (type is "MESSAGE_PROCESSED" or "REVIEW_RESOLVED" || type.StartsWith("ACCOUNT", StringComparison.Ordinal) || type.StartsWith("CREDENTIAL_", StringComparison.Ordinal)) return page is "accounts" or "account-details" or "assignments" or "inbox" or "dashboard";
        if (type.StartsWith("ASSIGNMENT_", StringComparison.Ordinal)) return page is "accounts" or "account-details" or "assignments" or "dashboard" or "replies";
        if (type.StartsWith("REPLY_", StringComparison.Ordinal)) return page is "assignments" or "replies" or "dashboard";
        if (type.StartsWith("TEMPLATE_", StringComparison.Ordinal)) return page is "replies" or "assignments";
        if (type.StartsWith("GROUP_", StringComparison.Ordinal) || type == "TASK_TYPE_CREATED") return page is "groups" or "assignments" or "inbox" or "replies";
        if (type.StartsWith("WHATSAPP_", StringComparison.Ordinal)) return page is "sessions" or "groups" or "inbox" or "privacy";
        if (type.StartsWith("RETENTION_", StringComparison.Ordinal)) return page is "privacy" or "inbox" or "dashboard";
        if (type == "LIVE_SENDING_CHANGE_AUTHORIZED") return page is "settings" or "replies" or "assignments";
        return true; // Unknown business events invalidate conservatively.
    }
}
