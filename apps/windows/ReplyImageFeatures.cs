using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using System.Security.Cryptography;
using Windows.Storage.Streams;

namespace TaskPilot_Windows;

public sealed partial class MainPage
{
    private sealed record ReplyAttachment(string Name, string Mime, byte[] Bytes)
    {
        public object Manifest => new { mime = Mime, size = Bytes.Length, sha256 = Convert.ToHexStringLower(SHA256.HashData(Bytes)) };
    }

    private static async Task<ReplyAttachment[]?> PickReplyImages()
    {
        const int perImage = 4 * 1024 * 1024;
        const int totalLimit = 8 * 1024 * 1024;
        var picker = new Microsoft.Windows.Storage.Pickers.FileOpenPicker(App.CurrentWindow!.AppWindow.Id);
        picker.FileTypeFilter.Add(".jpg");
        picker.FileTypeFilter.Add(".jpeg");
        picker.FileTypeFilter.Add(".png");
        var files = await picker.PickMultipleFilesAsync();
        if (files is null || files.Count == 0) return null;
        if (files.Count > 4) throw new InvalidOperationException("REPLY_IMAGE_LIMIT");
        var images = new List<ReplyAttachment>();
        var total = 0;
        foreach (var file in files)
        {
            await using var stream = System.IO.File.OpenRead(file.Path);
            if (stream.Length <= 0 || stream.Length > perImage || total + stream.Length > totalLimit)
                throw new InvalidOperationException("REPLY_IMAGE_LIMIT");
            var bytes = new byte[(int)stream.Length];
            await stream.ReadExactlyAsync(bytes);
            var mime = System.IO.Path.GetExtension(file.Path).Equals(".png", StringComparison.OrdinalIgnoreCase)
                ? "image/png" : "image/jpeg";
            total += bytes.Length;
            images.Add(new ReplyAttachment(System.IO.Path.GetFileName(file.Path), mime, bytes));
        }
        return images.ToArray();
    }

    private static async Task<UIElement> ReplyImagePreview(ReplyAttachment[] attachments)
    {
        var content = new StackPanel { Spacing = 8 };
        content.Children.Add(Text(attachments.Length == 1
            ? "يظهر نص القالب وصفًا للصورة."
            : $"{attachments.Length} صور في ألبوم واحد • يظهر نص القالب وصفًا للصورة الأولى."));
        foreach (var attachment in attachments)
        {
            using var buffer = new InMemoryRandomAccessStream();
            using var writer = new DataWriter(buffer);
            writer.WriteBytes(attachment.Bytes);
            await writer.StoreAsync();
            writer.DetachStream();
            buffer.Seek(0);
            var bitmap = new BitmapImage { DecodePixelWidth = 260 };
            await bitmap.SetSourceAsync(buffer);
            content.Children.Add(new Image
            {
                Source = bitmap, MaxHeight = 120, Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Right,
            });
            content.Children.Add(Text(attachment.Name, 12));
        }
        return new ScrollViewer { Content = content, MaxHeight = 215, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    }
}
