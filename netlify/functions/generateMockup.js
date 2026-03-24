import { GoogleGenAI, Modality } from "@google/genai";

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "Mestre, a GEMINI_API_KEY não está no painel do Netlify." }) 
      };
    }

    const body = JSON.parse(event.body);
    const { base64Image, mimeType, category, userPrompt, layout } = body;

    const layoutInstruction = layout ? `Composição/Layout: ${layout}.` : '';

    const fullPrompt = `Crie um mockup fotorrealista e de alta qualidade da imagem fornecida.
    Contexto do mockup: ${category}.
    ${layoutInstruction}
    Estilo desejado: ${userPrompt || 'Limpo, moderno e profissional, com clima meio escuro ou intenso se for adequado.'}
    A imagem enviada pelo usuário deve ser o foco central, claramente visível e perfeitamente integrada ao ambiente do mockup, respeitando a perspectiva, iluminação e texturas da cena.`;

    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: fullPrompt },
        ],
      },
      config: { responseModalities: [Modality.IMAGE] },
    });

    const imageData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (imageData) {
       return { 
         statusCode: 200, 
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ image: imageData }) 
       };
    }
    
    // Fallback if blocked
    const candidate = response?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        return { statusCode: 400, body: JSON.stringify({ error: `Bloqueado pelo Google: ${candidate.finishReason}` }) };
    }
    
    return { statusCode: 500, body: JSON.stringify({ error: "A API não devolveu a imagem." }) };
    
  } catch (error) {
    console.error("Erro na Serverless Function:", error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: error.message || "Falha técnica no servidor (Proxy)" }) 
    };
  }
};
