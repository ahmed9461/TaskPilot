using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;

namespace TaskPilot_Windows;

public sealed class MetricGridPanel : Panel
{
    private const double Gap = 18;
    public static int Columns(double width) => width >= 740 ? 3 : width >= 470 ? 2 : 1;
    protected override Size MeasureOverride(Size availableSize)
    {
        var width = double.IsFinite(availableSize.Width) ? availableSize.Width : 900;
        var columns = Columns(width);
        var cellWidth = Math.Max(0, (width - Gap * (columns - 1)) / columns);
        foreach (var child in Children) child.Measure(new Size(cellWidth, 220));
        var rows = (int)Math.Ceiling(Children.Count / (double)columns);
        return new Size(width, rows == 0 ? 0 : rows * 220 + (rows - 1) * Gap);
    }
    protected override Size ArrangeOverride(Size size)
    {
        var columns = Columns(size.Width); var width = Math.Max(0, (size.Width - Gap * (columns - 1)) / columns);
        for (var i = 0; i < Children.Count; i++) Children[i].Arrange(new Rect((i % columns) * (width + Gap), (i / columns) * (220 + Gap), width, 220));
        return size;
    }
}
