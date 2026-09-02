$sourceCode = @"
using System;
using System.IO;
using System.Net.Sockets;
using System.Net.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;

public class Email750Reader : IDisposable {
    private TcpClient tcp;
    private SslStream ssl;
    private int tagCounter = 0;

    public bool Connect(string host = "imap.gmail.com", int port = 993) {
        tcp = new TcpClient();
        tcp.Connect(host, port);
        ssl = new SslStream(tcp.GetStream(), false);
        ssl.AuthenticateAsClient(host);
        string line = ReadLine();
        return line != null && line.StartsWith("* OK");
    }

    private string ReadLine() {
        List<byte> lineBytes = new List<byte>();
        int b;
        while ((b = ssl.ReadByte()) != -1) {
            if (b == '\n') break;
            if (b != '\r') lineBytes.Add((byte)b);
        }
        return Encoding.UTF8.GetString(lineBytes.ToArray());
    }

    public string Exec(string command) {
        tagCounter++;
        string tag = "A" + tagCounter.ToString("D4");
        byte[] cmdBytes = Encoding.ASCII.GetBytes(tag + " " + command + "\r\n");
        ssl.Write(cmdBytes);
        ssl.Flush();

        StringBuilder sb = new StringBuilder();
        string line;
        while ((line = ReadLine()) != null) {
            sb.AppendLine(line);
            if (line.StartsWith(tag + " OK") || line.StartsWith(tag + " NO") || line.StartsWith(tag + " BAD")) {
                break;
            }
        }
        return sb.ToString();
    }

    public bool Login(string user, string pass) {
        string resp = Exec("LOGIN \"" + user + "\" \"" + pass + "\"");
        return resp.Contains("OK");
    }

    public bool SelectFolder(string folder = "INBOX") {
        string resp = Exec("SELECT \"" + folder + "\"");
        return resp.Contains("OK");
    }

    public byte[] FetchFullMessage(int id) {
        tagCounter++;
        string tag = "A" + tagCounter.ToString("D4");
        byte[] cmdBytes = Encoding.ASCII.GetBytes(tag + " FETCH " + id + " BODY.PEEK[]\r\n");
        ssl.Write(cmdBytes);
        ssl.Flush();

        string line = ReadLine();
        if (line == null || !line.Contains("BODY[]")) return new byte[0];

        Match m = Regex.Match(line, @"\{(\d+)\}");
        if (!m.Success) return new byte[0];
        int size = int.Parse(m.Groups[1].Value);

        byte[] buffer = new byte[size];
        int total = 0;
        while (total < size) {
            int read = ssl.Read(buffer, total, size - total);
            if (read <= 0) break;
            total += read;
        }

        while ((line = ReadLine()) != null) {
            if (line.StartsWith(tag + " OK") || line.StartsWith(tag + " NO") || line.StartsWith(tag + " BAD")) break;
        }

        return buffer;
    }

    public void Dispose() {
        if (ssl != null) { try { Exec("LOGOUT"); } catch {} ssl.Dispose(); }
        if (tcp != null) tcp.Close();
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'Email750Reader').Type) {
    Add-Type -TypeDefinition $sourceCode
}

$c = New-Object Email750Reader
$c.Connect()
$c.Login("psccnx@gmail.com", "hmsrutrzviubozwb")
$c.SelectFolder("INBOX")
$raw = $c.FetchFullMessage(750)
Write-Host "Email 750 Raw Length: $($raw.Length) bytes"

$rawText = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($raw)

$fnMatches = [regex]::Matches($rawText, 'filename="?([^"\r\n;]+)"?', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
Write-Host "Found $($fnMatches.Count) attachments:"
foreach ($m in $fnMatches) {
    Write-Host " - Attachment: $($m.Groups[1].Value)" -ForegroundColor Yellow
}
$c.Dispose()
