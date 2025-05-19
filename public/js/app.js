document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const serverForm = document.getElementById('server-form');
    const serverInput = document.getElementById('server-input');
    const portInput = document.getElementById('port-input');
    const editionInput = document.getElementById('edition-input');
    const editionTabs = document.querySelectorAll('.tab-button');
    const resultsSection = document.getElementById('results-section');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const modsSection = document.getElementById('mods-section');
    
    // Server details elements
    const serverAddress = document.getElementById('server-address');
    const serverStatus = document.getElementById('server-status');
    const serverFavicon = document.getElementById('server-favicon');
    const statusValue = document.getElementById('status-value');
    const versionValue = document.getElementById('version-value');
    const playersValue = document.getElementById('players-value');
    const ipValue = document.getElementById('ip-value');
    const motdValue = document.getElementById('motd-value');
    const playerCount = document.getElementById('player-count');
    const playerList = document.getElementById('player-list');
    const modCount = document.getElementById('mod-count');
    const modList = document.getElementById('mod-list');
    const jsonResponse = document.getElementById('json-response');
    
    // Handle edition tab clicks
    editionTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove active class from all tabs
            editionTabs.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            this.classList.add('active');
            
            // Update hidden input value
            editionInput.value = this.dataset.edition;
            
            // Update port placeholder based on edition
            if (this.dataset.edition === 'bedrock') {
                portInput.placeholder = 'Port (default: 19132)';
                if (portInput.value === '25565') {
                    portInput.value = '19132';
                }
            } else {
                portInput.placeholder = 'Port (default: 25565)';
                if (portInput.value === '19132') {
                    portInput.value = '25565';
                }
            }
        });
    });
    
    // Handle form submission
    serverForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get server address, port, and edition
        const server = serverInput.value.trim();
        const port = portInput.value.trim() || (editionInput.value === 'bedrock' ? '19132' : '25565');
        const edition = editionInput.value;
        
        if (!server) {
            showError('Please enter a server address.');
            return;
        }
        
        // Show loading state
        showLoading();
        
        // Query the server
        queryServer(server, port, edition);
    });
    
    // Function to query server status
    function queryServer(server, port, edition) {
        // Hide any previous errors
        errorMessage.classList.add('hidden');
        
        // Construct API URL based on edition
        let apiUrl = `/api/${edition}/${encodeURIComponent(server)}`;
        
        // Add port parameter if it's not the default port for the selected edition
        const defaultPort = edition === 'bedrock' ? '19132' : '25565';
        if (port !== defaultPort) {
            apiUrl += `?port=${port}`;
        }
        
        // Fetch server status
        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                // Display JSON response
                jsonResponse.textContent = JSON.stringify(data, null, 2);
                
                if (data.status === 'error' || !data.online) {
                    showError(data.error || 'Could not connect to server.');
                    return;
                }
                
                // Update UI with server details
                updateServerUI(data, server, port);
                
                // Show results
                hideLoading();
                resultsSection.classList.remove('hidden');
                
                // Scroll to results
                resultsSection.scrollIntoView({ behavior: 'smooth' });
            })
            .catch(error => {
                console.error('Error:', error);
                showError('An error occurred: ' + error.message);
                hideLoading();
            });
    }
    
    // Function to update UI with server details
    function updateServerUI(data, server, port) {
        // Update server address and port
        const defaultPort = data.edition === 'bedrock' ? '19132' : '25565';
        serverAddress.textContent = server + (port !== defaultPort ? ':' + port : '');
        ipValue.textContent = server + ':' + port;
        
        // Add edition indicator if available
        if (data.edition) {
            const editionBadge = document.createElement('span');
            editionBadge.className = `edition-badge ${data.edition}`;
            editionBadge.textContent = data.edition === 'bedrock' ? 'Bedrock' : 'Java';
            serverAddress.appendChild(editionBadge);
        }
        
        // Update status and version
        const statusBadge = serverStatus.querySelector('.status-badge');
        const statusText = data.online ? 'Online' : 'Offline';
        statusValue.textContent = statusText;
        
        if (data.online) {
            statusBadge.textContent = 'Online';
            statusBadge.classList.add('online');
            statusBadge.classList.remove('offline');
        } else {
            statusBadge.textContent = 'Offline';
            statusBadge.classList.add('offline');
            statusBadge.classList.remove('online');
        }
        
        // Update version
        const versionText = data.version || 'Unknown';
        versionValue.textContent = versionText;
        serverStatus.querySelector('.status-version').textContent = versionText;
        
        // Update players count
        const onlinePlayers = data.players?.online || 0;
        const maxPlayers = data.players?.max || 0;
        playersValue.textContent = formatNumber(onlinePlayers) + ' / ' + formatNumber(maxPlayers);
        
        // Update MOTD (Message of the Day)
        if (data.edition === 'bedrock') {
            const formattedMotd = formatBedrockMotd(data.motd);
            motdValue.innerHTML = formattedMotd;
            motdValue.classList.add('bedrock-motd');
        } else {
            motdValue.textContent = data.motd || 'A Minecraft Server';
            motdValue.classList.remove('bedrock-motd');
        }
        
        // Update favicon if available
        if (data.favicon) {
            serverFavicon.src = data.favicon;
        } else {
            // Use default server icon
            serverFavicon.src = '/img/default-server.png';
        }
        
        // Update player list
        updatePlayerList(data.players);
        
        // Update mods if available (only for Java edition)
        if (data.mods && data.mods.count > 0) {
            updateModList(data.mods);
            modsSection.classList.remove('hidden');
        } else {
            modsSection.classList.add('hidden');
        }
        
        // Update player capacity chart
        updatePlayerChart(onlinePlayers, maxPlayers);
        
        // Update ping/latency indicator 
        updatePingIndicator(data.latency);
    }
    
    // Function to update player capacity chart
    function updatePlayerChart(online, max) {
        const playerPercentage = max > 0 ? Math.round((online / max) * 100) : 0;
        const playerPercent = document.getElementById('player-percent');
        const playerPercentagePath = document.getElementById('player-percentage');
        
        playerPercent.textContent = playerPercentage + '%';
        playerPercentagePath.setAttribute('stroke-dasharray', `${playerPercentage}, 100`);
        
        // Update color based on capacity
        if (playerPercentage > 90) {
            playerPercentagePath.setAttribute('stroke', 'var(--error-color)');
        } else if (playerPercentage > 70) {
            playerPercentagePath.setAttribute('stroke', 'var(--warning-color)');
        } else {
            playerPercentagePath.setAttribute('stroke', 'var(--primary-color)');
        }
    }
    
    // Function to update player list
    function updatePlayerList(players) {
        const playersList = players?.list || [];
        playerCount.textContent = `(${players?.online || 0})`;
        
        // Clear existing players
        playerList.innerHTML = '';
        
        if (playersList.length > 0) {
            // Filter out entries that are likely not actual players
            const validPlayers = playersList.filter(player => {
                // Filter out entries that look like server advertisements
                if (!player.name || !player.id) return false;
                const name = player.name.toLowerCase();
                
                // Skip entries with domain indicators or formatting that suggests they're not players
                return !(
                    name.includes('http') || 
                    name.includes('www') || 
                    name.includes('.net') || 
                    name.includes('.com') || 
                    name.includes('discord') || 
                    name.includes('§f') || 
                    name.startsWith('§') ||
                    name.includes('store')
                );
            });
            
            if (validPlayers.length > 0) {
                // Add players to the list
                validPlayers.forEach(player => {
                    const playerItem = document.createElement('div');
                    playerItem.className = 'player-item';
                    
                    // Clean player name from Minecraft formatting codes
                    const cleanName = player.name.replace(/§[0-9a-fk-or]/gi, '');
                    
                    // Create UUID-based avatar URL (uses Minecraft avatar service)
                    const avatarUrl = `https://crafatar.com/avatars/${player.id}?size=32&overlay`;
                    
                    playerItem.innerHTML = `
                        <img src="${avatarUrl}" alt="${cleanName}" class="player-avatar">
                        <span>${cleanName}</span>
                    `;
                    
                    playerList.appendChild(playerItem);
                });
            } else {
                // No valid players to display
                const noPlayers = document.createElement('div');
                noPlayers.className = 'no-players';
                noPlayers.textContent = 'No online players found or player list is hidden.';
                playerList.appendChild(noPlayers);
            }
        } else {
            // No players to display
            const noPlayers = document.createElement('div');
            noPlayers.className = 'no-players';
            noPlayers.textContent = 'No online players found or player list is hidden.';
            playerList.appendChild(noPlayers);
        }
    }
    
    // Function to update mod list
    function updateModList(mods) {
        const modsList = mods?.list || [];
        modCount.textContent = `(${mods.count})`;
        
        // Clear existing mods
        modList.innerHTML = '';
        
        if (modsList.length > 0) {
            // Add mods to the list
            modsList.forEach(mod => {
                const modItem = document.createElement('div');
                modItem.className = 'mod-item';
                
                modItem.innerHTML = `
                    <i class="fas fa-puzzle-piece mod-icon"></i>
                    <div>
                        <div>${mod.name}</div>
                        <small>${mod.version || ''}</small>
                    </div>
                `;
                
                modList.appendChild(modItem);
            });
        } else {
            // No mods to display
            const noMods = document.createElement('div');
            noMods.className = 'no-mods';
            noMods.textContent = 'Mod information not found.';
            modList.appendChild(noMods);
        }
    }
    
    // Function to show error message
    function showError(message) {
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
        hideLoading();
    }
    
    // Function to format number with commas
    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    // Function to show loading state
    function showLoading() {
        // Create loading element if it doesn't exist
        if (!document.querySelector('.loading-container')) {
            const loadingContainer = document.createElement('div');
            loadingContainer.className = 'loading-container';
            loadingContainer.innerHTML = `
                <div class="loading"></div>
                <p>Querying server status...</p>
            `;
            
            // Insert after form
            serverForm.parentNode.insertBefore(loadingContainer, serverForm.nextSibling);
        } else {
            document.querySelector('.loading-container').classList.remove('hidden');
        }
    }
    
    // Function to hide loading state
    function hideLoading() {
        const loadingContainer = document.querySelector('.loading-container');
        if (loadingContainer) {
            loadingContainer.classList.add('hidden');
        }
    }
    
    // Function to update ping/latency indicator
    function updatePingIndicator(pingMs) {
        const pingValue = document.getElementById('ping-value');
        if (!pingValue) return;
        
        // If ping is not available, show N/A
        if (pingMs === null || pingMs === undefined) {
            pingValue.textContent = 'N/A';
            return;
        }
        
        // Format and display the ping value
        pingValue.textContent = Math.round(pingMs);
        
        // Add color class based on ping value
        pingValue.className = 'ping-value';
        if (pingMs < 100) {
            pingValue.classList.add('good-ping');
        } else if (pingMs < 300) {
            pingValue.classList.add('average-ping');
        } else {
            pingValue.classList.add('poor-ping');
        }
    }
    
    // Function to format Bedrock MOTD for better readability
    function formatBedrockMotd(motd) {
        if (!motd) return 'A Minecraft Bedrock Server';
        
        // Clean up any special characters that might be in the MOTD
        let cleanMotd = motd.trim();
        
        // Split by line breaks if present
        const lines = cleanMotd.split('\n');
        
        // Format with better styling
        let formattedMotd = '';
        if (lines.length > 1) {
            formattedMotd = `<div class="bedrock-motd-line main-line">${lines[0]}</div>`;
            for (let i = 1; i < lines.length; i++) {
                formattedMotd += `<div class="bedrock-motd-line sub-line">${lines[i]}</div>`;
            }
        } else {
            formattedMotd = `<div class="bedrock-motd-line">${cleanMotd}</div>`;
        }
        
        return formattedMotd;
    }
    
    // Check if URL has a server parameter
    const urlParams = new URLSearchParams(window.location.search);
    const serverParam = urlParams.get('server');
    const portParam = urlParams.get('port');
    
    if (serverParam) {
        // Fill form fields
        serverInput.value = serverParam;
        if (portParam) portInput.value = portParam;
        
        // Submit form automatically
        setTimeout(() => {
            serverForm.dispatchEvent(new Event('submit'));
        }, 500);
    }
}); 