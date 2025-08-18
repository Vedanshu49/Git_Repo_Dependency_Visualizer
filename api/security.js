const fetch = require('node-fetch');

// Simulate a database of known vulnerabilities for demonstration
// In a real-world app, you would use a service like the GitHub Advisory Database API
const KNOWN_VULNERABILITIES = {
    'express': ['4.17.1', '4.18.2'], // Example: old versions of express are "vulnerable"
    'lodash': ['4.17.15']
};

module.exports = async (req, res) => {
    // Set CORS headers for Vercel environment
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { dependencies } = req.body;

    if (!dependencies || typeof dependencies !== 'object') {
        return res.status(400).json({ error: 'Invalid dependencies format.' });
    }

    const insights = {};
    const promises = Object.entries(dependencies).map(async ([name, version]) => {
        try {
            const response = await fetch(`https://registry.npmjs.org/${name}`);
            if (!response.ok) {
                insights[name] = { license: 'Unknown', vulnerable: false, error: 'Package not found' };
                return;
            }
            const data = await response.json();
            const latestVersion = data['dist-tags']?.latest;
            const license = data.license || 'N/A';
            
            // Check against our simulated vulnerability list
            const vulnerableVersions = KNOWN_VULNERABILITIES[name] || [];
            const isVulnerable = vulnerableVersions.some(vulnerableVersion => version.includes(vulnerableVersion));

            insights[name] = { license, vulnerable: isVulnerable, latest: latestVersion, current: version.replace(/[\^~]/g, '') };

        } catch (error) {
            insights[name] = { license: 'Error', vulnerable: false, error: error.message };
        }
    });

    await Promise.all(promises);
    res.status(200).json(insights);
};