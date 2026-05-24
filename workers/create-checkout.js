/**
 * Executive Mind - Stripe Checkout Worker
 * Handles booking payments and calendar confirmations
 */

export default {
    async fetch(request, env) {
        // Handle CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        try {
            const { package: packageName, price, email, date, notes } = await request.json();

            // Validate
            if (!email || !packageName || !price) {
                return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Create Stripe checkout session
            const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    'payment_method_types[]': 'card',
                    'customer_email': email,
                    'line_items[0][price_data][currency]': 'aud',
                    'line_items[0][price_data][product_data][name]': `Executive Mind - ${packageName}`,
                    'line_items[0][price_data][product_data][description]': `AI C-Suite Deployment Session - ${date || 'TBD'}`,
                    'line_items[0][price_data][unit_amount]': String(price * 100), // Convert to cents
                    'line_items[0][quantity]': '1',
                    'mode': 'payment',
                    'success_url': `${env.SITE_URL}/book.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
                    'cancel_url': `${env.SITE_URL}/book.html?canceled=true`,
                    'metadata[package]': packageName,
                    'metadata[email]': email,
                    'metadata[date]': date || 'TBD',
                    'metadata[notes]': notes || ''
                })
            });

            const session = await stripeResponse.json();

            if (session.error) {
                console.error('Stripe error:', session.error);
                return new Response(JSON.stringify({ error: session.error.message }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                });
            }

            // Log booking attempt (you could store this in KV or D1)
            console.log(`Booking: ${packageName} - $${price} - ${email} - ${date}`);

            return new Response(JSON.stringify({ url: session.url }), {
                status: 200,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });

        } catch (error) {
            console.error('Checkout error:', error);
            return new Response(JSON.stringify({ error: 'Internal server error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }
    }
};