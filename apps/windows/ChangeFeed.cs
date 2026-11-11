using System.Globalization;
using System.Text.Json.Nodes;
namespace TaskPilot_Windows;

public sealed record ChangeBatch(int NewItems, int AttentionItems);

public sealed class ChangeFeed
{
    private long cursor;
    public string Cursor => cursor.ToString(CultureInfo.InvariantCulture);
    private static long Id(string value) => long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var id) && id >= 0 && id <= 9007199254740991L ? id : throw new InvalidOperationException("INVALID_CHANGE_FEED");
    public void Seed(string head) => cursor = Id(head);
    public ChangeBatch Consume(JsonNode response)
    {
        var rows = response["items"]?.AsArray() ?? throw new InvalidOperationException("INVALID_CHANGE_FEED");
        var next = Id(response["cursor"]?.ToString() ?? "");
        var prior = -1L;
        var added = 0;
        var attention = 0;
        foreach (var row in rows)
        {
            var value = Id(row?["id"]?.ToString() ?? "");
            if (value <= prior)
                throw new InvalidOperationException("INVALID_CHANGE_FEED");
            prior = value;
            if (value <= cursor)
                continue;
            added++;
            if (NeedsAttention(row?["type"]?.ToString()))
                attention++;
        }
        if ((rows.Count > 0 && next != prior) || (rows.Count == 0 && next != cursor))
            throw new InvalidOperationException("INVALID_CHANGE_FEED");
        cursor = Math.Max(cursor, next);
        return new(added, attention);
    }
    public static bool NeedsAttention(string? type) => type is "MESSAGE_PROCESSED" or "MESSAGE_MISSING_FIELDS" or "CREDENTIAL_REVIEW_REQUIRED" or "ACCOUNT_SAVED" or "CREDENTIAL_ERROR_VERIFIED" or "ACCOUNT_CREDENTIALS_UNVERIFIED" or "REPLY_DELIVERY_UNKNOWN";
    // OS notification text accepts a count only, never an event body or account identifier.
    public static string SafeSummary(int count) => count is > 0 and <= 500 ? $"لديك {count} تحديثات جديدة في مساحة العمل. افتح TaskPilot للمراجعة." : throw new ArgumentOutOfRangeException(nameof(count));
}
