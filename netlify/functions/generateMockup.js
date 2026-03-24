import { GoogleGenAI, Modality } from "@google/genai";

export async function handler(event, context) {
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
         return { statusCode: 502, body: JSON.stringify({ error: `O Google Gemini rejeitou a chamada: ${apiError.message}` }) };
    }

    const imageData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (imageData) {
       return { statusCode: 200, body: JSON.stringify({ image: imageData }) };
    }
    
    return { statusCode: 500, body: JSON.stringify({ error: "O Google não retornou os dados da imagem." }) };
    
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "Netlify Function Execution Error" }) };
  }
}
