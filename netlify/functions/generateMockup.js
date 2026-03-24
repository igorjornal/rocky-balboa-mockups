export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "A GEMINI_API_KEY não foi encontrada no Netlify." }) };

    const body = JSON.parse(event.body);
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
       return { statusCode: response.status, body: JSON.stringify({ error: data.error?.message || "Google API Error", payload: data }) };
    }

    const imageData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (imageData) {
       return { statusCode: 200, body: JSON.stringify({ image: imageData }) };
    }
    
    return { statusCode: 500, body: JSON.stringify({ error: "O Google não retornou a imagem.", payload: data }) };
    
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "Netlify Function Execution Error" }) };
  }
};
