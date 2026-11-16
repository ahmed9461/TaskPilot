using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml;
using Windows.Foundation;

namespace TaskPilot_Windows;

public sealed class MetricGridPanel : Panel
{
    private const double Gap = 18;
    private double tileHeight = 220;
    private XamlRoot? root;
    public MetricGridPanel()
    {
        Loaded += (_, _) => { root = XamlRoot; if (root is not null) root.Changed += RootChanged; InvalidateMeasure(); };
        Unloaded += (_, _) => { if (root is not null) root.Changed -= RootChanged; root = null; };
    }
    private void RootChanged(XamlRoot sender, XamlRootChangedEventArgs args) => InvalidateMeasure();
    public static int Columns(double width) => width >= 740 ? 3 : width >= 470 ? 2 : 1;
    protected override Size MeasureOverride(Size availableSize)
    {
        var width = double.IsFinite(availableSize.Width) ? availableSize.Width : 900;
        var columns = Columns(width);
        tileHeight = columns == 3 && (XamlRoot?.Size.Height ?? 900) < 800 ? 176 : 220;
        var cellWidth = Math.Max(0, (width - Gap * (columns - 1)) / columns);
        foreach (var child in Children) child.Measure(new Size(cellWidth, tileHeight));
        var rows = (int)Math.Ceiling(Children.Count / (double)columns);
        return new Size(width, rows == 0 ? 0 : rows * tileHeight + (rows - 1) * Gap);
    }
    protected override Size ArrangeOverride(Size size)
    {
        var columns = Columns(size.Width); var width = Math.Max(0, (size.Width - Gap * (columns - 1)) / columns);
        for (var i = 0; i < Children.Count; i++) Children[i].Arrange(new Rect((i % columns) * (width + Gap), (i / columns) * (tileHeight + Gap), width, tileHeight));
        return size;
    }
}
