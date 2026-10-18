/* 
    PAULINHO BIKES - LÓGICA DO APP
*/

const STORAGE_KEY = "paulinho_bikes_vendas";
let vendas = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let chartAros = null;

document.addEventListener("DOMContentLoaded", () => {
    inicializarApp();
});

function inicializarApp() {
    renderDashboard();
    renderListaCompleta();
    configurarMascaras();
}

// TROCA DE TELAS
function mostrarTela(id, btn) {
    // Esconder todas as telas
    document.querySelectorAll(".tela-app").forEach(t => t.classList.add("escondido"));
    
    // Mostrar a selecionada
    document.getElementById(id).classList.remove("escondido");

    // Atualizar menu inferior
    if (btn) {
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        btn.classList.add("active");
    }

    // Ações específicas ao abrir tela
    if (id === 'dashboard') {
        renderDashboard();
    } else if (id === 'pedidos') {
        renderListaCompleta();
    } else if (id === 'clientes') {
        renderClientes();
    }
}

// RENDERIZAR CLIENTES
function renderClientes(lista = null) {
    const container = document.getElementById("lista-clientes");
    if (!container) return;
    container.innerHTML = "";

    // Obter lista única de clientes baseada nas vendas
    // ou usar uma lista de clientes dedicada se você decidir separar o cadastro
    const clientesMap = new Map();
    
    vendas.forEach(v => {
        if (!clientesMap.has(v.cliente)) {
            clientesMap.set(v.cliente, {
                nome: v.cliente,
                telefone: v.telefone,
                ultimaCompra: v.data,
                totalGasto: v.valor,
                vendas: 1
            });
        } else {
            const c = clientesMap.get(v.cliente);
            c.totalGasto += v.valor;
            c.vendas += 1;
            if (new Date(v.data) > new Date(c.ultimaCompra)) {
                c.ultimaCompra = v.data;
            }
        }
    });

    const listaFinal = lista || Array.from(clientesMap.values());

    if (listaFinal.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#555; padding:20px;'>Nenhum cliente cadastrado.</p>";
        return;
    }

    listaFinal.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(c => {
        container.innerHTML += `
            <div class="order-card">
                <div class="order-info">
                    <h4>${c.nome}</h4>
                    <p>${c.telefone}</p>
                    <p>Compras: ${c.vendas} | Total: ${formatarMoeda(c.totalGasto)}</p>
                </div>
                <div class="order-price">
                    <a href="https://wa.me/55${c.telefone.replace(/\D/g,'')}" target="_blank" style="color:#25D366; text-decoration:none; font-size:18px;">
                        <i class="fa-brands fa-whatsapp"></i>
                    </a>
                </div>
            </div>
        `;
    });
}

function filtrarClientes() {
    const termo = document.getElementById("buscaCliente").value.toLowerCase();
    
    const clientesMap = new Map();
    vendas.forEach(v => {
        if (!clientesMap.has(v.cliente)) {
            clientesMap.set(v.cliente, {
                nome: v.cliente,
                telefone: v.telefone,
                totalGasto: v.valor,
                vendas: 1
            });
        } else {
            const c = clientesMap.get(v.cliente);
            c.totalGasto += v.valor;
            c.vendas += 1;
        }
    });

    const filtrados = Array.from(clientesMap.values()).filter(c => 
        c.nome.toLowerCase().includes(termo)
    );
    
    renderClientes(filtrados);
}

// SALVAR VENDA
function salvarVenda() {
    const cliente = document.getElementById("cliente").value.trim();
    const telefone = document.getElementById("telefone").value.trim();
    const marca = document.getElementById("marca").value.trim();
    const aro = document.getElementById("aro").value;
    const valor = document.getElementById("valor").value || 0;
    const quadro = document.getElementById("quadro").value.trim().toUpperCase();

    if (!cliente || !telefone || !marca) {
        mostrarToast("Preencha os campos obrigatórios!");
        return;
    }

    const novaVenda = {
        id: Date.now(),
        cliente,
        telefone,
        marca,
        aro,
        valor: parseFloat(valor),
        quadro,
        data: new Date().toISOString()
    };

    vendas.push(novaVenda);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vendas));

    mostrarToast("Venda registrada com sucesso! 🚲");
    limparFormulario();
    mostrarTela('dashboard', document.querySelector('.nav-item')); // Volta pro início
}

function limparFormulario() {
    document.getElementById("formVenda").reset();
}

// RENDERIZAR DASHBOARD
function renderDashboard() {
    // Totais
    const totalVendas = vendas.length;
    const esteMes = vendas.filter(v => {
        const data = new Date(v.data);
        const agora = new Date();
        return data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear();
    }).length;

    document.getElementById("dash-total-vendas").textContent = totalVendas;
    document.getElementById("dash-vendas-mes").textContent = esteMes;

    // Mini Lista Recente
    const listaRecente = document.getElementById("lista-recente");
    listaRecente.innerHTML = "";

    const ultimas = [...vendas].reverse().slice(0, 3);

    if (ultimas.length === 0) {
        listaRecente.innerHTML = "<p style='text-align:center; color:#555; padding:20px;'>Nenhuma venda ainda.</p>";
    }

    ultimas.forEach(v => {
        listaRecente.innerHTML += `
            <div class="order-card">
                <div class="order-info">
                    <h4>${v.cliente}</h4>
                    <p>${v.marca} (Aro ${v.aro})</p>
                </div>
                <div class="order-price">
                    <span class="price">${formatarMoeda(v.valor)}</span>
                    <span class="date">${new Date(v.data).toLocaleDateString()}</span>
                </div>
            </div>
        `;
    });

    atualizarGrafico();
}

// RENDERIZAR LISTA COMPLETA
function renderListaCompleta(lista = vendas) {
    const container = document.getElementById("lista-vendas-full");
    container.innerHTML = "";

    if (lista.length === 0) {
        container.innerHTML = "<div style='text-align:center; margin-top:50px; opacity:0.5;'><i class='fa-solid fa-box-open' style='font-size:40px;'></i><p>Nada encontrado.</p></div>";
        return;
    }

    [...lista].reverse().forEach(v => {
        container.innerHTML += `
            <div class="order-card">
                <div class="order-info">
                    <h4>${v.cliente}</h4>
                    <p><b>${v.marca}</b></p>
                    <p>Quadro: ${v.quadro || '---'}</p>
                    <div style="margin-top:10px;">
                        <a href="https://wa.me/55${v.telefone.replace(/\D/g,'')}" target="_blank" style="color:#25D366; text-decoration:none; font-size:12px; font-weight:bold;">
                            <i class="fa-brands fa-whatsapp"></i> WHATSAPP
                        </a>
                    </div>
                </div>
                <div class="order-price">
                    <span class="price">${formatarMoeda(v.valor)}</span>
                    <span class="date">${new Date(v.data).toLocaleDateString()}</span>
                    <button onclick="excluirVenda(${v.id})" style="background:none; border:none; color:#ff4757; font-size:12px; margin-top:15px; cursor:pointer;">Excluir</button>
                </div>
            </div>
        `;
    });
}

// FILTRAR VENDAS
function filtrarVendas() {
    const termo = document.getElementById("inputBusca").value.toLowerCase();
    const filtrados = vendas.filter(v => 
        v.cliente.toLowerCase().includes(termo) || 
        v.quadro.toLowerCase().includes(termo) ||
        v.marca.toLowerCase().includes(termo)
    );
    renderListaCompleta(filtrados);
}

// EXCLUIR
function excluirVenda(id) {
    if (confirm("Deseja realmente apagar esta venda?")) {
        vendas = vendas.filter(v => v.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(vendas));
        renderListaCompleta();
        mostrarToast("Venda removida.");
    }
}

// GRÁFICO
function atualizarGrafico() {
    const ctx = document.getElementById('chartAros');
    if (!ctx) return;

    if (chartAros) chartAros.destroy();

    const contagemAros = {};
    vendas.forEach(v => {
        contagemAros[v.aro] = (contagemAros[v.aro] || 0) + 1;
    });

    const labels = Object.keys(contagemAros).map(a => "Aro " + a);
    const data = Object.values(contagemAros);

    chartAros = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#FFD700', '#FFFFFF', '#333333', '#555555', '#777777'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#fff', font: { size: 10 } } }
            }
        }
    });
}

// UTILITÁRIOS
function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mostrarToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

function configurarMascaras() {
    const tel = document.getElementById("telefone");
    tel.addEventListener("input", (e) => {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
        e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
    });
}

function limparSistema() {
    if (confirm("CUIDADO! Isso apagará TODOS os pedidos. Confirmar?")) {
        vendas = [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(vendas));
        location.reload();
    }
}

function exportarDados() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(vendas));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "backup_paulinho_bikes.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
