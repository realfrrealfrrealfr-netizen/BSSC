// api/analyze.js - Using CommonJS (require) for maximum Vercel compatibility

// Use require() for packages that are sometimes tricky with Vercel's ES Modules
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Constants are read directly from Vercel's environment variables
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY; 
const BSSC_RPC_URL = 'https://bssc-rpc.bssc.live';
const BSSC_EXPLORER_URL = 'https://explorer.bssc.live';

// --- Helper Functions ---

async function fetchExplorerData(id) {
    try {
        const isTx = id.length > 44;
        const url = isTx
            ? `${BSSC_EXPLORER_URL}/tx/${id}`
            : `${BSSC_EXPLORER_URL}/address/${id}`;

        const html = await fetch(url).then(r => r.text());
        const $ = cheerio.load(html);
        const title = $('title').text();
        
        // Use a more robust check for body content
        const bodyContent = $('body').text();
        const text = bodyContent.slice(0, 1000).replace(/\s+/g, ' ').trim(); 
        
        return { summary: `Parsed ${title}: ${text.slice(0, 500)}...` };
    } catch (err) {
        console.error("Explorer fetch failed:", err);
        return { summary: `Error fetching BSSC Explorer data for ${id}.` };
    }
}

// --- Main Handler ---

// Vercel Serverless Function export uses the CommonJS module.exports syntax
module.exports = async function handler(req, res) {
    // Set headers for CORS if needed, but Vercel usually handles this
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }
    
    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes('YOUR_ACTUAL_GEMINI_API_KEY')) {
        // This response is explicit about the key being the issue
        return res.status(500).json({ error: 'Configuration Error: GEMINI_API_KEY is missing or invalid. Check Vercel Environment Variables.' });
    }

    try {
        let context = 'No specific BSSC data context needed.'; 
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
        
        if (!aiRes.ok) {
            const errorText = await aiRes.text();
            // Return detailed error status from Gemini
            return res.status(502).json({ 
                error: `Gemini API failed with status ${aiRes.status}. Check Vercel logs for full error.` 
            });
        }

        const data = await aiRes.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No legible response from AI.';

        res.status(200).json({ answer: text });
    } catch (err) {
        // Catch any remaining runtime errors
        res.status(500).json({ error: `Internal Server Error: ${err.message}. Please check Vercel deployment logs.` });
    }
}
