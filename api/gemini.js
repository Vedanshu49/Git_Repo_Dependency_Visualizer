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

    // Note the updated Gemini API model name for better performance
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

    try {
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body) // Forward the prompt from the frontend
        });

        const data = await geminiResponse.json();

        if (!geminiResponse.ok) {
            console.error('Gemini API Error:', data);
            return res.status(geminiResponse.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

// Export the app instance for Vercel
module.exports = app;