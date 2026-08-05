param(
  [Parameter(Mandatory = $true)]
  [string]$IpAddress
)

$ErrorActionPreference = 'Stop'
$certDirectory = Join-Path $PSScriptRoot '..\certs'
$pfxPath = Join-Path $certDirectory 'hello-ethiopia-local.pfx'
$cerPath = Join-Path $certDirectory 'hello-ethiopia-local.cer'
$password = ConvertTo-SecureString -String 'hello-ethiopia-local' -AsPlainText -Force

New-Item -ItemType Directory -Force -Path $certDirectory | Out-Null
$certificate = New-SelfSignedCertificate `
  -Type Custom `
  -Subject "CN=$IpAddress" `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -KeyExportPolicy Exportable `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -TextExtension @("2.5.29.17={text}ipaddress=$IpAddress&dns=localhost")

Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $password | Out-Null
Export-Certificate -Cert $certificate -FilePath $cerPath | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null

Write-Host "HTTPS certificate created for $IpAddress. Start the frontend with the HTTPS_PFX_PATH and HTTPS_PFX_PASSWORD values in .env."
Write-Host "For phones/tablets, import $cerPath into that device's trusted certificate store before using the camera."
