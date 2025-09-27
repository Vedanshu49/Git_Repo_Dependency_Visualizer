const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();

// Set up CORS and JSON parsing
app.use(cors());
app.use(express.json());

app.post('/api/gemini', async (req, res) => {
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        return res.status(500).json({ error: 'API key not configured on the server.' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?key=${geminiApiKey}`;

    try {
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body) // Forward the prompt from the frontend
        });

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json();
            console.error('Gemini API Error:', errorData);
            return res.status(geminiResponse.status).json(errorData);
        }

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Process the stream and forward it in the desired format
        const reader = geminiResponse.body.getReader();
        const decoder = new TextDecoder();

        const processStream = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        res.end();
                        break;
                    }
                    const chunk = decoder.decode(value, { stream: true });
                    try {
                        res.write(`data: ${chunk}\n\n`);
                    } catch (e) {
                        console.error("Error writing to stream:", e, "Chunk:", chunk);
                    }
                }
            } catch (error) {
                console.error('Error processing stream:', error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error processing stream' });
                } else {
                    res.end();
                }
            }
        };

        processStream();

    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

// Export the app instance for Vercel
module.exports = app;