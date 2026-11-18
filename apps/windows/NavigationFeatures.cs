using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace TaskPilot_Windows;
public sealed partial class MainPage
{
    private readonly WorkspaceViewCache<StackPanel> viewCache = new();
    private StackPanel? buildingContent, visibleContent;
    private CancellationTokenSource? pageRead;
    private string? renderedPage;
    private DateTimeOffset currentViewBuiltAt;
    private long identityRevision = -1;
    private DateTimeOffset identityReadAt;
    private long draftRevision;
    private void MarkDraft() { hasDraft = true; draftRevision++; }
    private static string PageTitle(string value) => value switch { "dashboard" => "لوحة التحكم", "accounts" => "الحسابات", "account-details" => "تفاصيل الحساب", "assignments" => "المهام", "inbox" => "صندوق المراجعة", "replies" => "الردود والقوالب", "groups" => "المجموعات", "sessions" => "الجلسات", "notifications" => "الإشعارات", "audit" => "سجل النشاط", "assistant" => "المساعد الشخصي", "ai" => "إعدادات الذكاء الاصطناعي", "operations" => "المراقبة", "privacy" => "الخصوصية والاحتفاظ", _ => "الإعدادات" };
    private StackPanel PageBody => buildingContent ?? visibleContent ?? Body;
    private void UpdateWorkspaceChrome()
    {
        var chat = page == "assistant";
        PageIntro.Visibility = chat && renderedPage == "assistant" ? Visibility.Collapsed : Visibility.Visible;
        Connection.Visibility = chat && Connection.Severity == InfoBarSeverity.Success ? Visibility.Collapsed : Visibility.Visible;
    }
    private void ShowSelectedSection()
    {
        if (renderedPage == page) return;
        Heading.Text = PageTitle(page);
        Body.Children.Clear();
        visibleContent = null;
        renderedPage = null;
        UpdateWorkspaceChrome();
        pendingChanges = false;
        hasDraft = false;
        Body.Children.Add(Text("جارٍ فتح " + PageTitle(page) + "…"));
        ContentScroll.ChangeView(null, 0, null, true);
    }
    private void RememberCurrentView()
    {
        if (visibleContent is null || renderedPage is null || !api.Connected || connectionState.Phase != ConnectionPhase.Connected) return;
        viewCache.Save(renderedPage, new(visibleContent, ContentScroll.VerticalOffset, hasDraft, currentViewBuiltAt, connectionState.Revision, pendingChanges));
    }
    private bool RestoreView()
    {
        if (!api.Connected || connectionState.Phase != ConnectionPhase.Connected || !viewCache.TryGet(page, connectionState.Revision, out var cached)) return false;
        Body.Children.Clear();
        visibleContent = cached!.Content;
        Body.Children.Add(visibleContent);
        renderedPage = page; currentViewBuiltAt = cached.BuiltAt;
        Heading.Text = PageTitle(page);
        UpdateWorkspaceChrome();
        hasDraft = cached.HasDraft; pendingChanges = cached.Dirty;
        Connection.Message = pendingChanges ? "احتُفظ بما تحرره؛ توجد بيانات أحدث. اضغط تحديث بعد الانتهاء." : TransportSummary;
        ContentScroll.UpdateLayout();
        ContentScroll.ChangeView(null, cached.Offset, null, true);
        return true;
    }
    private async Task Render()
    {
        viewCache.Clear();
        identityRevision = -1;
        await RenderCore();
    }
    private async Task ReadWorkspaceIdentity(bool force = false)
    {
        var revision = connectionState.Revision;
        if (!force && identityRevision == revision && DateTimeOffset.UtcNow - identityReadAt < TimeSpan.FromSeconds(30)) return;
        identityRevision = -1;
        var identity = await api.Send("GET", "/v1/me");
        if (shuttingDown || revision != connectionState.Revision) return;
        mockToolsEnabled = identity["mockEnabled"]?.GetValue<bool>() == true;
        liveSendingEnabled = identity["liveSendingEnabled"]?.GetValue<bool>() == true;
        liveConnectionEnabled = identity["liveConnectionEnabled"]?.GetValue<bool>() == true;
        identityRevision = revision; identityReadAt = DateTimeOffset.UtcNow;
    }
    private async Task RenderCore()
    {
        if (shuttingDown) return;
        var target = page;
        ShowSelectedSection();
        var revision = connectionState.Revision;
        var draftAtStart = draftRevision;
        var content = new StackPanel { Spacing = 14 };
        using var read = new CancellationTokenSource();
        pageRead = read;
        buildingContent = content;
        try
        {
            await api.ReadPage(() => BuildPage(target), read.Token);
            if (read.IsCancellationRequested || shuttingDown || revision != connectionState.Revision || target != page)
            {
                if (!shuttingDown && target != page) renderPending = true;
                return;
            }
            if (draftRevision != draftAtStart)
            {
                if (target == renderedPage)
                {
                    pendingChanges = true;
                    Connection.Message = "احتُفظ بما بدأت تحريره أثناء وصول التحديث؛ حدّث بعد الانتهاء.";
                    return;
                }
                RememberCurrentView();
            }
            Body.Children.Clear();
            Body.Children.Add(content);
            visibleContent = content; renderedPage = target;
            Heading.Text = PageTitle(target);
            UpdateWorkspaceChrome();
            currentViewBuiltAt = DateTimeOffset.UtcNow;
            pendingChanges = false; hasDraft = false;
            ContentScroll.ChangeView(null, 0, null, true);
        }
        catch (OperationCanceledException) when (read.IsCancellationRequested) { }
        catch
        {
            if (renderedPage is null && page == target && !shuttingDown)
            {
                Body.Children.Clear();
                Body.Children.Add(Button("إعادة تحميل القسم", Render));
            }
            throw;
        }
        finally { buildingContent = null; pageRead = null; }
    }
}
