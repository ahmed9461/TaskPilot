using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace TaskPilot_Windows;

// Current-user Windows DPAPI. No access token, account data or key is stored as plaintext.
public sealed class ProtectedConnectionStore(string? path = null)
{
    private readonly string path = path ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TaskPilot", "connection.dpapi");
    [StructLayout(LayoutKind.Sequential)] private struct Blob { public int Length; public IntPtr Data; }
    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CryptProtectData(ref Blob input, string? description, ref Blob entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);
    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CryptUnprotectData(ref Blob input, IntPtr description, ref Blob entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr value);
    private static byte[] Transform(byte[] bytes, bool protect)
    {
        var entropyBytes = Encoding.UTF8.GetBytes("TaskPilot.Desktop.Connection.v1");
        var input = new Blob { Length = bytes.Length, Data = Marshal.AllocHGlobal(bytes.Length) };
        var entropy = new Blob { Length = entropyBytes.Length, Data = Marshal.AllocHGlobal(entropyBytes.Length) };
        Blob output = default;
        try
        {
            Marshal.Copy(bytes, 0, input.Data, bytes.Length); Marshal.Copy(entropyBytes, 0, entropy.Data, entropyBytes.Length);
            var ok = protect ? CryptProtectData(ref input, "TaskPilot", ref entropy, IntPtr.Zero, IntPtr.Zero, 1, out output) : CryptUnprotectData(ref input, IntPtr.Zero, ref entropy, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!ok || output.Length is < 1 or > 65536) throw new CryptographicException("DEVICE_PROFILE_UNAVAILABLE");
            var result = new byte[output.Length]; Marshal.Copy(output.Data, result, 0, output.Length); return result;
        }
        finally
        {
            if (output.Data != IntPtr.Zero) { if (!protect && output.Length is > 0 and <= 65536) Marshal.Copy(new byte[output.Length], 0, output.Data, output.Length); LocalFree(output.Data); }
            Marshal.Copy(new byte[bytes.Length], 0, input.Data, bytes.Length); Marshal.FreeHGlobal(input.Data); Marshal.FreeHGlobal(entropy.Data);
        }
    }
    public TailscaleProfile? Load()
    {
        if (!File.Exists(path)) return null;
        byte[]? plain = null;
        try
        {
            if (new FileInfo(path).Length is < 1 or > 65536) throw new CryptographicException();
            plain = Transform(File.ReadAllBytes(path), false);
            return (JsonSerializer.Deserialize<TailscaleProfile>(plain) ?? throw new CryptographicException()).Validate();
        }
        catch { throw new InvalidOperationException("DEVICE_PROFILE_UNAVAILABLE"); }
        finally { if (plain is not null) CryptographicOperations.ZeroMemory(plain); }
    }
    public void Save(TailscaleProfile profile)
    {
        var plain = JsonSerializer.SerializeToUtf8Bytes(profile.Validate());
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            var encrypted = Transform(plain, true);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllBytes(temporary, encrypted); File.Move(temporary, path, true);
        }
        finally { CryptographicOperations.ZeroMemory(plain); if (File.Exists(temporary)) File.Delete(temporary); }
    }
    public void Clear() { if (File.Exists(path)) File.Delete(path); }
}
