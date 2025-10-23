// This file runs on Vercel as a Serverless Function (Node.js environment)

import fetch from 'node-fetch';
import cheerio from 'cheerio';

// Vercel automatically exposes environment variables prefixed with VITE_ 
// in Serverless Functions, which is a great place to securely hide keys.
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY; 
const BSSC_RPC_URL = 'https://bssc-rpc.bssc.live';
const BSSC_EXPLORER_URL = 'https://explorer.bssc.live';


// RE-CREATED fetchExplorerData with Cheerio for reliable scraping
async function fetchExplorerData(id) {
    try {
        const isTx = id.length > 44;
        const url = isTx
            ? `${BSSC_EXPLORER_URL}/tx/${id}`
            : `${BSSC_EXPLORER_URL}/address/${id}`;

        const html = await fetch(url).then(r => r.text());
        const $ = cheerio.load(html);
        const title = $('title').text();
        
        // This extraction is reliable thanks to cheerio
        const text = $('body').text().slice(0, 1000).replace(/\s+/g, ' ').trim(); 
        
        return { summary: `Parsed ${title}: ${text.slice(0, 500)}...` };
    } catch (err) {
        console.error("Explorer fetch failed:", err);
        return { summary: `Error fetching explorer data for ${id}.` };
    }
}

// Vercel Serverless Function Handler
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing from environment variables.' });
    }

    try {
        let context = '';
        
        // Use the restored server-side logic if the query looks like an ID
        if (query.length > 30) {
            const explorer = await fetchExplorerData(query);
            context = explorer.summary;
        }

        // --- Call Gemini API ---
        const aiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-09-2025:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { 
                                    text: `Context: ${context}
User query: ${query}` 
                                },
                            ],
                        },
                    ],
                }),
            }
        );

        const data = await aiRes.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';

        // Respond with the final result
        res.status(200).json({ answer: text });
    } catch (err) {
        console.error('API Analyze Error:', err);
        res.status(500).json({ error: 'Internal Server Error during AI processing.' });
    }
}
