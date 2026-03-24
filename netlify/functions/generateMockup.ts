export const handler = async (event: any, context: any) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "A GEMINI_API_KEY não foi encontrada no servidor do Netlify." }) };
    }

    const body = JSON.parse(event.body || "{}");
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
       return { statusCode: 502, body: JSON.stringify({ error: data.error?.message || "O Google bloqueou a geração ou a chave é inválida." }) };
    }

    const imageData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (imageData) {
       return { statusCode: 200, body: JSON.stringify({ image: imageData }) };
    }

    return { statusCode: 500, body: JSON.stringify({ error: "A API do Google foi chamada com sucesso, mas não retornou a imagem esperada na resposta." }) };

  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "Erro sintático no fetch do servidor proxy nativo." }) };
  }
};
