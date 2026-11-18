using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private static readonly Regex BatchReplyCommand = new(
        @"^\s*(?:[اأإ]رسل|ارسلي)\s+قالب\s+(?<template>.+?)\s+(?:على|لـ?|إلى)\s+(?:(?:كل|جميع)\s+(?:الحسابات\s+)?(?:في\s+)?|الحسابات\s+(?:في\s+)?)?(?:مجموعة\s+)?(?<group>.+?)\s*[؟?.]?\s*$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static string ReplyLabel(string label) => new(label.Normalize()
        .Trim().ToLowerInvariant().Where(c => char.IsLetterOrDigit(c)).ToArray());

    private async Task ReplyBatch(string groupHint = "", string templateHint = "", bool completedOnly = false)
    {
        var groupsRead = api.Send("GET", "/v1/groups");
        var sessionsRead = api.Send("GET", "/v1/sessions");
        var templatesRead = api.Send("GET", "/v1/reply-templates?enabled=true&limit=500");
        await Task.WhenAll(groupsRead, templatesRead, sessionsRead);
        var labels = (await sessionsRead).AsArray().ToDictionary(s => V(s, "id"), s => V(s, "label"));
        var groups = (await groupsRead).AsArray().Where(g => g?["enabled"]?.GetValue<bool>() == true).ToArray();
        var templates = (await templatesRead).AsArray();
        var exactGroups = groups.Where(g => ReplyLabel(V(g, "title")) == ReplyLabel(groupHint)).Take(2).ToArray();
        var selectedGroup = exactGroups.Length == 1 ? V(exactGroups[0], "id") : "";
        if ((groupHint == "" || ReplyLabel(groupHint) is "اليفيها" or "الليفيها") &&
            groups.Any(g => V(g, "id") == assistantGroup)) selectedGroup = assistantGroup!;
        if (selectedGroup == "" && groupHint != "")
        {
            var containing = groups.Where(g => ReplyLabel(V(g, "title")).Contains(ReplyLabel(groupHint))).Take(2).ToArray();
            if (containing.Length == 1 && ReplyLabel(groupHint).Length > 0) selectedGroup = V(containing[0], "id");
        }
        var group = Choice("المجموعة", [("", "اختر المجموعة"), ..groups.Select(g => (V(g, "id"), V(g, "title") + " • " + labels.GetValueOrDefault(V(g, "session_id"), "جلسة واتساب")))], selectedGroup);
        var template = Choice("القالب", [("", "اختر القالب")]);
        var completed = new CheckBox { Content = "المهام المكتملة فقط", IsChecked = completedOnly };
        void FillTemplates()
        {
            template.Items.Clear();
            template.Items.Add(new ComboBoxItem { Content = "اختر القالب", Tag = "" });
            template.SelectedIndex = 0;
            var candidates = templates.Where(t => Selected(group) != "" && (V(t, "group_id") == "" || V(t, "group_id") == Selected(group))).ToArray();
            var precise = candidates.Where(t => ReplyLabel(V(t, "code")) == ReplyLabel(templateHint)).Take(2).ToArray();
            foreach (var t in candidates)
            {
                var item = new ComboBoxItem { Content = V(t, "code"), Tag = V(t, "id") };
                template.Items.Add(item);
                if (precise.Length == 1 && V(t, "id") == V(precise[0], "id")) template.SelectedItem = item;
            }
            template.IsEnabled = template.Items.Count > 1;
        }
        group.SelectionChanged += (_, _) => FillTemplates();
        FillTemplates();
        var requestHint = groupHint == "" ? "" : $"طلبت المجموعة «{groupHint}» والقالب «{templateHint}».";
        var input = Stack(group, template, completed);
        if (requestHint != "") input.Children.Insert(0, Text(requestHint));
        if (!await Dialog("تجهيز ردود المجموعة", input, "عرض المعاينة",
            () => Selected(group) == "" || Selected(template) == "" ? "اختر المجموعة والقالب." : null))
            return;

        var preview = await api.Send("POST", "/v1/reply-batches/preview",
            new { groupId = Selected(group), templateId = Selected(template), completedOnly = completed.IsChecked == true });
        var targets = preview["targets"]!.AsArray();
        var details = Stack(Text(V(preview, "groupTitle"), 19),
            Text($"الجلسة {V(preview, "sessionLabel")} • القالب {V(preview, "template")}"),
            Text($"الحسابات {V(preview, "accountCount")} • ستُدرج {targets.Count} • لها طلب رد سابق {V(preview, "alreadyReplied")} • بلا مصدر أو قالب مطابق {V(preview, "unavailable")}"));
        var rows = new StackPanel { Spacing = 9 };
        foreach (var row in targets)
            rows.Children.Add(Text($"{V(row, "displayName")} • {LocalAssistantTime(V(row, "receivedAt"))}\n{V(row, "body")}"));
        if (targets.Count > 0)
            details.Children.Add(new ScrollViewer { MaxHeight = 195, Content = rows });
        var live = V(preview, "provider") != "mock";
        if (targets.Count == 0 || live && !liveSendingEnabled)
        {
            await new ContentDialog { XamlRoot = XamlRoot, FlowDirection = FlowDirection.RightToLeft, Title = "معاينة ردود المجموعة",
                Content = details, CloseButtonText = "إغلاق" }.ShowAsync();
            return;
        }
        var reauth = ReauthField();
        var phrase = $"إرسال {targets.Count}";
        var confirmation = Field($"اكتب «{phrase}» لتأكيد العدد");
        details.Children.Add(confirmation);
        details.Children.Add(reauth);
        var batchId = V(preview, "batchId");
        try
        {
            if (!await Dialog(live ? "إقرار إرسال ردود واتساب" : "إقرار دفعة محاكاة", details, "اعتماد الدفعة",
                () => confirmation.Text.Trim() != phrase ? "اكتب عبارة التأكيد كما تظهر." : null))
                return;
            try
            {
                await api.Send("POST", "/v1/reply-batches/approve", new { approvalToken = V(preview, "approvalToken") }, await Reauth(reauth.Password));
            }
            catch (Exception e) when (e is not ApiFailure || ((ApiFailure)e).StatusCode >= 500 || ((ApiFailure)e).StatusCode == 408)
            {
                // A lost acknowledgement may still mean that the transaction committed.
                await ShowReplyBatch(batchId);
                return;
            }
            await ShowReplyBatch(batchId);
        }
        finally { reauth.Password = ""; }
    }

    private async Task ShowReplyBatch(string id)
    {
        try
        {
            var receipt = await api.Send("GET", "/v1/reply-batches/" + id);
            var parts = receipt["counts"]!.AsArray();
            var counts = parts.Select(r => StateLabel(V(r, "status")) + " " + V(r, "count"));
            var summary = string.Join(" • ", counts);
            if (!parts.Any(r => V(r, "status") == "APPROVED"))
            {
                await AssistantNotice("نتيجة دفعة الردود", summary);
                return;
            }
            var reauth = ReauthField();
            try
            {
                if (!await Dialog("نتيجة دفعة الردود", Stack(Text(summary),
                    Text("يمكن إلغاء الردود التي ما زالت في الانتظار من هذه الدفعة."), reauth), "إلغاء الردود المنتظرة"))
                    return;
                var result = await api.Send("POST", $"/v1/reply-batches/{id}/cancel", new { }, await Reauth(reauth.Password));
                await AssistantNotice("الردود المنتظرة", $"عدد الردود الملغاة {V(result, "canceled")}.");
            }
            finally { reauth.Password = ""; }
        }
        catch (ApiFailure e) when (e.StatusCode == 404)
        {
            await AssistantNotice("تعذّر العثور على الدفعة", "حدّث قائمة الردود وتحقق من الحالات قبل إعادة طلب الإرسال.");
        }
    }
}
