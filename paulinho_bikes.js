"use strict";

const STORAGE_KEY = "paulinho_bikes_vendas";
const LEGACY_STORAGE_KEY = `${STORAGE_KEY}_legado`;
const LEGACY_OWNER_KEY = `${STORAGE_KEY}_legado_conta`;
const LEGACY_MODE_KEY = `${STORAGE_KEY}_legado_modo`;
const moneyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR");

let vendas = [];
let chartMensal = null;
let toastTimeout;
let clienteSupabase = null;
let usuarioAutenticado = null;
let canalVendas = null;
let filaSincronizacao = Promise.resolve();
let idsVendasNuvem = new Set();
let snapshotVendasNuvem = new Map();
let vendasLegadasNaAbertura = [];
let versaoLocalVendas = 0;
let contaCarregada = false;
let usuarioCarregandoId = null;
let recuperacaoSenhaAtiva = false;
let erroSincronizacaoConta = null;

document.addEventListener("DOMContentLoaded", inicializarApp);

async function inicializarApp() {
    const resultado = carregarVendas();
    vendas = resultado.vendas;
    vendasLegadasNaAbertura = [...vendas];
    configurarEventos();
    renderDashboard();
    renderListaCompleta();

    if (resultado.erro) {
        mostrarToast(resultado.erro);
    }

    const config = window.PAULINHO_SUPABASE_CONFIG || {};
    const url = typeof config.url === "string" ? config.url.trim() : "";
    const anonKey = typeof config.anonKey === "string" ? config.anonKey.trim() : "";
    if (!url && !anonKey) {
        atualizarEstadoContaLocal();
        document.body.classList.remove("auth-pending");
        return;
    }

    if (!url || !anonKey) {
        atualizarEstadoContaLocal();
        mostrarStatusConta("A URL e a chave pública do Supabase precisam estar preenchidas.", true);
        document.body.classList.remove("auth-pending");
        mostrarToast("Configuração do Supabase incompleta.");
        return;
    }

    document.body.classList.add("auth-required");
    document.getElementById("authGate").classList.remove("escondido");
    try {
        if (!window.supabase || typeof window.supabase.createClient !== "function") {
            throw new Error("Não foi possível carregar o serviço de contas. Verifique a conexão e recarregue a página.");
        }
        clienteSupabase = window.supabase.createClient(url, anonKey);
        document.getElementById("authStatus").textContent = "Verificando sua sessão...";
        document.getElementById("authStatus").classList.remove("auth-error");

        clienteSupabase.auth.onAuthStateChange((evento, sessao) => {
            if (evento === "PASSWORD_RECOVERY") {
                recuperacaoSenhaAtiva = true;
                document.body.classList.add("auth-required");
                document.getElementById("authGate").classList.remove("escondido");
                document.getElementById("formLogin").classList.add("escondido");
                document.getElementById("formRedefinirSenha").classList.remove("escondido");
                mostrarStatusAuth("Escolha uma nova senha para sua conta.");
                return;
            }
            window.setTimeout(() => {
                tratarSessao(sessao).catch(erro => tratarErroDeSessao(erro));
            }, 0);
        });
        const { data, error } = await clienteSupabase.auth.getSession();
        if (error) throw error;
        await tratarSessao(data.session);
    } catch (erro) {
        console.error("Não foi possível iniciar a conexão com a conta.", erro);
        mostrarStatusAuth(erro.message || "Não foi possível conectar ao serviço de contas.");
        document.getElementById("tentarNovamente").classList.remove("escondido");
        mostrarToast("Falha ao conectar à conta.");
    } finally {
        document.body.classList.remove("auth-pending");
    }
}

function configurarEventos() {
    document.querySelectorAll("[data-screen]").forEach(botao => {
        botao.addEventListener("click", () => mostrarTela(botao.dataset.screen, botao));
    });

    document.getElementById("formVenda").addEventListener("submit", salvarVenda);
    document.getElementById("telefone").addEventListener("input", mascararTelefone);
    document.getElementById("cpf").addEventListener("input", mascararCPF);
    configurarBuscaCEP("cep", "endereco");
    document.getElementById("metodoPagamento").addEventListener("change", atualizarParcelas);
    document.querySelectorAll('input[type="text"], input[type="search"]').forEach(input => {
        input.addEventListener("input", transformarEmMaiusculas);
    });
    document.getElementById("inputBusca").addEventListener("input", filtrarVendas);
    document.getElementById("buscaCliente").addEventListener("input", filtrarClientes);
    document.getElementById("lista-vendas-full").addEventListener("click", tratarAcaoVenda);
    document.getElementById("formEditarVenda").addEventListener("submit", salvarEdicaoVenda);
    document.getElementById("cancelarEdicaoVenda").addEventListener("click", () => {
        document.getElementById("dialogEditarVenda").close();
    });
    document.getElementById("telefoneVendaEditada").addEventListener("input", mascararTelefone);
    document.getElementById("cpfVendaEditada").addEventListener("input", mascararCPF);
    configurarBuscaCEP("cepVendaEditada", "enderecoVendaEditada");
    document.getElementById("metodoPagamentoVendaEditada").addEventListener("change", atualizarParcelasVendaEditada);
    document.getElementById("lista-clientes").addEventListener("click", tratarAcaoCliente);
    document.getElementById("formEditarCliente").addEventListener("submit", salvarEdicaoCliente);
    document.getElementById("cancelarEdicaoCliente").addEventListener("click", () => {
        document.getElementById("dialogEditarCliente").close();
    });
    document.getElementById("fecharComprovante").addEventListener("click", () => {
        document.getElementById("dialogComprovante").close();
    });
    document.getElementById("frameComprovante").addEventListener("load", () => {
        document.getElementById("imprimirComprovante").disabled = false;
    });
    document.getElementById("imprimirComprovante").addEventListener("click", imprimirComprovante);
    document.getElementById("telefoneClienteEditado").addEventListener("input", mascararTelefone);
    document.getElementById("cpfClienteEditado").addEventListener("input", mascararCPF);
    configurarBuscaCEP("cepClienteEditado", "enderecoClienteEditado");
    document.getElementById("modoGrafico").addEventListener("change", atualizarGrafico);
    document.getElementById("exportarDados").addEventListener("click", exportarDados);
    document.getElementById("importarBackup").addEventListener("click", () => {
        document.getElementById("arquivoBackup").click();
    });
    document.getElementById("arquivoBackup").addEventListener("change", importarDados);
    document.getElementById("limparSistema").addEventListener("click", limparSistema);
    window.addEventListener("focus", atualizarVendasAoRetomar);
    document.addEventListener("visibilitychange", atualizarVendasAoRetomar);
    window.addEventListener("online", () => {
        if (clienteSupabase && usuarioAutenticado && contaCarregada) {
            agendarSincronizacaoVendas();
        }
    });
    document.getElementById("formLogin").addEventListener("submit", entrarNaConta);
    document.getElementById("formRedefinirSenha").addEventListener("submit", salvarNovaSenha);
    document.getElementById("criarConta").addEventListener("click", criarConta);
    document.getElementById("recuperarSenha").addEventListener("click", recuperarSenha);
    document.getElementById("tentarNovamente").addEventListener("click", tentarConectarConta);
    document.getElementById("sairConta").addEventListener("click", sairDaConta);
    document.getElementById("importarDadosLegados").addEventListener("click", importarDadosLegados);
}

function atualizarEstadoContaLocal() {
    document.getElementById("accountDescription").textContent =
        "Sem uma conta configurada, seus dados ficam salvos somente neste dispositivo.";
    document.getElementById("accountSetupHint").classList.remove("escondido");
    mostrarStatusConta("Modo local ativo. Configure o Supabase para sincronizar entre dispositivos.");
}

function mostrarStatusConta(mensagem, erro = false) {
    const status = document.getElementById("accountStatus");
    status.textContent = mensagem;
    status.classList.toggle("account-error", erro);
}

function mostrarStatusAuth(mensagem, erro = false) {
    const status = document.getElementById("authStatus");
    status.textContent = mensagem;
    status.classList.toggle("auth-error", erro);
}

function atualizarControlesConta() {
    const autenticado = Boolean(usuarioAutenticado);
    document.getElementById("accountDescription").textContent = autenticado
        ? "Suas vendas estão vinculadas à sua conta e sincronizadas entre dispositivos."
        : "Entre com sua conta para acessar suas vendas sincronizadas.";
    document.getElementById("accountEmail").textContent = autenticado
        ? `Conectado como ${usuarioAutenticado.email || "usuário autenticado"}`
        : "";
    document.getElementById("accountEmail").classList.toggle("escondido", !autenticado);
    document.getElementById("sairConta").classList.toggle("escondido", !autenticado);
    document.getElementById("accountSetupHint").classList.add("escondido");
    atualizarBotaoImportacaoLegada();
}

function atualizarBotaoImportacaoLegada() {
    const botao = document.getElementById("importarDadosLegados");
    const donoLegado = localStorage.getItem(LEGACY_OWNER_KEY);
    const possuiArquivo = Boolean(localStorage.getItem(LEGACY_STORAGE_KEY));
    botao.classList.toggle(
        "escondido",
        !usuarioAutenticado || !possuiArquivo || donoLegado !== usuarioAutenticado.id
    );
}

async function tratarSessao(sessao) {
    const usuario = sessao && sessao.user;
    if (recuperacaoSenhaAtiva) {
        document.body.classList.add("auth-required");
        document.getElementById("authGate").classList.remove("escondido");
        return;
    }
    if (!usuario) {
        if (usuarioAutenticado) {
            if (canalVendas) {
                await clienteSupabase.removeChannel(canalVendas);
                canalVendas = null;
            }
            if (erroSincronizacaoConta) {
                try {
                    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(vendas));
                    localStorage.setItem(LEGACY_OWNER_KEY, usuarioAutenticado.id);
                    localStorage.setItem(LEGACY_MODE_KEY, "pendente");
                } catch (erro) {
                    console.error("Não foi possível preservar as alterações pendentes da conta.", erro);
                    mostrarToast("Não foi possível guardar as alterações pendentes neste dispositivo.");
                }
            }
            usuarioAutenticado = null;
            contaCarregada = false;
            erroSincronizacaoConta = null;
            idsVendasNuvem = new Set();
            snapshotVendasNuvem = new Map();
            vendas = [];
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (erro) {
                console.error("Não foi possível limpar o cache local da conta.", erro);
                mostrarToast("Não foi possível limpar os dados locais desta conta.");
            }
            renderizarDadosVendas();
        }
        document.body.classList.add("auth-required");
        document.getElementById("authGate").classList.remove("escondido");
        document.getElementById("tentarNovamente").classList.add("escondido");
        document.getElementById("formLogin").classList.remove("escondido");
        document.getElementById("formRedefinirSenha").classList.add("escondido");
        recuperacaoSenhaAtiva = false;
        mostrarStatusAuth("Entre ou crie uma conta para acessar suas vendas.");
        atualizarControlesConta();
        return;
    }

    if (usuarioAutenticado && usuarioAutenticado.id === usuario.id &&
        (contaCarregada || usuarioCarregandoId === usuario.id)) return;
    document.body.classList.add("auth-required");
    document.getElementById("authGate").classList.remove("escondido");
    document.getElementById("tentarNovamente").classList.add("escondido");
    mostrarStatusAuth("Carregando as vendas da sua conta...");
    usuarioAutenticado = usuario;
    contaCarregada = false;
    usuarioCarregandoId = usuario.id;

    try {
        const { data, error } = await clienteSupabase
            .from("vendas")
            .select("id,dados")
            .eq("user_id", usuario.id);
        if (error) throw error;
        if (!usuarioAutenticado || usuarioAutenticado.id !== usuario.id) return;

        const vendasRemotas = normalizarVendasRemotas(data);
        idsVendasNuvem = new Set(vendasRemotas.map(venda => String(venda.id)));
        snapshotVendasNuvem = new Map(vendasRemotas.map(venda => [String(venda.id), JSON.stringify(venda)]));
        vendas = vendasRemotas;

        const donoLegado = localStorage.getItem(LEGACY_OWNER_KEY);
        if (donoLegado === usuario.id && localStorage.getItem(LEGACY_STORAGE_KEY)) {
            try {
                const vendasArquivadas = lerVendasLegadas();
                if (vendasArquivadas.length > 0) {
                    document.getElementById("accountStatus").textContent =
                        "Há vendas antigas guardadas neste dispositivo. Você pode importá-las para esta conta.";
                }
            } catch (erro) {
                console.error("Não foi possível verificar as vendas antigas guardadas.", erro);
                mostrarToast("O arquivo local de vendas antigas está inválido; os dados da conta continuam disponíveis.");
            }
        } else if (!donoLegado && vendasLegadasNaAbertura.length > 0) {
            const quantidade = vendasLegadasNaAbertura.length;
            if (window.confirm(
                `Encontramos ${quantidade} venda(s) salva(s) neste dispositivo. Deseja importá-las para a conta ${usuario.email || "atual"}?`
            )) {
                const vendasLocais = vendasLegadasNaAbertura.filter(venda =>
                    !idsVendasNuvem.has(String(venda.id))
                );
                vendas = [...vendas, ...vendasLocais];
                localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(vendasLegadasNaAbertura));
                localStorage.setItem(LEGACY_OWNER_KEY, usuario.id);
                localStorage.setItem(LEGACY_MODE_KEY, "migracao");
                try {
                    await sincronizarVendasNuvem();
                    localStorage.removeItem(LEGACY_STORAGE_KEY);
                    localStorage.removeItem(LEGACY_MODE_KEY);
                } catch (erro) {
                    console.error("Não foi possível importar as vendas antigas para a conta.", erro);
                    mostrarToast("As vendas antigas foram mantidas neste dispositivo, mas não sincronizaram.");
                }
            } else {
                localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(vendasLegadasNaAbertura));
                localStorage.setItem(LEGACY_OWNER_KEY, usuario.id);
                localStorage.setItem(LEGACY_MODE_KEY, "migracao");
            }
        }

        persistirCacheVendas();
        contaCarregada = true;
        configurarCanalVendas(usuario.id);
        atualizarControlesConta();
        mostrarStatusConta("Conta conectada. Sincronização automática ativa.");
        document.getElementById("authGate").classList.add("escondido");
        document.body.classList.remove("auth-required");
        mostrarStatusAuth("Conta conectada.");
        document.getElementById("tentarNovamente").classList.add("escondido");
        renderizarDadosVendas();
    } catch (erro) {
        contaCarregada = false;
        throw erro;
    } finally {
        if (usuarioCarregandoId === usuario.id) usuarioCarregandoId = null;
    }
}

function tratarErroDeSessao(erro) {
    console.error("Não foi possível carregar os dados da conta.", erro);
    document.body.classList.add("auth-required");
    document.getElementById("authGate").classList.remove("escondido");
    document.getElementById("tentarNovamente").classList.remove("escondido");
    mostrarStatusAuth(erro.message || "Não foi possível carregar os dados da conta.", true);
    mostrarToast("Falha ao carregar os dados sincronizados.");
}

function normalizarVendasRemotas(registros) {
    if (!Array.isArray(registros)) {
        throw new Error("O serviço retornou uma lista de vendas inválida.");
    }
    return registros.map(registro => {
        if (!registro || typeof registro.id !== "string" || !vendaValida(registro.dados) ||
            String(registro.dados.id) !== registro.id) {
            throw new Error("Há uma venda inválida no banco. Nenhum dado local foi substituído.");
        }
        return normalizarVenda(registro.dados);
    });
}

function persistirCacheVendas() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(vendas));
    } catch (erro) {
        console.error("Não foi possível atualizar o cache local das vendas.", erro);
        mostrarToast("Os dados estão na conta, mas não puderam ser salvos neste dispositivo.");
    }
}

function agendarSincronizacaoVendas() {
    const sincronizacao = filaSincronizacao.then(() => sincronizarVendasNuvem());
    filaSincronizacao = sincronizacao.catch(erro => {
        erroSincronizacaoConta = erro;
        console.error("Não foi possível sincronizar as vendas.", erro);
        mostrarStatusConta("Sincronização pendente. Verifique a conexão e tente novamente.", true);
        mostrarToast("Não foi possível sincronizar. As alterações continuam salvas neste dispositivo.");
    });
    return sincronizacao;
}

async function sincronizarVendasNuvem() {
    if (!clienteSupabase || !usuarioAutenticado) return;
    const usuarioId = usuarioAutenticado.id;
    const vendasAtuais = [...vendas];
    const idsAtuais = new Set(vendasAtuais.map(venda => String(venda.id)));
    const vendasAlteradas = vendasAtuais.filter(venda =>
        snapshotVendasNuvem.get(String(venda.id)) !== JSON.stringify(venda)
    );
    if (vendasAlteradas.length > 0) {
        const registros = vendasAlteradas.map(venda => ({
            user_id: usuarioId,
            id: String(venda.id),
            dados: venda,
            updated_at: new Date().toISOString()
        }));
        const { error } = await clienteSupabase
            .from("vendas")
            .upsert(registros, { onConflict: "user_id,id" });
        if (error) throw error;
        vendasAlteradas.forEach(venda => {
            snapshotVendasNuvem.set(String(venda.id), JSON.stringify(venda));
        });
    }

    const removidos = [...idsVendasNuvem].filter(id => !idsAtuais.has(id));
    if (removidos.length > 0) {
        const { error } = await clienteSupabase
            .from("vendas")
            .delete()
            .eq("user_id", usuarioId)
            .in("id", removidos);
        if (error) throw error;
        removidos.forEach(id => snapshotVendasNuvem.delete(id));
    }

    if (usuarioAutenticado && usuarioAutenticado.id === usuarioId) {
        erroSincronizacaoConta = null;
        idsVendasNuvem = new Set(snapshotVendasNuvem.keys());
        mostrarStatusConta("Conta conectada. Sincronização automática ativa.");
        atualizarBotaoImportacaoLegada();
    }
}

function configurarCanalVendas(usuarioId) {
    if (canalVendas) {
        clienteSupabase.removeChannel(canalVendas);
    }
    canalVendas = clienteSupabase
        .channel(`vendas-${usuarioId}`)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "vendas",
            filter: `user_id=eq.${usuarioId}`
        }, () => agendarAtualizacaoVendasNuvem(usuarioId))
        .subscribe(estado => {
            if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
                console.error(`Canal de sincronização em tempo real: ${estado}.`);
                mostrarStatusConta("Sincronização em tempo real indisponível. Atualize a página para buscar alterações.", true);
            }
        });
}

function agendarAtualizacaoVendasNuvem(usuarioId) {
    const versaoSolicitada = versaoLocalVendas;
    filaSincronizacao = filaSincronizacao
        .then(async () => {
            if (!usuarioAutenticado || usuarioAutenticado.id !== usuarioId) return;
            if (erroSincronizacaoConta) return;
            const { data, error } = await clienteSupabase
                .from("vendas")
                .select("id,dados")
                .eq("user_id", usuarioId);
            if (error) throw error;
            if (versaoLocalVendas !== versaoSolicitada ||
                !usuarioAutenticado || usuarioAutenticado.id !== usuarioId) return;
            vendas = normalizarVendasRemotas(data);
            idsVendasNuvem = new Set(vendas.map(venda => String(venda.id)));
            snapshotVendasNuvem = new Map(vendas.map(venda => [String(venda.id), JSON.stringify(venda)]));
            persistirCacheVendas();
            renderizarDadosVendas();
        })
        .catch(erro => {
            console.error("Não foi possível atualizar as vendas recebidas de outro dispositivo.", erro);
            mostrarStatusConta("Não foi possível atualizar as vendas de outros dispositivos.", true);
            mostrarToast("Falha ao atualizar as vendas sincronizadas.");
        });
}

function atualizarVendasAoRetomar() {
    if (document.visibilityState === "hidden" || !usuarioAutenticado || !contaCarregada) return;
    agendarSincronizacaoVendas();
    agendarAtualizacaoVendasNuvem(usuarioAutenticado.id);
}

function renderizarDadosVendas() {
    renderDashboard();
    renderListaCompleta();
    filtrarClientes();
    filtrarVendas();
}

async function entrarNaConta(evento) {
    evento.preventDefault();
    const email = document.getElementById("authEmail");
    const senha = document.getElementById("authPassword");
    if (!email.reportValidity() || !senha.reportValidity()) return;
    try {
        mostrarStatusAuth("Entrando...");
        const { error } = await clienteSupabase.auth.signInWithPassword({
            email: email.value.trim(),
            password: senha.value
        });
        if (error) throw error;
    } catch (erro) {
        console.error("Não foi possível entrar na conta.", erro);
        mostrarStatusAuth(erro.message || "Não foi possível entrar. Confira o e-mail e a senha.", true);
    }
}

async function criarConta() {
    const email = document.getElementById("authEmail");
    const senha = document.getElementById("authPassword");
    if (!email.reportValidity() || !senha.reportValidity()) return;
    try {
        mostrarStatusAuth("Criando sua conta...");
        const { data, error } = await clienteSupabase.auth.signUp({
            email: email.value.trim(),
            password: senha.value
        });
        if (error) throw error;
        if (data.session) {
            await tratarSessao(data.session);
        } else {
            mostrarStatusAuth("Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.");
        }
    } catch (erro) {
        console.error("Não foi possível criar a conta.", erro);
        mostrarStatusAuth(erro.message || "Não foi possível criar a conta.", true);
    }
}

async function recuperarSenha() {
    const email = document.getElementById("authEmail");
    if (!email.reportValidity()) return;
    try {
        mostrarStatusAuth("Enviando instruções de recuperação...");
        const { error } = await clienteSupabase.auth.resetPasswordForEmail(email.value.trim(), {
            redirectTo: window.location.href
        });
        if (error) throw error;
        mostrarStatusAuth("Se esse e-mail estiver cadastrado, você receberá instruções para redefinir a senha.");
    } catch (erro) {
        console.error("Não foi possível enviar a recuperação de senha.", erro);
        mostrarStatusAuth(erro.message || "Não foi possível enviar o e-mail de recuperação.", true);
    }
}

async function salvarNovaSenha(evento) {
    evento.preventDefault();
    const senha = document.getElementById("novaSenha");
    if (!senha.reportValidity()) return;
    try {
        mostrarStatusAuth("Salvando a nova senha...");
        const { error } = await clienteSupabase.auth.updateUser({ password: senha.value });
        if (error) throw error;
        recuperacaoSenhaAtiva = false;
        contaCarregada = false;
        const { data, error: erroSessao } = await clienteSupabase.auth.getSession();
        if (erroSessao) throw erroSessao;
        await tratarSessao(data.session);
    } catch (erro) {
        console.error("Não foi possível atualizar a senha.", erro);
        mostrarStatusAuth(erro.message || "Não foi possível atualizar a senha.", true);
    }
}

async function tentarConectarConta() {
    try {
        mostrarStatusAuth("Verificando sua conexão...");
        const { data, error } = await clienteSupabase.auth.getSession();
        if (error) throw error;
        await tratarSessao(data.session);
    } catch (erro) {
        tratarErroDeSessao(erro);
    }
}

async function sairDaConta() {
    try {
        mostrarStatusConta("Salvando alterações antes de sair...");
        await agendarSincronizacaoVendas();
        const { error } = await clienteSupabase.auth.signOut();
        if (error) throw error;
    } catch (erro) {
        console.error("Não foi possível sair da conta.", erro);
        mostrarStatusConta(erro.message || "Não foi possível sair da conta.", true);
        mostrarToast("Não foi possível sair da conta.");
    }
}

function lerVendasLegadas() {
    const conteudo = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!conteudo) return [];
    const registros = JSON.parse(conteudo);
    if (!Array.isArray(registros) || registros.some(registro => !vendaValida(registro))) {
        throw new Error("As vendas antigas guardadas neste dispositivo estão inválidas.");
    }
    return registros.map(normalizarVenda);
}

async function importarDadosLegados() {
    if (!usuarioAutenticado) return;
    let vendasLegadas;
    try {
        vendasLegadas = lerVendasLegadas();
    } catch (erro) {
        console.error("Não foi possível ler as vendas antigas deste dispositivo.", erro);
        mostrarToast(erro.message || "Não foi possível ler as vendas antigas.");
        return;
    }
    if (vendasLegadas.length === 0) {
        mostrarToast("Não há vendas antigas para importar.");
        atualizarBotaoImportacaoLegada();
        return;
    }
    if (!window.confirm(`Importar ${vendasLegadas.length} venda(s) antigas para esta conta?`)) return;

    const vendasPorId = new Map(vendas.map(venda => [String(venda.id), venda]));
    const sobrescreverExistentes = localStorage.getItem(LEGACY_MODE_KEY) === "pendente";
    vendasLegadas.forEach(venda => {
        const id = String(venda.id);
        if (sobrescreverExistentes || !vendasPorId.has(id)) {
            vendasPorId.set(id, venda);
        }
    });
    vendas = [...vendasPorId.values()];
    try {
        versaoLocalVendas += 1;
        persistirCacheVendas();
        await agendarSincronizacaoVendas();
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        localStorage.removeItem(LEGACY_MODE_KEY);
        renderizarDadosVendas();
        atualizarBotaoImportacaoLegada();
        mostrarToast("Vendas antigas importadas para a conta.");
    } catch (erro) {
        console.error("Não foi possível importar as vendas antigas.", erro);
        mostrarStatusConta("A importação ficou pendente. As vendas continuam salvas neste dispositivo.", true);
        mostrarToast("Não foi possível concluir a importação. Tente novamente quando estiver online.");
    }
}

function carregarVendas() {
    try {
        const dados = localStorage.getItem(STORAGE_KEY);
        if (!dados) return { vendas: [], erro: "" };

        const registros = JSON.parse(dados);
        if (!Array.isArray(registros)) {
            return { vendas: [], erro: "Os dados salvos estão inválidos. Exporte um backup antes de continuar." };
        }

        return {
            vendas: registros.filter(vendaValida).map(normalizarVenda),
            erro: ""
        };
    } catch (erro) {
        console.error("Não foi possível carregar as vendas salvas.", erro);
        return {
            vendas: [],
            erro: "Não foi possível ler os dados salvos neste dispositivo."
        };
    }
}

function vendaValida(venda) {
    return venda !== null &&
        typeof venda === "object" &&
        typeof venda.cliente === "string" &&
        typeof venda.telefone === "string" &&
        typeof venda.marca === "string" &&
        Number.isFinite(Number(venda.valor)) &&
        Number(venda.valor) >= 0 &&
        (venda.metodoPagamento === undefined ||
            ["pix", "dinheiro", "cartao", "nao_informado"].includes(venda.metodoPagamento)) &&
        (venda.parcelas === undefined ||
            (Number.isInteger(Number(venda.parcelas)) && Number(venda.parcelas) >= 1 && Number(venda.parcelas) <= 12)) &&
        ["cpf", "cep", "endereco"].every(campo =>
            venda[campo] === undefined || typeof venda[campo] === "string"
        ) &&
        validarCPF(venda.cpf ?? "") &&
        validarCEP(venda.cep ?? "") &&
        typeof venda.data === "string" &&
        !Number.isNaN(Date.parse(venda.data));
}

function normalizarVenda(venda) {
    return {
        id: venda.id ?? criarId(),
        cliente: venda.cliente.trim().toLocaleUpperCase("pt-BR"),
        telefone: venda.telefone.trim(),
        cpf: formatarCPF(venda.cpf ?? ""),
        cep: formatarCEP(venda.cep ?? ""),
        endereco: String(venda.endereco ?? "").trim().toLocaleUpperCase("pt-BR"),
        marca: venda.marca.trim().toLocaleUpperCase("pt-BR"),
        aro: String(venda.aro ?? ""),
        valor: Number(venda.valor),
        quadro: String(venda.quadro ?? "").trim().toLocaleUpperCase("pt-BR"),
        metodoPagamento: venda.metodoPagamento ?? "nao_informado",
        parcelas: Number(venda.parcelas) || 1,
        data: venda.data
    };
}

function salvarVendas() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(vendas));
        versaoLocalVendas += 1;
        if (clienteSupabase && usuarioAutenticado) {
            agendarSincronizacaoVendas();
        }
        return true;
    } catch (erro) {
        console.error("Não foi possível salvar as vendas.", erro);
        mostrarToast("Não foi possível salvar. Verifique o espaço disponível no dispositivo.");
        return false;
    }
}

function criarId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mostrarTela(id, botao) {
    const tela = document.getElementById(id);
    if (!tela) return;

    document.querySelectorAll(".tela-app").forEach(secao => {
        secao.classList.toggle("escondido", secao !== tela);
    });

    document.querySelectorAll(".nav-item").forEach(item => {
        const ativo = item.dataset.screen === id;
        item.classList.toggle("active", ativo);
        if (ativo) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
    });

    if (id === "dashboard") renderDashboard();
    if (id === "pedidos") filtrarVendas();
    if (id === "clientes") filtrarClientes();

    if (botao && botao.closest(".bottom-nav")) {
        document.querySelector(".main-header").scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
}

function mostrarEstadoVazio(container, mensagem, icone = "fa-box-open") {
    const estado = criarElemento("div", "empty-state");
    const simbolo = criarElemento("i", `fa-solid ${icone}`);
    simbolo.setAttribute("aria-hidden", "true");
    estado.append(simbolo, criarElemento("p", "", mensagem));
    container.replaceChildren(estado);
}

function criarCartaoVenda(venda, incluirAcao = false) {
    const cartao = criarElemento("article", "order-card");
    const info = criarElemento("div", "order-info");
    info.append(
        criarElemento("h4", "", venda.cliente),
        criarElemento("p", "", `${venda.marca} (Aro ${venda.aro || "—"})`)
    );

    if (incluirAcao) {
        info.append(criarElemento("p", "", `Quadro: ${venda.quadro || "—"}`));
        info.append(criarElemento("p", "", formatarPagamento(venda)));
        const whatsapp = criarLinkWhatsApp(venda.telefone, "WhatsApp");
        if (whatsapp) info.append(whatsapp);
    }

    const preco = criarElemento("div", "order-price");
    preco.append(
        criarElemento("span", "price", formatarMoeda(venda.valor)),
        criarElemento("time", "date", formatarData(venda.data))
    );
    preco.lastElementChild.dateTime = venda.data;

    if (incluirAcao) {
        const imprimir = criarElemento("button", "print-sale", "Imprimir nota");
        imprimir.type = "button";
        imprimir.dataset.printId = String(venda.id);
        imprimir.setAttribute("aria-label", `Imprimir nota da venda de ${venda.cliente}`);
        const editar = criarElemento("button", "edit-sale", "Editar venda");
        editar.type = "button";
        editar.dataset.editSaleId = String(venda.id);
        editar.setAttribute("aria-label", `Editar venda de ${venda.cliente}`);
        const excluir = criarElemento("button", "delete-sale", "Excluir");
        excluir.type = "button";
        excluir.dataset.deleteId = String(venda.id);
        excluir.setAttribute("aria-label", `Excluir venda de ${venda.cliente}`);
        preco.append(imprimir, editar, excluir);
    }

    cartao.append(info, preco);
    return cartao;
}

function criarLinkWhatsApp(telefone, rotulo, compacto = false) {
    const digitos = String(telefone).replace(/\D/g, "");
    if (!digitos) return null;
    const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
    const link = criarElemento("a", compacto ? "whatsapp-link compact" : "whatsapp-link");
    link.href = `https://wa.me/${numero}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `${rotulo}: abrir conversa no WhatsApp`);
    const icone = criarElemento("i", "fa-brands fa-whatsapp");
    icone.setAttribute("aria-hidden", "true");
    link.append(icone);
    if (!compacto) link.append(document.createTextNode(` ${rotulo}`));
    return link;
}

function agregarClientes() {
    const clientes = new Map();

    vendas.forEach(venda => {
        const chave = venda.cliente.trim().toLocaleLowerCase("pt-BR");
        const cliente = clientes.get(chave);
        if (!cliente) {
            clientes.set(chave, {
                chave,
                nome: venda.cliente,
                telefone: venda.telefone,
                cpf: venda.cpf,
                cep: venda.cep,
                endereco: venda.endereco,
                ultimaCompra: venda.data,
                totalGasto: venda.valor,
                vendas: 1
            });
            return;
        }

        cliente.totalGasto += venda.valor;
        cliente.vendas += 1;
        if (Date.parse(venda.data) > Date.parse(cliente.ultimaCompra)) {
            cliente.ultimaCompra = venda.data;
            cliente.telefone = venda.telefone;
            cliente.cpf = venda.cpf || cliente.cpf;
            cliente.cep = venda.cep || cliente.cep;
            cliente.endereco = venda.endereco || cliente.endereco;
        }
    });

    return Array.from(clientes.values());
}

function renderClientes(lista = agregarClientes()) {
    const container = document.getElementById("lista-clientes");
    const ordenados = [...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (ordenados.length === 0) {
        mostrarEstadoVazio(container, "Nenhum cliente corresponde à busca.", "fa-users");
        return;
    }

    const fragmento = document.createDocumentFragment();
    ordenados.forEach(cliente => {
        const cartao = criarElemento("article", "order-card");
        const info = criarElemento("div", "order-info");
        info.append(
            criarElemento("h4", "", cliente.nome),
            criarElemento("p", "", cliente.telefone),
            criarElemento("p", "", `CPF: ${cliente.cpf || "—"} · CEP: ${cliente.cep || "—"}`),
            criarElemento("p", "", `Endereço: ${cliente.endereco || "—"}`),
            criarElemento("p", "", `Compras: ${cliente.vendas} · Total: ${formatarMoeda(cliente.totalGasto)}`)
        );
        const acao = criarElemento("div", "order-price");
        const whatsapp = criarLinkWhatsApp(cliente.telefone, `Conversar com ${cliente.nome}`, true);
        if (whatsapp) acao.append(whatsapp);
        const editar = criarElemento("button", "edit-client", "Editar");
        editar.type = "button";
        editar.dataset.editClient = cliente.chave;
        editar.setAttribute("aria-label", `Editar dados de ${cliente.nome}`);
        acao.append(editar);
        cartao.append(info, acao);
        fragmento.append(cartao);
    });
    container.replaceChildren(fragmento);
}

function tratarAcaoCliente(evento) {
    const botao = evento.target.closest("[data-edit-client]");
    if (!botao) return;
    const cliente = agregarClientes().find(item => item.chave === botao.dataset.editClient);
    if (!cliente) return;

    document.getElementById("chaveClienteOriginal").value = cliente.chave;
    document.getElementById("nomeClienteEditado").value = cliente.nome;
    document.getElementById("telefoneClienteEditado").value = cliente.telefone;
    document.getElementById("cpfClienteEditado").value = cliente.cpf;
    document.getElementById("cepClienteEditado").value = cliente.cep;
    document.getElementById("enderecoClienteEditado").value = cliente.endereco;
    document.getElementById("dialogEditarCliente").showModal();
}

function salvarEdicaoCliente(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    if (!formulario.reportValidity()) return;

    const chaveOriginal = document.getElementById("chaveClienteOriginal").value;
    const nome = document.getElementById("nomeClienteEditado").value.trim().toLocaleUpperCase("pt-BR");
    const telefone = document.getElementById("telefoneClienteEditado").value.trim();
    const cpf = formatarCPF(document.getElementById("cpfClienteEditado").value);
    const cep = formatarCEP(document.getElementById("cepClienteEditado").value);
    const endereco = document.getElementById("enderecoClienteEditado").value.trim().toLocaleUpperCase("pt-BR");
    const digitosTelefone = telefone.replace(/\D/g, "");
    if (!nome || digitosTelefone.length < 10 || digitosTelefone.length > 11) {
        mostrarToast("Informe um nome e um telefone com DDD válido.");
        return;
    }
    if (!validarCPF(cpf)) {
        mostrarToast("O CPF precisa ter 11 números. Confira o campo e tente novamente.");
        document.getElementById("cpfClienteEditado").focus();
        return;
    }
    if (!validarCEP(cep)) {
        mostrarToast("O CEP deve conter 8 números.");
        document.getElementById("cepClienteEditado").focus();
        return;
    }

    const vendasAnteriores = vendas;
    vendas = vendas.map(venda => {
        if (venda.cliente.trim().toLocaleLowerCase("pt-BR") !== chaveOriginal) return venda;
        return { ...venda, cliente: nome, telefone, cpf, cep, endereco };
    });

    if (!salvarVendas()) {
        vendas = vendasAnteriores;
        return;
    }
    document.getElementById("dialogEditarCliente").close();
    filtrarClientes();
    renderDashboard();
    filtrarVendas();
    mostrarToast("Dados do cliente atualizados em todas as vendas.");
}

function filtrarClientes() {
    const termo = normalizarBusca(document.getElementById("buscaCliente").value);
    const filtrados = agregarClientes().filter(cliente =>
        normalizarBusca(`${cliente.nome} ${cliente.telefone} ${cliente.cpf} ${cliente.cep} ${cliente.endereco}`).includes(termo)
    );
    renderClientes(filtrados);
}

function salvarVenda(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    if (!formulario.reportValidity()) return;

    const telefone = document.getElementById("telefone").value.trim();
    const digitosTelefone = telefone.replace(/\D/g, "");
    if (digitosTelefone.length < 10 || digitosTelefone.length > 11) {
        mostrarToast("Informe um telefone com DDD válido.");
        document.getElementById("telefone").focus();
        return;
    }

    const cpf = formatarCPF(document.getElementById("cpf").value);
    const cep = formatarCEP(document.getElementById("cep").value);
    if (!validarCPF(cpf)) {
        mostrarToast("O CPF precisa ter 11 números. Confira o campo e tente novamente.");
        document.getElementById("cpf").focus();
        return;
    }
    if (!validarCEP(cep)) {
        mostrarToast("O CEP deve conter 8 números.");
        document.getElementById("cep").focus();
        return;
    }

    const valor = Number(document.getElementById("valor").value);
    if (!Number.isFinite(valor) || valor < 0) {
        mostrarToast("Informe um valor válido para a venda.");
        document.getElementById("valor").focus();
        return;
    }

    const venda = {
        id: criarId(),
        cliente: document.getElementById("cliente").value.trim().toLocaleUpperCase("pt-BR"),
        telefone,
        cpf,
        cep,
        endereco: document.getElementById("endereco").value.trim().toLocaleUpperCase("pt-BR"),
        marca: document.getElementById("marca").value.trim().toLocaleUpperCase("pt-BR"),
        aro: document.getElementById("aro").value,
        valor,
        quadro: document.getElementById("quadro").value.trim().toLocaleUpperCase("pt-BR"),
        metodoPagamento: document.getElementById("metodoPagamento").value,
        parcelas: Number(document.getElementById("parcelas").value),
        data: new Date().toISOString()
    };

    if (!venda.cliente || !venda.marca) {
        mostrarToast("Preencha os campos obrigatórios.");
        return;
    }

    vendas.push(venda);
    if (!salvarVendas()) {
        vendas.pop();
        return;
    }

    formulario.reset();
    document.getElementById("valor").value = "0";
    atualizarParcelas();
    mostrarToast("Venda registrada com sucesso!");
    mostrarTela("dashboard");
}

function renderDashboard() {
    const agora = new Date();
    const vendasDoMes = vendas.filter(venda => {
        const data = new Date(venda.data);
        return data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear();
    });
    const faturamento = vendas.reduce((total, venda) => total + venda.valor, 0);
    const faturamentoMes = vendasDoMes.reduce((total, venda) => total + venda.valor, 0);

    document.getElementById("dash-total-vendas").textContent = String(vendas.length);
    document.getElementById("dash-vendas-mes").textContent = String(vendasDoMes.length);
    document.getElementById("dash-faturamento-total").textContent = formatarMoeda(faturamento);
    document.getElementById("dash-faturamento-mes").textContent = formatarMoeda(faturamentoMes);

    const recentes = [...vendas].sort((a, b) => Date.parse(b.data) - Date.parse(a.data)).slice(0, 3);
    const listaRecente = document.getElementById("lista-recente");
    if (recentes.length === 0) {
        mostrarEstadoVazio(listaRecente, "Nenhuma venda registrada ainda.");
    } else {
        listaRecente.replaceChildren(...recentes.map(venda => criarCartaoVenda(venda)));
    }
    atualizarGrafico();
}

function renderListaCompleta(lista = vendas) {
    const container = document.getElementById("lista-vendas-full");
    const ordenadas = [...lista].sort((a, b) => Date.parse(b.data) - Date.parse(a.data));
    if (ordenadas.length === 0) {
        const termo = document.getElementById("inputBusca").value.trim();
        mostrarEstadoVazio(container, termo ? "Nenhuma venda encontrada para essa busca." : "Nenhuma venda registrada ainda.");
        return;
    }
    container.replaceChildren(...ordenadas.map(venda => criarCartaoVenda(venda, true)));
}

function normalizarBusca(texto) {
    return String(texto).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function filtrarVendas() {
    const termo = normalizarBusca(document.getElementById("inputBusca").value.trim());
    const filtradas = vendas.filter(venda =>
        normalizarBusca(`${venda.cliente} ${venda.telefone} ${venda.quadro} ${venda.marca} ${venda.aro}`).includes(termo)
    );
    renderListaCompleta(filtradas);
}

function tratarAcaoVenda(evento) {
    const botaoEditar = evento.target.closest("[data-edit-sale-id]");
    if (botaoEditar) {
        abrirEdicaoVenda(botaoEditar.dataset.editSaleId);
        return;
    }
    const botaoNota = evento.target.closest("[data-print-id]");
    if (botaoNota) {
        imprimirNota(botaoNota.dataset.printId);
        return;
    }
    const botao = evento.target.closest("[data-delete-id]");
    if (!botao) return;
    excluirVenda(botao.dataset.deleteId);
}

function abrirEdicaoVenda(id) {
    const venda = vendas.find(item => String(item.id) === String(id));
    if (!venda) {
        mostrarToast("Não foi possível localizar esta venda.");
        return;
    }

    document.getElementById("idVendaEditada").value = String(venda.id);
    document.getElementById("clienteVendaEditada").value = venda.cliente;
    document.getElementById("telefoneVendaEditada").value = venda.telefone;
    document.getElementById("cpfVendaEditada").value = venda.cpf || "";
    document.getElementById("cepVendaEditada").value = venda.cep || "";
    document.getElementById("enderecoVendaEditada").value = venda.endereco || "";
    document.getElementById("marcaVendaEditada").value = venda.marca;
    document.getElementById("aroVendaEditada").value = venda.aro || "29";
    document.getElementById("valorVendaEditada").value = String(venda.valor);
    document.getElementById("metodoPagamentoVendaEditada").value =
        ["pix", "dinheiro", "cartao"].includes(venda.metodoPagamento) ? venda.metodoPagamento : "pix";
    document.getElementById("parcelasVendaEditada").value = String(venda.parcelas || 1);
    document.getElementById("quadroVendaEditada").value = venda.quadro || "";
    atualizarParcelasVendaEditada();
    document.getElementById("dialogEditarVenda").showModal();
}

function atualizarParcelasVendaEditada() {
    const cartaoSelecionado =
        document.getElementById("metodoPagamentoVendaEditada").value === "cartao";
    document.getElementById("grupoParcelasVendaEditada").classList.toggle("escondido", !cartaoSelecionado);
    document.getElementById("parcelasVendaEditada").disabled = !cartaoSelecionado;
}

function salvarEdicaoVenda(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    if (!formulario.reportValidity()) return;

    const id = document.getElementById("idVendaEditada").value;
    const indice = vendas.findIndex(venda => String(venda.id) === id);
    if (indice < 0) {
        mostrarToast("Esta venda não foi encontrada. Atualize a lista e tente novamente.");
        document.getElementById("dialogEditarVenda").close();
        return;
    }

    const telefone = document.getElementById("telefoneVendaEditada").value.trim();
    const digitosTelefone = telefone.replace(/\D/g, "");
    if (digitosTelefone.length < 10 || digitosTelefone.length > 11) {
        mostrarToast("Informe um telefone com DDD válido.");
        document.getElementById("telefoneVendaEditada").focus();
        return;
    }

    const cpf = formatarCPF(document.getElementById("cpfVendaEditada").value);
    const cep = formatarCEP(document.getElementById("cepVendaEditada").value);
    if (!validarCPF(cpf)) {
        mostrarToast("O CPF precisa ter 11 números. Confira o campo e tente novamente.");
        document.getElementById("cpfVendaEditada").focus();
        return;
    }
    if (!validarCEP(cep)) {
        mostrarToast("O CEP deve conter 8 números.");
        document.getElementById("cepVendaEditada").focus();
        return;
    }

    const valor = Number(document.getElementById("valorVendaEditada").value);
    if (!Number.isFinite(valor) || valor < 0) {
        mostrarToast("Informe um valor válido para a venda.");
        document.getElementById("valorVendaEditada").focus();
        return;
    }

    const anterior = vendas[indice];
    vendas[indice] = {
        ...anterior,
        cliente: document.getElementById("clienteVendaEditada").value.trim().toLocaleUpperCase("pt-BR"),
        telefone,
        cpf,
        cep,
        endereco: document.getElementById("enderecoVendaEditada").value.trim().toLocaleUpperCase("pt-BR"),
        marca: document.getElementById("marcaVendaEditada").value.trim().toLocaleUpperCase("pt-BR"),
        aro: document.getElementById("aroVendaEditada").value,
        valor,
        quadro: document.getElementById("quadroVendaEditada").value.trim().toLocaleUpperCase("pt-BR"),
        metodoPagamento: document.getElementById("metodoPagamentoVendaEditada").value,
        parcelas: Number(document.getElementById("parcelasVendaEditada").value)
    };

    if (!salvarVendas()) {
        vendas[indice] = anterior;
        return;
    }

    document.getElementById("dialogEditarVenda").close();
    filtrarVendas();
    filtrarClientes();
    renderDashboard();
    mostrarToast("Venda atualizada com sucesso.");
}

function excluirVenda(id) {
    const venda = vendas.find(item => String(item.id) === String(id));
    if (!venda || !window.confirm(`Deseja excluir a venda de ${venda.cliente}?`)) return;

    const vendasAnteriores = vendas;
    vendas = vendas.filter(item => String(item.id) !== String(id));
    if (!salvarVendas()) {
        vendas = vendasAnteriores;
        return;
    }
    renderDashboard();
    filtrarVendas();
    mostrarToast("Venda removida.");
}

function atualizarGrafico() {
    const canvas = document.getElementById("chartMensal");
    const fallback = document.getElementById("chart-fallback");
    if (typeof Chart === "undefined") {
        canvas.classList.add("escondido");
        fallback.classList.remove("escondido");
        return;
    }

    canvas.classList.remove("escondido");
    fallback.classList.add("escondido");
    const ano = new Date().getFullYear();
    const faturamentoMensal = Array(12).fill(0);
    const quantidadeMensal = Array(12).fill(0);

    vendas.forEach(venda => {
        const data = new Date(venda.data);
        if (!Number.isNaN(data.getTime()) && data.getFullYear() === ano) {
            faturamentoMensal[data.getMonth()] += venda.valor;
            quantidadeMensal[data.getMonth()] += 1;
        }
    });

    const modo = document.getElementById("modoGrafico").value;
    const exibindoFaturamento = modo === "faturamento";
    const valores = exibindoFaturamento ? faturamentoMensal : quantidadeMensal;
    document.getElementById("titulo-grafico").textContent =
        `${exibindoFaturamento ? "Faturamento" : "Quantidade de vendas"} por mês (${ano})`;
    canvas.setAttribute(
        "aria-label",
        `Gráfico mensal de ${exibindoFaturamento ? "faturamento em reais" : "quantidade de vendas"} em ${ano}`
    );

    if (chartMensal) chartMensal.destroy();
    chartMensal = new Chart(canvas, {
        type: "bar",
        data: {
            labels: Array.from({ length: 12 }, (_, mes) =>
                new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(ano, mes, 1))
            ),
            datasets: [{
                label: exibindoFaturamento ? "Faturamento" : "Vendas",
                data: valores,
                backgroundColor: "#FFD700",
                borderRadius: 6,
                maxBarThickness: 28
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: contexto => exibindoFaturamento
                            ? formatarMoeda(contexto.parsed.y)
                            : `${contexto.parsed.y} ${contexto.parsed.y === 1 ? "venda" : "vendas"}`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#b8b8b8" } },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#b8b8b8",
                        callback: valor => exibindoFaturamento
                            ? new Intl.NumberFormat("pt-BR", {
                                notation: "compact",
                                maximumFractionDigits: 1
                            }).format(valor)
                            : Number.isInteger(Number(valor)) ? valor : ""
                    },
                    grid: { color: "rgba(255,255,255,0.08)" }
                }
            }
        }
    });
}

function atualizarParcelas() {
    const cartaoSelecionado = document.getElementById("metodoPagamento").value === "cartao";
    const grupo = document.getElementById("grupoParcelas");
    grupo.classList.toggle("escondido", !cartaoSelecionado);
    document.getElementById("parcelas").disabled = !cartaoSelecionado;
}

function transformarEmMaiusculas(evento) {
    const campo = evento.currentTarget;
    const inicio = campo.selectionStart;
    const fim = campo.selectionEnd;
    campo.value = campo.value.toLocaleUpperCase("pt-BR");
    if (inicio !== null && fim !== null) campo.setSelectionRange(inicio, fim);
}

function formatarPagamento(venda) {
    const valorParcela = formatarMoeda(venda.valor / (Number(venda.parcelas) || 1));
    const metodos = {
        pix: "PIX",
        dinheiro: "Dinheiro físico",
        cartao: `Cartão · ${venda.parcelas}x de ${valorParcela}`,
        nao_informado: "Não informado"
    };
    return `Pagamento: ${metodos[venda.metodoPagamento] || "Não informado"}`;
}

function escaparHtml(valor) {
    return String(valor).replace(/[&<>"']/g, caractere => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[caractere]);
}

function imprimirNota(id) {
    const venda = vendas.find(item => String(item.id) === String(id));
    if (!venda) {
        mostrarToast("Não foi possível localizar esta venda.");
        return;
    }

    const informacoes = [
        ["WhatsApp", venda.telefone, "contact"],
        ["CPF", venda.cpf || "Não informado", "contact"],
        ["CEP", venda.cep || "Não informado", "contact"],
        ["Endereço", venda.endereco || "Não informado", "address"],
        ["Bicicleta", `${venda.marca} · Aro ${venda.aro || "—"}`, "bike"],
        ["Número do quadro", venda.quadro || "Não informado", "frame"],
        ["Pagamento", formatarPagamento(venda).replace(/^Pagamento:\s*/, ""), "payment"],
        ["Data da venda", formatarData(venda.data), "date"]
    ];
    const conteudo = informacoes.map(([rotulo, valor, classe]) =>
        `<div class="detail-card ${classe}"><span class="detail-label">${escaparHtml(rotulo)}</span><strong>${escaparHtml(valor)}</strong></div>`
    ).join("");

    const html = `<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="theme-color" content="#121212">
            <title>Comprovante de venda - ${escaparHtml(venda.cliente)}</title>
            <style>
                :root { color-scheme: light; --black: #121212; --yellow: #ffd700; --ink: #202020; --muted: #686868; }
                * { box-sizing: border-box; }
                body { max-width: 760px; margin: 36px auto; padding: 0 24px 28px; color: var(--ink); font: 15px/1.5 Arial, sans-serif; }
                .receipt { overflow: hidden; border: 1px solid #dedede; border-radius: 16px; box-shadow: 0 12px 36px #00000012; }
                .brand { display: flex; align-items: center; gap: 16px; padding: 24px 28px; border-bottom: 5px solid var(--yellow); background: var(--black); color: white; }
                .brand-mark { display: grid; width: 54px; height: 54px; flex: 0 0 54px; place-items: center; border-radius: 14px; background: var(--yellow); color: var(--black); font-size: 29px; font-weight: 900; }
                .brand h1 { margin: 0; font-size: 24px; font-weight: 900; letter-spacing: .3px; }
                .brand h1 span { color: var(--yellow); }
                .brand p { margin: 4px 0 0; color: #dedede; font-size: 11px; font-weight: 700; letter-spacing: 2px; }
                .receipt-content { padding: 28px; }
                .receipt-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
                .receipt-heading h2 { margin: 0 0 5px; font-size: 21px; }
                .receipt-heading p { margin: 0; color: var(--muted); font-size: 13px; }
                .sale-id { padding: 7px 10px; border: 1px solid #e2bd00; border-radius: 8px; background: #fff8cc; color: #554700; font-size: 11px; font-weight: 800; }
                .details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
                .detail-card { min-width: 0; padding: 15px 16px; border: 1px solid #e4e4e4; border-left: 4px solid var(--yellow); border-radius: 10px; background: #fafafa; }
                .detail-label { display: block; margin-bottom: 5px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .65px; text-transform: uppercase; }
                .detail-card strong { display: block; overflow-wrap: anywhere; font-size: 15px; }
                .detail-card.bike { grid-column: 1 / -1; background: #fffdf0; }
                .detail-card.bike strong { font-size: 18px; }
                .detail-card.address { grid-column: 1 / -1; }
                .detail-card.payment { background: #fffdf0; }
                .total { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 22px 0 0; padding: 19px 20px; border-radius: 12px; background: var(--yellow); color: var(--black); }
                .total span { font-size: 13px; font-weight: 900; letter-spacing: 1px; }
                .total strong { font-size: clamp(24px, 5vw, 32px); font-weight: 900; }
                .legal { margin: 18px 0 0; color: var(--muted); font-size: 11px; text-align: center; }
                @media (max-width: 520px) {
                    body { margin: 16px auto; padding: 0 12px 20px; }
                    .brand, .receipt-content { padding: 20px; }
                    .brand-mark { width: 46px; height: 46px; flex-basis: 46px; }
                    .brand h1 { font-size: 20px; }
                    .receipt-heading { flex-direction: column; gap: 10px; }
                    .details { grid-template-columns: 1fr; }
                    .detail-card.bike, .detail-card.address { grid-column: auto; }
                }
                @media print {
                    @page { size: A4 portrait; margin: 8mm; }
                    html, body { width: 100%; height: auto; }
                    body { max-width: none; margin: 0; padding: 0; font-size: 10pt; line-height: 1.3; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                    .receipt { overflow: visible; border-color: #d5d5d5; border-radius: 0; box-shadow: none; break-inside: avoid; page-break-inside: avoid; }
                    .brand { gap: 10px; padding: 12px 18px; border-bottom-width: 3px; }
                    .brand-mark { width: 40px; height: 40px; flex-basis: 40px; border-radius: 9px; font-size: 21px; }
                    .brand h1 { font-size: 18pt; }
                    .brand p { margin-top: 2px; font-size: 8pt; letter-spacing: 1.4px; }
                    .receipt-content { padding: 14px 18px; }
                    .receipt-heading { gap: 12px; margin-bottom: 12px; }
                    .receipt-heading h2 { margin-bottom: 2px; font-size: 15pt; }
                    .receipt-heading p { font-size: 9pt; }
                    .sale-id { padding: 5px 8px; font-size: 8pt; }
                    .details { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
                    .detail-card { padding: 8px 10px; border-radius: 6px; }
                    .detail-label { margin-bottom: 2px; font-size: 7.5pt; letter-spacing: .4px; }
                    .detail-card strong { font-size: 9.5pt; }
                    .detail-card.bike { grid-column: 1 / -1; }
                    .detail-card.bike strong { font-size: 11pt; }
                    .detail-card.address { grid-column: 1 / -1; }
                    .total { gap: 10px; margin-top: 12px; padding: 11px 14px; border-radius: 7px; }
                    .total span { font-size: 9pt; }
                    .total strong { font-size: 20pt; }
                    .legal { margin-top: 9px; font-size: 8pt; }
                }
            </style>
        </head>
        <body>
            <main class="receipt">
                <header class="brand">
                    <div class="brand-mark" aria-hidden="true">PB</div>
                    <div>
                        <h1>PAULINHO<span>BIKES</span></h1>
                        <p>SUA PRÓXIMA AVENTURA COMEÇA AQUI</p>
                    </div>
                </header>
                <section class="receipt-content">
                    <div class="receipt-heading">
                        <div>
                            <h2>Comprovante de venda</h2>
                            <p>Confira os dados e as informações do pedido.</p>
                        </div>
                        <span class="sale-id">VENDA Nº ${escaparHtml(String(venda.id))}</span>
                    </div>
                    <div class="details">
                        <div class="detail-card customer">
                            <span class="detail-label">Cliente</span>
                            <strong>${escaparHtml(venda.cliente)}</strong>
                        </div>
                        ${conteudo}
                    </div>
                    <div class="total">
                        <span>VALOR TOTAL</span>
                        <strong>${escaparHtml(formatarMoeda(venda.valor))}</strong>
                    </div>
                    <p class="legal">Este comprovante não substitui uma nota fiscal.</p>
                </section>
            </main>
        </body>
        </html>`;

    const frame = document.getElementById("frameComprovante");
    document.getElementById("imprimirComprovante").disabled = true;
    frame.srcdoc = html;
    document.getElementById("dialogComprovante").showModal();
}

function imprimirComprovante() {
    const frame = document.getElementById("frameComprovante");
    if (!frame.contentWindow || document.getElementById("imprimirComprovante").disabled) {
        mostrarToast("O comprovante ainda está carregando. Tente novamente.");
        return;
    }
    frame.contentWindow.focus();
    frame.contentWindow.print();
}

function formatarMoeda(valor) {
    return moneyFormatter.format(Number.isFinite(Number(valor)) ? Number(valor) : 0);
}

function formatarData(valor) {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? "Data inválida" : dateFormatter.format(data);
}

function mascararTelefone(evento) {
    const digitos = evento.target.value.replace(/\D/g, "").slice(0, 11);
    const ddd = digitos.slice(0, 2);
    const numero = digitos.slice(2);
    if (digitos.length < 3) {
        evento.target.value = ddd ? `(${ddd}` : "";
    } else if (numero.length > 4) {
        const tamanhoParteFinal = numero.length > 8 ? 5 : 4;
        evento.target.value = `(${ddd}) ${numero.slice(0, -tamanhoParteFinal)}-${numero.slice(-tamanhoParteFinal)}`;
    } else {
        evento.target.value = `(${ddd}) ${numero}`;
    }
}

function mascararCPF(evento) {
    const digitos = evento.target.value.replace(/\D/g, "").slice(0, 11);
    evento.target.value = digitos
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function configurarBuscaCEP(cepId, enderecoId) {
    const campoCEP = document.getElementById(cepId);
    campoCEP.addEventListener("input", mascararCEP);
    campoCEP.addEventListener("input", () => {
        const digitos = campoCEP.value.replace(/\D/g, "");
        if (digitos.length === 8) {
            buscarEnderecoPorCEP(campoCEP, document.getElementById(enderecoId), digitos);
        }
    });
}

async function buscarEnderecoPorCEP(campoCEP, campoEndereco, cepConsultado) {
    const enderecoInicial = campoEndereco.value;
    try {
        const resposta = await fetch(`https://viacep.com.br/ws/${cepConsultado}/json/`, {
            headers: { Accept: "application/json" }
        });
        if (!resposta.ok) {
            throw new Error(`O serviço de CEP respondeu com o status ${resposta.status}.`);
        }
        const dados = await resposta.json();
        if (campoCEP.value.replace(/\D/g, "") !== cepConsultado) return;
        if (dados.erro) {
            mostrarToast("CEP não encontrado. Confira os números e tente novamente.");
            return;
        }

        const cidade = dados.localidade && dados.uf
            ? `${dados.localidade}/${dados.uf}`
            : dados.localidade || dados.uf || "";
        const partesEndereco = [dados.logradouro, dados.bairro, cidade]
            .filter(parte => typeof parte === "string" && parte.trim())
            .map(parte => parte.trim());
        if (partesEndereco.length === 0) {
            throw new Error("O serviço não retornou um endereço para esse CEP.");
        }
        if (campoEndereco.value !== enderecoInicial) return;
        campoEndereco.value = partesEndereco.join(", ").toLocaleUpperCase("pt-BR");
        mostrarToast("Endereço preenchido pelo CEP.");
    } catch (erro) {
        if (campoCEP.value.replace(/\D/g, "") !== cepConsultado) return;
        console.error("Não foi possível consultar o endereço pelo CEP.", erro);
        mostrarToast("Não foi possível buscar o CEP. Verifique a conexão e tente novamente.");
    }
}

function mascararCEP(evento) {
    const digitos = evento.target.value.replace(/\D/g, "").slice(0, 8);
    evento.target.value = digitos.length > 5
        ? `${digitos.slice(0, 5)}-${digitos.slice(5)}`
        : digitos;
}

function formatarCPF(valor) {
    const digitos = String(valor).replace(/\D/g, "").slice(0, 11);
    if (digitos.length !== 11) return digitos;
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatarCEP(valor) {
    const digitos = String(valor).replace(/\D/g, "").slice(0, 8);
    return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

function validarCEP(valor) {
    const digitos = String(valor).replace(/\D/g, "");
    return digitos.length === 0 || digitos.length === 8;
}

function validarCPF(valor) {
    const digitos = String(valor).replace(/\D/g, "");
    return digitos.length === 0 || digitos.length === 11;
}

function mostrarToast(mensagem) {
    const toast = document.getElementById("toast");
    toast.textContent = mensagem;
    toast.classList.add("show");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("show"), 3500);
}

function limparSistema() {
    if (!window.confirm("Cuidado: isso apagará todas as vendas salvas neste dispositivo. Deseja continuar?")) return;
    const vendasAnteriores = vendas;
    vendas = [];
    if (!salvarVendas()) {
        vendas = vendasAnteriores;
        return;
    }
    renderDashboard();
    filtrarVendas();
    filtrarClientes();
    mostrarToast("Todas as vendas foram apagadas.");
}

function exportarDados() {
    try {
        const conteudo = JSON.stringify(vendas, null, 2);
        const arquivo = new Blob([conteudo], { type: "application/json" });
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement("a");
        link.href = url;
        link.download = `backup-paulinho-bikes-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        mostrarToast("Backup baixado com sucesso.");
    } catch (erro) {
        console.error("Não foi possível exportar o backup.", erro);
        mostrarToast("Não foi possível criar o backup.");
    }
}

async function importarDados(evento) {
    const input = evento.currentTarget;
    const arquivo = input.files[0];
    if (!arquivo) return;

    try {
        const conteudo = await arquivo.text();
        const dados = JSON.parse(conteudo);
        const registros = Array.isArray(dados) ? dados : dados && dados.vendas;
        if (!Array.isArray(registros) || registros.some(registro => !vendaValida(registro))) {
            throw new Error("O arquivo não contém um backup de vendas válido.");
        }

        if (!window.confirm(`O backup contém ${registros.length} venda(s). Ele substituirá os dados atuais. Continuar?`)) {
            return;
        }

        const vendasAnteriores = vendas;
        vendas = registros.map(normalizarVenda);
        if (!salvarVendas()) {
            vendas = vendasAnteriores;
            return;
        }
        renderDashboard();
        filtrarVendas();
        filtrarClientes();
        mostrarToast("Backup restaurado com sucesso.");
    } catch (erro) {
        console.error("Não foi possível importar o backup.", erro);
        mostrarToast(erro instanceof SyntaxError ? "O arquivo não é um JSON válido." : erro.message || "Não foi possível ler o backup.");
    } finally {
        input.value = "";
    }
}
