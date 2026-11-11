using System.Text.Json.Nodes;
using TaskPilot_Windows;
static class ChangeFeedChecks
{
    static void Check(bool value)
    {
        if (!value)
            throw new Exception("Change feed contract failed");
    }
    static void Reject(Action action)
    {
        try
        {
            action();
        }
        catch (InvalidOperationException) { return; }
        throw new Exception("Invalid feed accepted");
    }
    static JsonNode Batch(int start, int count, string type = "ACCOUNT_SAVED") => new JsonObject
    {
        ["cursor"] = (start + count - 1).ToString(),
        ["items"] = new JsonArray(Enumerable.Range(start, count).Select(i => (JsonNode)new JsonObject { ["id"] = i.ToString(), ["type"] = type, ["untrustedBody"] = "synthetic-secret-name-password" }).ToArray())
    };
    public static void Run()
    {
        var feed = new ChangeFeed();
        feed.Seed("100");
        Check(feed.Consume(Batch(1, 5)).NewItems == 0 && feed.Cursor == "100");
        var newBatch = Batch(101, 2);
        Check(feed.Consume(newBatch) == new ChangeBatch(2, 2) && feed.Cursor == "102");
        Check(feed.Consume(newBatch) == new ChangeBatch(0, 0));
        var leap = Batch(103, 1);
        leap["cursor"] = "999";
        Reject(() => feed.Consume(leap));
        Check(feed.Cursor == "102");
        var disorder = Batch(103, 2);
        disorder["items"]![1]!["id"] = "103";
        Reject(() => feed.Consume(disorder));
        Check(feed.Cursor == "102");
        foreach (var head in new[] { "-1", "+1", "9007199254740992", "garbage" })
            Reject(() => feed.Seed(head));
        Check(feed.Cursor == "102" && !ChangeFeed.NeedsAttention("synthetic-secret-name-password"));
        var many = new ChangeFeed();
        many.Seed("0");
        Check(many.Consume(Batch(1, 500)).AttentionItems == 500);
        Check(many.Consume(Batch(501, 30)).AttentionItems == 30);
        Check(many.Cursor == "530");
        Check(many.Consume(new JsonObject { ["items"] = new JsonArray(), ["cursor"] = "530" }).NewItems == 0);
        Check(!ChangeFeed.SafeSummary(2).Contains("synthetic-secret") && ChangeFeed.SafeSummary(2).Contains("2"));
        Console.WriteLine("PASS: 7 change-feed checks (baseline, fresh batches, replay, cursor leaps, ordering, validation, backlog/privacy); no OS or network used.");
    }
}
