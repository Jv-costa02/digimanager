document.addEventListener('DOMContentLoaded', () => {
    let allSales = [];
    let currentFilter = 'active';

    const tableBody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');
    const refreshBtn = document.getElementById('refresh-btn');
    const importBtn = document.getElementById('import-btn');
    const tabs = document.querySelectorAll('.tab');
    const durationFilter = document.getElementById('duration-filter');
    const periodFilter = document.getElementById('period-filter');
    const accountTypeFilter = document.getElementById('account-type-filter');

    // Stats elements
    const countActive = document.getElementById('count-active');
    const countExpiring = document.getElementById('count-expiring');
    const countExpired = document.getElementById('count-expired');
    const countRevoked = document.getElementById('count-revoked');

    // Modal elements
    const modal = document.getElementById('modal');
    const modalClose = document.getElementById('modal-close');
    const modalDetails = document.getElementById('modal-details');

    async function loadSales() {
        try {
            refreshBtn.textContent = 'Carregando...';
            const response = await fetch('/api/sales');
            allSales = await response.json();
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
        const today = new Date();
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        allSales.forEach(sale => {
            // Cria a data da string (vem do banco) e isola ano/mês/dia
            const expParts = (sale.expiration_date || '').split(/[- :T]/);
            let expDateOnly;
            let exactExpDate;
            if (expParts.length >= 6) {
                // Se tiver data e hora: YYYY-MM-DD HH:MM:SS
                expDateOnly = new Date(expParts[0], expParts[1] - 1, expParts[2]);
                exactExpDate = new Date(expParts[0], expParts[1] - 1, expParts[2], expParts[3], expParts[4], expParts[5]);
            } else if (expParts.length >= 3) {
                // Se for só YYYY-MM-DD
                expDateOnly = new Date(expParts[0], expParts[1] - 1, expParts[2]);
                exactExpDate = new Date(expParts[0], expParts[1] - 1, expParts[2], 23, 59, 59);
            } else {
                expDateOnly = new Date(sale.expiration_date);
                expDateOnly = new Date(expDateOnly.getFullYear(), expDateOnly.getMonth(), expDateOnly.getDate());
                exactExpDate = new Date(sale.expiration_date);
            }

            const diffTime = expDateOnly - todayOnly;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            const exactDiffMs = exactExpDate - today;
            sale.exactHoursLeft = Math.floor(exactDiffMs / (1000 * 60 * 60));
            sale.exactMinutesLeft = Math.floor(exactDiffMs / (1000 * 60));
            
            if (sale.status === 'revoked') {
                sale.uiStatus = 'revoked';
            } else if (diffDays < 0 || sale.exactMinutesLeft < 0) {
                sale.uiStatus = 'danger';
            } else if (diffDays <= 3) {
                sale.uiStatus = 'warning';
            } else {
                sale.uiStatus = 'active';
            }
            sale.daysLeft = diffDays;
        });

        const active = allSales.filter(s => s.uiStatus === 'active').length;
        const expiring = allSales.filter(s => s.uiStatus === 'warning').length;
        const expired = allSales.filter(s => s.uiStatus === 'danger').length;
        const revoked = allSales.filter(s => s.uiStatus === 'revoked').length;

        countActive.textContent = active;
        countExpiring.textContent = expiring;
        countExpired.textContent = expired;
        countRevoked.textContent = revoked;
    }

    function renderTable() {
        tableBody.innerHTML = '';
        let durationDays = durationFilter.value;
        let periodDays = periodFilter.value;
        const now = new Date();
        
        let filteredSales = allSales.filter(sale => {
            // Filtro por duração da conta (7, 15, 30)
            if (durationDays !== 'all') {
                const duration = sale.duration_days || 7;
                if (duration !== parseInt(durationDays)) {
                    return false; // Não tem essa duração
                }
            }

            // Filtro por período de venda
            if (periodDays !== 'all') {
                const saleDate = new Date(sale.sale_date);
                const diffTime = now - saleDate;
                const diffDays = diffTime / (1000 * 60 * 60 * 24);
                if (diffDays > parseInt(periodDays)) {
                    return false; // Fora do período
                }
            }

            // Filtro por tipo de conta (google, outlook)
            if (accountTypeFilter && accountTypeFilter.value !== 'all') {
                const accountType = accountTypeFilter.value;
                if (sale.account_details) {
                    let textLower = sale.account_details.toLowerCase();
                    if (accountType === 'google') {
                        if (!textLower.includes('@gmail.com') && !textLower.includes('@googlemail.com')) return false;
                    } else if (accountType === 'outlook') {
                        if (!textLower.includes('@hotmail.com') && !textLower.includes('@outlook.com') && !textLower.includes('@live.com')) return false;
                    } else if (accountType === 'vlxsmfy') {
                        if (!textLower.includes('@vlxsmfy.com')) return false;
                    }
                } else {
                    return false; // Sem detalhes de conta
                }
            }

            // Filtro por tab
            if (currentFilter === 'active') return sale.uiStatus === 'active' || sale.uiStatus === 'warning';
            if (currentFilter === 'expiring_today') return sale.uiStatus === 'warning';
            if (currentFilter === 'expired') return sale.uiStatus === 'danger';
            if (currentFilter === 'revoked') return sale.uiStatus === 'revoked';
            return true;
        });

        // Ordenar: primeiro 7 dias, depois 15 dias, depois 30 dias.
        filteredSales.sort((a, b) => {
            const durA = a.duration_days || 7;
            const durB = b.duration_days || 7;
            if (durA !== durB) return durA - durB;
            return new Date(a.expiration_date) - new Date(b.expiration_date);
        });

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
                else if (sale.uiStatus === 'danger' || sale.exactMinutesLeft < 0) {
                    statusBadge = '<span class="status-badge status-danger">Expirado</span>';
                }
                else {
                    let badgeClass = 'status-active'; // verde para > 3 dias
                    let text = '';
                    
                    if (sale.exactHoursLeft < 24) {
                        badgeClass = 'status-danger'; // vermelho para < 24h
                        if (sale.exactHoursLeft > 0) text = `${sale.exactHoursLeft}h`;
                        else text = `${sale.exactMinutesLeft}m`;
                    } else {
                        if (sale.daysLeft <= 3) badgeClass = 'status-warning'; // amarelo para 1 a 3 dias
                        text = sale.daysLeft === 1 ? '1 dia' : `${sale.daysLeft} dias`;
                    }
                    
                    statusBadge = `<span class="status-badge ${badgeClass}">${text}</span>`;
                }

                let sourceBadge = '';
                if (sale.source === 'ggmax') {
                    sourceBadge = '<span class="source-badge source-ggmax">GGMax</span>';
                } else if (sale.source === 'ggsel') {
                    sourceBadge = '<span class="source-badge source-ggsel">GGSel</span>';
                } else {
                    sourceBadge = '<span class="source-badge source-digi">Digiseller</span>';
                }

                tr.className = 'clickable-row';
                tr.style.cursor = 'pointer';
                tr.onclick = (e) => showDetails(encodeURIComponent(sale.account_details || ''), e, sale);

                tr.innerHTML = `
                    <td><strong>${sale.order_id}</strong></td>
                    <td>${sale.product_name}</td>
                    <td>${sourceBadge}</td>
                    <td><span class="duration-badge">${sale.duration_days || 7} dias</span></td>
                    <td>${new Date(sale.sale_date).toLocaleDateString()}</td>
                    <td>${new Date(sale.expiration_date).toLocaleDateString()}</td>
                    <td>${statusBadge}</td>
                `;
                
                // Sistema de Seleção de Linha
                tr.addEventListener('click', (e) => {
                    // Remove seleção de todas as outras linhas
                    document.querySelectorAll('#table-body tr').forEach(row => row.classList.remove('selected-row'));
                    // Adiciona na atual
                    tr.classList.add('selected-row');
                    e.stopPropagation();
                });
                
                tableBody.appendChild(tr);
            });
        }
    }

    window.showDetails = (encodedDetails, event, sale) => {
        if(event) event.stopPropagation();
        
        let details = decodeURIComponent(encodedDetails);
        
        // Remove barras invertidas caso venham do JSON
        let cleanDetails = details.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
        
        // --- Filtro Inteligente de Credenciais ---
        let htmlContent = '';
        
        // 1. Achar o email
        let emailMatch = cleanDetails.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        let email = emailMatch ? emailMatch[0] : null;
        
        // 2. Achar a senha (não permitir < ou > no meio para não pular de linha no HTML)
        let passRegex = /(?:Пароль|Пapoль|Password|Senha|Pass|Pwd)[^\:<>\n\r]*:\s*([^\s\n\r\\]+)/gi;
        let passMatch = null;
        let match;
        
        while ((match = passRegex.exec(cleanDetails)) !== null) {
            let extractedPass = match[1].replace(/["']/g, ''); // Remove aspas do JSON
            
            // Limpar sujeira de tags HTML que colaram na senha
            if (extractedPass.includes('<br>')) {
                extractedPass = extractedPass.split('<br>')[0];
            }
            if (extractedPass.includes('<')) {
                extractedPass = extractedPass.split('<')[0];
            }
            
            // Se a senha extraída NÃO for o email, preferimos essa!
            if (!email || extractedPass.toLowerCase() !== email.toLowerCase()) {
                passMatch = [match[0], extractedPass];
                break;
            }
        }
        
        let linkMatch = cleanDetails.match(/https?:\/\/[^\s\n\r<>"'\\]+/);
        
        // Tentar formato email:senha
        let comboMatch = cleanDetails.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}):([^\s\n\r\\]+)/);
        
        if (comboMatch) {
            let comboPass = comboMatch[2].replace(/["']/g, '');
            if (!passMatch || (passMatch[1].toLowerCase() === comboPass.toLowerCase())) {
                email = comboMatch[1];
                passMatch = [null, comboPass];
            }
        }
        
        // Proteção final: Se a senha for EXATAMENTE igual ao email, nós anulamos ela
        // porque não existe senha que seja o próprio email em serviços normais
        if (passMatch && email && passMatch[1].replace(/["']/g, '').toLowerCase() === email.toLowerCase()) {
            passMatch = null;
        }
        
        if (email) {
            let isGmail = email.toLowerCase().includes('@gmail.com') || email.toLowerCase().includes('@googlemail.com');
            
            if (linkMatch && !passMatch) {
                let cardTitle = isGmail ? "Acesso via Painel Google" : "Acesso via Painel";
                htmlContent = `
                    <div class="smart-card" style="background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; margin-bottom: 5px; display: flex; flex-direction: column; gap: 10px;">
                        
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                            <h3 style="margin: 0; color: #e2e8f0; font-size: 0.95rem; font-weight: 500;">${cardTitle}</h3>
                        </div>
                        
                        <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.03);">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="color: #64748b; font-size: 0.65rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">E-mail Cadastrado</span>
                                <span style="color: #f8fafc; font-family: monospace; font-size: 0.85rem; letter-spacing: 0.5px;">${email}</span>
                            </div>
                            <button onclick="navigator.clipboard.writeText('${email}'); this.innerHTML='✓ Copiado'; this.style.color='#10b981'; this.style.borderColor='#10b981'; setTimeout(()=>{this.innerHTML='Copiar'; this.style.color='#94a3b8'; this.style.borderColor='rgba(255,255,255,0.2)'}, 2000)" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #94a3b8; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; cursor: pointer; transition: 0.2s;">Copiar</button>
                        </div>

                        <a href="${linkMatch[0]}" target="_blank" style="background: #10b981; color: #ffffff; width: 100%; display: flex; justify-content: center; align-items: center; text-decoration: none; transition: 0.2s; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 600; font-size: 0.85rem; box-sizing: border-box;" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10b981'">Acessar Painel</a>
                    </div>
                `;
            } else if (passMatch) {
                htmlContent = `
                    <div class="smart-card" style="background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; margin-bottom: 5px; display: flex; flex-direction: column; gap: 10px;">
                        
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
                            <h3 style="margin: 0; color: #e2e8f0; font-size: 0.95rem; font-weight: 500;">Credenciais Outlook</h3>
                        </div>
                        
                        <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.03);">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="color: #64748b; font-size: 0.65rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">E-mail</span>
                                <span style="color: #f8fafc; font-family: monospace; font-size: 0.85rem;">${email}</span>
                            </div>
                            <button onclick="navigator.clipboard.writeText('${email}'); this.innerHTML='✓ Copiado'; this.style.color='#3b82f6'; this.style.borderColor='#3b82f6'; setTimeout(()=>{this.innerHTML='Copiar'; this.style.color='#94a3b8'; this.style.borderColor='rgba(255,255,255,0.2)'}, 2000)" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #94a3b8; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; cursor: pointer; transition: 0.2s;">Copiar</button>
                        </div>
                        
                        <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.03);">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="color: #64748b; font-size: 0.65rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Senha</span>
                                <span style="color: #f8fafc; font-family: monospace; font-size: 0.85rem;">${passMatch[1]}</span>
                            </div>
                            <button onclick="navigator.clipboard.writeText('${passMatch[1]}'); this.innerHTML='✓ Copiado'; this.style.color='#3b82f6'; this.style.borderColor='#3b82f6'; setTimeout(()=>{this.innerHTML='Copiar'; this.style.color='#94a3b8'; this.style.borderColor='rgba(255,255,255,0.2)'}, 2000)" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #94a3b8; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; cursor: pointer; transition: 0.2s;">Copiar</button>
                        </div>
                    </div>
                `;
            }
        }
        
        if (htmlContent !== '') {
            modalDetails.innerHTML = htmlContent;
        } else {
            // Fallback JSON/Texto Original
            try {
                const parsed = JSON.parse(details.replace(/'/g, '"'));
                modalDetails.innerHTML = `<pre>${JSON.stringify(parsed, null, 2)}</pre>`;
            } catch(e) {
                modalDetails.innerHTML = `<pre style="white-space: pre-wrap;">${details}</pre>`;
            }
        }
        // -----------------------------------------
        
        // Injetar botões de ação
        const modalActions = document.getElementById('modal-sale-actions');
        if (sale) {
            modalActions.style.display = 'flex';
            modalActions.innerHTML = `
                <div style="display: flex; gap: 10px; width: 100%;">
                    <button class="btn btn-edit" onclick="editarData(${sale.id}, '${sale.sale_date ? sale.sale_date.split(' ')[0] : ''}', event);" title="Editar Data" style="flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 10px; color: #fff;">
                        Editar
                    </button>
                    ${sale.uiStatus !== 'revoked' && sale.status !== 'revoked' ? `<button class="btn btn-revoke" onclick="marcarRetirada(${sale.id}, event);" style="flex: 1; padding: 10px; background: #ca8a04;">Retirar</button>` : ''}
                    <button class="btn btn-delete" onclick="deletarVenda(${sale.id}, event);" style="flex: 1; background: rgba(239, 68, 68, 0.8); padding: 10px;">Excluir</button>
                </div>
            `;
        } else {
            modalActions.style.display = 'none';
        }

        modal.classList.remove('hidden');
    };
    
    function fecharModal() {
        modal.classList.add('hidden');
    }
    window.fecharModal = fecharModal;

    window.marcarRetirada = async (id, event) => {
        if(event) event.stopPropagation();
        if (!confirm('Tem certeza que deseja marcar esta conta como revogada?')) return;
        
        try {
            const res = await fetch(`/api/sales/${id}/status`, { 
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'revoked' })
            });
            if (res.ok) {
                window.fecharModal();
                loadSales();
            } else {
                alert('Erro ao marcar retirada');
            }
        } catch (e) {
            console.error(e);
        }
    };
    
    window.editarData = async (id, dataAtual, event) => {
        if(event) event.stopPropagation();
        const novaData = prompt('Digite a data real da venda no formato AAAA-MM-DD (Exemplo: 2026-05-15):', dataAtual);
        if (novaData) {
            try {
                const res = await fetch(`/api/sales/${id}/editar-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sale_date: novaData })
                });
                if (res.ok) {
                    window.fecharModal();
                    loadSales();
                } else {
                    alert('Erro ao atualizar data');
                }
            } catch (e) {
                console.error(e);
            }
        }
    };

    window.deletarVenda = async (id, event) => {
        if(event) event.stopPropagation();
        if(confirm('Tem certeza que deseja APAGAR permanentemente esta venda?')) {
            try {
                const res = await fetch(`/api/sales/${id}/delete`, { method: 'DELETE' });
                if (res.ok) {
                    window.fecharModal();
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
                
                if (data.status === 'success') {
                    if (data.unparsed > 0 && data.debug_info && data.debug_info.length > 0) {
                        alert(`Li ${data.skipped} mensagens que já existiam, mas encontrei ${data.unparsed} mensagens que o robô não entendeu o formato. Veja o conteúdo da primeira:\n\n${data.debug_info[0].body.substring(0, 250)}`);
                    } else if (data.imported === 0) {
                        alert(`Sincronização concluída!\n\nNenhuma nova venda encontrada.\n${data.skipped} mensagens lidas já estavam no sistema.`);
                    } else {
                        alert(`Sincronização concluída!\n\n${data.imported} novas vendas importadas.\n${data.skipped} já existiam no sistema.`);
                    }
                    loadSales();
                } else {  alert(`Erro na sincronização: ${data.error || 'Erro desconhecido'}`);
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

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderTable();
        });
    });

    // Desselecionar ao clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('tr')) {
            document.querySelectorAll('#table-body tr').forEach(row => row.classList.remove('selected-row'));
        }
    });

    // Evento de mudança nos filtros
    durationFilter.addEventListener('change', renderTable);
    periodFilter.addEventListener('change', renderTable);
    if (accountTypeFilter) accountTypeFilter.addEventListener('change', renderTable);

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

// Custom Dropdowns
document.querySelectorAll('.custom-dropdown').forEach(dropdown => {
    const trigger = dropdown.querySelector('.dropdown-trigger');
    const menu = dropdown.querySelector('.dropdown-menu');
    const select = dropdown.querySelector('select');
    const items = dropdown.querySelectorAll('.dropdown-item');
    const strong = trigger.querySelector('strong');

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-dropdown').forEach(d => {
            if (d !== dropdown) d.classList.remove('open');
        });
        dropdown.classList.toggle('open');
    });

    items.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            items.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const val = item.getAttribute('data-value');
            select.value = val;
            
            let displayTxt = item.textContent.trim();
            if (dropdown.id === 'dropdown-period' && val !== 'all') {
                const days = parseInt(val);
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(endDate.getDate() - days);
                const format = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
                displayTxt = `${format(startDate)} ~ ${format(endDate)}`;
            }
            
            strong.textContent = displayTxt;
            dropdown.classList.remove('open');
            select.dispatchEvent(new Event('change'));
        });
    });
});

document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
    
    // Clear selected row when clicking outside
    document.querySelectorAll('#table-body tr').forEach(row => row.classList.remove('selected-row'));
});
