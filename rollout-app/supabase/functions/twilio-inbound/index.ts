// @ts-nocheck — Deno runtime file, not processed by Node/browser TypeScript

const twiml = (message: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`

const XML_HEADERS = { 'Content-Type': 'text/xml' }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  try {
    const text = await req.text()
    const params = new URLSearchParams(text)

    const from = params.get('From') ?? ''
    const to   = params.get('To')   ?? ''
    const body = params.get('Body') ?? ''

    console.log({ from, to, body })

    return new Response(twiml('Received'), { status: 200, headers: XML_HEADERS })
  } catch (err) {
    console.error('twilio-inbound error:', err)
    return new Response(twiml('Received'), { status: 200, headers: XML_HEADERS })
  }
})
