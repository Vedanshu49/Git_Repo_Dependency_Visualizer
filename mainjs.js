// --- DOM Elements ---
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
let searchInput, fileTypeFilter, exportBtn;

// --- State ---
let currentOwner, currentRepo;
let repoFiles = [];
let dependencies = [];
let nodes = [], edges = [];
let selectedNodeId = null;
let simulation;

// --- Event Listeners ---
analyzeBtn.addEventListener('click', handleAnalyzeClick);
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


// --- Modal Functions ---
function openModal(modal) {
    const content = modal.querySelector('.modal-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.add('opacity-100');
        content.style.transform = 'scale(1) translateY(0)';
    }, 10);
}

function closeModal(modal) {
    const content = modal.querySelector('.modal-content');
    modal.classList.remove('opacity-100');
    content.style.transform = 'scale(0.95) translateY(1rem)';
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 400);
}

[tokenModal, errorModal, aiModal, fileTreeModal].forEach(modal => {
    const content = modal.querySelector('.modal-content');
    content.style.transform = 'scale(0.95) translateY(1rem)';
});


// --- Main Logic ---
async function handleAnalyzeClick() {
    const url = repoUrlInput.value.trim();
    const githubRegex = /github\.com\/([^/]+)\/([^/]+)/;
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
    mainContent.classList.add('hidden');

    saveToken();

    try {
        const repoInfo = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}`);
        const commitsData = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/commits?per_page=100`);

        displayRepoInfo(repoInfo, commitsData);

        const defaultBranch = repoInfo.default_branch;

        showMessage('Fetching file tree...');
        const treeData = await apiFetch(`https://api.github.com/repos/${currentOwner}/${currentRepo}/git/trees/${defaultBranch}?recursive=1`);

        repoFiles = treeData.tree.filter(file => {
            const path = file.path.toLowerCase();
            const isIgnored = path.includes('node_modules/') || path.includes('dist/') || path.includes('vendor/') || path.startsWith('.') || path.includes('test/') || path.includes('example/');
            const isSupported = /\.(js|mjs|jsx|ts|tsx|html|css|py|json|go|rb|java|php)$/.test(path);
            return file.type === 'blob' && isSupported && !isIgnored;
        });

        if (repoFiles.length > 200) {
            showMessage(`Warning: Found ${repoFiles.length} files. Truncating for performance.`, false);
            repoFiles = repoFiles.slice(0, 200);
        }

        showMessage(`Found ${repoFiles.length} files. Analyzing dependencies...`, false);
        dependencies = await analyzeFileDependencies(currentOwner, currentRepo);

        const nodeData = repoFiles.map(file => ({ id: file.path, label: file.path.split('/').pop(), fullPath: file.path }));
        const edgeData = dependencies.map(dep => ({ source: dep.from, target: dep.to }));

        mainContent.classList.remove('hidden');
        initializeGraphControls();

        hideMessage();
        const fileTreeData = buildFileTreeData(repoFiles);
        renderFileTree(fileTreeData, fileTreeContainer); // Render preview
        renderFileTree(fileTreeData, fullFileTreeContainer); // Render full tree in modal
        renderGraph(nodeData, edgeData);
        updateDetailsPanel(null);
        populateFileTypeFilter();

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

function initializeGraphControls() {
    searchInput = document.getElementById('searchInput');
    fileTypeFilter = document.getElementById('fileTypeFilter');
    exportBtn = document.getElementById('exportBtn');

    searchInput.addEventListener('input', handleSearch);
    fileTypeFilter.addEventListener('change', handleFilter);
    exportBtn.addEventListener('click', handleExport);
}

function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    filterGraph(query, fileTypeFilter.value);
}

function handleFilter() {
    const type = fileTypeFilter.value;
    filterGraph(searchInput.value.toLowerCase().trim(), type);
}

function filterGraph(query, type) {
    const allNodes = d3.selectAll('.node');
    const allEdges = d3.selectAll('.edge');

    const isSearchActive = query.length > 0;
    const isFilterActive = type !== 'all';

    if (!isSearchActive && !isFilterActive) {
        allNodes.classed('searched', false);
        allNodes.transition().duration(300).style('opacity', 1);
        allEdges.transition().duration(300).style('opacity', 0.5);
        return;
    }

    const matchedNodeIds = new Set();
    nodes.forEach(node => {
        const matchesSearch = isSearchActive ? node.label.toLowerCase().includes(query) : true;
        const matchesType = isFilterActive ? node.id.endsWith(type) : true;
        if (matchesSearch && matchesType) {
            matchedNodeIds.add(node.id);
        }
    });

    allNodes.classed('searched', d => isSearchActive && matchedNodeIds.has(d.id));
    allNodes.transition().duration(300)
        .style('opacity', d => matchedNodeIds.has(d.id) ? 1 : 0.1);

    allEdges.transition().duration(300)
        .style('opacity', d => matchedNodeIds.has(d.source.id) && matchedNodeIds.has(d.target.id) ? 0.5 : 0.05);
}

function populateFileTypeFilter() {
    const fileTypes = new Set(nodes.map(n => {
        const parts = n.id.split('.');
        return parts.length > 1 ? `.${parts.pop()}` : '';
    }).filter(Boolean));

    fileTypeFilter.innerHTML = '<option value="all">All File Types</option>';
    [...fileTypes].sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        fileTypeFilter.appendChild(option);
    });
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

    repoOverviewContainer.innerHTML = `
        <button id="generateRepoOverviewBtn" class="w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center shadow-lg">
            Generate Repo Overview
        </button>
    `;
    document.getElementById('generateRepoOverviewBtn').addEventListener('click', handleGenerateRepoOverview);
}

async function analyzeFileDependencies(owner, repo) {
    const allDependencies = [];
    const filePaths = new Set(repoFiles.map(f => f.path));

    const promises = repoFiles.map(async file => {
        try {
            const contentResponse = await apiFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`);
            const fileContent = atob(contentResponse.content);
            const foundImports = parseContentForImports(fileContent, file.path);

            foundImports.forEach(imp => {
                const targetPath = resolvePath(file.path, imp);
                if (filePaths.has(targetPath)) {
                    allDependencies.push({ from: file.path, to: targetPath });
                }
            });
        } catch (error) {
            console.warn(`Could not analyze file: ${file.path}`, error);
        }
    });

    await Promise.all(promises);
    return allDependencies;
}

function parseContentForImports(content, path) {
    const imports = new Set();
    const importRegex = /(?:import|from|require)\s*(?:(?:\{[^}]*\}|\* as \w+)\s*from\s*)?['"]((?:\.\/|\.\.\/)[^'"]+?)(?:\.js|\.ts|\.mjs|\.jsx|\.tsx)?['"]/g;
    const htmlRegex = /(?:href|src)=['"]((?:\.\/|\.\.\/)[^'"]+\.(?:css|js|png|jpg|svg))/g;
    const regex = path.endsWith('.html') ? htmlRegex : importRegex;

    let match;
    while ((match = regex.exec(content)) !== null) {
        imports.add(match[1]);
    }
    return Array.from(imports);
}

function resolvePath(basePath, relativePath) {
    const baseParts = basePath.split('/').slice(0, -1);
    const relativeParts = relativePath.split('/');

    for (const part of relativeParts) {
        if (part === '..') baseParts.pop();
        else if (part !== '.') baseParts.push(part);
    }

    let resolved = baseParts.join('/');
    const filePaths = new Set(repoFiles.map(f => f.path));

    if (filePaths.has(resolved)) return resolved;

    const possibleExtensions = ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.ts'];
    for (const ext of possibleExtensions) {
        if (filePaths.has(resolved + ext)) return resolved + ext;
    }
    return resolved;
}

// --- D3 Visualization ---
function renderGraph(nodeData, edgeData) {
    nodes = nodeData;
    edges = edgeData;
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

    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(edgeData).id(d => d.id).distance(120))
        .force("charge", d3.forceManyBody().strength(-350))
        .force("center", d3.forceCenter(0, 0))
        .force("x", d3.forceX())
        .force("y", d3.forceY());

    const link = g.append("g")
        .selectAll("line")
        .data(edgeData)
        .join("line")
        .attr("class", "edge")
        .attr("stroke", "#4b5563")
        .attr("stroke-width", 1.5)
        .attr("marker-end", "url(#arrowhead)")
        .style("opacity", 0);

    const node = g.append("g")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .attr("class", "node")
        .style("opacity", 0)
        .call(drag(simulation))
        .on("mouseover", function () {
            d3.select(this).raise();
        });

    const nodeDegrees = {};
    edgeData.forEach(d => {
        nodeDegrees[d.source.id] = (nodeDegrees[d.source.id] || 0) + 1;
        nodeDegrees[d.target.id] = (nodeDegrees[d.target.id] || 0) + 1;
    });

    node.append("circle")
        .attr("r", d => 6 + Math.sqrt(nodeDegrees[d.id] || 1) * 2.5)
        .attr("fill", "#1f2937")
        .attr("stroke", "#4b5563");

    node.append("text")
        .attr("y", d => (15 + Math.sqrt(nodeDegrees[d.id] || 1) * 2.5) * -1)
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
        .delay(nodes.length * 7)
        .ease(d3.easeCubicOut)
        .style("opacity", 0.5);

    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        node
            .attr("transform", d => `translate(${d.x}, ${d.y})`);
    });

    const zoom = d3.zoom().scaleExtent([0.1, 4]).on("zoom", (event) => {
        g.attr("transform", event.transform);
    });
    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("click", () => {
        if (selectedNodeId) handleNodeClick(null);
    });
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

    selectedNodeId = (selectedNodeId === nodeId) ? null : nodeId;
    updateDetailsPanel(selectedNodeId);
    highlightNodes(selectedNodeId);
}

function highlightNodes(nodeId) {
    const t = d3.transition().duration(500).ease(d3.easeCubicOut);
    const allNodes = d3.selectAll('.node');
    const allEdges = d3.selectAll('.edge');

    if (!nodeId) {
        allNodes.classed('selected dependency dependent', false);
        allNodes.transition(t).style('opacity', 1);
        allEdges.transition(t).style('opacity', 0.5).attr("stroke", "#4b5563");
        return;
    }

    const dependencyIds = new Set(edges.filter(e => e.source.id === nodeId).map(e => e.target.id));
    const dependentIds = new Set(edges.filter(e => e.target.id === nodeId).map(e => e.source.id));
    const connectedIds = new Set([nodeId, ...dependencyIds, ...dependentIds]);

    allNodes.classed('selected dependency dependent', false);
    allNodes
        .classed('selected', d => d.id === nodeId)
        .classed('dependency', d => dependencyIds.has(d.id))
        .classed('dependent', d => dependentIds.has(d.id));

    allNodes.transition(t)
        .style('opacity', d => connectedIds.has(d.id) ? 1 : 0.1);

    allEdges.transition(t)
        .style('opacity', d => d.source.id === nodeId || d.target.id === nodeId ? 0.9 : 0.1)
        .attr("stroke", d => {
            if (d.source.id === nodeId) return "#2dd4bf";
            if (d.target.id === nodeId) return "#f472b6";
            return "#4b5563";
        });
}

function updateDetailsPanel(nodeId) {
    if (!nodeId) {
        detailsContent.innerHTML = '<p class="mt-10 text-center text-gray-400">Click a file to see its details.</p>';
        return;
    }

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const nodeDependencies = edges.filter(e => e.source.id === nodeId).map(e => e.target.id);
    const nodeDependents = edges.filter(e => e.target.id === nodeId).map(e => e.source.id);

    const createList = (items) => items.length > 0
        ? items.map(d => `<li class="p-2 rounded-md transition cursor-pointer" onclick="handleNodeClick('${d}')">${d}</li>`).join('')
        : '<li class="p-2 text-gray-500">None</li>';

    detailsContent.innerHTML = `
        <h3 class="text-lg font-semibold text-white break-words">${node.fullPath}</h3>
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
            <button id="explainFileBtn" class="w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center shadow-lg">
                Explain this file
            </button>
            <button id="refineFileBtn" class="w-full bg-purple-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-purple-700 transition duration-300 flex items-center justify-center shadow-lg">
                Suggest Refinements
            </button>
        </div>
    `;
    document.getElementById('explainFileBtn').addEventListener('click', () => handleExplainFile(nodeId));
    document.getElementById('refineFileBtn').addEventListener('click', () => handleRefineFile(nodeId));
}

// --- File Tree Functions ---
function buildFileTreeData(files) {
    const tree = { name: "root", type: "folder", children: [] };
    files.forEach(file => {
        let currentLevel = tree.children;
        const pathParts = file.path.split('/');
        pathParts.forEach((part, i) => {
            const isLastPart = i === pathParts.length - 1;
            let existingPath = currentLevel.find(item => item.name === part);

            if (existingPath) {
                currentLevel = existingPath.children;
            } else {
                const newEntry = {
                    name: part,
                    type: isLastPart ? "file" : "folder",
                    path: isLastPart ? file.path : null,
                    children: isLastPart ? null : []
                };
                currentLevel.push(newEntry);
                if (!isLastPart) {
                    currentLevel = newEntry.children;
                }
            }
        });
    });
    return tree;
}

function renderFileTree(treeData, container) {
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
        const errorData = await response.json();
        throw new Error(errorData.message || `API request failed: ${response.status}`);
    }
    return response.json();
}

function showMessage(text) {
    messageOverlay.classList.remove('hidden');
    messageText.textContent = text;
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
// async function callGeminiAPI(prompt) {
//     const apiKey = ""; // Leave empty, handled by environment
//     const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

async function callGeminiAPI(prompt) {
    const apiKey = "AIzaSy...YOUR_NEW_UNRESTRICTED_KEY"; // Paste your new key here
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Gemini API request failed with status ${response.status}`);
    const result = await response.json();
    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        return result.candidates[0].content.parts[0].text;
    } else {
        throw new Error("Invalid response structure from Gemini API.");
    }
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
        const prompt = `Based on this list of file paths from a software repository, provide a high-level overview of the project's likely purpose and architecture. Format the response using Markdown. What kind of application is this? What technologies are likely being used?\n\nFile list:\n${fileList}`;
        const overview = await callGeminiAPI(prompt);
        aiModalResult.innerHTML = simpleMarkdownToHtml(overview);
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
        const fileContent = atob(contentResponse.content);
        const prompt = `Explain what this code does in simple terms. Format the response using Markdown. Focus on its primary purpose and how it might interact with other files. Here is the code for the file "${filePath}":\n\n\`\`\`\n${fileContent}\n\`\`\``;
        const explanation = await callGeminiAPI(prompt);
        aiModalResult.innerHTML = simpleMarkdownToHtml(explanation);
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
        const fileContent = atob(contentResponse.content);
        const prompt = `Act as a senior software engineer performing a code review. Analyze the following code from the file "${filePath}". Provide actionable suggestions for refinement. Focus on improving readability, efficiency, and adherence to best practices. Do not rewrite the entire file, but instead, identify specific code blocks and explain how they could be improved. Format the response using Markdown. \n\n\`\`\`\n${fileContent}\n\`\`\``;
        const refinement = await callGeminiAPI(prompt);
        aiModalResult.innerHTML = simpleMarkdownToHtml(refinement);
    } catch (error) {
        aiModalResult.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Suggest Refinements';
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
