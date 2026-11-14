namespace TaskPilot_Windows;

public readonly record struct FlowSize(double Width, double Height);
public readonly record struct FlowBox(double X, double Y, double Width, double Height);
public sealed record FlowResult(double Width, double Height, IReadOnlyList<FlowBox> Boxes);

// Logical coordinates; the WinUI panel inherits its parent's RTL transform.
public static class ActionFlowLayout
{
    public static FlowResult Measure(double width, IReadOnlyList<FlowSize> items, double spacing = 8)
    {
        if (double.IsNaN(width) || width < 0 || !double.IsFinite(spacing) || spacing < 0)
            throw new ArgumentOutOfRangeException(nameof(width));
        var boxes = new List<FlowBox>(items.Count);
        double x = 0, y = 0, lineHeight = 0, usedWidth = 0;
        foreach (var item in items)
        {
            if (!double.IsFinite(item.Width) || !double.IsFinite(item.Height) || item.Width < 0 || item.Height < 0)
                throw new ArgumentOutOfRangeException(nameof(items));
            if (item.Width == 0 && item.Height == 0)
            {
                boxes.Add(new(x, y, 0, 0));
                continue;
            }
            var w = Math.Min(width, item.Width);
            if (x > 0 && x + w > width)
            {
                y += lineHeight + spacing;
                x = 0;
                lineHeight = 0;
            }
            boxes.Add(new(x, y, w, item.Height));
            usedWidth = Math.Max(usedWidth, x + w);
            lineHeight = Math.Max(lineHeight, item.Height);
            x += w + spacing;
        }
        return new(usedWidth, y + lineHeight, boxes);
    }
}
