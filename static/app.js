document.addEventListener('DOMContentLoaded', () => {
    let allSales = [];
    let currentFilter = 'active';

    const tableBody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');
    const refreshBtn = document.getElementById('refresh-btn');
    const tabs = document.querySelectorAll('.tab');

    // Stats elements
    const countActive = document.getElementById('count-active');
    const countWarning = document.getElementById('count-warning');
    const countDanger = document.getElementById('count-danger');

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
        const active = allSales.filter(s => s.uiStatus === 'active' || s.uiStatus === 'warning' || s.uiStatus === 'danger').length;
        const warning = allSales.filter(s => s.uiStatus === 'warning').length;
        const danger = allSales.filter(s => s.uiStatus === 'danger').length;

        countActive.textContent = active;
        countWarning.textContent = warning;
        countDanger.textContent = danger;
    }

    function renderTable() {
        tableBody.innerHTML = '';
        
        let filteredSales = allSales;
        if (currentFilter === 'active') {
            filteredSales = allSales.filter(s => s.uiStatus !== 'revoked');
        } else if (currentFilter === 'expiring_today') {
            filteredSales = allSales.filter(s => s.uiStatus === 'warning');
        } else if (currentFilter === 'expired') {
            filteredSales = allSales.filter(s => s.uiStatus === 'danger');
        } else if (currentFilter === 'revoked') {
            filteredSales = allSales.filter(s => s.uiStatus === 'revoked');
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
                else if (sale.uiStatus === 'danger') statusBadge = '<span class="status-badge status-danger">Expirada</span>';
                else if (sale.uiStatus === 'warning') statusBadge = '<span class="status-badge status-warning">Expira Hoje</span>';
                else statusBadge = `<span class="status-badge status-active">${sale.daysLeft} dias restantes</span>`;

                tr.innerHTML = `
                    <td><strong>#${sale.order_id}</strong></td>
                    <td>${sale.product_name}</td>
                    <td>${sale.buyer_email}</td>
                    <td>${new Date(sale.sale_date).toLocaleDateString()}</td>
                    <td>${new Date(sale.expiration_date).toLocaleDateString()}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-details" onclick="showDetails('${encodeURIComponent(sale.account_details)}')">Ver Dados</button>
                        ${sale.status !== 'revoked' ? `<button class="btn btn-revoke" onclick="revokeSale(${sale.id})">Marcar Retirada</button>` : ''}
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

    window.revokeSale = async (id) => {
        if (!confirm('Tem certeza que deseja marcar esta conta como revogada? Ela sairá da lista de pendências.')) return;
        
        try {
            const res = await fetch(`/api/sales/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'revoked' })
            });
            if (res.ok) {
                loadSales();
            }
        } catch (e) {
            console.error(e);
            alert('Erro ao atualizar status');
        }
    };

    modalClose.addEventListener('click', () => modal.classList.add('hidden'));
    
    refreshBtn.addEventListener('click', loadSales);

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
    
    // Auto-refresh a cada 15 segundos
    setInterval(loadSales, 15000);
});
