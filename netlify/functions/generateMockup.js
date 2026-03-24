export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || (typeof Netlify !== 'undefined' ? Netlify.env.get("GEMINI_API_KEY") : undefined);
    if (!apiKey) {
      return Response.json({ error: "A GEMINI_API_KEY não foi encontrada no servidor do Netlify." }, { status: 500 });
    }

    const body = await req.json();
    const layoutInstruction = body.layout ? `Composição/Layout: ${body.layout}.` : '';

    const textPrompt = `Crie um mockup fotorrealista e de alta qualidade da imagem fornecida.
    Contexto do mockup: ${body.category}.
    ${layoutInstruction}
    Estilo desejado: ${body.userPrompt || 'Limpo, moderno e profissional, com clima escuro se for adequado.'}
    A imagem enviada deve ser o foco central, perfeitamente integrada ao ambiente do mockup.`;

    const requestBody = {
      contents: [{
        parts: [
          { inlineData: { mimeType: body.mimeType, data: body.base64Image } },
          { text: textPrompt }
        ]
      }],
      generationConfig: {
        responseModalities: ["IMAGE"]
      }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
       return Response.json({ error: data.error?.message || "O Google bloqueou a geração ou a chave é inválida." }, { status: 502 });
    }

    const imageData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (imageData) {
       return Response.json({ image: imageData });
    }

    return Response.json({ error: "A API do Google foi chamada com sucesso, mas não retornou a imagem esperada na resposta." }, { status: 500 });

  } catch (error) {
    return Response.json({ error: error.message || "Erro sintático no fetch do servidor proxy nativo." }, { status: 500 });
  }
};
