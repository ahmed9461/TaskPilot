using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;
namespace TaskPilot_Windows;

// Opt-in in-process WinUI component checks. No injected input or OS setting changes.
// Actual screen layout, keyboard navigation, popup visibility and click remain separate.
internal static class NativeLayoutChecks
{
    public static object Run(Panel host)
    {
        var cases = 0;
        foreach (var width in new[] { 160d, 240, 480, 1000 })
        foreach (var scale in new[] { 1d, 1.5, 2 })
        {
            var panel = new ActionFlowPanel { Width = width, HorizontalAlignment = HorizontalAlignment.Left, FlowDirection = FlowDirection.RightToLeft };
            foreach (var title in new[] { "عرض التفاصيل", "معاينة العملية وإعادة التحقق قبل الموافقة", "التالي" })
            {
                var button = MainPage.ActionButton(title);
                ((TextBlock)button.Content).FontSize = 14 * scale;
                panel.Children.Add(button);
                if (AutomationProperties.GetName(button) != title || !button.IsTabStop)
                    throw new InvalidOperationException("NATIVE_ACTION_NAME_OR_TAB_STOP_FAILED");
            }
            host.Children.Add(panel);
            try
            {
            panel.Measure(new Size(width, double.PositiveInfinity));
            panel.Arrange(new Rect(0, 0, width, panel.DesiredSize.Height));
            panel.UpdateLayout();
            var bounds = panel.Children.Cast<FrameworkElement>().Select(child =>
                child.TransformToVisual(panel).TransformBounds(new Rect(0, 0, child.ActualWidth, child.ActualHeight))).ToArray();
            for (var i = 0; i < bounds.Length; i++)
            {
                var a = bounds[i];
                if (a.Width <= 0 || a.Height <= 0 || a.X < -0.1 || a.Y < -0.1 || a.Right > width + 0.1 || a.Bottom > panel.ActualHeight + 0.1)
                    throw new InvalidOperationException(FormattableString.Invariant($"NATIVE_ACTION_BOUNDS_FAILED;width={width};scale={scale};item={i};panel={panel.ActualWidth},{panel.ActualHeight};box={a.X},{a.Y},{a.Width},{a.Height}"));
                for (var j = 0; j < i; j++)
                {
                    var b = bounds[j];
                    if (a.X < b.Right - 0.1 && b.X < a.Right - 0.1 && a.Y < b.Bottom - 0.1 && b.Y < a.Bottom - 0.1)
                        throw new InvalidOperationException("NATIVE_ACTION_OVERLAP_FAILED");
                }
            }
            var field = MainPage.Field("حقل وهمي لاختبار العرض");
            field.Width = width;
            field.HorizontalAlignment = HorizontalAlignment.Left;
            field.FontSize = 14 * scale;
            host.Children.Add(field);
            try
            {
            field.Measure(new Size(width, double.PositiveInfinity));
            field.Arrange(new Rect(0, 0, width, field.DesiredSize.Height));
            field.UpdateLayout();
            if (field.ActualWidth <= 0 || field.ActualHeight <= 0 || field.ActualWidth > width + 0.1)
                throw new InvalidOperationException("NATIVE_FIELD_WIDTH_FAILED");
            }
            finally { host.Children.Remove(field); }
            cases++;
            }
            finally { host.Children.Remove(panel); }
        }
        return new
        {
            status = "PASS", cases,
            logicalWidths = new[] { 160, 240, 480, 1000 },
            fontMultipliers = new[] { 1, 1.5, 2 },
            scope = "in-process WinUI measure/arrange/name/tab-stop only; not visible scaling or actual keyboard proof"
        };
    }
}
