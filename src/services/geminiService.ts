/**
 * Generates a mockup image using the Serverless Proxy Function.
 */
export async function generateMockup(
  base64Image: string,
  mimeType: string,
  category: string,
  userPrompt: string,
  layout: string
): Promise<string> {
  try {
    const response = await fetch('/.netlify/functions/generateMockup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, mimeType, category, userPrompt, layout })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.errorMessage || data.message || `Netlify Error JSON: ${JSON.stringify(data)}`);
    }

    return data.image; // Retorna o base64 da imagem gerada pelo backend
  } catch (error: any) {
    console.error("Erro da função proxy:", error);
    throw new Error(error.message || 'Falha na conexão com o servidor. A API bloqueou o envio.');
  }
}
