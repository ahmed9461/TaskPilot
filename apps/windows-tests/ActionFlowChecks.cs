using TaskPilot_Windows;

static class ActionFlowChecks
{
    static void Check(bool value) { if (!value) throw new Exception("ACTION_FLOW_ASSERTION"); }
    public static void Run()
    {
        var varied = new[] { new FlowSize(100, 30), new FlowSize(120, 50), new FlowSize(90, 20) };
        var wide = ActionFlowLayout.Measure(400, varied);
        var narrow = ActionFlowLayout.Measure(220, varied);
        Check(wide.Height == 50 && wide.Width == 326 && wide.Boxes.All(x => x.Y == 0));
        Check(narrow.Boxes[0].Y == 0 && narrow.Boxes[1].Y == 38 && narrow.Boxes[2].Y == 38 && narrow.Height == 88);
        var huge = ActionFlowLayout.Measure(80, [new(1000, 32), new(40, 24)]);
        Check(huge.Boxes[0].Width == 80 && huge.Boxes[1].Y == 40 && huge.Height == 64);
        Check(ActionFlowLayout.Measure(0, []).Height == 0 && ActionFlowLayout.Measure(500, [new(0, 0)]).Width == 0);
        Check(ActionFlowLayout.Measure(double.PositiveInfinity, varied).Height == 50);
        // Sweep realistic logical widths/font-size multipliers; no overlap or horizontal overflow.
        foreach (var width in new[] { 160d, 240, 320, 480, 640, 1000, 1600 })
        foreach (var scale in new[] { 1d, 1.25, 1.5, 2 })
        {
            var items = new[] { 90d, 170, 120, 240, 72, 135 }.Select((w, i) => new FlowSize(w * scale, (30 + i % 2 * 8) * scale)).ToArray();
            var layout = ActionFlowLayout.Measure(width, items);
            Check(layout.Width <= width && layout.Boxes.Count == items.Length);
            for (var i = 0; i < layout.Boxes.Count; i++)
            {
                var a = layout.Boxes[i];
                Check(a.X >= 0 && a.Y >= 0 && a.X + a.Width <= width && a.Y + a.Height <= layout.Height);
                for (var j = 0; j < i; j++)
                {
                    var b = layout.Boxes[j];
                    Check(a.X >= b.X + b.Width || b.X >= a.X + a.Width || a.Y >= b.Y + b.Height || b.Y >= a.Y + a.Height);
                }
            }
        }
        Console.WriteLine("PASS: 3 action-flow check groups (mixed heights, oversized/empty edges, 28 width/font-scale scenarios without overlap); geometry only, no native scaling claim.");
    }
}
