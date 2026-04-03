document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('search-form');
    const loadBtn = document.getElementById('search-btn');
    const resultsSection = document.getElementById('results-section');
    const resultsContainer = document.getElementById('results-container');
    const historyList = document.getElementById('history-list');

    // Modal UI logic
    const modal = document.getElementById('delete-modal');
    const modalList = document.getElementById('modal-history-list');
    const clearBtn = document.getElementById('clear-history-btn');

    // Load history on mount
    loadHistory();

    // Mobile Sidebar Toggle
    const toggleBtn = document.getElementById('toggle-history-btn');
    const sidebar = document.querySelector('.sidebar');
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            toggleBtn.textContent = sidebar.classList.contains('collapsed') ? 'Show History' : 'Hide History';
        });
        
        // Initial state for mobile
        if (window.innerWidth < 600) {
            sidebar.classList.add('collapsed');
            toggleBtn.style.display = 'inline-block';
        }
    }

    // Dynamic Labels
    function adjustLabels() {
        const searchBtnText = document.querySelector('#search-btn .btn-text');
        if (searchBtnText) {
            searchBtnText.textContent = window.innerWidth < 480 ? 'Search' : 'Search local prices';
        }
        
        const zipLabel = document.querySelector('label[for="zip"]');
        if (zipLabel) {
            zipLabel.textContent = window.innerWidth < 400 ? 'Zip' : 'Zip Code';
        }
    }
    window.addEventListener('resize', adjustLabels);
    adjustLabels();

    // Mode Toggle Logic
    const modeStandard = document.getElementById('mode-standard');
    const modeCommute = document.getElementById('mode-commute');
    const zipContainer = document.getElementById('zip-container');
    const commuteContainer = document.getElementById('commute-container');
    let isCommuteMode = false;

    if (modeStandard && modeCommute) {
        modeStandard.onclick = () => {
            isCommuteMode = false;
            modeStandard.classList.add('active');
            modeCommute.classList.remove('active');
            zipContainer.style.display = 'flex';
            commuteContainer.style.display = 'none';
        };
        modeCommute.onclick = () => {
            isCommuteMode = true;
            modeCommute.classList.add('active');
            modeStandard.classList.remove('active');
            zipContainer.style.display = 'none';
            commuteContainer.style.display = 'flex';
        };
    }

    // Attach Manage/Clear History functionality to summon Modal
    if (clearBtn && modal) {
        clearBtn.addEventListener('click', () => {
            let hist = JSON.parse(localStorage.getItem('budgetAppHistoryV6') || '[]');
            if (hist.length === 0) return alert("You don't have any recent searches saved to clear!");
            
            modalList.innerHTML = '';
            hist.forEach(h => {
                const lbl = document.createElement('label');
                lbl.className = 'modal-checkbox-item';
                const shortItems = h.items.length > 35 ? h.items.substring(0,35) + '...' : h.items;
                lbl.innerHTML = `
                    <input type="checkbox" value="${h.id}" class="delete-checkbox">
                    <span><strong>${h.zip}</strong> &nbsp;—&nbsp; <span style="color:#cbd5e1;">${shortItems}</span></span>
                `;
                modalList.appendChild(lbl);
            });
            modal.showModal();
        });

        document.getElementById('modal-cancel').onclick = () => {
            modal.close();
        };

        document.getElementById('modal-delete-all').onclick = () => {
            if(confirm("Permanently wipe all historical searches?")) {
                localStorage.removeItem('budgetAppHistoryV6');
                loadHistory();
                modal.close();
            }
        };

        document.getElementById('modal-delete-selected').onclick = () => {
            const checkboxes = document.querySelectorAll('.delete-checkbox:checked');
            if (checkboxes.length === 0) return alert("Please select at least one search to delete.");
            const idsToDelete = Array.from(checkboxes).map(c => parseInt(c.value));
            let hist = JSON.parse(localStorage.getItem('budgetAppHistoryV6') || '[]');
            hist = hist.filter(h => !idsToDelete.includes(h.id));
            localStorage.setItem('budgetAppHistoryV6', JSON.stringify(hist));
            loadHistory();
            modal.close();
        };
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const zip = document.getElementById('zip').value;
        const radius = document.getElementById('radius').value;
        const itemsInput = document.getElementById('custom-items').value;
        const items = itemsInput.split(',').map(i => i.trim()).filter(i => i);

        if (items.length === 0) {
            alert('Please enter at least one item.');
            return;
        }

        loadBtn.classList.add('loading');
        resultsSection.classList.add('hidden');
        resultsContainer.innerHTML = '';
        
        try {
            const endpoint = window.location.protocol === 'file:' ? 'http://127.0.0.1:8000/search' : '/search';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    zip: isCommuteMode ? null : zip, 
                    radius: parseInt(radius), 
                    items,
                    origin_zip: isCommuteMode ? document.getElementById("origin-zip").value : null, 
                    dest_zip: isCommuteMode ? document.getElementById("dest-zip").value : null 
                })
            });

            if(!res.ok) {
                const txt = await res.text();
                throw new Error(txt || "Search failed");
            }
            
            const data = await res.json();
            renderResults(data, isCommuteMode ? 'Commute' : zip);
            saveHistory(isCommuteMode ? 'Commute' : zip, items, data);

        } catch (error) {
            console.error(error);
            alert("Failed to retrieve local prices.");
            resultsContainer.innerHTML = `<p style="color:#ff6b6b; padding: 1rem; background: rgba(255,0,0,0.1); border-radius: 8px;">Error: ${error.message}</p>`;
            resultsSection.classList.remove('hidden');
        } finally {
            loadBtn.classList.remove('loading');
        }
    });

    function renderResults(data, zipLabel) {
        resultsContainer.innerHTML = '';
        resultsSection.classList.remove('hidden');

        if (data.is_commute) {
            const results = data.results;
            const labels = data.location_labels || Object.keys(results);
            const zips = Object.keys(results);
            
            if (zips.length === 0) {
                resultsContainer.innerHTML = '<p>No data found.</p>';
                return;
            }

            // Iterate through the results by ZIP
            zips.forEach((z, idx) => {
                const label = labels[idx] || z;
                const title = idx === 0 ? "Start Location" : "End Location";
                renderGroup(label, results[z], title);
            });
        } else {
            const results = Array.isArray(data.results) ? data.results : [];
            if (results.length === 0) {
                resultsContainer.innerHTML = '<p>No data found.</p>';
                return;
            }
            renderStoreList(results);
        }
    }

    function renderGroup(location, stores, title) {
        const groupHeader = document.createElement('h3');
        groupHeader.className = 'commute-group-header';
        groupHeader.innerHTML = `<span style="color: #6366f1;">${title}</span> (${location})`;
        groupHeader.style.gridColumn = '1 / -1';
        groupHeader.style.marginTop = '2rem';
        groupHeader.style.marginBottom = '1rem';
        groupHeader.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        groupHeader.style.paddingBottom = '0.5rem';
        resultsContainer.appendChild(groupHeader);
        
        if (!stores || stores.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = 'No data found for this location.';
            empty.style.gridColumn = '1 / -1';
            resultsContainer.appendChild(empty);
            return;
        }

        renderStoreList(stores);
    }

    function renderStoreList(results) {
        results.forEach(storeData => {
            if (Object.keys(storeData.prices || {}).length === 0) return;

            const card = document.createElement('div');
            card.className = 'result-card';
            
            let pricesHtml = '';
            for(const [itm, priceData] of Object.entries(storeData.prices || {})) {
                let unit = '';
                const itmLower = itm.toLowerCase();
                if (storeData.type.toLowerCase() === 'fuel') {
                    unit = (itmLower.includes('ev') || itmLower.includes('charging') || itmLower.includes('kw')) ? ' / kW' : ' / gal';
                } else if (storeData.type.toLowerCase() === 'grocery') {
                    const lbItems = ['orange', 'apple', 'banana', 'chicken', 'beef', 'pork', 'meat', 'steak', 'produce', 'grape', 'carrot', 'potato', 'onion', 'lettuce', 'tomato', 'ground'];
                    if (lbItems.some(lb => itmLower.includes(lb))) unit = ' / lb';
                }
                
                let displayTotal = 0;
                let unitPriceText = '';
                if (typeof priceData === 'object' && priceData !== null) {
                    displayTotal = priceData.total;
                    if (priceData.qty !== 1) {
                        unitPriceText = `<span style="font-size:0.85rem; color:#94a3b8; margin-right: 8px;">($${priceData.unit_price.toFixed(2)}${unit})</span>`;
                    } else if (unit) {
                        unitPriceText = `<span style="font-size:0.85rem; color:#94a3b8; margin-right: 8px;">${unit}</span>`;
                    }
                } else {
                    displayTotal = priceData;
                    if (unit) unitPriceText = `<span style="font-size:0.85rem; color:#94a3b8; margin-right: 8px;">${unit}</span>`;
                }

                pricesHtml += `
                    <div class="price-item" style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="item-name">${itm}</span>
                        <div style="display:flex; align-items:center;">
                            ${unitPriceText}
                            <span class="item-val" style="font-size:1.1rem;">$${displayTotal.toFixed(2)}</span>
                        </div>
                    </div>
                `;
            }
            
            let totalHtml = (storeData.type.toLowerCase() !== 'fuel') ? `
                <div class="store-total">
                    <span>Basket Total</span>
                    <span>$${(storeData.total || 0).toFixed(2)}</span>
                </div>` : '';

            card.innerHTML = `
                <div class="store-name">${storeData.store}</div>
                <div class="store-type">${storeData.type}</div>
                <div class="price-list">${pricesHtml}</div>
                ${totalHtml}
            `;
            resultsContainer.appendChild(card);
        });
    }

    function saveHistory(zip, items, data) {
        let history = JSON.parse(localStorage.getItem('budgetAppHistoryV6') || '[]');
        const entry = { id: Date.now(), zip, date: new Date().toLocaleDateString(), items: items.join(', '), data };
        history.unshift(entry);
        if (history.length > 100) history = history.slice(0, 100); 
        localStorage.setItem('budgetAppHistoryV6', JSON.stringify(history));
        loadHistory();
    }

    function loadHistory() {
        let history = JSON.parse(localStorage.getItem('budgetAppHistoryV6') || '[]');
        if (history.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No recent searches</p>';
            return;
        }

        historyList.innerHTML = '';
        history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.innerHTML = `
                <div style="flex:1; cursor:pointer;" class="clickable-history">
                    <div class="history-item-zip">Zip: ${item.zip}</div>
                    <div class="history-item-date">${item.date} • ${item.items.substring(0, 30)}...</div>
                </div>
                <button class="delete-btn" style="background:none; border:none; color:#64748b; font-size:1.3rem; margin-left:8px; cursor:pointer; transition:0.2s;" title="Delete">&times;</button>
            `;
            
            div.querySelector('.clickable-history').onclick = () => {
                const zipInput = document.getElementById('zip');
                if (item.zip === 'Commute') {
                    modeCommute.click();
                } else {
                    modeStandard.click();
                    zipInput.value = item.zip;
                }
                document.getElementById('custom-items').value = item.items;
                renderResults(item.data, item.zip);
            };

            div.querySelector('.delete-btn').onclick = (e) => {
                e.stopPropagation();
                let hist = JSON.parse(localStorage.getItem('budgetAppHistoryV6') || '[]');
                hist = hist.filter(h => h.id !== item.id);
                localStorage.setItem('budgetAppHistoryV6', JSON.stringify(hist));
                loadHistory();
            };
            historyList.appendChild(div);
        });
    }
});

// --- Final Matrix Fire Rain Background ---
(function() {
    const canvas = document.getElementById("canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let width, height, columns, drops;
    
    function getFontSize() {
        return Math.min(70, Math.max(30, window.innerWidth / 15));
    }

    function init() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        const fontSize = getFontSize();
        columns = Math.floor(width / fontSize);
        drops = Array(columns).fill(0).map(() => Math.random() * -height);
    }

    window.addEventListener("resize", init);
    init();

    let particles = [];
    function getColor(y) {
        if (y < height * 0.4) return "rgb(0,255,70)";
        if (y < height * 0.65) return "rgb(255,140,0)";
        return "rgb(255,50,50)";
    }

    function createParticle(x, y) {
        return { x, y, vx: (Math.random() - 0.5) * 0.5, vy: -Math.random() * 2 - 1, life: Math.random() * 50 + 50, size: Math.random() * 3 + 2 };
    }

    function draw() {
        const fontSize = getFontSize();
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(0, 0, width, height);
        ctx.font = fontSize + "px monospace";

        for (let i = 0; i < drops.length; i++) {
            const x = i * fontSize;
            const y = drops[i];

            if (y > height * (2/3)) {
                if (Math.random() > 0.5) particles.push(createParticle(x, y));
                ctx.fillStyle = "rgb(255,80,0)";
            } else {
                ctx.fillStyle = getColor(y);
            }

            ctx.fillText("$", x, y);
            drops[i] += 8.064; 
            if (drops[i] > height && Math.random() > 0.975) drops[i] = Math.random() * -100;
        }

        particles.forEach((p, i) => {
            p.x += p.vx + (Math.random() - 0.5) * 0.3;
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) {
                particles.splice(i, 1);
            } else {
                const intensity = p.life / 100;
                ctx.beginPath();
                ctx.fillStyle = `rgba(255, ${Math.floor(150 * intensity)}, 0, ${intensity})`;
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        requestAnimationFrame(draw);
    }
    draw();
})();

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW Registered', reg))
            .catch(err => console.log('SW Registration failed', err));
    });
}
