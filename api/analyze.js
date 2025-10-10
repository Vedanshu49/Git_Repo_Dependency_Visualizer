const fetch = require('node-fetch');
const { kv } = require('@vercel/kv');
const crypto = require('crypto');
const babelParser = require('@babel/parser');
const Parser = require('tree-sitter');
const Python = require('tree-sitter-python');
const Java = require('tree-sitter-java');
const PHP = require('tree-sitter-php');
const fs = require('fs');
const os = require('os');
const path = require('path');
const StreamZip = require('node-stream-zip');

function hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

// --- Main Handler (Refactored for Zip Download) ---

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { owner, repo, token, latestCommit } = req.body;

    if (!owner || !repo || !latestCommit) {
        return res.status(400).json({ error: 'Missing required parameters: owner, repo, latestCommit.' });
    }

    const isProduction = process.env.VERCEL_ENV === 'production';
    // Note: Caching key might need adjustment if `files` is no longer sent.
    // Using commit SHA is a good way to ensure freshness.
    const cacheKey = `deps-zip:${owner}-${repo}-${latestCommit}`;

    if (isProduction) {
        try {
            const cachedDependencies = await kv.get(cacheKey);
            if (cachedDependencies) {
                return res.status(200).json({ dependencies: cachedDependencies, fromCache: true });
            }
        } catch (e) {
            console.warn("KV cache read error:", e.message);
        }
    }

    const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${latestCommit}`;
    const tempFilePath = path.join(os.tmpdir(), `repo-${owner}-${repo}-${latestCommit}.zip`);
    
    try {
        // 1. Download the repository zipball
        const headers = { Accept: 'application/vnd.github.v3+json' };
        if (token) headers['Authorization'] = `token ${token}`;

        const response = await fetch(zipUrl, { headers });
        if (!response.ok) {
            throw new Error(`Failed to download repository: ${response.statusText}`);
        }

        await new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(tempFilePath);
            response.body.pipe(fileStream);
            response.body.on("error", reject);
            fileStream.on("finish", resolve);
        });

        // 2. Process the zip file
        const zip = new StreamZip.async({ file: tempFilePath });
        const entries = await zip.entries();
        const allDependencies = [];

        // Find the root directory within the zip
        const rootDir = Object.keys(entries)[0].split('/')[0] + '/';
        
        const allFilePaths = Object.keys(entries)
            .map(name => name.substring(rootDir.length))
            .filter(name => !name.endsWith('/') && name.length > 0);
        
        const filePathsSet = new Set(allFilePaths);
        const aliasMap = await getAliasMap(owner, repo, token, allFilePaths);

        // 3. Analyze files from the zip
        for (const entry of Object.values(entries)) {
            if (entry.isDirectory) continue;

            const currentPath = entry.name.substring(rootDir.length);
            if (!currentPath) continue;

            try {
                const fileContent = await zip.entryData(entry.name);
                const foundImports = parseContentForImports(fileContent.toString('utf-8'), currentPath);

                foundImports.forEach(imp => {
                    const targetPath = resolvePath(currentPath, imp, filePathsSet, aliasMap);
                    if (targetPath && filePathsSet.has(targetPath)) {
                        allDependencies.push({ from: currentPath, to: targetPath });
                    }
                });
            } catch (error) {
                console.warn(`Could not analyze file from zip: ${currentPath}`, error.message);
            }
        }

        await zip.close();

        // 4. Cache and return the result
        if (isProduction) {
            try {
                await kv.set(cacheKey, allDependencies, { ex: 3600 }); // Cache for 1 hour
            } catch(e) {
                console.warn("KV cache write error:", e.message);
            }
        }

        res.status(200).json({ dependencies: allDependencies, fromCache: false });

    } catch (error) {
        console.error('Error in /api/analyze (zip method):', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    } finally {
        // 5. Clean up the temporary file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
};


// --- GitHub API Fetch (for non-zip operations) ---

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

// --- Analysis Logic (Parser) ---

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
            const regex = /import(?:\s+.*\s+from)?\s+['\"](.*?)['\"]|require\(['\"](.*?)['\"]\)/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                imports.add(match[1] || match[2]);
            }
        }
    } else {
        const parser = new Parser();
        let query, postProcess;

        try {
            if (ext === 'py') {
                parser.setLanguage(Python);
                query = new Parser.Query(Python, `
                  (import_statement name: (dotted_name) @p)
                  (import_from_statement module_name: (dotted_name) @p)
                  (import_from_statement module_name: (relative_import) @p)
                `);
                postProcess = (text) => text.replace(/\./g, '/');
            } else if (ext === 'java') {
                parser.setLanguage(Java);
                query = new Parser.Query(Java, `(import_declaration) @p`);
                postProcess = (text) => text.replace(/^import\s+(static\s+)?/, '').replace(/;/,'').trim().replace(/\./g, '/');
            } else if (ext === 'php') {
                parser.setLanguage(PHP);
                query = new Parser.Query(PHP, `(use_declaration name: (_) @p)`);
                postProcess = (text) => text.replace(/\\/g, '/');
            }

            if (query) {
                const tree = parser.parse(content);
                const captures = query.captures(tree.rootNode);
                for (const { node } of captures) {
                    imports.add(postProcess(node.text));
                }
            }
        } catch (e) {
            console.warn(`Tree-sitter parsing error in ${path}: ${e.message}`);
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

    for (const [alias, realPath] of Object.entries(aliasMap)) {
        if (importPath.startsWith(alias)) {
            const resolvedImport = importPath.replace(alias, realPath);
            const resolved = checkPath(resolvedImport);
            if (resolved) return resolved;
        }
    }

    if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const baseDir = basePath.substring(0, basePath.lastIndexOf('/'));
        const path = require('path');
        const resolved = path.resolve('/' + baseDir, importPath).substring(1);
        
        const checked = checkPath(resolved);
        if (checked) return checked;
    }

    const checked = checkPath(importPath);
    if (checked) return checked;

    return importPath;
}

async function getAliasMap(owner, repo, token, allFilePaths) {
    const configPath = allFilePaths.find(p => p === 'jsconfig.json' || p === 'tsconfig.json');
    if (!configPath) return {};

    try {
        const contentResponse = await apiFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${configPath}`, token);
        const configContent = Buffer.from(contentResponse.content, 'base64').toString('utf-8');
        const jsonContent = configContent.replace(/\/\/[^\n]*/g, '').replace(/\/[\s\S]*?\*\//g, '');
        const config = JSON.parse(jsonContent);
        const paths = config.compilerOptions?.paths;

        if (!paths) return {};

        const aliasMap = {};
        for (const [alias, realPaths] of Object.entries(paths)) {
            if (Array.isArray(realPaths) && realPaths.length > 0) {
                const key = alias.replace('/*', '');
                const value = realPaths[0].replace('/*', '');
                aliasMap[key] = value;
            }
        }
        return aliasMap;
    } catch (error) {
        console.warn('Could not parse alias config:', error);
        return {};
    }
}