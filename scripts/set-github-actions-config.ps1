[CmdletBinding()]
param(
    [string]$Repo = "agents-adityaupadhyay/ai-interview-portal",
    [string]$EnvFile = ".env.local",
    [Parameter(Mandatory = $true)]
    [string]$DeployHost,
    [Parameter(Mandatory = $true)]
    [string]$DeployUser,
    [string]$DeployPath = "/opt/ai-interview-platform",
    [string]$DeployPort = "22",
    [string]$AppPort = "3000",
    [string]$GhcrUsername,
    [string]$GhcrToken,
    [string]$DeploySshKeyPath,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-EnvFile {
    param([string]$Path)

    $values = @{}
    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $key = $trimmed.Substring(0, $separatorIndex).Trim()
        $value = $trimmed.Substring($separatorIndex + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }

    return $values
}

function ConvertTo-PlainText {
    param([Security.SecureString]$SecureValue)

    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        if ($ptr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        }
    }
}

function Get-RequiredValue {
    param(
        [hashtable]$Source,
        [string]$Name
    )

    if (-not $Source.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Source[$Name])) {
        throw "Missing required value '$Name' in $EnvFile"
    }

    return $Source[$Name]
}

function Set-GitHubSecret {
    param(
        [string]$Name,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        Write-Host "Skipping secret $Name because no value was provided."
        return
    }

    if ($DryRun) {
        Write-Host "[DryRun] Would set secret $Name"
        return
    }

    Write-Host "Setting secret $Name"
    gh secret set $Name --repo $Repo --body $Value | Out-Null
}

function Set-GitHubVariable {
    param(
        [string]$Name,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        Write-Host "Skipping variable $Name because no value was provided."
        return
    }

    if ($DryRun) {
        Write-Host "[DryRun] Would set variable $Name=$Value"
        return
    }

    Write-Host "Setting variable $Name"
    gh variable set $Name --repo $Repo --body $Value | Out-Null
}

if (-not (Test-Path -Path $EnvFile)) {
    throw "Env file not found: $EnvFile"
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) is not installed. Install it first: https://cli.github.com/"
}

if (-not $DryRun) {
    gh auth status | Out-Null
}

$envValues = Read-EnvFile -Path $EnvFile

if ([string]::IsNullOrWhiteSpace($GhcrUsername)) {
    $GhcrUsername = ($Repo -split "/")[0]
}

if ([string]::IsNullOrWhiteSpace($GhcrToken)) {
    $secureGhcrToken = Read-Host "Enter GHCR token (read:packages)" -AsSecureString
    $GhcrToken = ConvertTo-PlainText -SecureValue $secureGhcrToken
}

if ([string]::IsNullOrWhiteSpace($DeploySshKeyPath)) {
    $DeploySshKeyPath = Read-Host "Enter path to the private SSH deploy key"
}

if (-not (Test-Path -Path $DeploySshKeyPath)) {
    throw "SSH key not found: $DeploySshKeyPath"
}

$deploySshKey = Get-Content -Path $DeploySshKeyPath -Raw

$nextAuthUrl = Get-RequiredValue -Source $envValues -Name "NEXTAUTH_URL"
$publicAppUrl = if ($envValues.ContainsKey("NEXT_PUBLIC_APP_URL") -and -not [string]::IsNullOrWhiteSpace($envValues["NEXT_PUBLIC_APP_URL"])) {
    $envValues["NEXT_PUBLIC_APP_URL"]
}
else {
    $nextAuthUrl
}

$maxStrikes = if ($envValues.ContainsKey("MAX_PROCTORING_STRIKES") -and -not [string]::IsNullOrWhiteSpace($envValues["MAX_PROCTORING_STRIKES"])) {
    $envValues["MAX_PROCTORING_STRIKES"]
}
elseif ($envValues.ContainsKey("NEXT_PUBLIC_MAX_PROCTORING_STRIKES") -and -not [string]::IsNullOrWhiteSpace($envValues["NEXT_PUBLIC_MAX_PROCTORING_STRIKES"])) {
    $envValues["NEXT_PUBLIC_MAX_PROCTORING_STRIKES"]
}
else {
    "20"
}

$secretMap = [ordered]@{
    DEPLOY_SSH_KEY = $deploySshKey
    GHCR_USERNAME = $GhcrUsername
    GHCR_TOKEN = $GhcrToken
    NEXTAUTH_SECRET = Get-RequiredValue -Source $envValues -Name "NEXTAUTH_SECRET"
    AI_API_KEY = Get-RequiredValue -Source $envValues -Name "AI_API_KEY"
    DEEPGRAM_API_KEY = Get-RequiredValue -Source $envValues -Name "DEEPGRAM_API_KEY"
    SMTP_PASS = if ($envValues.ContainsKey("SMTP_PASS")) { $envValues["SMTP_PASS"] } else { "" }
}

$variableMap = [ordered]@{
    DEPLOY_HOST = $DeployHost
    DEPLOY_PORT = $DeployPort
    DEPLOY_USER = $DeployUser
    DEPLOY_PATH = $DeployPath
    APP_PORT = $AppPort
    DATABASE_URL = Get-RequiredValue -Source $envValues -Name "DATABASE_URL"
    NEXTAUTH_URL = $nextAuthUrl
    NEXT_PUBLIC_APP_URL = $publicAppUrl
    AI_BASE_URL = if ($envValues.ContainsKey("AI_BASE_URL")) { $envValues["AI_BASE_URL"] } else { "https://api.openai.com" }
    AI_MODEL = if ($envValues.ContainsKey("AI_MODEL") -and -not [string]::IsNullOrWhiteSpace($envValues["AI_MODEL"])) { $envValues["AI_MODEL"] } else { "gpt-4o" }
    TTS_PROVIDER = if ($envValues.ContainsKey("TTS_PROVIDER") -and -not [string]::IsNullOrWhiteSpace($envValues["TTS_PROVIDER"])) { $envValues["TTS_PROVIDER"] } else { "deepgram" }
    EDGE_TTS_VOICE = if ($envValues.ContainsKey("EDGE_TTS_VOICE")) { $envValues["EDGE_TTS_VOICE"] } else { "en-IN-NeerjaNeural" }
    EDGE_TTS_RATE = if ($envValues.ContainsKey("EDGE_TTS_RATE")) { $envValues["EDGE_TTS_RATE"] } else { "+10%" }
    STT_PROVIDER = if ($envValues.ContainsKey("STT_PROVIDER") -and -not [string]::IsNullOrWhiteSpace($envValues["STT_PROVIDER"])) { $envValues["STT_PROVIDER"] } else { "deepgram" }
    STT_LANGUAGE = if ($envValues.ContainsKey("STT_LANGUAGE") -and -not [string]::IsNullOrWhiteSpace($envValues["STT_LANGUAGE"])) { $envValues["STT_LANGUAGE"] } else { "en-IN" }
    MAX_PROCTORING_STRIKES = $maxStrikes
    NEXT_PUBLIC_MAX_PROCTORING_STRIKES = if ($envValues.ContainsKey("NEXT_PUBLIC_MAX_PROCTORING_STRIKES") -and -not [string]::IsNullOrWhiteSpace($envValues["NEXT_PUBLIC_MAX_PROCTORING_STRIKES"])) { $envValues["NEXT_PUBLIC_MAX_PROCTORING_STRIKES"] } else { $maxStrikes }
    HEARTBEAT_STALE_MS = if ($envValues.ContainsKey("HEARTBEAT_STALE_MS") -and -not [string]::IsNullOrWhiteSpace($envValues["HEARTBEAT_STALE_MS"])) { $envValues["HEARTBEAT_STALE_MS"] } else { "180000" }
    SILENCE_DELAY_MS = if ($envValues.ContainsKey("SILENCE_DELAY_MS") -and -not [string]::IsNullOrWhiteSpace($envValues["SILENCE_DELAY_MS"])) { $envValues["SILENCE_DELAY_MS"] } else { "3000" }
    SMTP_HOST = if ($envValues.ContainsKey("SMTP_HOST")) { $envValues["SMTP_HOST"] } else { "" }
    SMTP_PORT = if ($envValues.ContainsKey("SMTP_PORT") -and -not [string]::IsNullOrWhiteSpace($envValues["SMTP_PORT"])) { $envValues["SMTP_PORT"] } else { "587" }
    SMTP_USER = if ($envValues.ContainsKey("SMTP_USER")) { $envValues["SMTP_USER"] } else { "" }
    SMTP_FROM = if ($envValues.ContainsKey("SMTP_FROM")) { $envValues["SMTP_FROM"] } else { "" }
    NODE_TLS_REJECT_UNAUTHORIZED = if ($envValues.ContainsKey("NODE_TLS_REJECT_UNAUTHORIZED") -and -not [string]::IsNullOrWhiteSpace($envValues["NODE_TLS_REJECT_UNAUTHORIZED"])) { $envValues["NODE_TLS_REJECT_UNAUTHORIZED"] } else { "1" }
}

foreach ($entry in $secretMap.GetEnumerator()) {
    Set-GitHubSecret -Name $entry.Key -Value ([string]$entry.Value)
}

foreach ($entry in $variableMap.GetEnumerator()) {
    Set-GitHubVariable -Name $entry.Key -Value ([string]$entry.Value)
}

Write-Host "GitHub Actions configuration completed for $Repo"
