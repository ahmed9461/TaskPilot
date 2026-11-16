using System.Text.RegularExpressions;

namespace TaskPilot_Windows;

public sealed record TailscaleProfile(string Alias, string Address, string Id, string Token, string HostKeyAlias)
{
    public TailscaleProfile Validate()
    {
        if (!Regex.IsMatch(Alias ?? "", "^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,80}$") || !Guid.TryParse(Id, out _) || Token is null || Token.Length is < 32 or > 256 || Token.Any(char.IsControl) || !Regex.IsMatch(HostKeyAlias ?? "", "^[a-zA-Z0-9][a-zA-Z0-9.:-]{0,252}$"))
            throw new InvalidOperationException("INVALID_DEVICE_PROFILE");
        if (!Uri.TryCreate(Address, UriKind.Absolute, out var uri) || uri.Scheme != "https" || !uri.DnsSafeHost.EndsWith(".ts.net", StringComparison.OrdinalIgnoreCase) || uri.Port != 9443 || uri.AbsolutePath != "/" || uri.UserInfo != "" || uri.Query != "" || uri.Fragment != "")
            throw new InvalidOperationException("INVALID_DEVICE_PROFILE");
        return this;
    }
    public override string ToString() => "TaskPilot protected device profile";
}
