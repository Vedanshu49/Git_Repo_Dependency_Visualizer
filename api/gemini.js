const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        return res.status(500).json({ error: 'API key not configured on the server.' });
    }

    const model = 'gemini-1.5-flash'; // Corrected model name
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

        // Process the stream from Gemini and forward it in the correct SSE format
        const reader = geminiResponse.body;
        const decoder = new TextDecoder();
        let buffer = '';

        reader.on('data', (chunk) => {
            buffer += decoder.decode(chunk, { stream: true });
            
            // The response from the Gemini API is a stream of JSON objects.
            // They are usually newline-delimited.
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex).trim();
                buffer = buffer.substring(newlineIndex + 1);

                if (line.startsWith('{')) {
                    try {
                        const parsed = JSON.parse(line.replace(/,$/, ''));
                        if (parsed.candidates && parsed.candidates[0].content && parsed.candidates[0].content.parts[0]) {
                            const text = parsed.candidates[0].content.parts[0].text;
                            // The frontend expects a JSON object with a 'text' property.
                            res.write(`data: ${JSON.stringify({ text })}\n\n`);
                        }
                    } catch (e) {
                        // Ignore lines that are not valid JSON
                    }
                }
            }
        });

        reader.on('end', () => {
            // Process any remaining data in the buffer
            if (buffer.trim().startsWith('{')) {
                try {
                    const parsed = JSON.parse(buffer.trim().replace(/,$/, ''));
                    if (parsed.candidates && parsed.candidates[0].content && parsed.candidates[0].content.parts[0]) {
                        const text = parsed.candidates[0].content.parts[0].text;
                        res.write(`data: ${JSON.stringify({ text })}\n\n`);
                    }
                } catch (e) {
                    // Ignore
                }
            }
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