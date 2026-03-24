/**
 * Generates a mockup image using the Serverless Proxy Function.
 */
export async function generateMockup(
  base64Image: string,
  mimeType: string,
  category: string,
  userPrompt: string,
  layout: string,
  aspectRatio: string
): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY não foi encontrada nas variáveis de ambiente! Configure no painel do Netlify e coloque o prefixo VITE_.");
  }

  const layoutInstruction = layout ? `Composição/Layout: ${layout}.` : '';
  
  let aspectInstruction = "";
  if (aspectRatio && aspectRatio !== "Automático") {
     aspectInstruction = `EXTREMAMENTE IMPORTANTE: A imagem final gerada DEVE SER CRIADA exatamente na proporção / aspect ratio geométrica de ${aspectRatio}. Modifique o corte do cenário se necessário para obedecer RIGOROSAMENTE à proporção ${aspectRatio}.`;
  } else {
     aspectInstruction = `Corte o cenário adaptando automaticamente a melhor proporção que caiba o produto original de forma elegante.`;
  }

  const textPrompt = `Crie um mockup fotorrealista e de alta qualidade da imagem fornecida.
  Contexto do mockup: ${category}.
  ${layoutInstruction}
  ${aspectInstruction}
  Estilo desejado: ${userPrompt || 'Limpo, moderno e profissional, com clima escuro se for adequado.'}
  A imagem enviada deve ser o foco central, perfeitamente integrada ao ambiente do mockup.`;

  const requestBody = {
    contents: [{
      parts: [
        { inlineData: { mimeType, data: base64Image } },
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
     throw new Error(data.error?.message || "O Google bloqueou a requisição direta na API.");
  }

  const imageData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!imageData) {
     throw new Error("API do Google respondeu com sucesso, mas a imagem não veio no formato correto.");
  }

  return imageData;
}
