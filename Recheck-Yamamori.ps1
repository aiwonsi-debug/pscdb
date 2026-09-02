$ErrorActionPreference = "Stop"
$AgyBaseDir  = "E:\agy"
$ConfigFile  = "$AgyBaseDir\gmail_config.json"
$BaseWorkDir = "E:\รวมงาน\งาน 25-26"

$cfg          = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
$EmailAddress = $cfg.EmailAddress
$AppPassword  = $cfg.AppPassword.Replace(" ","").Trim()

Write-Host "== RECHECK Gmail: Siam Yamamori ONLY (20-Jul-2026 to 31-Aug-2026) ==" -ForegroundColor Cyan

$src = @'
using System;
using System.IO;
using System.Net.Sockets;
using System.Net.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;

public class RecheckImapY : IDisposable {
    private TcpClient tcp;
    private SslStream ssl;
    private int tag = 0;

    public bool Connect(string host, int port) {
        tcp = new TcpClient(); tcp.ReceiveTimeout=30000; tcp.SendTimeout=30000;
        tcp.Connect(host,port);
        ssl = new SslStream(tcp.GetStream(),false);
        ssl.ReadTimeout=30000; ssl.WriteTimeout=30000;
        ssl.AuthenticateAsClient(host);
        return ReadLine().StartsWith("* OK");
    }

    private string ReadLine() {
        var buf = new List<byte>(); int b;
        while((b=ssl.ReadByte())!=-1){ if(b=='\n')break; if(b!='\r')buf.Add((byte)b); }
        return Encoding.UTF8.GetString(buf.ToArray());
    }

    public string Exec(string cmd) {
        tag++; var t="Y"+tag.ToString("D4");
        var bytes=Encoding.ASCII.GetBytes(t+" "+cmd+"\r\n");
        ssl.Write(bytes); ssl.Flush();
        var sb=new StringBuilder(); string line;
        while((line=ReadLine())!=null){
            sb.AppendLine(line);
            if(line.StartsWith(t+" OK")||line.StartsWith(t+" NO")||line.StartsWith(t+" BAD"))break;
        }
        return sb.ToString();
    }

    public bool Login(string u,string p){ return Exec("LOGIN \""+u+"\" \""+p+"\"").Contains("OK"); }
    public bool Select(string f){ return Exec("SELECT \""+f+"\"").Contains("OK"); }

    public List<int> Search(string q) {
        var r=Exec("SEARCH "+q); var ids=new List<int>();
        foreach(var line in r.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries)){
            if(!line.StartsWith("* SEARCH"))continue;
            foreach(var p in line.Substring(8).Trim().Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries)){
                int id; if(int.TryParse(p,out id))ids.Add(id);
            }
        }
        return ids;
    }

    public string FetchHeader(int id) {
        tag++; var t="Y"+tag.ToString("D4");
        var bytes=Encoding.ASCII.GetBytes(t+" FETCH "+id+" (BODY[HEADER.FIELDS (FROM SUBJECT DATE)])\r\n");
        ssl.Write(bytes); ssl.Flush();
        var sb=new StringBuilder(); string line;
        while((line=ReadLine())!=null){
            sb.AppendLine(line);
            if(line.StartsWith(t+" OK")||line.StartsWith(t+" NO")||line.StartsWith(t+" BAD"))break;
        }
        return sb.ToString();
    }

    public byte[] FetchBody(int id) {
        tag++; var t="Y"+tag.ToString("D4");
        var bytes=Encoding.ASCII.GetBytes(t+" FETCH "+id+" BODY.PEEK[]\r\n");
        ssl.Write(bytes); ssl.Flush();
        var line=ReadLine();
        if(line==null||!line.Contains("BODY[]"))return new byte[0];
        var m=Regex.Match(line,@"\{(\d+)\}");
        if(!m.Success)return new byte[0];
        int sz=int.Parse(m.Groups[1].Value);
        var buf=new byte[sz]; int tot=0;
        while(tot<sz){ int r=ssl.Read(buf,tot,sz-tot); if(r<=0)break; tot+=r; }
        while((line=ReadLine())!=null)
            if(line.StartsWith(t+" OK")||line.StartsWith(t+" NO")||line.StartsWith(t+" BAD"))break;
        return buf;
    }

    public void Dispose(){
        if(ssl!=null){try{Exec("LOGOUT");}catch{}ssl.Dispose();}
        if(tcp!=null)tcp.Close();
    }
}
'@

if (-not ([System.Management.Automation.PSTypeName]'RecheckImapY').Type) {
    Add-Type -TypeDefinition $src
}

$imap    = New-Object RecheckImapY
$results = @()

try {
    if (-not $imap.Connect("imap.gmail.com", 993)) { throw "IMAP connect failed" }
    if (-not $imap.Login($EmailAddress, $AppPassword)) { throw "Login failed" }
    Write-Host "[OK] Connected as $EmailAddress" -ForegroundColor Green

    $imap.Select("INBOX") | Out-Null

    # Search Yamamori emails by sender/subject keyword in date range
    Write-Host "[*] Searching Yamamori emails: SINCE 20-Jul-2026 BEFORE 01-Sep-2026 ..." -ForegroundColor Yellow
    $ids = $imap.Search("SINCE 20-Jul-2026 BEFORE 01-Sep-2026")
    Write-Host "[*] Total in range: $($ids.Count) emails - filtering Yamamori..." -ForegroundColor Yellow

    $mnames = "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
    $yamaCount = 0

    foreach ($id in $ids) {
        $hdr = $imap.FetchHeader($id)

        $sm = [regex]::Match($hdr,'Subject:\s*([^\r\n]+)',[System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        $fm = [regex]::Match($hdr,'From:\s*([^\r\n]+)',   [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        $dm = [regex]::Match($hdr,'Date:\s*([^\r\n]+)',   [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

        $subj = if ($sm.Success) { $sm.Groups[1].Value.Trim() } else { "(no subject)" }
        $from = if ($fm.Success) { $fm.Groups[1].Value.Trim() } else { "" }
        $ds   = if ($dm.Success) { $dm.Groups[1].Value.Trim() } else { "" }

        # Filter: Yamamori only
        $isYama = ($from -match '(?i)yamamori|siamyamamori|siam.yamamori') -or `
                  ($subj -match '(?i)yamamori')
        if (-not $isYama) { continue }

        $yamaCount++
        $dt   = [DateTime]::Now
        if ($ds) { try { $dt = [DateTime]::Parse($ds) } catch {} }
        $mon  = $mnames[$dt.Month-1]
        $yr   = $dt.Year.ToString()
        $dlbl = $dt.ToString("dd/MM/yyyy")

        Write-Host "  [EMAIL #$yamaCount] $dlbl | $subj" -ForegroundColor DarkCyan
        Write-Host "           From: $from" -ForegroundColor DarkGray

        $raw = $imap.FetchBody($id)
        if ($raw.Length -eq 0) {
            $results += [PSCustomObject]@{Date=$dlbl;Subj=$subj;From=$from;File="(no attach)";Status="MAIL_ONLY";Path=""}
            continue
        }

        $txt = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($raw)
        $bm  = [regex]::Match($txt,'boundary="?([^"\r\n;]+)"?',[System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

        if (-not $bm.Success) {
            $results += [PSCustomObject]@{Date=$dlbl;Subj=$subj;From=$from;File="(no attach)";Status="MAIL_ONLY";Path=""}
            continue
        }

        $bnd   = $bm.Groups[1].Value.Trim()
        $parts = $txt -split [regex]::Escape("--$bnd")
        $hasA  = $false

        foreach ($pt in $parts) {
            $fn = [regex]::Match($pt,'filename="?([^"\r\n;]+)"?',[System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            if (-not $fn.Success) { continue }
            $fname = $fn.Groups[1].Value.Trim('"').Trim()
            if ($fname -notmatch '\.(pdf|xlsx|xls|csv|zip)$') { continue }

            $hasA = $true
            $dest = "$BaseWorkDir\Siam Yamamori\PO\$mon"

            $ci  = $pt.IndexOf("`r`n`r`n")
            if ($ci -lt 0) { continue }
            $b64 = ($pt.Substring($ci+4).Trim()) -replace '\s+',''

            try {
                $fb = [System.Convert]::FromBase64String($b64)
                if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
                $dp   = Join-Path $dest $fname
                $stat = "SAVED_NEW"
                if (Test-Path $dp) {
                    $esz = (Get-Item $dp).Length
                    if ($esz -eq $fb.Length) {
                        $stat = "SAME"
                    } else {
                        [System.IO.File]::WriteAllBytes($dp, $fb)
                        $stat = "UPDATED"
                    }
                } else {
                    [System.IO.File]::WriteAllBytes($dp, $fb)
                }

                $results += [PSCustomObject]@{Date=$dlbl;Subj=$subj;From=$from;File=$fname;Status=$stat;Path=$dp}

                $col = if ($stat -eq "SAVED_NEW") {"Green"} elseif ($stat -eq "UPDATED") {"Yellow"} else {"DarkGray"}
                Write-Host "    [$stat] $fname" -ForegroundColor $col
            } catch {
                Write-Host "    [ERR] $fname : $_" -ForegroundColor Red
            }
        }

        if (-not $hasA) {
            $results += [PSCustomObject]@{Date=$dlbl;Subj=$subj;From=$from;File="(no attach)";Status="MAIL_ONLY";Path=""}
        }
    }

} finally {
    $imap.Dispose()
}

# ===== SUMMARY =====
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " YAMAMORI RECHECK SUMMARY  (20-Jul to 31-Aug 2026)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if ($results.Count -eq 0) {
    Write-Host "  (No Yamamori emails found in this period)" -ForegroundColor Yellow
} else {
    foreach ($r in ($results | Sort-Object Date)) {
        $ico = switch ($r.Status) {
            "SAVED_NEW"  { "NEW " }
            "SAME"       { "OK  " }
            "UPDATED"    { "UPD " }
            "MAIL_ONLY"  { "MAIL" }
            default      { "??? " }
        }
        Write-Host "  $ico  $($r.Date)  $($r.File)  [$($r.Status)]"
        if ($r.Path) { Write-Host "         -> $($r.Path)" -ForegroundColor DarkGray }
        Write-Host "         Subject: $($r.Subj)" -ForegroundColor DarkGray
    }
}

$cnew  = ($results | Where-Object {$_.Status -eq "SAVED_NEW"}).Count
$cupd  = ($results | Where-Object {$_.Status -eq "UPDATED"}).Count
$csame = ($results | Where-Object {$_.Status -eq "SAME"}).Count
$cmail = ($results | Where-Object {$_.Status -eq "MAIL_ONLY"}).Count

Write-Host ""
Write-Host "Totals:" -ForegroundColor Cyan
Write-Host "  New files  : $cnew"
Write-Host "  Updated    : $cupd"
Write-Host "  Unchanged  : $csame"
Write-Host "  Email only : $cmail"
Write-Host "Done." -ForegroundColor Green
