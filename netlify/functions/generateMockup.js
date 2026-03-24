import { GoogleGenAI, Modality } from "@google/genai";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    // Netlify env config
    const apiKey = process.env.GEMINI_API_KEY || (typeof Netlify !== 'undefined' ? Netlify.env.get("GEMINI_API_KEY") : undefined);
    if (!apiKey) {
      return Response.json({ error: "A GEMINI_API_KEY não foi encontrada no Netlify." }, { status: 500 });
    }

    const body = await req.json();
    const layoutInstruction = body.layout ? `Composição/Layout: ${body.layout}.` : '';

    const textPrompt = `Crie um mockup fotorrealista e de alta qualidade da imagem fornecida.
    Contexto do mockup: ${body.category}.
    ${layoutInstruction}
    Estilo desejado: ${body.userPrompt || 'Limpo, moderno e profissional, com clima escuro se for adequado.'}
    A imagem enviada deve ser o foco central, perfeitamente integrada ao ambiente do mockup.`;

    const ai = new GoogleGenAI({ apiKey });

    let response;
    try {
        response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { inlineData: { mimeType: body.mimeType, data: body.base64Image } },
              { text: textPrompt }
            ]
          },
          config: { responseModalities: [Modality.IMAGE] }
        });
    } catch (apiError) {
         return Response.json({ error: `O Google Gemini rejeitou a chamada: ${apiError.message}` }, { status: 502 });
    }

    const imageData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (imageData) {
       return Response.json({ image: imageData });
    }

    return Response.json({ error: "O Google não retornou os dados da imagem." }, { status: 500 });

  } catch (error) {
    return Response.json({ error: error.message || "Erro interno do servidor." }, { status: 500 });
  }
};
