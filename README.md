# IoT • Dashboard ambiental ESP32

Aplicação web completa, derivada do `post_esp32_iot.py`: backend Python/Flask (WSGI) e interface HTML/CSS/JavaScript, sem compilação de frontend ou CDN. Lê a **mesma planilha CSV publicada** do projeto original. Os arquivos originais foram preservados. O destino de produção é **Render.com**, com Gunicorn. A versão anterior usava FastAPI/ASGI e foi migrada para Flask; Uvicorn não é mais necessário.

Versão atual: **1.0.1**, registrada no arquivo `VERSION`. Consulte `CHANGELOG.md` para as mudanças. A versão em execução aparece em `/api/health`, no cabeçalho `X-App-Version` e no rodapé do painel. O Git mantém o histórico e a tag anotada `v1.0.0` identifica a entrega inicial.

Para publicar pela primeira vez, siga as seções **Git e GitHub pelo PowerShell** e **Deploy de produção no Render (WSGI)**. Os blocos de autenticação são interativos: execute uma etapa por vez e conclua o login no navegador antes de continuar.

Para conferir o projeto antes de publicar, siga [Testar o projeto localmente no PowerShell](#testar-o-projeto-localmente-no-powershell): testes automatizados, inicialização do servidor, consultas HTTP e verificação do GIF no navegador.

## Iniciar no PowerShell com um único bloco (Windows / VS Code)

Requer **Python 3.12 ou superior** instalado e disponível pelo comando `python`, além de internet para baixar as dependências e consultar a planilha. No VS Code, abra **Terminal → Novo Terminal** e selecione **PowerShell**, ou use uma janela do PowerShell do Windows.

**Copie e cole todo o bloco abaixo de uma única vez.** Ele entra na pasta do projeto, cria ou reutiliza o ambiente `esp32IoT`, verifica a versão do Python, instala as dependências, cria `.env` apenas se ele ainda não existir e inicia o servidor local. Se alguma etapa de preparação falhar, a execução é interrompida antes de iniciar o servidor.

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $projectRoot = 'W:\ESP32_IoT\ESP32_IoT_DASHBOARD'

    # Se mover o projeto, ajuste somente o caminho acima.
    Set-Location -LiteralPath $projectRoot
    if (-not (Test-Path -LiteralPath '.\app.py' -PathType Leaf) -or
        -not (Test-Path -LiteralPath '.\requirements.txt' -PathType Leaf)) {
        throw 'A pasta selecionada precisa conter app.py e requirements.txt.'
    }

    $environmentPython = Join-Path $projectRoot 'esp32IoT\Scripts\python.exe'

    if (-not (Test-Path -LiteralPath $environmentPython -PathType Leaf)) {
        Write-Host 'Criando o ambiente Python esp32IoT...'
        if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
            throw 'Python não encontrado. Instale Python 3.12 ou superior e abra um novo terminal.'
        }
        & python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)"
        if ($LASTEXITCODE -ne 0) {
            throw 'O comando python precisa apontar para Python 3.12 ou superior.'
        }
        & python -m venv esp32IoT
        if ($LASTEXITCODE -ne 0) {
            throw 'Não foi possível criar o ambiente esp32IoT.'
        }
    }

    & $environmentPython -c "import sys; print('Interpretador:', sys.executable); print('Versão:', sys.version.split()[0]); sys.exit(0 if sys.version_info >= (3, 12) else 1)"
    if ($LASTEXITCODE -ne 0) {
        throw 'O ambiente esp32IoT existente precisa usar Python 3.12 ou superior.'
    }

    Write-Host 'Instalando as dependências...'
    & $environmentPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        throw 'A instalação das dependências falhou. Confira a mensagem acima e a conexão de internet.'
    }

    if (-not (Test-Path -LiteralPath '.\.env')) {
        Copy-Item -LiteralPath '.\.env.example' -Destination '.\.env' -ErrorAction Stop
        Write-Host 'Arquivo .env criado com a configuração de exemplo.'
    } else {
        Write-Host 'Arquivo .env existente preservado.'
    }

    Write-Host 'Dashboard: http://127.0.0.1:8000'
    Write-Host 'Mantenha este terminal aberto. Para parar, pressione Ctrl+C.'
    & $environmentPython -m flask --app app run --host 127.0.0.1 --port 8000 --no-debugger --no-reload
}
```

Quando aparecer a mensagem de que o servidor está escutando, abra <http://127.0.0.1:8000> no navegador. A fonte original já é o padrão. Para personalizá-la, edite `.env`, pare o servidor com **Ctrl+C** e execute novamente o mesmo bloco. Ele reutiliza o ambiente e preserva seu `.env`. Se a porta 8000 já estiver em uso, encerre a instância anterior pelo terminal em que ela foi iniciada ou ajuste `--port 8000` no bloco e a URL acessada.

O bloco usa diretamente o Python do ambiente: **não precisa executar `Activate.ps1`, mudar a política de execução do PowerShell nem usar privilégios de administrador**. É normal que `(esp32IoT)` não apareça no prompt.

Para selecionar o mesmo ambiente no editor do VS Code, instale a extensão **Python**, da Microsoft, pressione **Ctrl+Shift+P**, execute **Python: Select Interpreter** e selecione `esp32IoT`. Se necessário, use **Enter interpreter path → Find** e informe `W:\ESP32_IoT\ESP32_IoT_DASHBOARD\esp32IoT\Scripts\python.exe`. Essa seleção é útil para o editor; não é necessária para executar o bloco acima.

Esse procedimento inicia o servidor **local**. A publicação de produção no **Render** está na seção **Deploy de produção no Render (WSGI)** abaixo; ela usa Gunicorn no Linux da plataforma. Gunicorn não roda no Windows nativo, e o marcador no `requirements.txt` evita instalá-lo nesse sistema. Não use `flask run` ou `app.run()` como servidor de produção. A pasta `esp32IoT` é local e não deve ser enviada ao Git ou ao Render.

Os endpoints estão descritos na seção **API**; a antiga rota Swagger `/docs` não faz parte da versão Flask.

## Funcionalidades

- Temperatura e umidade atuais, médias, extremos de temperatura e quantidade de registros.
- Gráfico interativo com eixos independentes, tooltip e seleção de séries/período.
- Histórico com busca, paginação e exportação CSV compatível com Excel em português.
- Atualização por consulta periódica (10 segundos por padrão, ajustável para 30 ou 60).
- Estados separados para leituras recentes, sensor desatualizado e falha na fonte.
- Tratamento de valores decimais brasileiros, datas locais, leituras parciais e linhas inválidas.
- Tema claro/escuro e faixas de referência persistidas no navegador.
- Layout adaptado a desktop, tablet e celular; navegação por teclado e foco visível.
- Sem geração de dados de demonstração: todos os números vêm da planilha.

## Arquitetura e fluxo

```text
ESP32 → integração existente → Google Sheets publicado como CSV
                                      ↓ HTTPS
                         Render → Gunicorn → Flask/WSGI
                                      ↓ GET /api/readings
                          Dashboard no navegador do usuário
```

O programa original era um loop de notebook. Aqui o Gunicorn importa o objeto WSGI `app` do módulo `app.py` e atende as consultas HTTP do painel. O frontend busca atualizações enquanto a página estiver visível e retoma a consulta ao voltar à aba. Não há processo de coleta permanente nem WebSocket. O cache de 8 segundos reduz consultas repetidas por processo; não é compartilhado entre workers ou instâncias do Render e não é durável.

A atualização é **quase em tempo real por polling**. A publicação do Google Sheets pode introduzir atraso; consultar a API a cada 10 segundos não garante uma nova leitura a cada 10 segundos. O timestamp do sensor determina a atualidade, não o sucesso da requisição HTTP.

Os filtros de 1h, 6h e 24h são calculados **até a última leitura registrada**, para permitir análise mesmo quando o sensor estiver parado. O aviso de dados antigos continua visível. O histórico completo troca automaticamente o filtro para “Tudo”. Exportar baixa o período carregado, indicado no nome do arquivo. Os KPIs correspondem a esse período. Uma métrica ausente na leitura mais recente fica como `—`, sem reutilizar silenciosamente um valor antigo. A média ignora valores ausentes.

As faixas iniciais de referência (18–30 °C e 30–70%) são apenas preferências visuais ajustáveis; não são limites técnicos do sensor nem uma avaliação de saúde. Não há notificações externas ou alteração do firmware.

## Configuração

Copie `.env.example` para `.env` localmente ou configure as variáveis em **Environment** no serviço do Render. Não envie `.env` ao repositório:

| Variável | Padrão / significado |
| --- | --- |
| `SENSOR_CSV_URL` | URL HTTPS da planilha publicada original |
| `SENSOR_NAME` | `ESP32 • Ambiente 01` |
| `SENSOR_TIMEZONE` | `America/Sao_Paulo`; aplicado a datas sem fuso no CSV |
| `STALE_AFTER_SECONDS` | `180`; idade máxima para indicar uma leitura recente |
| `WEB_CONCURRENCY` | `1`; quantidade inicial de processos Gunicorn |
| `GUNICORN_THREADS` | `4`; threads por processo para atender consultas concorrentes |
| `PORT` | Fornecida pelo Render; Gunicorn escuta em `0.0.0.0:$PORT` (fallback local: `10000`) |

Publique a aba no Google Sheets em **Arquivo → Compartilhar → Publicar na Web → CSV**. Compartilhar uma planilha não é o mesmo que publicá-la. Colunas aceitas: `Carimbo de data/hora` ou `Timestamp`, ou `Data` + `Hora`; `Temperatura`/`Temperature`; `Umidade`/`Humidity`. A fonte original tem exatamente essas colunas. Datas brasileiras usam dia/mês/ano. Datas ISO 8601 com fuso também são aceitas.

Valores não numéricos, NaN, infinito, umidade fora de 0–100% e temperatura fora de −100–150 °C são descartados por métrica. Esses limites são verificações amplas de consistência, não uma especificação de um modelo de sensor. Linhas sem data válida ou sem nenhuma métrica válida são descartadas. O painel informa as contagens. A API limita a fonte a 8 MB e 50.000 linhas para evitar consultas sem limite; arquive registros antigos ao atingir esses limites.

## Git e GitHub pelo PowerShell

### 1. Instalar e conferir as ferramentas

O Git já estava instalado nesta máquina durante a preparação do projeto. O comando `gh` (GitHub CLI) não foi encontrado. No PowerShell, instale-o:

```powershell
winget install --id GitHub.cli --exact --source winget
```

Se também precisar instalar Git em outro computador, execute:

```powershell
winget install --id Git.Git --exact --source winget
```

Conclua as solicitações do instalador e **feche e reabra o terminal** para atualizar o PATH. No novo PowerShell:

```powershell
Set-Location -LiteralPath 'W:\ESP32_IoT\ESP32_IoT_DASHBOARD'
git --version
gh --version
```

O controle local deste projeto é preparado na branch `main`, com commit inicial e tag `v1.0.0`. Nenhum repositório remoto é criado por esses arquivos. As etapas seguintes publicam o histórico na conta que você selecionar.

Se o Git apresentar **detected dubious ownership**, a pasta foi criada por outro usuário do Windows. Como esta é a pasta conhecida do seu projeto, autorize **somente esse caminho** e repita o comando que falhou:

```powershell
git config --global --add safe.directory 'W:/ESP32_IoT/ESP32_IoT_DASHBOARD'
```

Não use `safe.directory '*'`, pois isso desabilita a verificação para todos os repositórios.

### 2. Desconectar a conta atual e conectar a conta desejada

Autenticação do GitHub, autoria dos commits e sessão do navegador são configurações diferentes. Trocar `git config user.name` não troca a conta usada para enviar código. O comando `gh auth logout` remove o login salvo pelo GitHub CLI; não encerra a sessão do navegador nem revoga automaticamente o token no GitHub.

Primeiro, confira as contas salvas:

```powershell
gh auth status --hostname github.com
```

Se houver uma conta salva, execute o comando abaixo e selecione a conta que deseja desconectar nas perguntas do terminal. Se não houver conta autenticada, pule esse logout:

```powershell
gh auth logout --hostname github.com
```

Se o Git ainda tentar usar credenciais antigas salvas por outro gerenciador, remova a credencial HTTPS **dessa conta** antes do novo login. Informe o nome de usuário antigo quando solicitado:

```powershell
$previousGitHubUser = Read-Host 'Nome da conta GitHub antiga'
if (-not [string]::IsNullOrWhiteSpace($previousGitHubUser)) {
    @('protocol=https', 'host=github.com', "username=$previousGitHubUser", '', '') -join "`n" | git credential reject
}
```

Se você já configurou tokens de automação em variáveis de ambiente, eles podem prevalecer sobre o login interativo. O comando abaixo remove somente essas variáveis **da sessão atual do terminal**, sem imprimir seus valores nem alterar variáveis persistentes do Windows:

```powershell
Remove-Item -Path Env:GH_TOKEN, Env:GITHUB_TOKEN -ErrorAction SilentlyContinue
```

No navegador que será usado para autorizar o login, entre na conta GitHub desejada. Se outra conta estiver aberta, use o menu do perfil para sair e entre com a conta correta. Então execute:

```powershell
gh auth login --hostname github.com --git-protocol https --web
```

Conclua o código de autenticação e a autorização no navegador. Depois, configure o Git para usar a autenticação do GitHub CLI, evitando reutilizar automaticamente uma conta diferente do gerenciador de credenciais:

```powershell
gh auth setup-git --hostname github.com
gh auth status --hostname github.com
gh api user --jq .login
```

**Confirme que o último comando mostra a conta em que você quer criar o repositório.** Não prossiga se a conta estiver errada. Essas etapas não desconectam automaticamente o GitHub do VS Code ou do GitHub Desktop; confira separadamente essas sessões se também usar tais aplicativos. A autoria de commits já existentes permanece no histórico.

### 3. Configurar a autoria e conferir o controle local

Copie este bloco. Ele solicita seu nome e e-mail de autoria; para privacidade, você pode usar o endereço `noreply` mostrado em **GitHub → Settings → Emails**. A configuração vale somente para este projeto:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location -LiteralPath 'W:\ESP32_IoT\ESP32_IoT_DASHBOARD'

    # Só inicializa se você estiver usando uma cópia sem a pasta .git.
    if (-not (Test-Path -LiteralPath '.git' -PathType Container)) {
        git init --initial-branch=main
        if ($LASTEXITCODE -ne 0) { throw 'Não foi possível inicializar o Git.' }
    }

    $gitAuthorName = Read-Host 'Nome que aparecerá nos próximos commits'
    $gitAuthorEmail = Read-Host 'E-mail verificado no GitHub ou endereço noreply'
    if ([string]::IsNullOrWhiteSpace($gitAuthorName) -or
        [string]::IsNullOrWhiteSpace($gitAuthorEmail)) {
        throw 'Informe nome e e-mail antes de continuar.'
    }
    git config --local user.name $gitAuthorName
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao configurar o nome.' }
    git config --local user.email $gitAuthorEmail
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao configurar o e-mail.' }

    git branch --show-current
    git status --short
    git check-ignore .env .env.production esp32IoT/ .venv/ __pycache__/
    git ls-files -- .env '.env.*' 'esp32IoT/*' '.venv/*'
}
```

A branch deve ser `main`. O comando `git check-ignore` deve listar os arquivos/pastas locais excluídos. O último comando pode mostrar **somente `.env.example`** entre os padrões de configuração: esse é o exemplo público, não suas credenciais. Se mostrar `.env`, `.env.production` ou arquivos dos ambientes Python, pare e corrija antes do envio. O `.gitignore` não remove automaticamente um segredo que já tenha sido versionado.

O commit inicial preparado usa a identidade Git disponível na máquina no momento de sua criação. O bloco acima define a autoria dos próximos commits; não reescreve o histórico existente.

### 4. Registrar o conteúdo e conferir a versão inicial

Antes do envio, pare o servidor local com **Ctrl+C** se ele estiver ocupando o terminal. Execute o bloco de inicialização do início deste README caso ainda não tenha criado `esp32IoT`. Instale as dependências de desenvolvimento e rode os testes:

```powershell
& {
    Set-Location -LiteralPath 'W:\ESP32_IoT\ESP32_IoT_DASHBOARD'
    .\esp32IoT\Scripts\python.exe -m pip install -r requirements-dev.txt
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências dos testes.' }
    .\esp32IoT\Scripts\python.exe -m pytest -q
    if ($LASTEXITCODE -ne 0) { throw 'Corrija os testes antes de publicar.' }
}
```

Só continue se os testes passarem. Confira o que será versionado:

```powershell
Set-Location -LiteralPath 'W:\ESP32_IoT\ESP32_IoT_DASHBOARD'
git status --short
git add --all
git diff --cached --stat
git diff --cached --name-only
```

Confira a lista. `.env` e ambientes virtuais não devem aparecer. Para registrar alterações pendentes, ou criar o primeiro commit de uma cópia sem histórico, execute:

```powershell
& {
    git diff --cached --quiet
    $stagedStatus = $LASTEXITCODE
    if ($stagedStatus -eq 1) {
        git commit -m 'chore: preparar dashboard ESP32 para GitHub e Render'
        if ($LASTEXITCODE -ne 0) { throw 'O commit falhou. Corrija a mensagem antes de continuar.' }
    } elseif ($stagedStatus -eq 0) {
        Write-Host 'Nenhuma alteração pendente para registrar.'
    } else {
        throw 'Não foi possível conferir as alterações preparadas.'
    }

    git rev-parse --verify HEAD
    if ($LASTEXITCODE -ne 0) { throw 'É necessário ter um commit antes do upload.' }

    $initialTag = git tag --list 'v1.0.0'
    if (-not $initialTag) {
        git tag -a v1.0.0 -m 'Versão inicial do dashboard ESP32 no Render'
        if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar a tag inicial.' }
    }
    git log -5 --oneline
    git tag --list
    git status --short
}
```

Se o projeto já estiver na versão inicial preparada, nenhum novo commit ou tag duplicada será criado. Tags já existentes não são movidas. Se fizer alterações posteriores, crie uma nova versão conforme a etapa 7.

### 5. Criar um repositório privado e enviar a pasta atual

Este bloco cria um repositório **privado** chamado `esp32-iot-dashboard` na conta autenticada, conecta o remote `origin` e envia a branch `main` e a tag inicial. Altere `$repositoryName` antes de executar se desejar outro nome. Ele deve estar disponível na sua conta:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location -LiteralPath 'W:\ESP32_IoT\ESP32_IoT_DASHBOARD'
    $repositoryName = 'esp32-iot-dashboard'
    $repositoryOwner = gh api user --jq .login
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repositoryOwner)) {
        throw 'Faça o login no GitHub antes de criar o repositório.'
    }
    $repositoryOwner = $repositoryOwner.Trim()

    $currentBranch = git branch --show-current
    if ($LASTEXITCODE -ne 0 -or $currentBranch -ne 'main') {
        throw 'Este envio inicial espera a branch main. Confira seu repositório.'
    }
    git rev-parse --verify HEAD *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Registre o commit inicial antes de continuar.' }

    $existingRemotes = @(git remote)
    if ($existingRemotes -contains 'origin') {
        throw 'Já existe um remote origin. Use as instruções de repositório existente abaixo.'
    }

    Write-Host "Criando repositório privado: $repositoryOwner/$repositoryName"
    gh repo create "$repositoryOwner/$repositoryName" --private --source . --remote origin
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o repositório. Confira se o nome já existe.' }

    git push --set-upstream origin main
    if ($LASTEXITCODE -ne 0) { throw 'O repositório foi criado, mas o push falhou. Confira a autenticação e use a recuperação abaixo.' }
    git push origin v1.0.0
    if ($LASTEXITCODE -ne 0) { throw 'A branch foi enviada, mas a tag não. Tente git push origin v1.0.0 novamente.' }

    git remote -v
    gh repo view --json nameWithOwner,url,visibility
}
```

O upload envia os arquivos registrados pelo Git, incluindo código, documentação e configuração. Ele não envia o ambiente Python nem o `.env` ignorado. O repositório privado não torna o dashboard do Render privado; a aplicação atual permite leitura dos dados a quem acessar a URL.

Se o repositório já existe, ou se a criação funcionou e apenas o push falhou, **não execute `gh repo create` novamente**. Confira primeiro:

```powershell
git remote -v
gh repo view 'SEU_USUARIO/esp32-iot-dashboard' --json nameWithOwner,url
```

Se não houver `origin`, conecte o repositório existente vazio (substitua `SEU_USUARIO` pela conta correta):

```powershell
git remote add origin 'https://github.com/SEU_USUARIO/esp32-iot-dashboard.git'
git push --set-upstream origin main
git push origin v1.0.0
```

Se `origin` já estiver correto, execute apenas os dois comandos `git push`. Se estiver errado, confira o destino antes de usar `git remote set-url origin 'https://github.com/SEU_USUARIO/esp32-iot-dashboard.git'`. Para um repositório criado pelo site do GitHub, deixe-o vazio: não adicione README, licença ou `.gitignore` pela interface antes desse primeiro envio. Se ele já contiver outros commits, integre o histórico antes de enviar; não use `push --force` para sobrescrevê-los.

### 6. Autorizar o GitHub no Render

Depois do upload, abra o Render na conta que hospedará o serviço. Em **Account Settings → Account Security → Git Deployment Credentials**, use **Add credential** e selecione GitHub. Conclua a autorização com a mesma conta que possui acesso ao repositório. Quando houver seleção de repositórios, conceda acesso ao `esp32-iot-dashboard`.

Se o Render já estiver conectado à conta anterior, adicione/selecione a credencial correta para o novo serviço. Não remova uma credencial usada por outros serviços sem conferir suas dependências. Um repositório que não aparece na lista normalmente exige revisar a conta conectada e o acesso concedido à integração no GitHub. Organizações podem exigir autorização do administrador.

Continue na seção **Deploy de produção no Render (WSGI)** logo abaixo. A troca de login no PowerShell não altera automaticamente a credencial de implantação do Render.

### 7. Publicar novas versões depois do primeiro deploy

Para uma correção futura, edite o código e atualize `VERSION` para `1.0.2`, adicionando a mudança ao `CHANGELOG.md`. A tag `v1.0.2` do exemplo abaixo é para essa próxima versão, não para repetir uma versão já publicada. Com o servidor local parado e as alterações revisadas:

```powershell
Set-Location -LiteralPath 'W:\ESP32_IoT\ESP32_IoT_DASHBOARD'
git switch main
git pull --ff-only origin main
.\esp32IoT\Scripts\python.exe -m pip install -r requirements-dev.txt
.\esp32IoT\Scripts\python.exe -m pytest -q
```

Só continue se os comandos anteriores e os testes terminarem com sucesso. Confira suas alterações e registre a nova versão:

```powershell
git status --short
git diff
git add --all
git diff --cached --stat
git commit -m 'fix: descrever a correção da versão 1.0.2'
git tag -a v1.0.2 -m 'Correções da versão 1.0.2'
git push origin main
git push origin v1.0.2
```

Pare se algum comando falhar. Se o Render estiver com **Auto-Deploy: After CI Checks Pass** na branch `main`, o push aguarda os testes do GitHub Actions antes de iniciar um novo deploy. Com **On Commit**, o deploy inicia sem aguardar os testes. A tag é uma referência de versão; o serviço acompanha `main`, não a tag. Se o auto-deploy estiver desativado, use **Manual Deploy → Deploy latest commit** no Render.

O workflow `.github/workflows/ci.yml` executa os testes no Linux com Python 3.12 e valida a configuração do Gunicorn a cada push ou pull request para `main`. Veja o resultado na aba **Actions** do repositório. Para versionar novas entregas, use PATCH (`1.0.1`) em correções, MINOR (`1.1.0`) em novas funcionalidades compatíveis e MAJOR (`2.0.0`) em mudanças incompatíveis; mantenha `VERSION`, `CHANGELOG.md` e a tag coerentes.

Para consultar o histórico:

```powershell
git status
git log --oneline --decorate -10
git tag --list
git show --stat v1.0.0
```

Para desfazer um commit normal já publicado, mantenha a árvore de trabalho limpa, atualize `main`, identifique o commit com `git log` e use `git revert SHA_DO_COMMIT`. Substitua o SHA antes de executar, resolva eventuais conflitos, revise e teste o resultado, e só então use `git push origin main`. Isso registra uma reversão sem apagar o histórico. Ao publicar a correção/reversão, registre uma nova versão e não mova tags existentes. No Render, o recurso de rollback também pode restaurar um deploy anterior; faça a reversão correspondente no Git para alinhar o próximo deploy.

Referências: [instalação do GitHub CLI](https://cli.github.com/), [logout](https://cli.github.com/manual/gh_auth_logout), [login](https://cli.github.com/manual/gh_auth_login), [autenticação do Git](https://cli.github.com/manual/gh_auth_setup-git), [criação de repositório](https://cli.github.com/manual/gh_repo_create) e [conexão Git no Render](https://render.com/docs/git-provider).

## Deploy de produção no Render (WSGI)

O arquivo `app.py` contém `app = Flask(...)` no nível do módulo. Esse objeto já implementa WSGI: **não é necessário adaptador ASGI/WSGI, arquivo `wsgi.py` nem servidor iniciado durante o import**. A configuração desativa debug e testing e retorna uma mensagem genérica em erros HTTP 500. O contrato JSON e os caminhos consumidos pelo frontend foram preservados.

As dependências de produção em `requirements.txt` são:

```text
Flask==3.1.3
gunicorn==26.2.0; sys_platform != 'win32'
python-dotenv==1.1.1
tzdata==2025.2
```

O `python-dotenv` carrega a configuração local sem sobrescrever as variáveis definidas no Render. O `tzdata` garante os fusos usados para interpretar as leituras. Não há adaptador específico do Render a instalar.

Envie ao Git os arquivos `app.py`, `sensor.py`, `VERSION`, `CHANGELOG.md`, `gunicorn.conf.py`, `render.yaml`, `.python-version`, `requirements.txt`, `.github/` e a pasta `static/`. Não envie `.env`, `esp32IoT/` ou `.venv/`. O arquivo `VERSION` é necessário para iniciar a aplicação. O Render usa a raiz do repositório por padrão; se o projeto estiver em uma subpasta, configure **Root Directory** e o caminho do Blueprint de acordo com essa estrutura.

Depois do upload e da autorização do GitHub, siga esta sequência no painel do Render:

1. Escolha **New → Web Service**, selecione a credencial GitHub correta e o repositório `esp32-iot-dashboard`.
2. Escolha a branch **main**, o nome **iot-esp32-dashboard** (ou outro disponível) e uma região adequada ao público do painel.
3. Deixe **Root Directory** vazio se `app.py` estiver na raiz do repositório. Se estiver numa subpasta, informe essa subpasta.
4. Escolha **Python 3** e um plano apropriado. O `render.yaml` usa o plano pago **Starter**; confirme o custo e a capacidade exibidos antes de criar o serviço.
5. Preencha as configurações abaixo. A porta `PORT` é fornecida pelo Render; não a fixe manualmente.

| Configuração | Valor |
| --- | --- |
| Branch | `main` |
| Language / Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn --config gunicorn.conf.py app:app` |
| Health Check Path | `/api/health` |
| Python | `.python-version` define `3.12` (Render seleciona o patch disponível dessa série) |

6. Em **Environment**, configure `SENSOR_TIMEZONE=America/Sao_Paulo`, `STALE_AFTER_SECONDS=180`, `WEB_CONCURRENCY=1`, `GUNICORN_THREADS=4` e `PYTHONUNBUFFERED=1`. Defina `SENSOR_NAME` como desejar. Se usar outra planilha, adicione `SENSOR_CSV_URL` com a URL CSV publicada; a planilha original já é o padrão. Não envie o arquivo `.env`.
7. Crie o serviço e acompanhe os logs de build e inicialização até o estado **Live**. Em **Settings → Auto-Deploy**, use **After CI Checks Pass** para as próximas atualizações, depois de confirmar que o workflow na aba **Actions** do GitHub executou com sucesso. O primeiro deploy também pode ser iniciado manualmente pelo painel.
8. Abra a URL atribuída pelo Render, teste as rotas abaixo e confirme a versão retornada por `/api/health`. Alterar o nome do serviço pode resultar em uma URL diferente; use sempre a URL mostrada no painel.

**Start Command exato:**

```sh
gunicorn --config gunicorn.conf.py app:app
```

Em `app:app`, o primeiro `app` é o módulo `app.py` e o segundo é a variável Flask. O arquivo `gunicorn.conf.py` lê `PORT` e configura o bind público `0.0.0.0`. Não é necessário definir a porta manualmente no Render.

Como alternativa ao cadastro manual, escolha **New → Blueprint**, conecte o repositório e aplique o **render.yaml** incluído. Ele já contém build, start, health check e variáveis iniciais. O Blueprint seleciona `plan: starter`, um plano pago, como ponto de partida para produção. Confira o plano e a capacidade desejados no Render antes de criar o serviço. O arquivo não cria nem publica recursos por conta própria. A fonte CSV original já é o padrão; para outra fonte, defina `SENSOR_CSV_URL` em **Environment**.

Escolha **uma** das opções (Web Service manual ou Blueprint) para evitar serviços duplicados. Se já existir um serviço para este projeto, ajuste seu repositório, branch e configurações pelo painel. O nome no Blueprint identifica um recurso; trocar esse nome pode criar outro serviço em vez de renomear o existente.

Após o deploy, verifique `https://SEU-SERVICO.onrender.com/api/health`, `/api/readings` e a página inicial. O health check verifica o processo da aplicação, sem depender da disponibilidade do Google Sheets. Monitore também a atualidade do sensor em `source.status`, a latência e os erros da fonte. Mudanças em variáveis exigem reinício/redeploy.

Para conferir pelo PowerShell, informe a URL **real** do serviço quando solicitado:

```powershell
$serviceUrl = (Read-Host 'URL HTTPS mostrada no Render, sem barra final').TrimEnd('/')
Invoke-RestMethod -Uri "$serviceUrl/api/health"
$sensorResponse = Invoke-RestMethod -Uri "$serviceUrl/api/readings?period=1h"
$sensorResponse.source
$sensorResponse.stats
```

A saúde deve retornar `status: ok`, `service: iot-dashboard` e `version: 1.0.0` na primeira entrega. Se o processo estiver saudável, mas a fonte falhar, confira a publicação da planilha e as variáveis de ambiente. Se o build falhar, confira os logs e `requirements.txt`; se não abrir porta, confira o Start Command e o bind em `gunicorn.conf.py`. Se o repositório não aparecer, revise a integração GitHub da etapa 6.

Referências: [Flask no Render](https://render.com/docs/deploy-flask), [Blueprint render.yaml](https://render.com/docs/blueprint-spec), [portas no Render](https://render.com/docs/web-services#port-binding) e [versão Python](https://render.com/docs/python-version).

## Concorrência, isolamento e memória

- **Dimensionamento inicial:** 1 processo com 4 threads (`gthread`). Esse é um ponto de partida, não uma garantia de capacidade. Ajuste `WEB_CONCURRENCY` e `GUNICORN_THREADS` medindo CPU, memória e latência; cada processo mantém sua própria cópia do cache e realiza suas próprias consultas à planilha. Aumentar workers aumenta o consumo de memória e a carga na origem.
- **Cache protegido:** um `threading.Lock` serializa atualizações por processo. Apenas o snapshot mais recente é mantido, sem anexar novos históricos indefinidamente. Os handlers tratam os registros do cache como somente leitura; filtros geram listas por requisição. Falhas sem cache também têm espera de 8 segundos antes de uma nova tentativa, evitando que threads repitam consultas de rede em sequência.
- **Isolamento:** a fonte pública é intencionalmente a mesma para todos os visitantes. Não guarde usuário, sessão, filtros ou credenciais em variáveis globais. Os filtros da API são locais à requisição e as preferências visuais ficam no navegador. A aplicação atual não cria sessões. Se adicionar autenticação, use `SECRET_KEY` forte via variável de ambiente, a mesma entre workers, e armazenamento compartilhado apropriado. Para dados privados de vários clientes, filtre e autorize por usuário/organização também no backend e inclua essa identidade nas chaves de cache.
- **Memória e I/O:** a fonte tem limite de 8 MB e 50.000 linhas, e a consulta externa tem timeout de socket de 12 segundos. Isso limita os dados mantidos pelo aplicativo, mas a memória transitória de parsing e serialização deve ser monitorada. A reciclagem após 1.000 requisições, com jitter de até 100, reduz o impacto de crescimento acumulado de memória; não substitui a investigação de vazamentos. O timeout de 60 segundos do Gunicorn monitora workers e não representa um prazo rígido por requisição com `gthread`.
- **Durabilidade:** não dependa de arquivos locais ou do cache para persistência. A planilha continua sendo a fonte do histórico. Para histórico próprio ou estado compartilhado entre instâncias, use um banco externo, como PostgreSQL, e cache compartilhado, como Redis, conforme a necessidade. Não inicie um loop de coleta em cada worker.
- **Operação:** debug e reload ficam desligados. Logs de acesso e erros do Gunicorn vão para stdout/stderr, visíveis no Render; não registre tokens, conteúdos de sensores privados ou dados pessoais. Há encerramento gracioso de até 30 segundos para os workers. Não foi configurado `ProxyFix`: só confie em headers de proxy depois de verificar a topologia e o número de proxies confiáveis.

A planilha original é pública e o dashboard não implementa autenticação: visitantes com acesso à URL podem ler os dados. Adicione autenticação e autorização antes de usar dados restritos. A fonte é definida exclusivamente no servidor; o visitante não consegue trocar a URL via API. As opções de cookies seguros já estão configuradas para futuras sessões HTTPS; elas não implementam login ou proteção CSRF por si só.

O `vercel.json` anterior foi atualizado para o preset Flask apenas para manter coerência com o objeto WSGI atual. Ele não é utilizado pelo Render. Na [integração nativa Flask da Vercel](https://vercel.com/docs/frameworks/backend/flask), `app.py:app` é detectado sem as rotas legadas de `@vercel/python`; o processo Gunicorn descrito aqui pertence ao deploy no Render.

## API

| Endpoint | Função |
| --- | --- |
| `GET /api/health` | Saúde da aplicação; não testa o sensor |
| `GET /api/readings?period=all` | Leituras, estatísticas, dispositivo e qualidade da fonte |
| `GET /api/readings?period=1h` | Também aceita `6h` e `24h` |

Quando a fonte falha sem cache, retorna HTTP 502 com mensagem amigável. Com cache disponível, retorna a última consulta bem-sucedida com `source.status=source_error`; `fetched_at` não é atualizado artificialmente. Nenhum dado local é mantido entre reinícios. A planilha permanece a fonte do histórico.

## Testar o projeto localmente no PowerShell

### 1. Preparar o ambiente e executar os testes automatizados

Se ainda não criou `esp32IoT`, execute o bloco **Iniciar no PowerShell com um único bloco** do início deste README. Quando o servidor iniciar, pare-o com **Ctrl+C** para liberar o terminal. Depois, copie e execute todo o bloco abaixo:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location -LiteralPath 'W:\ESP32_IoT\ESP32_IoT_DASHBOARD'
    $testPython = '.\esp32IoT\Scripts\python.exe'

    if (-not (Test-Path -LiteralPath $testPython -PathType Leaf)) {
        throw 'Crie o ambiente esp32IoT usando o bloco de inicialização do início deste README.'
    }

    & $testPython -m pip install -r requirements-dev.txt
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências de teste.' }

    & $testPython -m pytest -q
    if ($LASTEXITCODE -ne 0) { throw 'Há testes com falha. Confira as mensagens acima antes de continuar.' }

    if (Get-Command node -ErrorAction SilentlyContinue) {
        node --check static/app.js
        if ($LASTEXITCODE -ne 0) { throw 'Há um erro de sintaxe no JavaScript.' }
    } else {
        Write-Host 'Node não está instalado: verificação opcional de JavaScript ignorada.'
    }

    Write-Host 'Testes automatizados concluídos com sucesso.'
}
```

A suíte atual contém **16 testes**; procure o resultado `16 passed`. Ela verifica CSV, fusos, ordenação, decimais brasileiros, valores inválidos, leituras parciais, cache, falhas da fonte, filtros, atualidade das leituras, rotas HTTP, contrato WSGI e concorrência. Esses testes simulam a fonte externa e não precisam de um servidor aberto ou de acesso à planilha para executar. A instalação das dependências precisa de internet. Node é opcional e só verifica a sintaxe do JavaScript.

### 2. Subir o servidor no primeiro terminal

Depois dos testes, execute este bloco em um terminal PowerShell e mantenha-o aberto:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location -LiteralPath 'W:\ESP32_IoT\ESP32_IoT_DASHBOARD'
    .\esp32IoT\Scripts\python.exe -m flask --app app run --host 127.0.0.1 --port 8000 --no-debugger --no-reload
}
```

Espere a mensagem `Running on http://127.0.0.1:8000`. Esse terminal ficará ocupado pelo servidor. Abra [o dashboard local](http://127.0.0.1:8000) no navegador. Para os próximos comandos, abra **um segundo terminal PowerShell** no VS Code; não feche o primeiro.

### 3. Testar a página, a API e o arquivo GIF no segundo terminal

Com o servidor em execução, copie e execute todo este bloco no segundo terminal:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location -LiteralPath 'W:\ESP32_IoT\ESP32_IoT_DASHBOARD'
    $localBaseUrl = 'http://127.0.0.1:8000'
    $expectedVersion = (Get-Content -LiteralPath VERSION -Raw).Trim()

    Write-Host '1/4 - Conferindo página inicial...'
    $pageResponse = Invoke-WebRequest -Uri "$localBaseUrl/" -UseBasicParsing -TimeoutSec 30
    if ($pageResponse.StatusCode -ne 200) { throw 'A página inicial não retornou HTTP 200.' }

    Write-Host '2/4 - Conferindo saúde e versão...'
    $healthResponse = Invoke-RestMethod -Uri "$localBaseUrl/api/health" -TimeoutSec 30
    $healthResponse | Format-List
    if ($healthResponse.status -ne 'ok' -or $healthResponse.version -ne $expectedVersion) {
        throw 'Confira a saúde da aplicação e reinicie o servidor para carregar a versão atual.'
    }

    Write-Host '3/4 - Conferindo o GIF do ESP32...'
    $gifResponse = Invoke-WebRequest -Uri "$localBaseUrl/static/images/esp32-rings.gif" -Method Head -UseBasicParsing -TimeoutSec 30
    if ($gifResponse.StatusCode -ne 200 -or $gifResponse.Headers['Content-Type'] -notmatch '^image/gif') {
        throw 'O GIF não está sendo servido corretamente.'
    }
    Write-Host 'GIF disponível: HTTP 200, image/gif.'

    Write-Host '4/4 - Consultando leituras reais da planilha...'
    $readingsResponse = Invoke-RestMethod -Uri "$localBaseUrl/api/readings?period=1h" -TimeoutSec 30
    $readingsResponse.source | Format-List
    $readingsResponse.stats | ConvertTo-Json -Depth 4
    Write-Host ('Registros no período: ' + $readingsResponse.total)

    Write-Host 'Verificações HTTP concluídas. Confira também a interface no navegador.'
}
```

O health check deve retornar `status: ok`, `service: iot-dashboard` e a mesma versão do arquivo `VERSION` (**1.0.1** nesta entrega). A verificação do GIF usa `HEAD`, para conferir sua disponibilidade sem baixar os aproximadamente 10 MB a cada teste.

A consulta de leituras usa a **planilha real** e precisa de internet. O estado `online` indica uma leitura recente; `stale` significa que os registros estão antigos, e `source_error` indica falha na atualização com cache disponível. Esses estados não são, por si só, uma falha do servidor local. HTTP 502 nessa rota indica que não foi possível obter dados da fonte e não há cache disponível.

### 4. Conferir a interface e encerrar

No navegador, acesse <http://127.0.0.1:8000> e confira:

- A marca **IoT**, os indicadores e o gráfico de temperatura/umidade.
- Os filtros de período e os botões que mostram ou ocultam cada série.
- O cartão **Dispositivo conectado**, à direita do gráfico no desktop, exibindo o ESP32 animado. O GIF também pode ser aberto diretamente em <http://127.0.0.1:8000/static/images/esp32-rings.gif>. Em telas menores, esse cartão é ocultado pelo layout responsivo.
- O histórico, a busca, a paginação e a exportação CSV.
- As preferências e a alternância de tema claro/escuro.
- A versão atual no rodapé e o estado de atualização do sensor.

Se estiver vendo a imagem antiga, pressione **Ctrl+F5**. A checagem HTTP confirma o arquivo; a reprodução da animação deve ser conferida visualmente no navegador. Para parar o servidor, volte ao primeiro terminal e pressione **Ctrl+C**. Nenhum desses comandos faz upload para GitHub ou deploy no Render.

Se aparecer **conexão recusada**, confira se o primeiro terminal ainda mostra o servidor em execução e se você usou a mesma porta nas URLs. Se a porta 8000 estiver ocupada, pare a instância anterior no terminal correspondente ou escolha outra porta no comando de inicialização e em `$localBaseUrl`.

### Verificar Gunicorn no Linux/WSL (opcional)

No Linux/WSL, depois de instalar `requirements.txt`, valide também o carregamento do Gunicorn:

```sh
gunicorn --config gunicorn.conf.py --check-config app:app
```

A suíte WSGI pode ser executada no Windows; iniciar o Gunicorn e verificar os recursos reais do serviço requer Linux/WSL ou o ambiente Render. Nenhum deploy é realizado pelos testes.

## Organização

```text
app.py                  Objeto Flask/WSGI, rotas e entrega da interface
VERSION                 Versão SemVer usada pela aplicação
CHANGELOG.md            Histórico das entregas
.github/workflows/ci.yml Testes automáticos para main e pull requests
sensor.py               CSV, validação, estatísticas e cache
static/index.html       Interface em português
static/styles.css       Design responsivo e temas
static/app.js           Consultas, gráfico SVG e interações
tests/test_sensor.py    Testes de domínio e integração HTTP
gunicorn.conf.py        Porta, concorrência, logs e reciclagem de workers
render.yaml             Blueprint do serviço de produção no Render
vercel.json             Preset Flask opcional, não usado pelo Render
.env.example            Exemplo de configuração
post_esp32_iot.py        Referência original preservada
POST_ESP32_IoT.ipynb     Notebook original preservado
```
