/**
 * Executive Mind - Stripe Webhook Handler
 * Handles payment confirmations and sends calendar invites
 */

export default {
    async fetch(request, env) {
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        try {
            const payload = await request.text();
            const sig = request.headers.get('Stripe-Signature');

            // Verify webhook signature
            const event = await stripe.webhooks.constructEventAsync(
                payload,
                sig,
                env.STRIPE_WEBHOOK_SECRET
            );

            // Handle the event
            switch (event.type) {
                case 'checkout.session.completed': {
                    const session = event.data.object;
                    await handleSuccessfulPayment(session, env);
                    break;
                }
                case 'payment_intent.succeeded': {
                    const paymentIntent = event.data.object;
                    console.log('PaymentIntent succeeded:', paymentIntent.id);
                    break;
                }
                default:
                    console.log(`Unhandled event type: ${event.type}`);
            }

            return new Response(JSON.stringify({ received: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });

        } catch (error) {
            console.error('Webhook error:', error);
            return new Response(JSON.stringify({ error: 'Webhook error' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};

async function handleSuccessfulPayment(session, env) {
    const { metadata } = session;
    
    console.log('Payment successful:', {
        package: metadata.package,
        email: metadata.email,
        date: metadata.date,
        notes: metadata.notes,
        amount: session.amount_total / 100 // Convert from cents
    });

    // Store booking in KV (if configured)
    if (env.BOOKINGS) {
        const bookingId = session.id;
        await env.BOOKINGS.put(bookingId, JSON.stringify({
            package: metadata.package,
            email: metadata.email,
            date: metadata.date,
            notes: metadata.notes,
            amount: session.amount_total / 100,
            status: 'confirmed',
            createdAt: new Date().toISOString(),
            stripeSessionId: session.id,
            customerName: session.customer_details?.name || 'Unknown'
        }));
    }

    // Send confirmation email (implement with your email provider)
    // await sendConfirmationEmail(metadata, session);

    // Create calendar event (implement with Google Calendar API)
    // await createCalendarEvent(metadata, session);

    console.log(`Booking confirmed: ${metadata.package} for ${metadata.email} on ${metadata.date}`);
}