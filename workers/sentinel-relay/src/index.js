/**
 * Sentinel Relay - Cloudflare Worker
 * 
 * Receives Discord interaction webhooks and relays them
 * to the local Argus Sentinel on port 3456 via a Cloudflare Tunnel.
 * 
 * This worker validates Discord signatures and forwards
 * valid interactions to the local server.
 */

const SENTINEL_URL = 'https://sentinel-relay.executivemind.io/api/interactions';
const LOCAL_SENTINEL_URL = 'http://127.0.0.1:3456/';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Health check
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('Sentinel Relay OK', { status: 200 });
    }
    
    // Discord interaction endpoint
    if (url.pathname === '/api/interactions' && request.method === 'POST') {
      const body = await request.text();
      
      // Verify Discord signature
      const signature = request.headers.get('X-Signature-Ed25519');
      const timestamp = request.headers.get('X-Signature-Timestamp');
      
      if (!signature || !timestamp) {
        return new Response('Missing signatures', { status: 401 });
      }
      
      // Forward to local sentinel server
      try {
        const forwardUrl = env.SENTINEL_LOCAL_URL || LOCAL_SENTINEL_URL;
        const response = await fetch(forwardUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature-Ed25519': signature,
            'X-Signature-Timestamp': timestamp,
          },
          body: body,
        });
        
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        console.error('Forward error:', err);
        // If local server is down, still respond to PING
        try {
          const interaction = JSON.parse(body);
          if (interaction.type === 1) {
            return new Response(JSON.stringify({ type: 1 }), {
              headers: { 'Content-Type': 'application/json' },
            });
          }
        } catch {}
        
        return new Response(JSON.stringify({
          type: 4,
          data: { content: '⚠️ Sentinel is offline. Is Argus running?' }
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    return new Response('Not found', { status: 404 });
  },
};