const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        return res.status(500).json({ error: 'API key not configured on the server.' });
    }

    // Corrected model name to a valid one.
    const model = 'gemini-1.5-flash'; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${geminiApiKey}`;

    try {
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body) // Forward the prompt from the frontend
        });

        if (!geminiResponse.ok) {
            let errorData;
            const errorText = await geminiResponse.text();
            try {
                // Try to parse as JSON, as the API usually returns JSON errors
                errorData = JSON.parse(errorText);
            } catch (e) {
                // If it's not JSON, use the raw text. This happens with some network errors or HTML responses.
                errorData = { error: { message: errorText } };
            }
            console.error('Gemini API Error:', errorData);
            // Ensure we send a status and a JSON object
            return res.status(geminiResponse.status).json({ 
                error: 'Gemini API Error', 
                details: errorData
            });
        }

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Process the stream and forward it
        geminiResponse.body.pipe(res);

    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: 'An internal server error occurred.', details: error.message });
    }
};