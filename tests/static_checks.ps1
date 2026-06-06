$ErrorActionPreference = 'Stop'

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$installPath = Join-Path $repoRoot 'install.sh'
$readmePath = Join-Path $repoRoot 'README.md'
$gitattributesPath = Join-Path $repoRoot '.gitattributes'
$gitignorePath = Join-Path $repoRoot '.gitignore'

Assert-True (Test-Path -LiteralPath $installPath -PathType Leaf) 'install.sh must exist'
Assert-True (Test-Path -LiteralPath $readmePath -PathType Leaf) 'README.md must exist'
Assert-True (Test-Path -LiteralPath $gitattributesPath -PathType Leaf) '.gitattributes must exist'
Assert-True (Test-Path -LiteralPath $gitignorePath -PathType Leaf) '.gitignore must exist'

$install = Get-Content -Raw -LiteralPath $installPath
$readme = Get-Content -Raw -LiteralPath $readmePath
$gitattributes = Get-Content -Raw -LiteralPath $gitattributesPath
$gitignore = Get-Content -Raw -LiteralPath $gitignorePath

Assert-True ($install -match 'set -Eeuo pipefail') 'install.sh must use strict bash mode'
Assert-True ($install -match 'XRAY_VERSION="\$\{XRAY_VERSION:-26\.2\.6\}"') 'Xray version must default to the inspected server version'
Assert-True ($install -match 'https://raw\.githubusercontent\.com/XTLS/Xray-install/main/install-release\.sh') 'install.sh must use the official Xray installer'
Assert-True ($install -match '--version "\$XRAY_VERSION"') 'install.sh must pin Xray through the installer version flag'
Assert-True ($install -match 'SNI="\$\{1:-www\.microsoft\.com\}"') 'default SNI must match the inspected server'
Assert-True ($install -match '"/usr/local/etc/xray/config\.json"') 'config path must match the inspected server'
Assert-True ($install -match 'xray x25519') 'install.sh must generate REALITY x25519 keys'
Assert-True ($install -match 'uuidgen') 'install.sh must generate a fresh VLESS client UUID'
Assert-True ($install -match 'openssl rand -hex 8') 'install.sh must generate an 8-byte REALITY short id'
Assert-True ($install -match '"port": 443') 'Xray inbound must listen on TCP 443'
Assert-True ($install -match '"protocol": "vless"') 'Xray inbound must use VLESS'
Assert-True ($install -match '"security": "reality"') 'Xray stream security must use REALITY'
Assert-True ($install -match '"flow": "xtls-rprx-vision"') 'client flow must match the inspected server'
Assert-True ($install -match 'ufw allow 22/tcp') 'firewall must preserve SSH'
Assert-True ($install -match 'ufw allow 443/tcp') 'firewall must allow Xray'
Assert-True ($install -match 'vless://\$\{uuid\}@\$\{ip\}:443\?type=tcp&security=reality&pbk=\$\{pbk\}&fp=chrome&sni=\$\{SNI\}&sid=\$\{sid\}&flow=xtls-rprx-vision&encryption=none#Reality-Auto') 'output URL must match the inspected client format'

Assert-True ($readme -match 'git clone') 'README must include clone usage'
Assert-True ($readme -match 'sudo bash install\.sh') 'README must include the install command'
Assert-True ($readme -match 'www\.microsoft\.com') 'README must document the default SNI'
Assert-True ($gitattributes -match '\*\.sh text eol=lf') '.gitattributes must force LF for shell scripts'
Assert-True ($gitignore -match '\.env') '.gitignore must ignore local env files'
Assert-True ($gitignore -match 'xray-reality-client\.txt') '.gitignore must ignore copied client URLs'
