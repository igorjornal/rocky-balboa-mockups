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
  try {
    const response = await fetch('/.netlify/functions/generateMockup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, mimeType, category, userPrompt, layout, aspectRatio })
    });

    let data;
    try {
       data = await response.json();
    } catch (e) {
       // Se o Netlify cuspir HTML de erro, vai cair aqui
       throw new Error(`Servidor quebrou feio. Status: ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(data.error || `Servidor bloqueou: ${JSON.stringify(data)}`);
    }

    return data.image; // Retorna o base64
  } catch (error: any) {
    console.error("Erro da api:", error);
    throw new Error(error.message || 'Falha na conexão com o servidor Netlify.');
  }
}

