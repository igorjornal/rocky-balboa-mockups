import { GoogleGenAI, Modality } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  const key = process.env.API_KEY;
  if (!key || key.trim() === '' || key === 'undefined') {
    throw new Error("CHAVE_FALTANDO");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
}

export async function generateMockup(
  base64Image: string,
  mimeType: string,
  category: string,
  userPrompt: string,
  layout: string
): Promise<string> {
  const layoutInstruction = layout ? `Composição/Layout: ${layout}.` : '';

  const fullPrompt = `Crie um mockup fotorrealista e de alta qualidade da imagem fornecida.
    Contexto do mockup: ${category}.
    ${layoutInstruction}
    Estilo desejado: ${userPrompt || 'Limpo, moderno e profissional, com clima meio escuro ou intenso se for adequado.'}
    A imagem enviada pelo usuário deve ser o foco central, claramente visível e perfeitamente integrada ao ambiente do mockup, respeitando a perspectiva, iluminação e texturas da cena.`;

  try {
    const ai = getAI();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: mimeType } },
          { text: fullPrompt },
        ],
      },
      config: { responseModalities: [Modality.IMAGE] },
    });

    const imageData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (imageData) {
      return imageData;
    }

    throw new Error('A resposta da API não continha dados de imagem.');
  } catch (error: any) {
    console.error("Erro da api:", error);
    
    if (error.message === "CHAVE_FALTANDO") {
       throw new Error("A GEMINI_API_KEY falhou no Build! Aperte 'Clear Cache and Deploy site' no Netlify de novo.");
    }

    throw new Error(error.message || 'Falha na conexão com a API do Google.');
  }
}

