using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;
namespace TaskPilot_Windows;

public sealed class ActionFlowPanel : Panel
{
    public double Spacing { get; set; } = 8;
    private FlowResult Layout(double width) => ActionFlowLayout.Measure(width,
        Children.Select(child => new FlowSize(child.DesiredSize.Width, child.DesiredSize.Height)).ToArray(), Spacing);
    protected override Size MeasureOverride(Size availableSize)
    {
        foreach (var child in Children)
            child.Measure(new Size(availableSize.Width, double.PositiveInfinity));
        var result = Layout(availableSize.Width);
        return new Size(result.Width, result.Height);
    }
    protected override Size ArrangeOverride(Size finalSize)
    {
        var layout = Layout(finalSize.Width);
        for (var i = 0; i < Children.Count; i++)
        {
            var box = layout.Boxes[i];
            Children[i].Arrange(new Rect(box.X, box.Y, box.Width, box.Height));
        }
        return finalSize;
    }
}
