const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// --- CORS Configuration ---
// This is the crucial part. We are explicitly telling the server
// to allow requests only from your live frontend application.
const corsOptions = {
    origin: 'https://git-repo-dependency-visualizer.onrender.com',
    optionsSuccessStatus: 200 // For legacy browser support
};

app.use(cors(corsOptions));
app.use(express.json());

app.post('/api/gemini', async (req, res) => {
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        return res.status(500).json({ error: 'API key not configured on the server.' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`;

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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
