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
            let start = buffer.indexOf('{');
            while (start !== -1) {
                let braceCount = 0;
                let end = -1;
                for (let i = start; i < buffer.length; i++) {
                    if (buffer[i] === '{') {
                        braceCount++;
                    } else if (buffer[i] === '}') {
                        braceCount--;
                    }
                    if (braceCount === 0) {
                        end = i;
                        break;
                    }
                }

                if (end !== -1) {
                    const jsonObject = buffer.substring(start, end + 1);
                    try {
                        JSON.parse(jsonObject);
                        res.write(`data: ${jsonObject}\n\n`);
                        buffer = buffer.substring(end + 1);
                        start = buffer.indexOf('{');
                    } catch (e) {
                        start = buffer.indexOf('{', start + 1);
                    }
                } else {
                    break;
                }
            }
            if (start !== -1) {
                buffer = buffer.substring(start);
            } else {
                buffer = '';
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