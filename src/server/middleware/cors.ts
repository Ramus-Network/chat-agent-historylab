// middleware/cors.ts
// CORS middleware for handling cross-origin requests

/**
 * Returns standard CORS headers for cross-origin requests
 * @returns An object containing appropriate CORS headers
 */
export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*', // Allow all origins (adjust in production)
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Add any other headers your frontend sends
  };
}

/**
 * Handle OPTIONS requests for CORS preflight
 * @param request The incoming request object
 * @returns A Response with appropriate CORS headers
 */
export function handleOptions(request: Request) {
  // Ensure necessary headers are present for CORS preflight success
  if (
    request.headers.get('Origin') !== null &&
    request.headers.get('Access-Control-Request-Method') !== null &&
    request.headers.get('Access-Control-Request-Headers') !== null
  ) {
    // Respond with CORS headers
    return new Response(null, {
      headers: corsHeaders(),
    });
  } else {
    // Handle standard OPTIONS request
    return new Response(null, {
      headers: {
        Allow: 'GET, POST, OPTIONS',
      },
    });
  }
}

/**
 * Apply CORS headers to a Response
 * @param response The response to modify
 * @returns The response with CORS headers added
 */
export function applyCorsToPesponse(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  const corsHeadersObj = corsHeaders();
  
  // Add each CORS header to the response
  for (const [key, value] of Object.entries(corsHeadersObj)) {
    newHeaders.set(key, value);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
} 