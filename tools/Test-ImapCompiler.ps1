# Test pure .NET IMAP Client implementation in PowerShell
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Net.Sockets;
using System.Net.Security;
using System.Text;
using System.Collections.Generic;

public class SimpleImapClient : IDisposable {
    private TcpClient tcp;
    private SslStream ssl;
    private StreamReader reader;
    private StreamWriter writer;
    private int tagCounter = 0;

    public bool Connect(string host, int port = 993) {
        tcp = new TcpClient();
        tcp.Connect(host, port);
        ssl = new SslStream(tcp.GetStream(), false);
        ssl.AuthenticateAsClient(host);
        reader = new StreamReader(ssl, Encoding.UTF8);
        writer = new StreamWriter(ssl, Encoding.ASCII) { AutoFlush = true };
        string greeting = reader.ReadLine();
        return greeting != null && greeting.StartsWith("* OK");
    }

    public string SendCommand(string command) {
        tagCounter++;
        string tag = "A" + tagCounter.ToString("D4");
        writer.WriteLine(tag + " " + command);
        StringBuilder sb = new StringBuilder();
        string line;
        while ((line = reader.ReadLine()) != null) {
            sb.AppendLine(line);
            if (line.StartsWith(tag + " OK") || line.StartsWith(tag + " NO") || line.StartsWith(tag + " BAD")) {
                break;
            }
        }
        return sb.ToString();
    }

    public bool Login(string user, string pass) {
        string resp = SendCommand("LOGIN \"" + user + "\" \"" + pass + "\"");
        return resp.Contains("OK");
    }

    public void Dispose() {
        if (writer != null) {
            try { SendCommand("LOGOUT"); } catch {}
            writer.Dispose();
        }
        if (reader != null) reader.Dispose();
        if (ssl != null) ssl.Dispose();
        if (tcp != null) tcp.Close();
    }
}
"@

Write-Host "SimpleImapClient compiled successfully!" -ForegroundColor Green
