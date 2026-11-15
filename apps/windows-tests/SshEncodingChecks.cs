using System.Diagnostics;
using System.Reflection;
using TaskPilot_Windows;

static class SshEncodingChecks
{
    public static async Task Run()
    {
        // Exercise the same stdio configuration through a real local child, never SSH/network.
        var info = SshConnection.Info("Synthetic", input: true);
        info.FileName = Environment.ProcessPath ?? throw new Exception("Missing test host");
        info.ArgumentList.Clear();
        if (Path.GetFileNameWithoutExtension(info.FileName).Equals("dotnet", StringComparison.OrdinalIgnoreCase))
            info.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);
        info.ArgumentList.Add("--synthetic-utf8-echo");
        using var process = Process.Start(info) ?? throw new Exception("Child unavailable");
        var output = process.StandardOutput.ReadToEndAsync();
        var errors = process.StandardError.ReadToEndAsync();
        var phrase = "{\"confirmation\":\"تفعيل الردود اليدوية\",\"off\":\"إيقاف الردود\"}";
        await process.StandardInput.WriteAsync(phrase);
        process.StandardInput.Close();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        try { await process.WaitForExitAsync(deadline.Token); }
        catch { if (!process.HasExited) process.Kill(true); throw; }
        if (process.ExitCode != 0 || await output != phrase || await errors != "") throw new Exception("Arabic SSH stdio was corrupted");
        Console.WriteLine("PASS: Arabic UTF-8 SSH stdio roundtrip through actual isolated child; no SSH/network.");
    }
}
