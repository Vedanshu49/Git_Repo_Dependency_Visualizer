const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        return res.status(500).json({ error: 'API key not configured on the server.' });
    }

    const model = 'gemini-2.5-flash'; // Corrected model name
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

        const reader = geminiResponse.body;
        const decoder = new TextDecoder();
        let buffer = '';

        reader.on('data', (chunk) => {
            buffer += decoder.decode(chunk, { stream: true });

            let openBraces = 0;
            let jsonStart = -1;
            let i = 0;

            while (i < buffer.length) {
                if (buffer[i] === '{') {
                    if (openBraces === 0) {
                        jsonStart = i;
                    }
                    openBraces++;
                } else if (buffer[i] === '}') {
                    if (openBraces > 0) {
                        openBraces--;
                        if (openBraces === 0 && jsonStart !== -1) {
                            const jsonObject = buffer.substring(jsonStart, i + 1);
                            try {
                                // Verify it's valid JSON before sending
                                JSON.parse(jsonObject);
                                res.write(`data: ${jsonObject}\n\n`);
                                buffer = buffer.substring(i + 1);
                                jsonStart = -1;
                                i = -1; // Restart scan from the beginning of the new buffer
                            } catch (e) {
                                // Invalid JSON, continue scanning
                            }
                        }
                    }
                }
                i++;
            }
        });

        reader.on('end', () => {
            res.end();
        });

        reader.on('error', (err) => {
            console.error('Error from Gemini stream:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error' });
            }
            res.end();
        });

    } catch (error) {
        console.error('Server Error in Gemini endpoint:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'An internal server error occurred.', details: error.message });
        }
    }
};