import { GoogleGenAI, Modality } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!key || key === 'undefined') {
    throw new Error("Mestre, o Netlify não encontrou a sua GEMINI_API_KEY. Adicione ela nas configurações de Environment Variables lá no site do Netlify e faça um novo Deploy!");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
}

/**
 * Generates a mockup image using the Gemini API.
 * @param base64Image The base64 encoded string of the user's image (without data URI prefix).
 * @param mimeType The MIME type of the user's image.
 * @param category The selected mockup category.
 * @param userPrompt An optional user-provided text prompt for style.
 * @param layout An optional user-provided layout or composition choice.
 * @returns A promise that resolves to the base64 string of the generated image.
 */
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
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: fullPrompt,
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const imageData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (imageData) {
      return imageData;
    }

    // Handle cases where generation might be blocked or return no content
    const candidate = response?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        const reason = candidate.finishReason;
        const safetyRatings = candidate.safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ') || 'N/A';
        const errorMessage = `A geração de imagem foi bloqueada. Motivo: ${reason}.`;
        console.error(errorMessage, `Classificações de segurança: ${safetyRatings}`);
        throw new Error(errorMessage);
    }
    
    throw new Error('A resposta da API não continha dados de imagem.');
  } catch (error) {
    console.error("Erro ao gerar mockup com a API Gemini:", error);
    if (error instanceof Error && error.message.startsWith('A geração de imagem foi bloqueada')) {
        throw error;
    }
    throw new Error('Falha ao gerar a imagem de mockup. Por favor, tente novamente.');
  }
}
