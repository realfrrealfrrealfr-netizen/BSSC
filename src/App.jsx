import { useState } from 'react';

// --- Placeholder/Mock Constants (formerly in .env and server.js) ---
// NOTE: EXPOSING API keys in client-side code is a SECURITY RISK.
// For a production application, you should proxy these calls through a secured serverless function or backend.
const GEMINI_API_KEY = 'YOUR_SECURE_GEMINI_API_KEY'; // MUST BE REPLACED
const BSSC_RPC_URL = 'https://bssc-rpc.bssc.live';
const BSSC_EXPLORER_URL = 'https://explorer.bssc.live';
const GEMINI_MODEL_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-09-2025:generateContent';


// --- Integrated Backend Logic Functions (formerly in server.js) ---

/**
 * Mocks the functionality of the backend's /api/fetchExplorerData
 * NOTE: This client-side implementation cannot use 'cheerio'. It
 * performs a simple fetch and returns the first 500 characters of the body.
 * For a real app, you would need a server proxy to handle reliable scraping.
 */
async function fetchExplorerData(id) {
  try {
    const isTx = id.length > 44;
    const url = isTx
      ? `${BSSC_EXPLORER_URL}/tx/${id}`
      : `${BSSC_EXPLORER_URL}/address/${id}`;

    // Browser fetch to get HTML
    const r = await fetch(url);
    if (!r.ok) throw new Error('Explorer fetch failed');
    
    // Attempting a simple text extraction without cheerio
    const html = await r.text();
    
    // Simple text extraction (not reliable like Cheerio)
    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    let text = bodyMatch ? bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : html;
    
    const titleMatch = /<title>(.*?)<\/title>/i.exec(html);
    const title = titleMatch ? titleMatch[1] : 'Explorer Data';
    
    return { summary: `Parsed ${title}: ${text.slice(0, 500)}...` };
  } catch (err) {
    console.error('Explorer fetch failed:', err);
    return { summary: `Error fetching explorer data for ${id}.` };
  }
}

/**
 * Mocks the functionality of the backend's /api/rpcBalance
 * Not currently used in the main /api/analyze flow, but kept for completeness.
 */
// async function rpcBalance(address) {
//   try {
//     const r = await fetch(BSSC_RPC_URL, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         jsonrpc: '2.0',
//         id: 1,
//         method: 'getBalance',
//         params: [address],
//       }),
//     });
//     const data = await r.json();
//     return { balance: data.result?.value || 0 };
//   } catch (err) {
//     console.error('RPC fetch failed:', err);
//     return { error: 'RPC fetch failed' };
//   }
// }


// --- Main Application Component (App.jsx) ---
export default function App() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAsk() {
    setLoading(true);
    setResponse('');
    const query = input.trim();

    try {
      // 1. Initial Context Fetch (Mimics backend /api/analyze part 1)
      let context = '';
      if (query.length > 30) {
        // This is a direct call to the integrated function
        const explorer = await fetchExplorerData(query);
        context = explorer.summary;
      }

      // 2. AI Request (Mimics backend /api/analyze part 2)
      const aiRes = await fetch(
        `${GEMINI_MODEL_URL}?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { 
                    text: `Context: ${context || 'No specific BSSC data context needed.'}
User query: ${query}` 
                  },
                ],
              },
            ],
          }),
        }
      );

      const data = await aiRes.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
      setResponse(text);
    } catch (err) {
      console.error(err);
      setResponse('Error connecting to AI or fetching data.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold mb-4">BSSC AI Assistant v2</h1>
      <input
        type="text"
        placeholder="Enter wallet, tx hash, or question..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="w-full max-w-md p-2 border rounded mb-3"
      />
      <button
        onClick={handleAsk}
        disabled={!input || loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Analyzing...' : 'Ask AI'}
      </button>
      {response && (
        <div className="mt-6 bg-white border rounded p-4 max-w-xl shadow-sm">
          <h2 className="font-semibold mb-2 text-gray-800">AI Response:</h2>
          <p className="text-gray-700 whitespace-pre-line">{response}</p>
        </div>
      )}
      <footer className="mt-10 text-sm text-gray-400">
        Powered by Gemini 2.5 + BSSC RPC + Explorer Proxy (Client-Side Re-implementation)
      </footer>
    </div>
  );
}
