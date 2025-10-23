// api/analyze.js - Corrected Serverless Function

// Ensure you are using the V3 syntax for node-fetch import
import fetch from 'node-fetch';
import cheerio from 'cheerio';

// Vercel automatically exposes environment variables prefixed with VITE_ 
// in Serverless Functions.
// NOTE: Vercel needs the 'Content-Type' header for JSON body requests.
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
        
        // This extraction is reliable thanks to cheerio
        const text = $('body').text().slice(0, 1000).replace(/\s+/g, ' ').trim(); 
        
        return { summary: `Parsed ${title}: ${text.slice(0, 500)}...` };
    } catch (err) {
        console.error("Explorer fetch failed:", err);
        // Ensure a fallback context is returned even on failure
        return { summary: `Error fetching BSSC Explorer data for ${id}.` };
    }
}

// --- Main Handler ---

export default async function handler(req, res) {
    // 1. Basic validation and method check
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }
    
    // Check if API Key is available
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing. Check Vercel Environment Variables.' });
    }

    try {
        // 2. Data Context Fetching
        let context = 'No specific BSSC data context needed.'; // Default context
        if (query.length > 30) {
            const explorer = await fetchExplorerData(query);
            context = explorer.summary;
        }

        // 3. AI Request
        const aiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-09-2025:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                // *** CRITICAL FIX: Ensure Content-Type is set for the JSON body ***
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
        
        // Check for non-200 responses from Gemini
        if (!aiRes.ok) {
            const errorText = await aiRes.text();
            console.error('Gemini API Error Status:', aiRes.status, errorText);
            // Return an error to the frontend if Gemini fails
            return res.status(502).json({ 
                error: `Gemini API call failed with status ${aiRes.status}. Details: ${errorText.slice(0, 100)}...` 
            });
        }

        const data = await aiRes.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No legible response from AI.';

        // 4. Success Response
        res.status(200).json({ answer: text });
    } catch (err) {
        console.error('API Analyze Runtime Error:', err);
        // If an unexpected exception occurs
        res.status(500).json({ error: `Internal Server Error: ${err.message}` });
    }
}
