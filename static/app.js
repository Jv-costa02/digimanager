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
            const expParts = sale.expiration_date.split(/[- :]/);
            let expDateOnly;
            if (expParts.length >= 3) {
                // Se for YYYY-MM-DD
                expDateOnly = new Date(expParts[0], expParts[1] - 1, expParts[2]);
            } else {
                expDateOnly = new Date(sale.expiration_date);
                expDateOnly = new Date(expDateOnly.getFullYear(), expDateOnly.getMonth(), expDateOnly.getDate());
            }

            const diffTime = expDateOnly - todayOnly;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            if (sale.status === 'revoked') {
                sale.uiStatus = 'revoked';
            } else if (diffDays < 0) {
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

            // Filtro por tab
            if (currentFilter === 'active') return sale.uiStatus === 'active' || sale.uiStatus === 'warning';
            if (currentFilter === 'expiring_today') return sale.uiStatus === 'warning';
            if (currentFilter === 'expired') return sale.uiStatus === 'danger';
            if (currentFilter === 'revoked') return sale.uiStatus === 'revoked';
            return true;
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
                else if (sale.uiStatus === 'danger') statusBadge = '<span class="status-badge status-danger">Expirada</span>';
                else if (sale.uiStatus === 'warning') {
                    if (sale.daysLeft === 0) statusBadge = '<span class="status-badge status-warning">Expira Hoje</span>';
                    else if (sale.daysLeft === 1) statusBadge = '<span class="status-badge status-warning">Expira Amanhã</span>';
                    else statusBadge = `<span class="status-badge status-warning">Expira em ${sale.daysLeft} dias</span>`;
                }
                else statusBadge = `<span class="status-badge status-active">${sale.daysLeft} dias restantes</span>`;

                const sourceBadge = (sale.source === 'ggsel' || sale.source === 'ggmax')
                    ? '<span class="source-badge source-ggmax">GGMax</span>' 
                    : '<span class="source-badge source-digi">Digiseller</span>';

                tr.className = 'clickable-row';
                tr.style.cursor = 'pointer';
                tr.onclick = (e) => showDetails(encodeURIComponent(sale.account_details || ''), e, sale);

                tr.innerHTML = `
                    <td><strong>#${sale.order_id}</strong></td>
                    <td>${sale.product_name}</td>
                    <td>${sourceBadge}</td>
                    <td>${sale.buyer_email}</td>
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
        
        // 2. Achar a senha
        let passRegex = /(?:Пароль|Пapoль|Password|Senha|Pass|Pwd)[^\:]*:\s*([^\s\n\r\\]+)/gi;
        let passMatch = null;
        let match;
        
        while ((match = passRegex.exec(cleanDetails)) !== null) {
            let extractedPass = match[1].replace(/["']/g, ''); // Remove aspas do JSON
            
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
                    <div class="smart-card" style="background: linear-gradient(145deg, rgba(30,41,59,0.6) 0%, rgba(15,23,42,0.8) 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); position: relative; overflow: hidden; margin-bottom: 20px;">
                        <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: rgba(16, 185, 129, 0.15); filter: blur(40px); border-radius: 50%; pointer-events: none;"></div>
                        
                        <div style="display: flex; align-items: center; margin-bottom: 20px; gap: 12px;">
                            <div style="background: rgba(16, 185, 129, 0.15); padding: 10px; border-radius: 10px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(16, 185, 129, 0.3);">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                            </div>
                            <h3 style="margin: 0; color: #f8fafc; font-size: 1.25rem; font-weight: 600; letter-spacing: 0.3px;">${cardTitle}</h3>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 12px; position: relative; z-index: 1;">
                            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 14px; display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    <span style="color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">E-mail Cadastrado</span>
                                    <span style="color: #f8fafc; font-size: 1.05rem; font-family: monospace; letter-spacing: 0.5px;">${email}</span>
                                </div>
                                <button onclick="navigator.clipboard.writeText('${email}'); this.innerHTML='✓ Copiado'; this.style.color='#10b981'; setTimeout(()=>{this.innerHTML='Copiar'; this.style.color='#e2e8f0'}, 2000)" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: all 0.2s;">Copiar</button>
                            </div>
                            
                            <a href="${linkMatch[0]}" target="_blank" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; border-radius: 10px; padding: 14px; color: white; text-align: center; text-decoration: none; font-weight: 600; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(16, 185, 129, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(16, 185, 129, 0.3)'">
                                Acessar Painel 
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                            </a>
                        </div>
                    </div>
                `;
            } else if (passMatch) {
                htmlContent = `
                    <div class="smart-card" style="background: linear-gradient(145deg, rgba(30,41,59,0.6) 0%, rgba(15,23,42,0.8) 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); position: relative; overflow: hidden; margin-bottom: 20px;">
                        <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: rgba(59, 130, 246, 0.15); filter: blur(40px); border-radius: 50%; pointer-events: none;"></div>
                        
                        <div style="display: flex; align-items: center; margin-bottom: 20px; gap: 12px;">
                            <div style="background: rgba(59, 130, 246, 0.15); padding: 10px; border-radius: 10px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(59, 130, 246, 0.3);">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
                            </div>
                            <h3 style="margin: 0; color: #f8fafc; font-size: 1.25rem; font-weight: 600; letter-spacing: 0.3px;">Credenciais Outlook</h3>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 12px; position: relative; z-index: 1;">
                            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 14px; display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    <span style="color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">E-mail</span>
                                    <span style="color: #f8fafc; font-size: 1.05rem; font-family: monospace; letter-spacing: 0.5px;">${email}</span>
                                </div>
                                <button onclick="navigator.clipboard.writeText('${email}'); this.innerHTML='✓ Copiado'; this.style.color='#3b82f6'; setTimeout(()=>{this.innerHTML='Copiar'; this.style.color='#e2e8f0'}, 2000)" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: all 0.2s;">Copiar</button>
                            </div>
                            
                            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 14px; display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    <span style="color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Senha</span>
                                    <span style="color: #f8fafc; font-size: 1.05rem; font-family: monospace; letter-spacing: 0.5px;">${passMatch[1]}</span>
                                </div>
                                <button onclick="navigator.clipboard.writeText('${passMatch[1]}'); this.innerHTML='✓ Copiado'; this.style.color='#3b82f6'; setTimeout(()=>{this.innerHTML='Copiar'; this.style.color='#e2e8f0'}, 2000)" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: all 0.2s;">Copiar</button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        if (htmlContent !== '') {
            // Ocultar detalhes longos num elemento expansível opcional, caso o usuário ainda queira ver
            htmlContent += `
                <details style="margin-top: 15px; font-size: 0.85rem; color: #aaa;">
                    <summary style="cursor: pointer; opacity: 0.7;">Ver conteúdo original bruto</summary>
                    <pre style="white-space: pre-wrap; margin-top: 10px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 5px;">${details}</pre>
                </details>
            `;
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
                    <button class="btn btn-edit" onclick="editarData(${sale.id}, '${sale.sale_date ? sale.sale_date.split(' ')[0] : ''}', event); fecharModal();" title="Editar Data" style="flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 10px; color: #fff;">
                        Editar
                    </button>
                    ${sale.uiStatus !== 'revoked' && sale.status !== 'revoked' ? `<button class="btn btn-revoke" onclick="marcarRetirada(${sale.id}, event); fecharModal();" style="flex: 1; padding: 10px; background: #ca8a04;">Retirar</button>` : ''}
                    <button class="btn btn-delete" onclick="deletarVenda(${sale.id}, event); fecharModal();" style="flex: 1; background: rgba(239, 68, 68, 0.8); padding: 10px;">Excluir</button>
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
    durationFilter.addEventListener('change', () => {
        renderTable();
    });

    periodFilter.addEventListener('change', () => {
        renderTable();
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
