apper.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  const apiKey = Deno.env.get('SLICE_API_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: 'Slice integration is not configured. Add SLICE_API_KEY to the server environment.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  const body = await req.json();
  const amount = Number(body.amount);
  const clientReferenceId = String(body.clientReferenceId || '').trim();
  if (!clientReferenceId || !Number.isFinite(amount) || amount <= 0) return new Response(JSON.stringify({ error: 'clientReferenceId and a positive amount are required.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const response = await fetch('https://api.slice.bank.in/banking/merchant/v1/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ clientReferenceId, amount: amount.toFixed(2), paymentMode: 'QR' })
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return new Response(JSON.stringify(payload), { status: response.status, headers: { 'Content-Type': 'application/json' } });
});