const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        return res.status(500).json({ error: 'API key not configured on the server.' });
    }

    const model = 'gemini-2.5-flash'; // Using a standard and reliable model
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:streamGenerateContent?key=${geminiApiKey}`;

    try {
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body) // Forward the prompt from the frontend
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: { message: errorText } };
            }
            console.error('Gemini API Error:', errorData);
            return res.status(geminiResponse.status).json({ 
                error: 'Gemini API Error', 
                details: errorData
            });
        }

        // Set headers for streaming directly to the client
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Directly pipe the response from Gemini to the client
        geminiResponse.body.pipe(res);

    } catch (error) {
        console.error('Server Error in Gemini endpoint:', error);
        // If the response hasn't been sent yet, send an error
        if (!res.headersSent) {
            res.status(500).json({ error: 'An internal server error occurred.', details: error.message });
        }
    }
};