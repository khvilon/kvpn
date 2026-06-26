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
$composePath = Join-Path $repoRoot 'docker-compose.yml'
$packagePath = Join-Path $repoRoot 'package.json'
$serverPath = Join-Path $repoRoot 'src/server.ts'
$xrayStatePath = Join-Path $repoRoot 'src/xrayState.ts'
$frontendPath = Join-Path $repoRoot 'public/app.js'
$xrayDockerfilePath = Join-Path $repoRoot 'docker/xray/Dockerfile'
$adminDockerfilePath = Join-Path $repoRoot 'docker/admin/Dockerfile'
$xrayEntrypointPath = Join-Path $repoRoot 'docker/xray/entrypoint.sh'
$migratorDockerfilePath = Join-Path $repoRoot 'docker/migrator/Dockerfile'
$migratorEntrypointPath = Join-Path $repoRoot 'docker/migrator/entrypoint.sh'

Assert-True (Test-Path -LiteralPath $installPath -PathType Leaf) 'install.sh must exist'
Assert-True (Test-Path -LiteralPath $readmePath -PathType Leaf) 'README.md must exist'
Assert-True (Test-Path -LiteralPath $gitattributesPath -PathType Leaf) '.gitattributes must exist'
Assert-True (Test-Path -LiteralPath $gitignorePath -PathType Leaf) '.gitignore must exist'
Assert-True (Test-Path -LiteralPath $composePath -PathType Leaf) 'docker-compose.yml must exist'
Assert-True (Test-Path -LiteralPath $packagePath -PathType Leaf) 'package.json must exist'
Assert-True (Test-Path -LiteralPath $serverPath -PathType Leaf) 'src/server.ts must exist'
Assert-True (Test-Path -LiteralPath $xrayStatePath -PathType Leaf) 'src/xrayState.ts must exist'
Assert-True (Test-Path -LiteralPath $frontendPath -PathType Leaf) 'public/app.js must exist'
Assert-True (Test-Path -LiteralPath $xrayDockerfilePath -PathType Leaf) 'docker/xray/Dockerfile must exist'
Assert-True (Test-Path -LiteralPath $adminDockerfilePath -PathType Leaf) 'docker/admin/Dockerfile must exist'
Assert-True (Test-Path -LiteralPath $xrayEntrypointPath -PathType Leaf) 'docker/xray/entrypoint.sh must exist'
Assert-True (Test-Path -LiteralPath $migratorDockerfilePath -PathType Leaf) 'docker/migrator/Dockerfile must exist'
Assert-True (Test-Path -LiteralPath $migratorEntrypointPath -PathType Leaf) 'docker/migrator/entrypoint.sh must exist'

$install = Get-Content -Raw -LiteralPath $installPath
$readme = Get-Content -Raw -LiteralPath $readmePath
$gitattributes = Get-Content -Raw -LiteralPath $gitattributesPath
$gitignore = Get-Content -Raw -LiteralPath $gitignorePath
$compose = Get-Content -Raw -LiteralPath $composePath
$package = Get-Content -Raw -LiteralPath $packagePath
$server = Get-Content -Raw -LiteralPath $serverPath
$xrayState = Get-Content -Raw -LiteralPath $xrayStatePath
$frontend = Get-Content -Raw -LiteralPath $frontendPath
$xrayDockerfile = Get-Content -Raw -LiteralPath $xrayDockerfilePath
$adminDockerfile = Get-Content -Raw -LiteralPath $adminDockerfilePath
$xrayEntrypoint = Get-Content -Raw -LiteralPath $xrayEntrypointPath
$migratorDockerfile = Get-Content -Raw -LiteralPath $migratorDockerfilePath
$migratorEntrypoint = Get-Content -Raw -LiteralPath $migratorEntrypointPath

Assert-True ($install -match 'set -Eeuo pipefail') 'install.sh must use strict bash mode'
Assert-True ($install -match 'XRAY_VERSION="\$\{XRAY_VERSION:-26\.2\.6\}"') 'Xray version must default to the inspected server version'
Assert-True ($install -match 'docker compose up -d --build') 'install.sh must only wrap docker compose up'
Assert-True ($install -notmatch 'apt-get') 'install.sh must not install host packages'
Assert-True ($install -notmatch 'npm ') 'install.sh must not run npm on the host'
Assert-True ($install -notmatch 'systemctl') 'install.sh must not manage host systemd'
Assert-True ($install -notmatch 'ufw') 'install.sh must not manage host firewall'
Assert-True ($install -notmatch 'openssl req') 'install.sh must not generate TLS on the host'
Assert-True ($install -notmatch '/usr/local/etc/xray') 'install.sh must not migrate host Xray files directly'
Assert-True ($install -match 'SNI="\$\{1:-www\.cloudflare\.com\}"') 'default SNI must use the verified stable REALITY target'

Assert-True ($compose -match 'admin:') 'compose must define admin service'
Assert-True ($compose -match 'xray:') 'compose must define xray service'
Assert-True ($compose -match 'migrator:') 'compose must define migrator service'
Assert-True ($compose -match '\$\{ADMIN_PORT:-8443\}:8443') 'compose must publish HTTPS admin UI on 8443 by default'
Assert-True ($compose -match '443:443') 'compose must publish Xray on 443'
Assert-True ($compose -match './data:/app/data') 'compose must persist app state in ./data'
Assert-True ($compose -match './data/xray:/etc/xray') 'compose must share generated Xray config'
Assert-True ($compose -match './data/logs:/var/log/xray') 'compose must share Xray logs'
Assert-True ($compose -match '/usr/local/etc/xray:/host/usr/local/etc/xray:ro') 'compose migrator must read old host Xray config'
Assert-True ($compose -match 'condition: service_completed_successfully') 'xray/admin must wait for migrator'

Assert-True ($package -match '"typescript"') 'package.json must build TypeScript'
Assert-True ($package -match '"express"') 'backend must use a simple TS HTTP server'
Assert-True ($server -match 'https\.createServer') 'admin backend must serve HTTPS'
Assert-True ($server -match 'ensureAdminPassword') 'admin backend must generate/preserve admin password inside container'
Assert-True ($server -match 'ensureTlsCertificate') 'admin backend must generate self-signed TLS inside container'
Assert-True ($server -match 'timingSafeEqual') 'admin auth must compare credentials safely'
Assert-True ($server -match 'app\.get\("/api/keys"') 'backend must list keys'
Assert-True ($server -match 'app\.post\("/api/keys"') 'backend must create keys'
Assert-True ($server -match 'app\.patch\("/api/keys/:id"') 'backend must update key comments'
Assert-True ($server -match 'app\.delete\("/api/keys/:id"') 'backend must delete keys'
Assert-True ($server -match 'app\.get\("/api/logs"') 'backend must expose logs'
Assert-True ($xrayState -match 'importLegacyState') 'state layer must import legacy keys'
Assert-True ($xrayState -match 'xray x25519') 'state layer must generate REALITY keys'
Assert-True ($xrayState -match 'StatsService') 'state layer must configure Xray stats API'
Assert-True ($xrayState -match 'HandlerService') 'state layer must configure Xray handler API'
Assert-True ($xrayState -match 'statsUserUplink') 'state layer must enable per-key uplink stats'
Assert-True ($xrayState -match 'statsUserDownlink') 'state layer must enable per-key downlink stats'
Assert-True ($xrayState -match 'vless://') 'state layer must render client URLs'
Assert-True ($frontend -match 'navigator\.clipboard\.writeText') 'UI must copy key URLs'
Assert-True ($frontend -match 'api\("/api/keys"') 'UI must load keys from API'
Assert-True ($frontend -match '/api/logs\?file=') 'UI must load logs from API'
Assert-True ($xrayDockerfile -match 'Xray-linux-64\.zip') 'xray image must pin the release archive'
Assert-True ($adminDockerfile -match 'npm run build') 'admin image must compile TypeScript'
Assert-True ($adminDockerfile -match 'openssl') 'admin image must include openssl for self-signed TLS'
Assert-True ($xrayEntrypoint -match 'restart\.request') 'xray runner must use explicit restart marker'
Assert-True ($xrayEntrypoint -match 'sha256sum') 'xray runner must detect restart marker changes'
Assert-True ($migratorDockerfile -match 'util-linux') 'migrator image must include nsenter'
Assert-True ($migratorEntrypoint -match 'legacy/config\.json') 'migrator must copy legacy Xray config into data'
Assert-True ($migratorEntrypoint -match 'nsenter') 'migrator must perform host migration from a container'
Assert-True ($migratorEntrypoint -match 'systemctl disable --now xray') 'migrator must stop legacy host xray service'
Assert-True ($migratorEntrypoint -match 'ufw allow 8443/tcp') 'migrator must open admin HTTPS port from compose'

Assert-True ($readme -match 'git clone') 'README must include clone usage'
Assert-True ($readme -match 'docker compose up -d --build') 'README must use docker compose up as primary command'
Assert-True ($readme -match 'Do not run npm install on the host') 'README must explicitly forbid host npm install'
Assert-True ($readme -notmatch '(?m)^npm ') 'README must not instruct host npm commands'
Assert-True ($readme -match 'www\.cloudflare\.com') 'README must document the default SNI'
Assert-True ($readme -match 'https://<server-ip>:8443') 'README must document admin HTTPS URL'
Assert-True ($readme -match 'existing key') 'README must document legacy key import'
Assert-True ($gitattributes -match '\*\.sh text eol=lf') '.gitattributes must force LF for shell scripts'
Assert-True ($gitignore -match '\.env') '.gitignore must ignore local env files'
Assert-True ($gitignore -match 'xray-reality-client\.txt') '.gitignore must ignore copied client URLs'
Assert-True ($gitignore -match '(?m)^data/') '.gitignore must ignore persistent runtime state'
