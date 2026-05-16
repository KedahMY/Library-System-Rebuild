# ai-rebuild/test-pack/smoke/lib.ps1
# Shared PowerShell helpers for smoke scripts

$script:API = if ($env:API) { $env:API } else { "http://localhost:8000" }
$script:PASS = 0
$script:FAIL = 0

function note { param($msg) Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

function ok { param($msg) $script:PASS++; Write-Host "  [OK ] $msg" -ForegroundColor Green }

function fail { param($msg) $script:FAIL++; Write-Host "  [FAIL] $msg" -ForegroundColor Red }

function Get-Token {
  param($username, $password)
  $body = @{username=$username; password=$password} | ConvertTo-Json
  try {
    $resp = Invoke-RestMethod -Uri "$script:API/api/auth/login" -Method Post -Body $body -ContentType "application/json"
    return $resp.token
  } catch {
    return $null
  }
}

function Get-TokenSilent {
  param($username, $password)
  $body = @{username=$username; password=$password} | ConvertTo-Json
  $resp = Invoke-RestMethod -Uri "$script:API/api/auth/login" -Method Post -Body $body -ContentType "application/json"
  return $resp.token
}

function Call-Api {
  param($Method, $Path, $Body, $Token, $ContentType = "application/json")
  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  try {
    if ($Body) {
      $resp = Invoke-WebRequest -Uri "$script:API$Path" -Method $Method -Headers $headers -Body $Body -ContentType $ContentType -UseBasicParsing
    } else {
      $resp = Invoke-WebRequest -Uri "$script:API$Path" -Method $Method -Headers $headers -UseBasicParsing
    }
    return @{ StatusCode = [int]$resp.StatusCode; Content = $resp.Content }
  } catch [System.Net.WebException] {
    $errResp = $_.Exception.Response
    if ($errResp) {
      $statusCode = [int]$errResp.StatusCode
      $reader = New-Object System.IO.StreamReader($errResp.GetResponseStream())
      $content = $reader.ReadToEnd()
      $reader.Close()
      return @{ StatusCode = $statusCode; Content = $content }
    }
    return @{ StatusCode = 0; Content = $_.Exception.Message }
  } catch {
    return @{ StatusCode = 0; Content = $_.Exception.Message }
  }
}

function summary {
  Write-Host "`n--- PASSED: $script:PASS  FAILED: $script:FAIL ---" -ForegroundColor White
  if ($script:FAIL -gt 0) {
    Write-Host "FAILED: $script:FAIL" -ForegroundColor Red
    exit 1
  }
  Write-Host "ALL GREEN" -ForegroundColor Green
}
