document.addEventListener('DOMContentLoaded', () => {
    let allSales = [];
    let currentFilter = 'active';

    const tableBody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');
    const refreshBtn = document.getElementById('refresh-btn');
    const importBtn = document.getElementById('import-btn');
    const checkRefundBtn = document.getElementById('check-refund-btn');
    const tabs = document.querySelectorAll('.tab');

    // Stats elements
    const countActive = document.getElementById('count-active');
    const countWarning = document.getElementById('count-warning');
    const countDanger = document.getElementById('count-danger');
    const countRefunded = document.getElementById('count-refunded');

    // Modal elements
    const modal = document.getElementById('modal');
    const modalClose = document.getElementById('modal-close');
    const modalDetails = document.getElementById('modal-details');

    async function loadSales() {
        try {
            refreshBtn.textContent = 'Carregando...';
            const response = await fetch('/api/sales');
            allSales = await response.json();
            
            // Process data for UI
            const now = new Date();
            
            allSales.forEach(sale => {
                if (sale.status === 'revoked') {
                    sale.uiStatus = 'revoked';
                    return;
                }
                if (sale.status === 'refunded') {
                    sale.uiStatus = 'refunded';
                    return;
                }

                const expDate = new Date(sale.expiration_date);
                const diffTime = expDate - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 0) {
                    sale.uiStatus = 'danger'; // Expirada
                } else if (diffDays <= 1) {
                    sale.uiStatus = 'warning'; // Expira hoje/amanhã
                } else {
                    sale.uiStatus = 'active'; // Ativa
                }
                sale.daysLeft = diffDays;
            });

            updateStats();
            renderTable();
        } catch (error) {
            console.error('Failed to load sales', error);
            alert('Erro ao carregar dados. Verifique se o servidor está rodando.');
        } finally {
            refreshBtn.textContent = '⟳ Atualizar';
        }
    }

    function updateStats() {
        const active = allSales.filter(s => s.uiStatus === 'active').length;
        const warning = allSales.filter(s => s.uiStatus === 'warning').length;
        const danger = allSales.filter(s => s.uiStatus === 'danger').length;
        const refunded = allSales.filter(s => s.uiStatus === 'refunded').length;

        countActive.textContent = active;
        countWarning.textContent = warning;
        countDanger.textContent = danger;
        countRefunded.textContent = refunded;
    }

    function renderTable() {
        tableBody.innerHTML = '';
        
        let filteredSales = allSales;
        if (currentFilter === 'active') {
            filteredSales = allSales.filter(s => s.uiStatus === 'active');
        } else if (currentFilter === 'expiring_today') {
            filteredSales = allSales.filter(s => s.uiStatus === 'warning');
        } else if (currentFilter === 'expired') {
            filteredSales = allSales.filter(s => s.uiStatus === 'danger');
        } else if (currentFilter === 'revoked') {
            filteredSales = allSales.filter(s => s.uiStatus === 'revoked');
        } else if (currentFilter === 'refunded') {
            filteredSales = allSales.filter(s => s.uiStatus === 'refunded');
        }

        if (filteredSales.length === 0) {
            emptyState.classList.remove('hidden');
            tableBody.parentElement.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            tableBody.parentElement.classList.remove('hidden');

            filteredSales.forEach(sale => {
                const tr = document.createElement('tr');
                
                let statusBadge = '';
                if (sale.uiStatus === 'revoked') statusBadge = '<span class="status-badge status-revoked">Acesso Retirado</span>';
                else if (sale.uiStatus === 'refunded') statusBadge = '<span class="status-badge status-refunded">Reembolsado</span>';
                else if (sale.uiStatus === 'danger') statusBadge = '<span class="status-badge status-danger">Expirada</span>';
                else if (sale.uiStatus === 'warning') statusBadge = '<span class="status-badge status-warning">Expira Hoje</span>';
                else statusBadge = `<span class="status-badge status-active">${sale.daysLeft} dias restantes</span>`;

                const sourceBadge = (sale.source === 'ggsel' || sale.source === 'ggmax')
                    ? '<span class="source-badge source-ggmax">GGMax</span>' 
                    : '<span class="source-badge source-digi">Digiseller</span>';

                tr.innerHTML = `
                    <td><strong>#${sale.order_id}</strong></td>
                    <td>${sale.product_name}</td>
                    <td>${sourceBadge}</td>
                    <td>${sale.buyer_email}</td>
                    <td><span class="duration-badge">${sale.duration_days || 7} dias</span></td>
                    <td>${new Date(sale.sale_date).toLocaleDateString()}</td>
                    <td>${new Date(sale.expiration_date).toLocaleDateString()}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-details" onclick="showDetails('${encodeURIComponent(sale.account_details)}')">Ver Dados</button>
                        <button class="btn btn-details" onclick="editarData(${sale.id}, '${sale.sale_date.split(' ')[0]}')" title="Editar Data de Compra">✏️</button>
                        ${sale.status !== 'revoked' ? `<button class="btn btn-revoke" onclick="marcarRetirada(${sale.id})" style="background: #ca8a04; margin-top: 5px;">Retirar</button>` : ''}
                        <button class="btn btn-revoke" onclick="deletarVenda(${sale.id})" style="background: #ef4444; margin-top: 5px;">Excluir</button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        }
    }

    window.showDetails = (encodedDetails) => {
        const details = decodeURIComponent(encodedDetails);
        
        // Tentativa de formatar JSON se for string json
        try {
            const parsed = JSON.parse(details.replace(/'/g, '"'));
            modalDetails.textContent = JSON.stringify(parsed, null, 2);
        } catch(e) {
            modalDetails.textContent = details;
        }
        
        modal.classList.remove('hidden');
    };

    window.marcarRetirada = async (id) => {
        if (!confirm('Tem certeza que deseja marcar esta conta como revogada?')) return;
        
        try {
            const res = await fetch(`/api/sales/${id}/retirar`, { method: 'POST' });
            if (res.ok) {
                loadSales();
            } else {
                alert('Erro ao marcar retirada');
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.deletarVenda = async (id) => {
        if(confirm('Tem certeza que deseja APAGAR permanentemente esta venda?')) {
            try {
                const res = await fetch(`/api/sales/${id}/delete`, { method: 'DELETE' });
                if (res.ok) {
                    loadSales();
                } else {
                    alert('Erro ao apagar venda');
                }
            } catch(e) {
                console.error(e);
            }
        }
    };

    modalClose.addEventListener('click', () => modal.classList.add('hidden'));
    
    refreshBtn.addEventListener('click', loadSales);

    // Importar vendas antigas
    importBtn.addEventListener('click', async () => {
        if (!confirm('Importar vendas dos últimos 90 dias da Digiseller?')) return;
        
        importBtn.textContent = '⏳ Importando...';
        importBtn.disabled = true;
        
        let messages = [];
        
        try {
            const resDigi = await fetch('/api/import/digiseller', { method: 'POST' });
            const dataDigi = await resDigi.json();
            if (resDigi.ok) {
                messages.push(`Digiseller: ${dataDigi.imported} importadas, ${dataDigi.skipped} já existentes`);
            } else {
                messages.push(`Digiseller: ${dataDigi.error || 'Erro'}`);
            }
        } catch(e) {
            messages.push('Digiseller: Erro de conexão');
        }
        
        alert(`Importação concluída!\n\n${messages.join('\n')}`);
        importBtn.textContent = '📥 Importar Digiseller';
        importBtn.disabled = false;
        loadSales();
    });

    // Importar via Discord API (GGMax)
    const importGgmaxDiscordBtn = document.getElementById('import-ggmax-discord-btn');
    if(importGgmaxDiscordBtn) {
        importGgmaxDiscordBtn.addEventListener('click', async () => {
            if (!confirm('O painel irá conectar no seu Discord e puxar as últimas 100 mensagens do canal de vendas da GGMax.\n\nIMPORTANTE: Você precisa ter configurado DISCORD_BOT_TOKEN e DISCORD_CHANNEL_ID.\n\nDeseja continuar?')) return;
            
            importGgmaxDiscordBtn.textContent = '⏳ Sincronizando...';
            importGgmaxDiscordBtn.disabled = true;
            
            try {
                const res = await fetch('/api/import/ggmax-discord-sync', { method: 'POST' });
                const data = await res.json();
                
                if (res.ok) {
                    if (data.imported === 0 && data.debug_info && data.debug_info.length > 0) {
                        alert(`Li ${data.skipped} mensagens que já existiam, mas encontrei novas mensagens que o robô não entendeu o formato. Veja o conteúdo da primeira:\n\n${data.debug_info[0].body.substring(0, 250)}`);
                    } else {
                        alert(`Sincronização concluída!\n\n${data.imported} novas vendas importadas.\n${data.skipped} já existiam no sistema.`);
                    }
                } else {
                    alert(`Erro na sincronização: ${data.error || 'Erro desconhecido'}`);
                }
            } catch(e) {
                alert('Erro de conexão ao tentar ler o Discord.');
            }
            
            importGgmaxDiscordBtn.textContent = '👾 Sincronizar Discord GGMax';
            importGgmaxDiscordBtn.disabled = false;
            loadSales();
        });
    }

    // Modal GGMax
    const ggmaxModal = document.getElementById('ggmax-modal');
    const addGgmaxBtn = document.getElementById('add-ggmax-btn');
    const ggmaxClose = document.getElementById('ggmax-close');
    const ggmaxSubmit = document.getElementById('ggmax-submit');
    const ggmaxForm = document.getElementById('ggmax-form');

    addGgmaxBtn.addEventListener('click', () => {
        ggmaxForm.reset();
        ggmaxModal.classList.remove('hidden');
    });

    ggmaxClose.addEventListener('click', () => ggmaxModal.classList.add('hidden'));

    ggmaxSubmit.addEventListener('click', async () => {
        if (!ggmaxForm.checkValidity()) {
            ggmaxForm.reportValidity();
            return;
        }

        const orderId = document.getElementById('ggmax-order-id').value;
        const product = document.getElementById('ggmax-product').value;
        const email = document.getElementById('ggmax-email').value;
        const duration = document.getElementById('ggmax-duration').value;

        ggmaxSubmit.textContent = '⏳ Salvando...';
        ggmaxSubmit.disabled = true;

        try {
            const res = await fetch('/api/add-ggmax', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: orderId,
                    product_name: product,
                    buyer_email: email,
                    duration_days: parseInt(duration)
                })
            });

            const data = await res.json();
            if (res.ok) {
                alert('Venda GGMax adicionada com sucesso!');
                ggmaxModal.classList.add('hidden');
                loadSales();
            } else {
                alert(`Erro: ${data.error}`);
            }
        } catch (e) {
            alert('Erro ao conectar com o servidor.');
        }

        ggmaxSubmit.textContent = 'Salvar Venda';
        ggmaxSubmit.disabled = false;
    });

    // Checar refunds
    checkRefundBtn.addEventListener('click', async () => {
        checkRefundBtn.textContent = '⏳ Checando...';
        checkRefundBtn.disabled = true;
        
        try {
            const res = await fetch('/api/check-refunds', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(`Verificação concluída!\n\n${data.checked} vendas verificadas.\n${data.refunded} reembolsos detectados.`);
            } else {
                alert(`Erro: ${data.error}`);
            }
        } catch(e) {
            alert('Erro ao verificar refunds.');
        }
        
        checkRefundBtn.textContent = '🔍 Checar Refunds';
        checkRefundBtn.disabled = false;
        loadSales();
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderTable();
        });
    });

    // Init
    loadSales();
    
    // Auto-refresh da tabela a cada 15 segundos
    setInterval(loadSales, 15000);
    
    // Auto-sync a cada 5 minutos (silencioso)
    setInterval(async () => {
        try {
            const res = await fetch('/api/import/ggmax-discord-sync', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                if (data.imported > 0) loadSales();
            }
        } catch(e) {}
    }, 300000);

    setInterval(async () => {
        try {
            const res = await fetch('/api/import/digiseller', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                if (data.imported > 0) loadSales(); 
            }
        } catch(e) {}
    }, 300000);

    // Sync invisível ao abrir o site (roda 2 segundos após carregar)
    setTimeout(async () => {
        try {
            const res = await fetch('/api/import/ggmax-discord-sync', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                if (data.imported > 0) loadSales();
            }
            const res2 = await fetch('/api/import/digiseller', { method: 'POST' });
            if (res2.ok) {
                const data = await res2.json();
                if (data.imported > 0) loadSales();
            }
        } catch(e) {}
    }, 2000);
});
