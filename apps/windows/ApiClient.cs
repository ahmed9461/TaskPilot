using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
namespace TaskPilot_Windows;

public sealed class ApiClient : IDisposable
{
    private readonly HttpClient http;
    public ApiClient(HttpMessageHandler? handler = null)
    {
        http = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(25) };
    }
    public string Address { get; private set; } = "http://127.0.0.1:18240";
    public bool Connected
    {
        get; private set;
    }
    public void Configure(string address, string token)
    {
        var uri = new Uri(address);
        if (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback))
            throw new InvalidOperationException("SECURE_CONNECTION_REQUIRED");
        if (uri.UserInfo != "" || uri.AbsolutePath != "/" || uri.Query != "" || uri.Fragment != "")
            throw new InvalidOperationException("INVALID_SERVER_ADDRESS");
        if (token.Length < 32)
            throw new InvalidOperationException("INVALID_API_TOKEN");
        Address = address.TrimEnd('/');
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        Connected = true;
    }
    public async Task<JsonNode> Send(string method, string path, object? payload = null, string? reauth = null)
    {
        if (!Connected)
            throw new InvalidOperationException("CONNECTION_REQUIRED");
        using var req = new HttpRequestMessage(new HttpMethod(method), Address + path);
        if (payload is not null)
            req.Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        if (reauth is not null)
            req.Headers.Add("X-Reauth-Secret", reauth);
        using var response = await http.SendAsync(req);
        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync()) ?? new JsonObject();
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(json["code"]?.ToString() ?? "SERVICE_UNAVAILABLE");
        return json;
    }
    public void Dispose() => http.Dispose();
}
