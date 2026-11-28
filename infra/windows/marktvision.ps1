# =====================================================================
# Marktvision Leads IA - operacao no Windows (Docker Desktop)
# Chamado pelos arquivos .bat. Compativel com Windows PowerShell 5.1.
# NUNCA usa "docker compose down -v": os dados ficam sempre preservados.
# =====================================================================
param([Parameter(Mandatory = $true)][string]$Acao)

# erros de comandos externos sao verificados explicitamente ($LASTEXITCODE); avisos do Docker nao interrompem
$ErrorActionPreference = "Continue"
$Raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Raiz
$Repo = "https://github.com/julianavdiassilva-hue/marktvision-leads-ia.git"
$EnvFile = Join-Path $Raiz ".env"
$Log = Join-Path $Raiz "logs\operacao.log"
New-Item -ItemType Directory -Force -Path (Join-Path $Raiz "logs"), (Join-Path $Raiz "backups") | Out-Null

function Info($t)  { Write-Host "  $t" -ForegroundColor Green;  Add-Content $Log "$(Get-Date -Format s) INFO $t" }
function Aviso($t) { Write-Host "  $t" -ForegroundColor Yellow; Add-Content $Log "$(Get-Date -Format s) AVISO $t" }
function Erro($t)  { Write-Host "  ERRO: $t" -ForegroundColor Red; Add-Content $Log "$(Get-Date -Format s) ERRO $t" }
function Titulo($t){ Write-Host ""; Write-Host "== $t ==" -ForegroundColor Cyan }

function Ler-Env {
  $h = @{}
  if (Test-Path $EnvFile) { Get-Content $EnvFile | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $h[$matches[1]] = $matches[2] } } }
  return $h
}
function Gravar-EnvValor($chave, $valor) {
  $linhas = @(); if (Test-Path $EnvFile) { $linhas = Get-Content $EnvFile }
  $achou = $false
  $linhas = $linhas | ForEach-Object { if ($_ -match "^$chave=") { $achou = $true; "$chave=$valor" } else { $_ } }
  if (-not $achou) { $linhas += "$chave=$valor" }
  Set-Content -Path $EnvFile -Value $linhas -Encoding ASCII
}
function Segredo($bytes) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return (($b | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Docker-Ok { try { docker info *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false } }
function Garantir-Docker {
  if (Docker-Ok) { return }
  $exe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (-not (Test-Path $exe)) { throw "Docker Desktop nao esta instalado. Execute INSTALAR.bat." }
  Info "Iniciando o Docker Desktop (pode levar 1 a 3 minutos)..."
  Start-Process $exe | Out-Null
  for ($i = 0; $i -lt 90; $i++) { Start-Sleep 4; if (Docker-Ok) { Info "Docker pronto."; return } }
  throw "O Docker Desktop nao respondeu. Abra o Docker Desktop manualmente, aguarde ficar verde e tente de novo."
}
function Perfis {
  $e = Ler-Env; $p = @()
  if ($e["ACESSO_REMOTO"] -eq "temporario") { $p += @("--profile", "remoto") }
  if ($e["ACESSO_REMOTO"] -eq "dominio") { $p += @("--profile", "dominio") }
  if ($e["AI_LOCAL"] -eq "sim") { $p += @("--profile", "ia-local") }
  return $p
}
function Compose { param([Parameter(ValueFromRemainingArguments = $true)]$Args2) $p = Perfis; & docker compose @p @Args2; if ($LASTEXITCODE -ne 0) { throw "Falha no comando: docker compose $Args2" } }

function Aguardar-App {
  $porta = (Ler-Env)["APP_PORT"]; if (-not $porta) { $porta = "3000" }
  Info "Aguardando o sistema ficar pronto..."
  for ($i = 0; $i -lt 90; $i++) {
    try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -ErrorAction Stop "http://localhost:$porta/api/health"; if ($r.StatusCode -eq 200) { Info "Sistema pronto."; return } } catch {}
    Start-Sleep 4
  }
  throw "O sistema nao respondeu a tempo. Veja os detalhes com VER_STATUS.bat."
}
function IP-Local {
  try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and $_.PrefixOrigin -ne 'WellKnown' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker|Loopback' } | Select-Object -First 1 -ExpandProperty IPAddress
    return $ip
  } catch { return $null }
}
function Endereco-Remoto {
  $e = Ler-Env
  if ($e["ACESSO_REMOTO"] -eq "dominio") { return $e["ENDERECO_FIXO"] }
  if ($e["ACESSO_REMOTO"] -ne "temporario") { return $null }
  for ($i = 0; $i -lt 20; $i++) {
    $log = (& docker compose --profile remoto logs tunel 2>&1) -join "`n"
    $m = [regex]::Matches($log, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Count -gt 0) { return $m[$m.Count - 1].Value }
    Start-Sleep 3
  }
  return $null
}
function Mostrar-Enderecos {
  $porta = (Ler-Env)["APP_PORT"]; if (-not $porta) { $porta = "3000" }
  $ip = IP-Local; $rem = Endereco-Remoto
  $linhas = @("ENDERECOS DE ACESSO - MARKTVISION LEADS IA  ($(Get-Date -Format 'dd/MM/yyyy HH:mm'))", "",
    "Neste computador:            http://localhost:$porta")
  if ($ip) { $linhas += "Rede local (Wi-Fi/cabo):     http://$($ip):$porta" }
  if ($rem) { $linhas += "Internet (outros locais):    $rem" } else { $linhas += "Internet: desativado (use ACESSO_REMOTO.bat para ativar)" }
  if ((Ler-Env)["ACESSO_REMOTO"] -eq "temporario") { $linhas += "", "ATENCAO: o endereco de internet temporario MUDA a cada reinicio. Envie o novo endereco aos vendedores." }
  Set-Content -Path (Join-Path $Raiz "ENDERECOS.txt") -Value $linhas -Encoding UTF8
  Titulo "Enderecos de acesso"; $linhas | ForEach-Object { Write-Host "  $_" }
}

function Criar-Env {
  if (Test-Path $EnvFile) { Info "Configuracao existente mantida (.env)."; return }
  Info "Gerando senhas e chaves seguras (unicas deste computador)..."
  $linhas = @(
    "# Marktvision Leads IA - configuracao local. NAO compartilhe este arquivo.",
    "DB_OWNER_PASSWORD=$(Segredo 24)", "DB_APP_PASSWORD=$(Segredo 24)", "EVOLUTION_API_KEY=$(Segredo 24)", "ENCRYPTION_KEY=$(Segredo 32)",
    "APP_PORT=3000", "APP_URL=http://localhost:3000", "ACESSO_REMOTO=desativado", "ENDERECO_FIXO=", "CLOUDFLARE_TUNNEL_TOKEN=",
    "BACKUP_KEEP_DAYS=14", "GOOGLE_PLACES_API_KEY=", "SEARCH_PROVIDER=osm", "ANTHROPIC_API_KEY=", "AI_PROVIDER=", "AI_BASE_URL=", "AI_API_KEY=", "AI_MODEL=", "AI_LOCAL=nao",
    "META_APP_ID=", "META_APP_SECRET=", "META_EMBEDDED_SIGNUP_CONFIG_ID=", "META_WEBHOOK_VERIFY_TOKEN=$(Segredo 16)")
  Set-Content -Path $EnvFile -Value $linhas -Encoding ASCII
  # somente o usuario atual pode ler o arquivo de segredos
  icacls $EnvFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
}

function Senha-Segura($rotulo) {
  while ($true) {
    $s1 = Read-Host "  $rotulo (minimo 8 caracteres; nao aparece ao digitar)" -AsSecureString
    $s2 = Read-Host "  Repita a senha" -AsSecureString
    $p1 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s1))
    $p2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s2))
    if ($p1 -ne $p2) { Aviso "As senhas nao conferem. Tente de novo."; continue }
    if ($p1.Length -lt 8) { Aviso "Use pelo menos 8 caracteres."; continue }
    return $p1
  }
}
function Criar-Admin {
  Titulo "Administrador geral"
  $u = Read-Host "  Login do administrador geral (Enter para 'admin')"; if (-not $u) { $u = "admin" }
  $p = Senha-Segura "Senha do administrador geral"
  # a senha vai por variavel de ambiente temporaria (nao aparece na linha de comando nem em arquivos)
  $env:ADMIN_USERNAME = $u; $env:ADMIN_PASSWORD = $p
  try { & docker compose exec -T -e ADMIN_USERNAME -e ADMIN_PASSWORD app npm run --silent admin; $ok = ($LASTEXITCODE -eq 0) }
  finally { Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue; Remove-Item Env:ADMIN_USERNAME -ErrorAction SilentlyContinue }
  if (-not $ok) { throw "Nao foi possivel criar o administrador (veja a mensagem acima)." }
  Info "Guarde o login '$u' e a senha em local seguro."
}

function Backup-Agora($motivo) {
  $ts = Get-Date -Format "yyyy-MM-dd_HHmm"
  New-Item -ItemType Directory -Force -Path (Join-Path $Raiz "backups\manual") | Out-Null
  Info "Gerando backup ($motivo)..."
  & docker compose exec -T backup sh -c "pg_dump -h postgres -U mv_owner -d marktvision -Fc -f /backups/manual/banco_$ts.dump && tar -czf /backups/manual/sessoes_whatsapp_$ts.tar.gz -C /sessions ."
  if ($LASTEXITCODE -ne 0) { throw "Falha ao gerar o backup." }
  Info "Backup salvo em: $Raiz\backups\manual (banco_$ts.dump e sessoes_whatsapp_$ts.tar.gz)"
  Info "Recomendado: copie a pasta backups para um pendrive ou nuvem periodicamente."
}

function Abrir-Navegador {
  $porta = (Ler-Env)["APP_PORT"]; if (-not $porta) { $porta = "3000" }
  Info "Abrindo o sistema no navegador: http://localhost:$porta"
  Start-Process "http://localhost:$porta" | Out-Null
}
function Atalho-AreaDeTrabalho {
  # Atalho "Marktvision Leads IA" na Area de Trabalho: liga o sistema (se estiver parado) e abre o navegador
  try {
    $desk = [Environment]::GetFolderPath("Desktop")
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut((Join-Path $desk "Marktvision Leads IA.lnk"))
    $s.TargetPath = Join-Path $Raiz "ABRIR_MARKTVISION.bat"
    $s.WorkingDirectory = $Raiz
    $s.WindowStyle = 7
    $s.Description = "Abrir a Marktvision Leads IA"
    $s.Save()
    Info "Atalho 'Marktvision Leads IA' criado na Area de Trabalho."
  } catch { Aviso "Nao foi possivel criar o atalho na Area de Trabalho. Use ABRIR_MARKTVISION.bat." }
}
function Atalho-Inicializacao($ativar) {
  $startup = [Environment]::GetFolderPath("Startup")
  $lnk = Join-Path $startup "Marktvision Leads IA.lnk"
  if ($ativar) {
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut($lnk)
    $s.TargetPath = Join-Path $Raiz "INICIAR_MARKTVISION.bat"
    $s.Arguments = "auto"
    $s.WorkingDirectory = $Raiz
    $s.WindowStyle = 7
    $s.Save()
    Info "Inicio automatico ATIVADO: o sistema sobe sozinho quando voce entrar no Windows."
  } elseif (Test-Path $lnk) { Remove-Item $lnk; Info "Inicio automatico desativado." }
}

function Liberar-Firewall {
  $porta = (Ler-Env)["APP_PORT"]; if (-not $porta) { $porta = "3000" }
  $cmd = "netsh advfirewall firewall delete rule name=`"Marktvision Leads IA`" >nul 2>&1 & netsh advfirewall firewall add rule name=`"Marktvision Leads IA`" dir=in action=allow protocol=TCP localport=$porta profile=private"
  try { Start-Process cmd -ArgumentList "/c $cmd" -Verb RunAs -Wait -ErrorAction Stop; Info "Acesso pela rede local liberado no Firewall (somente redes privadas)." }
  catch { Aviso "Firewall nao configurado (permissao negada). Os vendedores da rede local podem nao conseguir acessar." }
}

function Instalar {
  Titulo "Verificando pre-requisitos"
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Aviso "winget nao encontrado: instale manualmente Git e Docker Desktop (links no MANUAL)." }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Info "Instalando Git..."; winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements
    $env:Path += ";$env:ProgramFiles\Git\cmd"
  }
  $dockerExe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (-not (Test-Path $dockerExe)) {
    Info "Instalando Docker Desktop (gratuito para uso pessoal e pequenas empresas)..."
    winget install --id Docker.DockerDesktop -e --accept-source-agreements --accept-package-agreements
    Aviso "Docker Desktop instalado. REINICIE o computador, abra o Docker Desktop uma vez (aceite os termos) e execute INSTALAR.bat novamente."
    return
  }
  Garantir-Docker
  if (-not (Test-Path (Join-Path $Raiz ".git"))) {
    Titulo "Vinculando a pasta ao GitHub (para receber atualizacoes)"
    git init -q; git remote add origin $Repo 2>$null
    git fetch -q origin main
    if ($LASTEXITCODE -ne 0) { Aviso "Nao foi possivel acessar o GitHub agora (faca login quando solicitado). As atualizacoes poderao ser configuradas depois." }
    else { git reset -q origin/main; git branch -q -M main; git branch -q --set-upstream-to=origin/main main }
  }
  Titulo "Configuracao"
  Criar-Env
  Titulo "Montando o sistema (a primeira vez leva de 5 a 15 minutos)"
  Compose build
  Compose up -d
  Aguardar-App
  Criar-Admin
  Liberar-Firewall
  $r = Read-Host "  Iniciar o sistema automaticamente ao ligar o computador? (S/N)"
  Atalho-Inicializacao ($r -match '^[sS]')
  Mostrar-Enderecos
  Atalho-AreaDeTrabalho
  Titulo "Instalacao concluida"
  Info "Para abrir o sistema depois: atalho 'Marktvision Leads IA' na Area de Trabalho (ou http://localhost:3000 no navegador)."
  Info "Entre com o login e a senha do administrador geral que voce acabou de criar."
  Abrir-Navegador
}

function Atualizar {
  Garantir-Docker
  if (-not (Test-Path (Join-Path $Raiz ".git"))) { throw "Esta pasta nao esta ligada ao GitHub. Execute INSTALAR.bat." }
  Backup-Agora "antes da atualizacao"
  Titulo "Baixando a versao mais recente"
  git fetch -q origin main; if ($LASTEXITCODE -ne 0) { throw "Sem acesso ao GitHub. Verifique a internet e o login." }
  $mudancas = git status --porcelain --untracked-files=no
  if ($mudancas) { throw "Ha arquivos do programa alterados nesta pasta. Nada foi atualizado. Peca suporte." }
  git merge -q --ff-only origin/main; if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel aplicar a atualizacao. Nada foi alterado." }
  Titulo "Aplicando (dados preservados; migracoes do banco sao automaticas)"
  Compose build
  Compose up -d
  Aguardar-App
  Info "Atualizado para: $(git log -1 --format='%h %s')"
  Atalho-AreaDeTrabalho
}

function Restaurar {
  $arqs = Get-ChildItem -Path (Join-Path $Raiz "backups") -Recurse -Filter "banco_*.dump" | Sort-Object LastWriteTime -Descending
  if (-not $arqs) { throw "Nenhum backup encontrado na pasta backups." }
  Titulo "Backups disponiveis"
  for ($i = 0; $i -lt [Math]::Min($arqs.Count, 15); $i++) { Write-Host ("  [{0}] {1}  ({2:dd/MM/yyyy HH:mm})" -f ($i + 1), $arqs[$i].Name, $arqs[$i].LastWriteTime) }
  $n = Read-Host "  Numero do backup a restaurar (Enter cancela)"; if (-not $n) { return }
  $arq = $arqs[[int]$n - 1]
  Aviso "Os dados ATUAIS serao substituidos pelos do backup $($arq.Name)."
  if ((Read-Host "  Digite RESTAURAR para confirmar") -ne "RESTAURAR") { Info "Cancelado."; return }
  Garantir-Docker
  Backup-Agora "antes da restauracao"
  $rel = $arq.FullName.Substring((Join-Path $Raiz "backups").Length + 1).Replace("\", "/")
  & docker compose stop app evolution
  & docker compose exec -T backup sh -c "pg_restore -h postgres -U mv_owner -d marktvision --clean --if-exists --no-owner /backups/$rel"
  $tar = $arq.FullName -replace 'banco_', 'sessoes_whatsapp_' -replace '\.dump$', '.tar.gz'
  if (Test-Path $tar) {
    $relTar = $tar.Substring((Join-Path $Raiz "backups").Length + 1).Replace("\", "/")
    & docker compose run --rm --no-deps -v "${Raiz}\backups:/b:ro" --entrypoint sh evolution -c "rm -rf /evolution/instances/* && tar -xzf /b/$relTar -C /evolution/instances"
  }
  Compose up -d
  Aguardar-App
  Info "Restauracao concluida."
}

function Acesso-Remoto {
  Titulo "Acesso pela internet"
  Write-Host "  [1] Ativar endereco TEMPORARIO gratuito (https://....trycloudflare.com - muda a cada reinicio)"
  Write-Host "  [2] Ativar endereco FIXO com dominio proprio (Cloudflare Tunnel - requer dominio e token)"
  Write-Host "  [3] Desativar acesso pela internet"
  $o = Read-Host "  Escolha"
  if ($o -eq "1") { Gravar-EnvValor "ACESSO_REMOTO" "temporario" }
  elseif ($o -eq "2") {
    $t = Read-Host "  Cole o TOKEN do tunel (Cloudflare Zero Trust > Networks > Tunnels)"
    $u = Read-Host "  Endereco fixo configurado (ex.: https://app.seudominio.com.br)"
    Gravar-EnvValor "CLOUDFLARE_TUNNEL_TOKEN" $t; Gravar-EnvValor "ENDERECO_FIXO" $u; Gravar-EnvValor "ACESSO_REMOTO" "dominio"
  }
  elseif ($o -eq "3") { Gravar-EnvValor "ACESSO_REMOTO" "desativado"; & docker compose --profile remoto --profile dominio stop tunel tunel-fixo 2>$null }
  else { return }
  Garantir-Docker
  Compose up -d
  Mostrar-Enderecos
}

function Configurar-IA {
  Titulo "Inteligencia artificial (chatbot, mensagens e sugestoes)"
  Write-Host "  [1] Google Gemini - franquia GRATUITA com limites (chave em aistudio.google.com)"
  Write-Host "      Atencao: na franquia gratuita o Google pode usar os dados enviados para melhorar produtos."
  Write-Host "  [2] Groq - franquia GRATUITA com limites (chave em console.groq.com)"
  Write-Host "  [3] Ollama - IA LOCAL e gratuita, roda neste computador (privado; mais lento; ~2 GB de download)"
  Write-Host "  [4] Anthropic Claude - PAGO por uso (chave em console.anthropic.com)"
  Write-Host "  [5] Desativar a IA"
  $o = Read-Host "  Escolha"
  Gravar-EnvValor "AI_LOCAL" "nao"
  switch ($o) {
    "1" { $k = Read-Host "  Cole a chave da API do Gemini"; $m = Read-Host "  Modelo (Enter para gemini-2.5-flash)"; if (-not $m) { $m = "gemini-2.5-flash" }
          Gravar-EnvValor "AI_PROVIDER" "openai_compat"; Gravar-EnvValor "AI_BASE_URL" "https://generativelanguage.googleapis.com/v1beta/openai"; Gravar-EnvValor "AI_API_KEY" $k; Gravar-EnvValor "AI_MODEL" $m }
    "2" { $k = Read-Host "  Cole a chave da API do Groq"; $m = Read-Host "  Modelo (Enter para llama-3.3-70b-versatile)"; if (-not $m) { $m = "llama-3.3-70b-versatile" }
          Gravar-EnvValor "AI_PROVIDER" "openai_compat"; Gravar-EnvValor "AI_BASE_URL" "https://api.groq.com/openai/v1"; Gravar-EnvValor "AI_API_KEY" $k; Gravar-EnvValor "AI_MODEL" $m }
    "3" { $m = Read-Host "  Modelo (Enter para qwen2.5:3b)"; if (-not $m) { $m = "qwen2.5:3b" }
          Gravar-EnvValor "AI_LOCAL" "sim"; Gravar-EnvValor "AI_PROVIDER" "openai_compat"; Gravar-EnvValor "AI_BASE_URL" "http://ollama:11434/v1"; Gravar-EnvValor "AI_API_KEY" ""; Gravar-EnvValor "AI_MODEL" $m
          Garantir-Docker; Compose up -d ollama
          Info "Baixando o modelo $m (pode levar varios minutos)..."
          & docker compose --profile ia-local exec -T ollama ollama pull $m
          if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel baixar o modelo $m." } }
    "4" { $k = Read-Host "  Cole a chave da API da Anthropic (servico PAGO)"; Gravar-EnvValor "AI_PROVIDER" "anthropic"; Gravar-EnvValor "ANTHROPIC_API_KEY" $k; Gravar-EnvValor "AI_MODEL" "claude-opus-5-5" }
    "5" { Gravar-EnvValor "AI_PROVIDER" ""; Gravar-EnvValor "AI_BASE_URL" ""; Gravar-EnvValor "AI_API_KEY" ""; Gravar-EnvValor "ANTHROPIC_API_KEY" "" }
    default { return }
  }
  Garantir-Docker; Compose up -d; Aguardar-App
  Info "Configuracao de IA aplicada. Teste em Chatbot IA > Testar o agente."
}

function Configurar-Pesquisa {
  Titulo "Pesquisa de empresas"
  Write-Host "  [1] OpenStreetMap - GRATUITO, sem cadastro (poucas empresas com telefone)"
  Write-Host "  [2] Google Places - mais completo; exige conta Google Cloud com faturamento (cartao). Consulte a franquia gratuita e os precos antes."
  $o = Read-Host "  Escolha"
  if ($o -eq "1") { Gravar-EnvValor "SEARCH_PROVIDER" "osm" }
  elseif ($o -eq "2") { $k = Read-Host "  Cole a chave GOOGLE_PLACES_API_KEY"; Gravar-EnvValor "GOOGLE_PLACES_API_KEY" $k; Gravar-EnvValor "SEARCH_PROVIDER" "google" }
  else { return }
  Garantir-Docker; Compose up -d; Aguardar-App; Info "Pesquisa configurada."
}

function Status {
  Garantir-Docker
  Titulo "Servicos"
  & docker compose --profile remoto --profile dominio ps --format "table {{.Service}}`t{{.State}}`t{{.Health}}"
  $ub = Join-Path $Raiz "backups\ultimo_backup.txt"
  Titulo "Backup"; if (Test-Path $ub) { Info "Ultimo backup automatico: $(Get-Content $ub)" } else { Aviso "Nenhum backup automatico ainda." }
  $er = Join-Path $Raiz "backups\ultimo_erro_backup.txt"; if (Test-Path $er) { Aviso "Ultima falha de backup: $(Get-Content $er)" }
  Titulo "Ultimos erros registrados (aplicacao)"
  & docker compose logs --tail 200 app 2>&1 | Select-String -Pattern "erro|error|\[worker\]|\[webhook" | Select-Object -Last 15 | ForEach-Object { Write-Host "  $_" }
  Mostrar-Enderecos
}

try {
  switch ($Acao) {
    "instalar"   { Instalar }
    "iniciar"    { Garantir-Docker; Compose up -d; Aguardar-App; Mostrar-Enderecos }
    "abrir"      { Garantir-Docker; Compose up -d; Aguardar-App; Abrir-Navegador }
    "parar"      { Garantir-Docker; & docker compose --profile remoto --profile dominio stop; Info "Sistema parado. Os dados continuam salvos." }
    "reiniciar"  { Garantir-Docker; Compose restart; Aguardar-App; Mostrar-Enderecos }
    "backup"     { Garantir-Docker; Backup-Agora "manual" }
    "restaurar"  { Restaurar }
    "atualizar"  { Atualizar }
    "admin"      { Garantir-Docker; Criar-Admin }
    "remoto"     { Acesso-Remoto }
    "status"     { Status }
    "ia"         { Configurar-IA }
    "pesquisa"   { Configurar-Pesquisa }
    "autoinicio" { $r = Read-Host "  Iniciar automaticamente ao ligar o computador? (S/N)"; Atalho-Inicializacao ($r -match '^[sS]') }
    default      { throw "Acao desconhecida: $Acao" }
  }
} catch {
  Erro $_.Exception.Message
  Add-Content $Log "$(Get-Date -Format s) DETALHE $($_ | Out-String)"
  exit 1
}
