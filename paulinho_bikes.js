"use strict";

const STORAGE_KEY = "paulinho_bikes_vendas";
const moneyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR");

let vendas = [];
let chartMensal = null;
let toastTimeout;

document.addEventListener("DOMContentLoaded", inicializarApp);

function inicializarApp() {
    const resultado = carregarVendas();
    vendas = resultado.vendas;
    configurarEventos();
    renderDashboard();
    renderListaCompleta();

    if (resultado.erro) {
        mostrarToast(resultado.erro);
    }
}

function configurarEventos() {
    document.querySelectorAll("[data-screen]").forEach(botao => {
        botao.addEventListener("click", () => mostrarTela(botao.dataset.screen, botao));
    });

    document.getElementById("formVenda").addEventListener("submit", salvarVenda);
    document.getElementById("telefone").addEventListener("input", mascararTelefone);
    document.getElementById("cpf").addEventListener("input", mascararCPF);
    document.getElementById("cep").addEventListener("input", mascararCEP);
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
    document.getElementById("cepVendaEditada").addEventListener("input", mascararCEP);
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
    document.getElementById("cepClienteEditado").addEventListener("input", mascararCEP);
    document.getElementById("modoGrafico").addEventListener("change", atualizarGrafico);
    document.getElementById("exportarDados").addEventListener("click", exportarDados);
    document.getElementById("importarBackup").addEventListener("click", () => {
        document.getElementById("arquivoBackup").click();
    });
    document.getElementById("arquivoBackup").addEventListener("change", importarDados);
    document.getElementById("limparSistema").addEventListener("click", limparSistema);
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
