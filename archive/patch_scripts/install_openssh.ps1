
Write-Host "Installing OpenSSH Server..." -ForegroundColor Cyan
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0

Write-Host "Starting sshd service..." -ForegroundColor Green
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

Write-Host "Configuring firewall rule..." -ForegroundColor Yellow
New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -ErrorAction SilentlyContinue

Write-Host "=== OpenSSH Server installation complete! ===" -ForegroundColor Green
Start-Sleep -Seconds 3
