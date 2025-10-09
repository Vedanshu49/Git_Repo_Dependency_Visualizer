// --- ORIGINAL APPLICATION LOGIC ---
const repoUrlInput = document.getElementById('repoUrl');
const analyzeBtn = document.getElementById('analyzeBtn');
const githubTokenInput = document.getElementById('githubToken');
const mainContent = document.getElementById('mainContent');
const graphContainer = document.getElementById('graphContainer');
const detailsContent = document.getElementById('detailsContent');
const repoDetailsContainer = document.getElementById('repoDetails');
const repoOverviewContainer = document.getElementById('repoOverviewContainer');
const fileTreeContainer = document.getElementById('fileTreeContainer');
const messageOverlay = document.getElementById('messageOverlay');
const messageText = document.getElementById('messageText');
const howToTokenBtn = document.getElementById('howToTokenBtn');
const tokenModal = document.getElementById('tokenModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const gotItBtn = document.getElementById('gotItBtn');
const errorModal = document.getElementById('errorModal');
const errorModalText = document.getElementById('errorModalText');
const closeErrorModalBtn = document.getElementById('closeErrorModalBtn');
const aiModal = document.getElementById('aiModal');
const aiModalTitle = document.getElementById('aiModalTitle');
const aiModalResult = document.getElementById('aiModalResult');
const closeAiModalBtn = document.getElementById('closeAiModalBtn');
const gotItAiModalBtn = document.getElementById('gotItAiModalBtn');
const fileTreeModal = document.getElementById('fileTreeModal');
const fullFileTreeContainer = document.getElementById('fullFileTreeContainer');
const closeFileTreeModalBtn = document.getElementById('closeFileTreeModalBtn');
const gotItFileTreeModalBtn = document.getElementById('gotItFileTreeModalBtn');
const viewMoreTreeBtn = document.getElementById('viewMoreTreeBtn');
const fileTreeSearchInput = document.getElementById('fileTreeSearchInput');
const forgetTokenBtn = document.getElementById('forgetTokenBtn');
const commitSelector = document.getElementById('commit-selector');
const goToLatestBtn = document.getElementById('goToLatestBtn');
let searchInput, exportBtn, layoutSwitcher;

// --- State ---
let currentOwner, currentRepo;
let repoFiles = [];
let allFolderEdges = [];
let dependencies = [];
let allNodes = [], nodes = [], edges = []; // allNodes contains everything, nodes is the filtered list for rendering
let selectedNodeId = null;
let simulation;
let currentLayout = 'force'; // 'force', 'hierarchical', 'circular'
let isFocusModeActive = false; // Global state for focus mode

// --- Event Listeners ---
analyzeBtn.addEventListener('click', () => handleAnalyzeClick());
repoUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAnalyzeClick();
});
howToTokenBtn.addEventListener('click', () => openModal(tokenModal));
closeModalBtn.addEventListener('click', () => closeModal(tokenModal));
gotItBtn.addEventListener('click', () => closeModal(tokenModal));
tokenModal.addEventListener('click', (e) => {
    if (e.target === tokenModal) closeModal(tokenModal);
});
closeErrorModalBtn.addEventListener('click', () => closeModal(errorModal));
errorModal.addEventListener('click', (e) => {
    if (e.target === errorModal) closeModal(errorModal);
});
closeAiModalBtn.addEventListener('click', () => closeModal(aiModal));
gotItAiModalBtn.addEventListener('click', () => closeModal(aiModal));
aiModal.addEventListener('click', (e) => {
    if (e.target === aiModal) closeModal(aiModal);
});
viewMoreTreeBtn.addEventListener('click', () => openModal(fileTreeModal));
closeFileTreeModalBtn.addEventListener('click', () => closeModal(fileTreeModal));
gotItFileTreeModalBtn.addEventListener('click', () => closeModal(fileTreeModal));
fileTreeModal.addEventListener('click', (e) => {
    if (e.target === fileTreeModal) closeModal(fileTreeModal);
});
fileTreeSearchInput.addEventListener('input', () => {
    const query = fileTreeSearchInput.value.toLowerCase().trim();
    filterFileTree(fullFileTreeContainer, query);
});
forgetTokenBtn.addEventListener('click', forgetToken);
commitSelector.addEventListener('change', (e) => {
    const commitSha = e.target.value;
    if (commitSha) {
        handleAnalyzeClick(commitSha);
    }
});
goToLatestBtn.addEventListener('click', () => handleAnalyzeClick());

// --- Modal Functions ---
function openModal(modal) {
    if (!modal) return;
    const content = modal.querySelector('.modal-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.add('opacity-100');
        content.style.transform = 'scale(1) translateY(0)';
    }, 10);
}

function closeModal(modal) {
    if (!modal) return;
    const content = modal.querySelector('.modal-content');
    modal.classList.remove('opacity-100');
    content.style.transform = 'scale(0.95) translateY(1rem)';
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 400);
}

[tokenModal, errorModal, aiModal, fileTreeModal].forEach(modal => {
    if (modal) {
        const content = modal.querySelector('.modal-content');
        if (content) content.style.transform = 'scale(0.95) translateY(1rem)';
    }
});


// --- Main Logic ---


function initializeGraphControls() {
    searchInput = document.getElementById('searchInput');
    exportBtn = document.getElementById('exportBtn');
    layoutSwitcher = document.getElementById('layoutSwitcher');
    const layoutHelpBtn = document.getElementById('layoutHelpBtn');
    const layoutHelpPopup = document.getElementById('layoutHelpPopup');
    const layoutHelpTitle = document.getElementById('layoutHelpTitle');
    const layoutHelpText = document.getElementById('layoutHelpText');

    const layoutInfo = {
        force: {
            title: 'Force-Directed Layout',
            text: 'This layout uses a physics-based simulation to position nodes. It is good for revealing the underlying structure of the graph, such as clusters and central nodes.'
        },
        hierarchical: {
            title: 'Hierarchical Layout',
            text: 'This layout attempts to arrange the nodes in a tree-like structure, which is useful for visualizing dependencies and flow.'
        },
        circular: {
            title: 'Circular Layout',
            text: 'This layout arranges the nodes in a circle. It can be useful for identifying patterns in the connections between nodes.'
        }
    };

    function updateLayoutHelp(layout) {
        layoutHelpTitle.textContent = layoutInfo[layout].title;
        layoutHelpText.textContent = layoutInfo[layout].text;
    }

    layoutHelpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = layoutHelpPopup.classList.contains('hidden');
        if (isHidden) {
            const btnRect = layoutHelpBtn.getBoundingClientRect();
            const containerRect = layoutHelpBtn.parentElement.getBoundingClientRect();
            layoutHelpPopup.style.left = `${btnRect.left - containerRect.left}px`;
            layoutHelpPopup.style.top = `${btnRect.bottom - containerRect.top + 10}px`;
            updateLayoutHelp(layoutSwitcher.value);
            layoutHelpPopup.classList.remove('hidden');
        } else {
            layoutHelpPopup.classList.add('hidden');
        }
    });

    document.addEventListener('click', () => {
        layoutHelpPopup.classList.add('hidden');
    });

    layoutSwitcher.addEventListener('change', (e) => {
        currentLayout = e.target.value;
        renderGraph(nodes, edges);
        if (!layoutHelpPopup.classList.contains('hidden')) {
            updateLayoutHelp(currentLayout);
        }
    });

    document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', applyFiltersAndRender);
    });

    searchInput.addEventListener('input', handleSearch);
    exportBtn.addEventListener('click', handleExport);
}

function applyFiltersAndRender() {
    const filters = {
        tests: document.querySelector('[data-filter="tests"]').checked,
        styles: document.querySelector('[data-filter="styles"]').checked,
        json: document.querySelector('[data-filter="json"]').checked,
        folders: document.querySelector('[data-filter="folders"]').checked,
        unused: document.querySelector('[data-filter="unused"]').checked
    };

    nodes = allNodes.filter(node => {
        const lowerId = node.id.toLowerCase();
        if (filters.tests && (lowerId.includes('.test.') || lowerId.includes('.spec.') || lowerId.includes('__tests__/'))) return false;
        if (filters.styles && (lowerId.endsWith('.css') || lowerId.endsWith('.scss'))) return false;
        if (filters.json && lowerId.endsWith('.json')) return false;
        return true;
    });
    
    const nodeIds = new Set(nodes.map(n => n.id));
    let dependencyEdges = allEdges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    
    edges = dependencyEdges;

    if (filters.folders) {
        const folderEdges = allFolderEdges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
        edges = [...edges, ...folderEdges];
    }
    
    renderGraph(nodes, edges);
}


function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    const allGraphNodes = d3.selectAll('.node');

    if (!query) {
        allGraphNodes.classed('searched', false).transition().duration(300).style('opacity', 1);
        return;
    }
    
    allGraphNodes.each(function(d) {
        const isMatch = d.label.toLowerCase().includes(query);
        d3.select(this)
          .classed('searched', isMatch)
          .transition().duration(300)
          .style('opacity', isMatch ? 1 : 0.1);
    });
}

async function detectTechStack(files) {
    const techStack = new Set();
    if (!files || !Array.isArray(files)) {
        displayTechStack(Array.from(techStack));
        return;
    }
    const packageJsonFile = files.find(f => f && f.path && f.path.toLowerCase().endsWith('package.json'));

    if (packageJsonFile) {
        techStack.add('Node.js');
        techStack.add('npm');
        try {
            const content = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/contents/${packageJsonFile.path}`);
            const decoded = atob(content.content);
            const pkg = JSON.parse(decoded);
            const allDependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

            if (allDependencies.react) techStack.add('React');
            if (allDependencies.vue) techStack.add('Vue.js');
            if (allDependencies.angular) techStack.add('Angular');
            if (allDependencies.express) techStack.add('Express');
            if (allDependencies.webpack) techStack.add('Webpack');
            if (allDependencies.typescript) techStack.add('TypeScript');
            
            await checkDependencyHealth(pkg.dependencies); // Check only runtime dependencies for health
        } catch (e) {
            console.error("Could not parse package.json", e);
        }
    }
    
    if (files.some(f => f && f.path && f.path.toLowerCase().endsWith('requirements.txt'))) techStack.add('Python');
    if (files.some(f => f && f.path && f.path.toLowerCase().endsWith('pom.xml'))) techStack.add('Java');
    if (files.some(f => f && f.path && f.path.toLowerCase().endsWith('composer.json'))) techStack.add('PHP');

    displayTechStack(Array.from(techStack));
}

function displayTechStack(stack) {
    const container = document.getElementById('techStackContent');
    container.innerHTML = '';
    if (stack.length === 0) {
        container.innerHTML = '<p class="text-gray-400">No specific tech stack detected.</p>';
        return;
    }
    
    stack.forEach(tech => {
        const slug = tech.toLowerCase().replace(/\./g, '').replace(/ /g, '-');
        const iconUrl = `https://cdn.simpleicons.org/${slug}/white`;
        const div = document.createElement('div');
        div.className = 'tech-icon';
        div.innerHTML = `<img src="${iconUrl}" alt="${tech} icon" onerror="this.style.display='none'"><span>${tech}</span>`;
        container.appendChild(div);
    });
}

async function checkDependencyHealth(dependencies) {
    const container = document.getElementById('dependencyHealthContainer');
    if (!dependencies || Object.keys(dependencies).length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <h3 class="text-xl font-bold text-white mt-6 mb-2">Dependency Health</h3>
        <p class="text-sm text-gray-400 mb-2">Based on simulated vulnerability data.</p>
        <div id="health-loader" class="custom-loader mx-auto"></div>
    `;

    try {
        const response = await fetch('/api/security', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dependencies })
        });
        if (!response.ok) {
            await handleApiError(response);
        }
        
        const insights = await response.json();
        
        let content = '<ul class="text-sm space-y-2 mt-2">';
        let vulnerableCount = 0;
        Object.entries(insights).forEach(([name, data]) => {
            if (data.vulnerable) vulnerableCount++;
            content += `
                <li class="dependency-item ${data.vulnerable ? 'vulnerable' : ''}">
                    <strong>${name}</strong>
                    <span class="text-gray-400">(${data.license || 'N/A'})</span>
                    ${data.vulnerable ? ` - 🚨 Vulnerable (${data.current})` : ''}
                </li>
            `;
        });
        content += '</ul>';

        const summary = vulnerableCount > 0 
            ? `<p class="text-red-400 font-bold">${vulnerableCount} potential vulnerabilit${vulnerableCount > 1 ? 'ies' : 'y'} found.</p>`
            : `<p class="text-green-400 font-bold">No known vulnerabilities found.</p>`;

        container.innerHTML = `
            <h3 class="text-xl font-bold text-white mt-6 mb-2">Dependency Health</h3>
            ${summary}
            ${content}
        `;

    } catch (error) {
        container.innerHTML = `<p class="text-red-400">Could not load complexity metrics.</p>`;
    }
}


function displayRepoInfo(repoInfo, commitsData) {
    const totalCommits = commitsData.length;

    repoDetailsContainer.innerHTML = `
        <div class="flex items-center space-x-4">
            <img src="${repoInfo.owner.avatar_url}" alt="Owner Avatar" class="w-16 h-16 rounded-full border-2 border-blue-400">
            <div>
                <h3 class="text-xl font-bold text-white">${repoInfo.owner.login}</h3>
                <a href="${repoInfo.owner.html_url}" target="_blank" class="text-blue-400 hover:underline">View Profile</a>
            </div>
        </div>
        <div class="mt-4 space-y-2 text-sm">
            <p><strong class="font-semibold text-gray-300">Created:</strong> ${new Date(repoInfo.created_at).toLocaleDateString()}</p>
            <p><strong class="font-semibold text-gray-300">Last Push:</strong> ${new Date(repoInfo.pushed_at).toLocaleDateString()}</p>
            <p><strong class="font-semibold text-gray-300">Total Commits (last 100):</strong> ${totalCommits}</p>
        </div>
        <div class="mt-4">
            <h4 class="font-semibold text-gray-300 mb-2">Commit Timeline (last 10)</h4>
            <div class="space-y-3">
                ${commitsData.slice(0, 10).map(commit => `
                    <div class="flex items-center text-xs">
                        <div class="w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
                        <div class="flex-grow text-gray-400 truncate" title="${commit.commit.message}">${commit.commit.message.split('\n')[0]}</div>
                        <div class="text-gray-500 ml-2 flex-shrink-0">${new Date(commit.commit.committer.date).toLocaleDateString()}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    commitSelector.innerHTML = '<option value="">View Past Commits</option>';
    commitsData.forEach(commit => {
        const option = document.createElement('option');
        option.value = commit.sha;
        option.textContent = `${commit.commit.message.split('\n')[0]} (${new Date(commit.commit.committer.date).toLocaleDateString()})`;
        commitSelector.appendChild(option);
    });
    commitSelector.disabled = false;

    repoOverviewContainer.innerHTML = `
        <button id="generateRepoOverviewBtn" class="glare-hover w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center shadow-lg">
            Generate Repo Overview
        </button>
    `;
    document.getElementById('generateRepoOverviewBtn').addEventListener('click', handleGenerateRepoOverview);
}




// --- D3 Visualization ---
async function handleAnalyzeClick(commitSha = null) {
    const url = repoUrlInput.value.trim();
    const githubRegex = /github\.com\/([^\/]+)\/([^\/]+)/;
    const match = url.match(githubRegex);

    if (!match) {
        openModal(errorModal);
        errorModalText.textContent = 'Invalid GitHub repository URL.';
        return;
    }

    currentOwner = match[1];
    currentRepo = match[2];

    analyzeBtn.disabled = true;
    analyzeBtn.classList.add('opacity-50', 'cursor-not-allowed');

    showMessage('Fetching repository information...');
    document.getElementById('skeleton-loader').classList.remove('hidden'); // Show skeleton loader
    mainContent.classList.add('hidden'); // Hide main content initially
    // Clear previous results
    document.getElementById('techStackContent').innerHTML = '';
    document.getElementById('dependencyHealthContainer').innerHTML = '';

    saveToken();

    try {
        const repoInfo = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}`);
        const commitsData = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/commits?per_page=100`);

        displayRepoInfo(repoInfo, commitsData, commitSha);

        const latestCommitSha = commitSha || (await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/branches/${repoInfo.default_branch}`)).commit.sha;

        showMessage('Fetching file tree...');
        const treeData = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/git/trees/${latestCommitSha}?recursive=1`);
        
        if (!treeData.tree || treeData.tree.length === 0) {
            openModal(errorModal);
            errorModalText.textContent = 'No files found for this commit.';
            return;
        }
        const fullFileTree = treeData.tree || [];
        await detectTechStack(fullFileTree);

        repoFiles = fullFileTree.filter(file => {
            const path = file.path.toLowerCase();
            const isIgnored = path.includes('node_modules/') || path.includes('dist/') || path.includes('vendor/') || path.startsWith('.');
            return file.type === 'blob' && !isIgnored; // Only blobs (files) are analyzable
        });

        showMessage(`File tree loaded! Preparing to analyze ${repoFiles.length} files.`);
        
        if (repoFiles.length > 1000) { // Lowered limit for a stronger recommendation
            const message = `This repository contains ${repoFiles.length} files. Analysis may be slow or fail due to GitHub API rate limits. Using a GitHub Personal Access Token is strongly recommended.`;
            showMessage('Large Repository Detected', message);
        } else if (repoFiles.length > 200) { 
            showMessage(`Warning: Found ${repoFiles.length} files. This might take a while...`, false);
        }

        // --- Backend Analysis via Chunking ---
        dependencies = [];
        const chunkSize = 20;
        const numChunks = Math.ceil(repoFiles.length / chunkSize);

        for (let i = 0; i < numChunks; i++) {
            const chunk = repoFiles.slice(i * chunkSize, (i + 1) * chunkSize);
            showMessage(`Analyzing dependencies (${i + 1} of ${numChunks})...`);
            
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    owner: currentOwner,
                    repo: currentRepo,
                    files: chunk,
                    token: githubTokenInput.value.trim(),
                    latestCommit: latestCommitSha
                })
            });

            if (!response.ok) {
                await handleApiError(response);
            }

            const result = await response.json();
            dependencies.push(...result.dependencies);
        }
        // --- End Backend Analysis ---


        const nodeData = repoFiles.map(file => ({
            id: file.path,
            label: file.path.split('/').pop(),
            fullPath: file.path,
            size: file.size
        }));

        const inDegrees = {};
        const outDegrees = {};
        dependencies.forEach(dep => {
            inDegrees[dep.to] = (inDegrees[dep.to] || 0) + 1;
            outDegrees[dep.from] = (outDegrees[dep.from] || 0) + 1;
        });

        nodeData.forEach(node => {
            node.inDegree = inDegrees[node.id] || 0;
            node.outDegree = outDegrees[node.id] || 0;
            node.isUnused = node.inDegree === 0 && node.outDegree === 0;
        });

        const edgeData = dependencies.map(dep => ({ source: dep.from, target: dep.to, type: 'dependency' }));

        allNodes = nodeData;
        allEdges = edgeData;

        allFolderEdges = [];
        const allNodeIds = new Set(allNodes.map(n => n.id));
        // Create a set of all directory paths to represent them as nodes
        const folderPaths = new Set();
        allNodes.forEach(node => {
            const pathParts = node.id.split('/');
            let currentPath = '';
            for (let i = 0; i < pathParts.length - 1; i++) {
                currentPath += (i > 0 ? '/' : '') + pathParts[i];
                folderPaths.add(currentPath);
            }
        });

        // Add folder nodes to the graph
        folderPaths.forEach(path => {
            if (!allNodeIds.has(path)) {
                allNodes.push({
                    id: path,
                    label: path.split('/').pop(),
                    fullPath: path,
                    size: 0, // Folders have no size
                    isFolder: true // Custom flag
                });
                allNodeIds.add(path);
            }
        });
        
        // Create containment edges
        allNodes.forEach(node => {
            if (!node.isFolder) {
                const pathParts = node.id.split('/');
                if (pathParts.length > 1) {
                    const parentPath = pathParts.slice(0, -1).join('/');
                    if (allNodeIds.has(parentPath)) {
                        allFolderEdges.push({
                            source: parentPath,
                            target: node.id,
                            type: 'containment'
                        });
                    }
                }
            }
        });
        
        document.getElementById('skeleton-loader').classList.add('hidden'); // Hide skeleton loader
        mainContent.classList.remove('hidden'); // Show main content
        initializeGraphControls();
        applyFiltersAndRender(); // This will perform the initial render

        hideMessage();
        const fileTreeData = buildFileTreeData(repoFiles);
        renderFileTree(fileTreeData, fileTreeContainer);
        renderFileTree(fileTreeData, fullFileTreeContainer);
        updateDetailsPanel(null);
        renderHeatmapLegend();

    } catch (error) {
        console.error('Error analyzing repository:', error);
        hideMessage();
        openModal(errorModal);
        errorModalText.textContent = `Error: ${error.message}. Check if the repository is public and your token is valid.`;
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}


function applyFiltersAndRender() {
    const filters = {
        tests: document.querySelector('[data-filter="tests"]').checked,
        styles: document.querySelector('[data-filter="styles"]').checked,
        json: document.querySelector('[data-filter="json"]').checked,
        folders: document.querySelector('[data-filter="folders"]').checked,
        unused: document.querySelector('[data-filter="unused"]').checked
    };

    nodes = allNodes.filter(node => {
        const lowerId = node.id.toLowerCase();
        if (filters.tests && (lowerId.includes('.test.') || lowerId.includes('.spec.') || lowerId.includes('__tests__/'))) return false;
        if (filters.styles && (lowerId.endsWith('.css') || lowerId.endsWith('.scss'))) return false;
        if (filters.json && lowerId.endsWith('.json')) return false;
        return true;
    });
    
    const nodeIds = new Set(nodes.map(n => n.id));
    let dependencyEdges = allEdges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    
    edges = dependencyEdges;

    if (filters.folders) {
        const folderEdges = allFolderEdges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
        edges = [...edges, ...folderEdges];
    }
    
    renderGraph(nodes, edges);
}

function renderGraph(nodeData, edgeData) {
    graphContainer.innerHTML = '';
    const width = graphContainer.clientWidth;
    const height = graphContainer.clientHeight;

    const svg = d3.select(graphContainer).append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-width / 2, -height / 2, width, height]);

    const g = svg.append("g");

    const defs = svg.append("defs");
    defs.append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 22)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#6b7280");
        
    const nodeMap = new Map(nodeData.map(d => [d.id, d]));
    const hydratedEdges = edgeData.map(edge => ({
        ...edge,
        source: nodeMap.get(edge.source),
        target: nodeMap.get(edge.target)
    })).filter(e => e.source && e.target);

    const link = g.append("g")
        .selectAll("path")
        .data(hydratedEdges)
        .join("path")
        .attr("class", "edge")
        .attr("stroke", d => d.type === 'containment' ? '#5a6675' : '#4b5563')
        .attr("stroke-width", d => d.type === 'containment' ? 1 : 1.5)
        .attr("stroke-dasharray", d => d.type === 'containment' ? "3,3" : null)
        .attr("marker-end", d => d.type === 'containment' ? null : "url(#arrowhead)")
        .attr("fill", "none")
        .style("opacity", 0);

    const highlightUnused = document.querySelector('[data-filter="unused"]').checked;

    const node = g.append("g")
        .selectAll("g")
        .data(nodeData, d => d.id) // Key function for object constancy
        .join("g")
        .attr("class", "node")
        .classed("unused-node", d => highlightUnused && d.isUnused)
        .style("opacity", 0)
        .on("mouseover", function () {
            d3.select(this).raise();
        });

    const maxInDegree = d3.max(nodeData, d => d.inDegree) || 1;
    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxInDegree]);
    
    // Dynamic node radius based on graph size
    const nodeBaseRadius = nodeData.length > 75 ? 4 : 6;
    const nodeRadius = d => nodeBaseRadius + Math.sqrt(d.inDegree || 1) * 2.5;

    node.append("circle")
        .attr("r", nodeRadius)
        .attr("fill", d => colorScale(d.inDegree))
        .attr("stroke", "#4b5563");

    node.append("text")
        .attr("y", d => (15 + nodeRadius(d)) * -1)
        .attr("class", "node-label")
        .text(d => d.label);

    node.on("click", (event, d) => {
        event.stopPropagation();
        handleNodeClick(d.id);
    });

    node.transition()
        .duration(700)
        .delay((d, i) => i * 7)
        .ease(d3.easeCubicOut)
        .style("opacity", 1);

    link.transition()
        .duration(700)
        .delay(nodeData.length * 7)
        .ease(d3.easeCubicOut)
        .style("opacity", 0.5);

    // Stop any previous simulation
    if (simulation) simulation.stop();

    if (currentLayout === 'force') {
        applyForceLayout(nodeData, hydratedEdges, node, link, width, height);
    } else if (currentLayout === 'hierarchical') {
        applyHierarchicalLayout(nodeData, hydratedEdges, node, link, width, height);
    } else if (currentLayout === 'circular') {
        applyCircularLayout(nodeData, hydratedEdges, node, link, width, height);
    }

    const zoom = d3.zoom().scaleExtent([0.1, 8]).on("zoom", (event) => {
        g.attr("transform", event.transform);
    });
    
    // Set initial zoom to fit all nodes
    const bounds = g.node().getBBox();
    const fullWidth = bounds.width;
    const fullHeight = bounds.height;
    const midX = bounds.x + fullWidth / 2;
    const midY = bounds.y + fullHeight / 2;
    if (fullWidth === 0 || fullHeight === 0) { // No nodes, prevent zoom error
        svg.call(zoom);
    } else {
        const scale = 0.85 / Math.max(fullWidth / width, fullHeight / height);
        const translate = [width / 2 - scale * midX, height / 2 - scale * midY];

        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
        );
    }

    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("click", () => {
        if (selectedNodeId) handleNodeClick(null);
    });
}

function highlightNodes(nodeId) {
    const t = d3.transition().duration(500).ease(d3.easeCubicOut);
    const allGraphNodes = d3.selectAll('.node');
    const allEdges = d3.selectAll('.edge');

    if (!nodeId) {
        allGraphNodes.classed('selected dependency dependent', false);
        allGraphNodes.transition(t).style('opacity', 1);
        allEdges.transition(t).style('opacity', 0.5).attr("stroke", d => d.type === 'containment' ? '#5a6675' : '#4b5563');
        return;
    }

    const selectedNode = allNodes.find(n => n.id === nodeId);
    let nodesToHighlight = new Set([nodeId]);

    if (selectedNode && selectedNode.isFolder) {
        allNodes.forEach(node => {
            if (node.id.startsWith(nodeId + '/')) {
                nodesToHighlight.add(node.id);
            }
        });
    }

    const dependencyIds = new Set();
    const dependentIds = new Set();

    if (!selectedNode.isFolder) {
        edges.forEach(edge => {
            if (edge.type === 'dependency') {
                if (edge.source.id === nodeId) {
                    dependencyIds.add(edge.target.id);
                }
                if (edge.target.id === nodeId) {
                    dependentIds.add(edge.source.id);
                }
            }
        });
    }

    const connectedIds = new Set([...nodesToHighlight, ...dependencyIds, ...dependentIds]);

    allGraphNodes.classed('selected dependency dependent', false);
    allGraphNodes
        .classed('selected', d => nodesToHighlight.has(d.id))
        .classed('dependency', d => dependencyIds.has(d.id))
        .classed('dependent', d => dependentIds.has(d.id));

    if (isFocusModeActive) {
        allGraphNodes.transition(t)
            .style('opacity', d => connectedIds.has(d.id) ? 1 : 0.1);
        allEdges.transition(t)
            .style('opacity', d => {
                if (d.type === 'containment') return 0.1;
                if (nodesToHighlight.has(d.source.id) || nodesToHighlight.has(d.target.id)) return 0.9;
                return 0.05;
            });
    } else {
        allGraphNodes.transition(t).style('opacity', 1);
        allEdges.transition(t).style('opacity', 0.5);
    }

    allEdges.attr("stroke", d => {
        if (d.type === 'containment') return '#5a6675';
        if (nodesToHighlight.has(d.source.id)) return "#2dd4bf";
        if (nodesToHighlight.has(d.target.id)) return "#f472b6";
        return "#4b5563";
    });
}

function applyForceLayout(nodeData, edgeData, node, link, width, height) {
    simulation = d3.forceSimulation(nodeData)
        .force("link", d3.forceLink(edgeData).distance(nodeData.length > 50 ? 150 : 120))
        .force("charge", d3.forceManyBody().strength(nodeData.length > 50 ? -400 : -350))
        .force("center", d3.forceCenter(0, 0))
        .force("x", d3.forceX())
        .force("y", d3.forceY());

    node.call(drag(simulation));

    simulation.on("tick", () => {
        link
            .attr("d", d => `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`);
        node
            .attr("transform", d => `translate(${d.x}, ${d.y})`);
    });
}

function applyHierarchicalLayout(nodeData, edgeData, node, link, width, height) {
    const dependencyEdges = edgeData.filter(e => e.type === 'dependency');

    // Topological sort
    const inDegree = new Map(nodeData.map(d => [d.id, 0]));
    dependencyEdges.forEach(e => {
        inDegree.set(e.target.id, inDegree.get(e.target.id) + 1);
    });

    const queue = nodeData.filter(d => inDegree.get(d.id) === 0);
    const sorted = [];
    const positions = new Map();

    while (queue.length > 0) {
        const u = queue.shift();
        sorted.push(u);
        positions.set(u.id, sorted.length - 1);

        dependencyEdges.filter(e => e.source.id === u.id).forEach(e => {
            const v = e.target;
            inDegree.set(v.id, inDegree.get(v.id) - 1);
            if (inDegree.get(v.id) === 0) {
                queue.push(v);
            }
        });
    }

    if (sorted.length < nodeData.length) {
        // Cycle detected, fall back to force layout
        applyForceLayout(nodeData, edgeData, node, link, width, height);
        return;
    }

    const layerWidth = width / (d3.max(sorted, d => positions.get(d.id)) + 1);
    const layerHeight = height / 10;

    nodeData.forEach(d => {
        d.x = positions.get(d.id) * layerWidth - width / 2 + layerWidth / 2;
        d.y = (d.inDegree % 10) * layerHeight - height / 2 + layerHeight / 2;
    });

    node.transition().duration(750)
        .attr("transform", d => `translate(${d.x}, ${d.y})`);

    link.transition().duration(750)
        .attr("d", d => `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`);
}

function applyCircularLayout(nodeData, edgeData, node, link, width, height) {
    const sortedNodes = nodeData.sort((a, b) => a.outDegree - b.outDegree);
    const radius = Math.min(width, height) / 2 - 50;
    const angleStep = (2 * Math.PI) / sortedNodes.length;

    sortedNodes.forEach((d, i) => {
        d.x = radius * Math.cos(i * angleStep);
        d.y = radius * Math.sin(i * angleStep);
    });

    node.transition().duration(750)
        .attr("transform", d => `translate(${d.x}, ${d.y})`);

    link.transition().duration(750)
        .attr("d", d => `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`);
}


function renderHeatmapLegend() {
    const legendContainer = document.getElementById('heatmap-legend');
    if (!nodes || nodes.length === 0) {
        legendContainer.innerHTML = '';
        return;
    }
    const maxInDegree = d3.max(nodes, d => d.inDegree) || 1;
    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxInDegree]);

    legendContainer.innerHTML = '<span>Less Critical</span>';
    for (let i = 0; i <= 1; i += 0.25) {
        const color = colorScale(maxInDegree * i);
        legendContainer.innerHTML += `<div class="color-box" style="background-color: ${color};"></div`;
    }
    legendContainer.innerHTML += '<span>More Critical</span>';
}


function drag(simulation) {
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

function handleNodeClick(nodeId) {
    if (searchInput && searchInput.value) {
        searchInput.value = '';
        handleSearch();
    }

    document.querySelectorAll('.tree-item').forEach(item => {
        item.classList.remove('selected');
    });
    if (nodeId) {
        document.querySelectorAll(`.tree-item[data-path="${nodeId}"]`).forEach(item => {
            item.classList.add('selected');
        });
    }

    if (!nodeId) {
        isFocusModeActive = false; // Turn off focus when clicking background
    }
    selectedNodeId = (selectedNodeId === nodeId) ? null : nodeId;
    
    updateDetailsPanel(selectedNodeId);
    highlightNodes(selectedNodeId);
}

function toggleFocusMode() {
    if (!selectedNodeId) return;
    isFocusModeActive = !isFocusModeActive;
    
    highlightNodes(selectedNodeId);
    updateDetailsPanel(selectedNodeId);
}

async function updateDetailsPanel(nodeId) {
    if (!nodeId) {
        detailsContent.innerHTML = '<p class="mt-10 text-center text-gray-400">Click a file to see its details.</p>';
        return;
    }

    const node = allNodes.find(n => n.id === nodeId); // Use allNodes to find details even if filtered
    if (!node) return;

    const nodeDependencies = allEdges.filter(e => e.source.id === nodeId).map(e => e.target.id);
    const nodeDependents = allEdges.filter(e => e.target.id === nodeId).map(e => e.source.id);

    const createList = (items) => items.length > 0
        ? items.map(d => `<li class="p-2 rounded-md transition cursor-pointer" onclick="handleNodeClick(\'${d}\')">${d}</li>`).join('')
        : '<li class="p-2 text-gray-500">None</li>';

    detailsContent.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-white break-words">${node.fullPath}</h3>
            <button id="focusModeBtn" class="glare-hover bg-gray-700 text-white text-xs font-semibold py-1 px-3 rounded-lg hover:bg-gray-600 transition duration-300">
                ${isFocusModeActive ? 'Unfocus' : 'Focus'}
            </button>
        </div>
        <div id="complexity-metrics" class="mt-4 text-sm text-gray-400">
            <p>Loading metrics...</p>
        </div>
        <div class="mt-6">
            <h4 class="font-semibold text-teal-400">Dependencies (${nodeDependencies.length})</h4>
            <p class="text-sm text-gray-400 mb-2">Files this file uses (click to select).</p>
            <ul class="text-sm space-y-1">${createList(nodeDependencies)}</ul>
        </div>
        <div class="mt-6">
            <h4 class="font-semibold text-pink-400">Dependents (${nodeDependents.length})</h4>
            <p class="text-sm text-gray-400 mb-2">Files that use this file (click to select).</p>
            <ul class="text-sm space-y-1">${createList(nodeDependents)}</ul>
        </div>
        <div id="fileExplanationContainer" class="mt-6 space-y-2">
            <button id="explainFileBtn" class="glare-hover w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center shadow-lg">
                Explain this file
            </button>
            <button id="refineFileBtn" class="glare-hover w-full bg-purple-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-purple-700 transition duration-300 flex items-center justify-center shadow-lg">
                Suggest Refinements
            </button>
            <button id="generateDocsBtn" class="glare-hover w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-green-700 transition duration-300 flex items-center justify-center shadow-lg">
                Generate Docs
            </button>
        </div>
    `;
    document.getElementById('explainFileBtn').addEventListener('click', () => handleExplainFile(nodeId));
    document.getElementById('refineFileBtn').addEventListener('click', () => handleRefineFile(nodeId));
    document.getElementById('generateDocsBtn').addEventListener('click', () => handleGenerateDocs(nodeId));
    document.getElementById('focusModeBtn').addEventListener('click', () => toggleFocusMode());

    displayComplexityMetrics(nodeId);
}

async function displayComplexityMetrics(nodeId) {
    const metricsContainer = document.getElementById('complexity-metrics');
    try {
        const node = allNodes.find(n => n.id === nodeId);
        const contentResponse = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/contents/${nodeId}`);
        const fileContent = atob(contentResponse.content);

        const loc = fileContent.split('\n').length;
        const functions = (fileContent.match(/function\s+\w+\s*\(|=>/g) || []).length;
        const classes = (fileContent.match(/class\s+\w+/g) || []).length;

        metricsContainer.innerHTML = `
            <p><strong class="font-semibold text-gray-300">File Size:</strong> ${(node.size / 1024).toFixed(2)} KB</p>
            <p><strong class="font-semibold text-gray-300">Lines of Code:</strong> ${loc}</p>
            <p><strong class="font-semibold text-gray-300">Functions/Classes:</strong> ${functions} / ${classes}</p>
        `;
    } catch (error) {
        metricsContainer.innerHTML = `<p class="text-red-400">Could not load complexity metrics.</p>`;
    }
}


// --- File Tree Functions ---
function buildFileTreeData(files) {
    const tree = { name: "root", type: "folder", children: [] };
    if (!files) return tree;

    for (const file of files) {
        if (!file || !file.path) continue;

        let currentLevel = tree.children;
        const pathParts = file.path.split('/');

        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            const isLastPart = i === pathParts.length - 1;

            let existingPath = currentLevel.find(item => item.name === part);

            if (existingPath) {
                if (existingPath.type === 'file' && !isLastPart) {
                    // Path conflict: a file is in the middle of a path. Convert it to a folder.
                    existingPath.type = 'folder';
                    existingPath.children = [];
                }
                currentLevel = existingPath.children;
            } else {
                const newEntry = {
                    name: part,
                    type: isLastPart ? 'file' : 'folder',
                    path: isLastPart ? file.path : null,
                    children: isLastPart ? null : []
                };
                currentLevel.push(newEntry);
                currentLevel = newEntry.children;
            }

            // If we've hit a leaf (null children), we can't go deeper.
            if (currentLevel === null) {
                break;
            }
        }
    }
    return tree;
}

function renderFileTree(treeData, container) {
    if (!container) return;
    container.innerHTML = '';
    const rootUl = document.createElement('ul');
    rootUl.className = 'file-tree';

    function createTreeHtml(items, parentElement) {
        items.forEach(item => {
            const li = document.createElement('li');
            li.className = item.type === 'folder' ? 'tree-folder collapsed' : 'tree-file';

            const itemDiv = document.createElement('div');
            itemDiv.className = 'tree-item';
            itemDiv.innerHTML = `<span class="icon"></span><span>${item.name}</span>`;

            if (item.type === 'file') {
                itemDiv.dataset.path = item.path;
                itemDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleNodeClick(item.path);
                });
            } else { // It's a folder
                itemDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    li.classList.toggle('collapsed');
                });
            }

            li.appendChild(itemDiv);

            if (item.children && item.children.length > 0) {
                const childrenUl = document.createElement('ul');
                createTreeHtml(item.children, childrenUl);
                li.appendChild(childrenUl);
            }

            parentElement.appendChild(li);
        });
    }

    createTreeHtml(treeData.children, rootUl);
    container.appendChild(rootUl);
}

function filterFileTree(container, query) {
    const allItems = container.querySelectorAll('li.tree-file');
    const allFolders = container.querySelectorAll('li.tree-folder');

    if (!query) {
        allItems.forEach(item => item.style.display = 'block');
        allFolders.forEach(folder => {
            folder.style.display = 'block';
            folder.classList.add('collapsed');
        });
        return;
    }

    allItems.forEach(item => item.style.display = 'none');
    allFolders.forEach(folder => folder.style.display = 'none');

    const matchedItems = new Set();

    allItems.forEach(item => {
        const itemName = item.querySelector('span:last-child').textContent.toLowerCase();
        if (itemName.includes(query)) {
            item.style.display = 'block';
            matchedItems.add(item);
        }
    });

    matchedItems.forEach(item => {
        let current = item.parentElement;
        while (current && current !== container) {
            if (current.tagName === 'LI' && current.classList.contains('tree-folder')) {
                current.style.display = 'block';
                current.classList.remove('collapsed');
            }
            current = current.parentElement;
        }
    });
}


// --- Utility Functions ---
async function apiFetch(url) {
    const token = githubTokenInput.value.trim();
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        if (response.status === 403) {
             const errorData = await response.json();
             const message = errorData.message || "";
             if (message.includes("API rate limit exceeded")) {
                 throw new Error("API rate limit exceeded. Please add a GitHub Personal Access Token to continue.");
             }
        }
        const errorData = await response.json();
        throw new Error(errorData.message || `API request failed: ${response.status}`);
    }
    return response.json();
}


async function handleApiError(response) {
    const contentType = response.headers.get("content-type");
    let errorDetails;

    if (contentType && contentType.indexOf("application/json") !== -1) {
        try {
            const err = await response.json();
            // Dig for the real error message from the structured JSON
            if (err.details && err.details.error && err.details.error.message) {
                errorDetails = err.details.error.message;
            } else if (err.details) {
                errorDetails = typeof err.details === 'string' ? err.details : JSON.stringify(err.details);
            } else if (err.error) {
                errorDetails = typeof err.error === 'string' ? err.error : JSON.stringify(err.error);
            } else {
                errorDetails = JSON.stringify(err);
            }
        } catch (e) {
            errorDetails = "Could not parse JSON error response.";
        }
    } else {
        errorDetails = await response.text();
        // For non-JSON (likely HTML error pages), try to extract the core message
        const match = errorDetails.match(/<p class="vc-message-text">(.+?)<\/p>|<div class="vc-function-logs-body">(.+?)<\/div>/s);
        if (match) {
            const logs = match[2];
            if (logs) {
                errorDetails = `Function Logs: ${logs.replace(/<[^>]+>/g, '')}`;
            } else {
                errorDetails = match[1];
            }
        }
    }
    throw new Error(errorDetails);
}

function showMessage(title, message) {
    messageOverlay.classList.remove('hidden');
    const titleElement = messageOverlay.querySelector('h3');
    const messageElement = messageOverlay.querySelector('p');
    
    if (title) {
        titleElement.textContent = title;
        titleElement.classList.remove('hidden');
    } else {
        titleElement.classList.add('hidden');
    }
    
    if (message) {
        messageElement.textContent = message;
        messageElement.classList.remove('hidden');
    } else {
        messageElement.classList.add('hidden');
    }
}

function hideMessage() {
    messageOverlay.classList.add('hidden');
}

function simpleMarkdownToHtml(markdown) {
    let html = markdown
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/(\r\n|\n|\r)/gm, '<br>')
        .replace(/<\/li><br>/g, '</li>')
        .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>')
        .replace(/<\/ul><br><ul>/g, '')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/```(\w*)\s*([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    return html;
}

// --- Gemini API Functions ---
async function callGeminiAPI(prompt, onChunkReceived) {
    const apiUrl = '/api/gemini';

    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }]
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        await handleApiError(response);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let resultText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Each chunk might contain multiple JSON objects or partial objects
        // We need to parse them carefully.
        // The Gemini API for streaming often sends data in the format: data: {json}
        chunk.split('\n').forEach(line => {
            if (line.startsWith('data: ')) {
                try {
                    const jsonStr = line.substring(6);
                    const json = JSON.parse(jsonStr);
                    const part = json.text; // The backend now sends a {text: "..."} object
                    if (part) {
                        resultText += part;
                        onChunkReceived(part); // Callback to update UI
                    }
                } catch (e) {
                    console.error("Error parsing stream chunk:", e, "Chunk:", line);
                }
            }
        });
    }
    return resultText;
}

async function handleGenerateRepoOverview() {
    const btn = document.getElementById('generateRepoOverviewBtn');
    btn.disabled = true;
    btn.innerHTML = 'Generating...';
    aiModalTitle.textContent = 'AI-Powered Repository Overview';
    aiModalResult.innerHTML = '<div class="custom-loader mx-auto"></div>';
    openModal(aiModal);

    try {
        const fileList = repoFiles.map(f => f.path).join('\n');
        const prompt = `Based on this list of file paths from a software repository, provide a high-level overview of the project's likely purpose and architecture. Format the response using Markdown. What kind of application is this? What technologies are likely being used?

File list:
${fileList}`;
        aiModalResult.innerHTML = ''; // Clear content before streaming
        let fullResponse = '';
        await callGeminiAPI(prompt, (chunk) => {
            fullResponse += chunk;
            aiModalResult.innerHTML = simpleMarkdownToHtml(fullResponse);
        });
    } catch (error) {
        aiModalResult.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Generate Repo Overview';
    }
}

async function handleExplainFile(filePath) {
    const btn = document.getElementById('explainFileBtn');
    btn.disabled = true;
    btn.innerHTML = 'Explaining...';
    aiModalTitle.textContent = 'AI-Powered File Explanation';
    aiModalResult.innerHTML = '<div class="custom-loader mx-auto"></div>';
    openModal(aiModal);

    try {
        const contentResponse = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/contents/${filePath}`);
        let fileContent;
        try {
            fileContent = atob(contentResponse.content);
        } catch (e) {
            throw new Error("Could not decode file content. It may be a binary file or have an unsupported encoding.");
        }
        const prompt = `Explain what this code does in simple terms. Format the response using Markdown. Focus on its primary purpose and how it might interact with other files. Here is the code for the file "${filePath}":


${fileContent}

`;
        aiModalResult.innerHTML = ''; // Clear content before streaming
        let fullResponse = '';
        await callGeminiAPI(prompt, (chunk) => {
            fullResponse += chunk;
            aiModalResult.innerHTML = simpleMarkdownToHtml(fullResponse);
        });
    } catch (error) {
        aiModalResult.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Explain this file';
    }
}

async function handleRefineFile(filePath) {
    const btn = document.getElementById('refineFileBtn');
    btn.disabled = true;
    btn.innerHTML = 'Analyzing...';
    aiModalTitle.textContent = 'AI-Powered Refinement Suggestions';
    aiModalResult.innerHTML = '<div class="custom-loader mx-auto"></div>';
    openModal(aiModal);

    try {
        const contentResponse = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/contents/${filePath}`);
        let fileContent;
        try {
            fileContent = atob(contentResponse.content);
        } catch (e) {
            throw new Error("Could not decode file content. It may be a binary file or have an unsupported encoding.");
        }

        const dependents = allEdges.filter(e => e.target.id === filePath).map(e => e.source.id);
        let dependentContents = '';
        if (dependents.length > 0) {
            dependentContents += '\n\nThis file is a dependency for the following files:\n';
            for (const dependent of dependents) {
                try {
                    const dependentContentResponse = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/contents/${dependent}`);
                    const dependentContent = atob(dependentContentResponse.content);
                    dependentContents += `\n--- ${dependent} ---\n${dependentContent}\n`;
                } catch (e) {
                    dependentContents += `\n--- ${dependent} --- (Could not fetch content)---\n`;
                }
            }
        }

        const prompt = `Act as a senior software engineer performing a code review. Analyze the following code from the file "${filePath}". Provide actionable suggestions for refinement. Focus on improving readability, efficiency, and adherence to best practices. Do not rewrite the entire file, but instead, identify specific code blocks and explain how they could be improved. Format the response using Markdown. 

${fileContent}${dependentContents}`;
        
        aiModalResult.innerHTML = ''; // Clear content before streaming
        let fullResponse = '';
        await callGeminiAPI(prompt, (chunk) => {
            fullResponse += chunk;
            aiModalResult.innerHTML = simpleMarkdownToHtml(fullResponse);
        });
    } catch (error) {
        aiModalResult.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Suggest Refinements';
    }
}

async function handleGenerateDocs(filePath) {
    const btn = document.getElementById('generateDocsBtn');
    btn.disabled = true;
    btn.innerHTML = 'Generating...';
    aiModalTitle.textContent = 'AI-Powered Documentation';
    aiModalResult.innerHTML = '<div class="custom-loader mx-auto"></div>';
    openModal(aiModal);

    try {
        const contentResponse = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/contents/${filePath}`);
        let fileContent;
        try {
            fileContent = atob(contentResponse.content);
        } catch (e) {
            throw new Error("Could not decode file content. It may be a binary file or have an unsupported encoding.");
        }
        const prompt = `Act as a technical writer. Analyze the following code and generate formal, structured documentation for it in Markdown format. For the file "${filePath}", please include the following sections:

### Summary
A brief, one-paragraph summary of the file's purpose and overall functionality.

### Functions
For each function or class method, provide:
- **Description:** A clear explanation of what the function does.
- **Parameters:** A list of parameters, their types, and descriptions.
- **Returns:** A description of what the function returns.
- **Example:** A short, practical code snippet showing how to use the function.

Here is the code:


${fileContent}

`;
        aiModalResult.innerHTML = ''; // Clear content before streaming
        let fullResponse = '';
        await callGeminiAPI(prompt, (chunk) => {
            fullResponse += chunk;
            aiModalResult.innerHTML = simpleMarkdownToHtml(fullResponse);
        });
    } catch (error) {
        aiModalResult.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Generate Docs';
    }
}

function handleExport() {
    const svgElement = graphContainer.querySelector('svg');
    if (!svgElement) {
        openModal(errorModal);
        errorModalText.textContent = 'No graph to export.';
        return;
    }

    svgElement.style.backgroundColor = '#111827';

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scale = 2;
    const scaledWidth = svgElement.clientWidth * scale;
    const scaledHeight = svgElement.clientHeight * scale;
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));

    img.onload = () => {
        ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);
        svgElement.style.backgroundColor = '';

        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${currentRepo}-dependency-graph.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };
    img.onerror = () => {
        svgElement.style.backgroundColor = '';
        openModal(errorModal);
        errorModalText.textContent = 'Could not export the image.';
    }
}

// --- Token Management ---
function saveToken() {
    const token = githubTokenInput.value.trim();
    if (token) {
        localStorage.setItem('githubToken', token);
        forgetTokenBtn.classList.remove('hidden');
    }
}

function loadToken() {
    const token = localStorage.getItem('githubToken');
    if (token) {
        githubTokenInput.value = token;
        forgetTokenBtn.classList.remove('hidden');
    }
}

function forgetToken() {
    localStorage.removeItem('githubToken');
    githubTokenInput.value = '';
    forgetTokenBtn.classList.add('hidden');
}

// Load token on initial page load
document.addEventListener('DOMContentLoaded', loadToken);


// =================================================================
// --- ALL NEW EFFECTS INITIALIZATION ---
// =================================================================

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Fullscreen Click Spark Effect ---
    const sparkCanvas = document.getElementById('spark-canvas');
    if (sparkCanvas) {
        const ctx = sparkCanvas.getContext('2d');
        let sparks = [];
        sparkCanvas.width = window.innerWidth;
        sparkCanvas.height = window.innerHeight;
        window.addEventListener('resize', () => {
            sparkCanvas.width = window.innerWidth;
            sparkCanvas.height = window.innerHeight;
        });
        const sparkConfig = {
            sparkColor: "#facc15",
            sparkSize: 8,
            sparkRadius: 25,
            sparkCount: 10,
            duration: 500,
            easing: (t) => t * (2 - t),
        };

        function drawSparks() {
            if (!ctx) return;
            ctx.clearRect(0, 0, sparkCanvas.width, sparkCanvas.height);
            sparks = sparks.filter(spark => {
                const elapsed = performance.now() - spark.startTime;
                if (elapsed >= sparkConfig.duration) return false;
                const progress = elapsed / sparkConfig.duration;
                const eased = sparkConfig.easing(progress);
                const distance = eased * sparkConfig.sparkRadius;
                const lineLength = sparkConfig.sparkSize * (1 - eased);
                const x1 = spark.x + distance * Math.cos(spark.angle);
                const y1 = spark.y + distance * Math.sin(spark.angle);
                const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
                const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);
                ctx.strokeStyle = sparkConfig.sparkColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                return true;
            });
            requestAnimationFrame(drawSparks);
        }
        document.addEventListener('click', (e) => {
            const x = e.clientX;
            const y = e.clientY;
            const now = performance.now();
            const newSparks = Array.from({ 
                length: sparkConfig.sparkCount 
            }, (_, i) => ({
                x, y,
                angle: (2 * Math.PI * i) / sparkConfig.sparkCount,
                startTime: now,
            }));
            sparks.push(...newSparks);
        });
        drawSparks();
    }

    // --- 2. GSAP SplitText Animation for Header ---
    if (typeof gsap !== 'undefined' && typeof SplitText !== 'undefined') {
        gsap.registerPlugin(SplitText);
        const mainTitle = document.getElementById('main-title');
        const subtitle = document.getElementById('subtitle');
        if (mainTitle && subtitle) {
            const mainTitleChars = new SplitText(mainTitle, {
                type: "chars"
            }).chars;
            const subtitleChars = new SplitText(subtitle, {
                type: "chars"
            }).chars;

            gsap.from(mainTitleChars, {
                duration: 0.8,
                opacity: 0,
                y: 50,
                ease: "power3.out",
                stagger: 0.05,
            });
            gsap.from(subtitleChars, {
                duration: 0.6,
                opacity: 0,
                y: 20,
                ease: "power2.out",
                stagger: 0.03,
                delay: 0.5,
            });
        }
    }
});
