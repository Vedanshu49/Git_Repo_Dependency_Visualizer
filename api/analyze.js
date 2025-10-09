const fetch = require('node-fetch');
const { kv } = require('@vercel/kv');
const crypto = require('crypto');
const babelParser = require('@babel/parser');

function hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

// --- Main Handler ---

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { owner, repo, files, token, latestCommit } = req.body;

        if (!owner || !repo || !files || !Array.isArray(files) || !latestCommit) {
            return res.status(400).json({ error: 'Missing required parameters.' });
        }

        const isProduction = process.env.VERCEL_ENV === 'production';
        const filePathsString = files.map(f => f.path).join(',');
        const cacheKey = `deps:${owner}-${repo}-${latestCommit}-${hash(filePathsString)}`;

        if (isProduction) {
            const cachedDependencies = await kv.get(cacheKey);
            if (cachedDependencies) {
                return res.status(200).json({ dependencies: cachedDependencies, fromCache: true });
            }
        }

        // Fetch file tree and alias map here
        const treeData = await apiFetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${latestCommit}?recursive=1`, token);
        const allFilePaths = treeData.tree.map(f => f.path);
        const aliasMap = await getAliasMap(owner, repo, token, allFilePaths);

        const dependencies = await analyzeFileDependencies(owner, repo, files, token, allFilePaths, aliasMap || {});
        
        if (isProduction) {
            await kv.set(cacheKey, dependencies, { ex: 3600 }); // Cache for 1 hour
        }

        res.status(200).json({ dependencies, fromCache: false });

    } catch (error) {
        console.error('Error in /api/analyze:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

// --- GitHub API Fetch ---

async function apiFetch(url, token) {
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

// --- Analysis Logic ---

async function analyzeFileDependencies(owner, repo, files, token, allFilePaths, aliasMap) {
    const allDependencies = [];
    const filePathsSet = new Set(allFilePaths);

    const promises = files.map(async (file) => {
        if (!file || !file.path) return;
        try {
            const contentResponse = await apiFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`, token);
            if (contentResponse.content) {
                const fileContent = Buffer.from(contentResponse.content, 'base64').toString('utf-8');
                const foundImports = parseContentForImports(fileContent, file.path);

                foundImports.forEach(imp => {
                    const targetPath = resolvePath(file.path, imp, filePathsSet, aliasMap);
                    if (targetPath && filePathsSet.has(targetPath)) {
                        allDependencies.push({ from: file.path, to: targetPath });
                    }
                });
            }
        } catch (error) {
            console.warn(`Could not analyze file: ${file.path}`, error.message);
        }
    });

    await Promise.all(promises);
    return allDependencies;
}

function parseContentForImports(content, path) {
    const imports = new Set();
    const ext = path.split('.').pop();
    const jsLike = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs']);

    if (jsLike.has(ext)) {
        try {
            const ast = babelParser.parse(content, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
                errorRecovery: true,
            });

            const walk = (node) => {
                if (!node) return;

                if (node.type === 'ImportDeclaration' && node.source) {
                    imports.add(node.source.value);
                }
                if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) {
                    imports.add(node.source.value);
                }
                if (node.type === 'CallExpression' && node.callee.name === 'require' && node.arguments.length > 0 && node.arguments[0].type === 'StringLiteral') {
                    imports.add(node.arguments[0].value);
                }
                if (node.type === 'Import' && node.parent.type === 'CallExpression' && node.parent.arguments.length > 0 && node.parent.arguments[0].type === 'StringLiteral') {
                    imports.add(node.parent.arguments[0].value);
                }

                for (const key in node) {
                    if (node.hasOwnProperty(key)) {
                        const child = node[key];
                        if (typeof child === 'object' && child !== null) {
                            if (Array.isArray(child)) {
                                child.forEach(walk);
                            } else {
                                walk(child);
                            }
                        }
                    }
                }
            };

            walk(ast);
        } catch (e) {
            console.warn(`Babel parsing error in ${path}: ${e.message}`);
            // Fallback to regex for JS-like files if AST parsing fails
            const regex = /import(?:\s+.*\s+from)?\s+['\"](.*?)['\"]|require\(['\"](.*?)['\"]\)/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                imports.add(match[1] || match[2]);
            }
        }
    } else if (ext === 'py') {
        const regex = /^\s*(?:from\s+([\w.]+)\s+import\s+|import\s+([\w.]+))/gm;
        let match;
        while ((match = regex.exec(content)) !== null) {
            imports.add((match[1] || match[2]).replace(/\./g, '/'));
        }
    } else if (ext === 'java') {
        const regex = /^import\s+(static\s+)?([\w.]+?(?:\.\*)?);/gm;
        let match;
        while ((match = regex.exec(content)) !== null) {
            imports.add(match[2].replace(/\./g, '/').replace(/\*$/, '*'));
        }
    } else if (ext === 'php') {
        const regex = /^use\s+([\w\\]+)(?:\s+as\s+\w+)?;/gm;
        let match;
        while ((match = regex.exec(content)) !== null) {
            imports.add(match[1].replace(/\\/g, '/'));
        }
    }

    return Array.from(imports);
}

function resolvePath(basePath, importPath, filePathsSet, aliasMap) {
    const possibleExtensions = [
        '', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.json',
        '/index.js', '/index.jsx', '/index.ts', '/index.tsx'
    ];

    const checkPath = (path) => {
        for (const ext of possibleExtensions) {
            if (filePathsSet.has(path + ext)) return path + ext;
        }
        return null;
    };

    // 1. Resolve Aliases
    for (const [alias, realPath] of Object.entries(aliasMap)) {
        if (importPath.startsWith(alias)) {
            const resolvedImport = importPath.replace(alias, realPath);
            const resolved = checkPath(resolvedImport);
            if (resolved) return resolved;
        }
    }

    // 2. Resolve Relative Paths
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const baseDir = basePath.substring(0, basePath.lastIndexOf('/'));
        const path = require('path');
        const resolved = path.resolve('/' + baseDir, importPath).substring(1);
        
        const checked = checkPath(resolved);
        if (checked) return checked;
    }

    // 3. Resolve Bare Paths (node_modules, etc.) - we can't do this well without a package.json, so we just check root
    const checked = checkPath(importPath);
    if (checked) return checked;

    return importPath; // Return original if not resolved
}

async function getAliasMap(owner, repo, token, allFilePaths) {
    const configPath = allFilePaths.find(p => p === 'jsconfig.json' || p === 'tsconfig.json');
    if (!configPath) return {};

    try {
        const contentResponse = await apiFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${configPath}`, token);
        const configContent = Buffer.from(contentResponse.content, 'base64').toString('utf-8');
        // Remove comments from JSON before parsing
        const jsonContent = configContent.replace(/\/\/[^\n]*/g, '').replace(/\/[\s\S]*?\*\//g, '');
        const config = JSON.parse(jsonContent);
        const paths = config.compilerOptions?.paths;

        if (!paths) return {};

        const aliasMap = {};
        for (const [alias, realPaths] of Object.entries(paths)) {
            if (Array.isArray(realPaths) && realPaths.length > 0) {
                // e.g., "@/*": ["src/*"] -> {"@": "src"}
                const key = alias.replace('/*', '');
                const value = realPaths[0].replace('/*', '');
                aliasMap[key] = value;
            }
        }
        return aliasMap;
    } catch (error) {
        console.warn('Could not parse alias config:', error);
        return {}; // Return empty map if parsing fails
    }
}