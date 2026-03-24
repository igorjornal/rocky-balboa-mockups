import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateMockup } from './services/geminiService';
import { MOCKUP_CATEGORIES, STYLE_PRESETS, LAYOUT_PRESETS, MAX_HISTORY_SIZE } from './constants';
import type { GeneratedImage, HistoryItem } from './types';

const fileToBase64 = (file: File): Promise<{ raw: string, prefixed: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const prefixed = reader.result as string;
      const raw = prefixed.split(',')[1];
      resolve({ raw, prefixed });
    };
    };
    reader.onerror = (error) => reject(error);
  });
};

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('RockyMockupsDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history', { keyPath: 'id' });
      }
    };
  });
};

const saveHistoryToDB = async (historyList: HistoryItem[]) => {
  try {
    const db = await initDB();
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    // Upsert items without clearing the database to prevent catastrophic wipes if the transaction fails midway
    for (const item of historyList) { store.put(item); }
  } catch (e) { console.error('IndexedDB Save Error:', e); }
};

const loadHistoryFromDB = async (): Promise<HistoryItem[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const req = store.getAll();
      req.onsuccess = () => {
        const sorted = req.result.sort((a: any, b: any) => b.createdAt - a.createdAt);
        resolve(sorted.slice(0, 40));
      };
      req.onerror = () => resolve([]);
    });
  } catch (e) { return []; }
};

const App: React.FC = () => {
  const [uploadedFile, setUploadedFile] = useState<{ raw: string; prefixed: string; mimeType: string } | null>(null);
  const [isColorEnabled, setIsColorEnabled] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [layout, setLayout] = useState<string>('');
  const [style, setStyle] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('Automático');
  const [numMockups, setNumMockups] = useState<number>(4);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [downloadStatus, setDownloadStatus] = useState<Record<string, 'downloading' | 'saved'>>({});
  const [maximizedImage, setMaximizedImage] = useState<GeneratedImage | HistoryItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadHistoryFromDB().then(savedHistory => {
      if (savedHistory && savedHistory.length > 0) {
        setHistory(savedHistory);
      }
    });
  }, []);

  // Removed flawed auto-save useEffect because on initial mount history is [] and it wiped the database!

  const processFile = async (file: File) => {
    if (['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/heic'].includes(file.type)) {
      try {
        const { raw, prefixed } = await fileToBase64(file);
        setUploadedFile({ raw, prefixed, mimeType: file.type });
        setError(null);
      } catch (err) {
        setError('Erro ao processar o arquivo.');
      }
    } else {
      setError('Formato inválido. Envie PNG, JPG, WEBP, AVIF ou HEIC.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleGenerate = useCallback(async () => {
    if (!uploadedFile || !category) {
      setError('A imagem e a categoria são obrigatórias para o treinamento!');
      return;
    }
    setIsLoading(true); setError(null); setGeneratedImages([]);

    let promises = Array(numMockups).fill(null).map(() => 
        generateMockup(uploadedFile.raw, uploadedFile.mimeType, category, style, layout, aspectRatio)
    );

    try {
      const results = await Promise.all(promises);
      const newImages = results.map((src, index) => ({ id: `img-${Date.now()}-${index}`, src, isLoading: false }));
      setGeneratedImages(newImages);
      const newHistoryItems = results.map((src, index) => ({ id: `hist-${Date.now()}-${index}`, src, category, prompt: style, createdAt: Date.now() }));
      setHistory(prev => {
        // Safe merge with explicit deduplication and hardcoded clamping to 40
        const merged = [...newHistoryItems, ...prev];
        const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
        const finalHistory = unique.slice(0, 40);
        
        saveHistoryToDB(finalHistory);
        return finalHistory;
      });
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro no ringue.');
    } finally { setIsLoading(false); }
  }, [uploadedFile, category, style, layout, numMockups]);

  const handleRemake = useCallback(async (id: string) => {
    if (!uploadedFile || !category) return;
    setGeneratedImages(prev => prev.map(img => img.id === id ? { ...img, isLoading: true } : img));
    try {
        const newSrc = await generateMockup(uploadedFile.raw, uploadedFile.mimeType, category, style, layout, aspectRatio);
        setGeneratedImages(prev => prev.map(img => img.id === id ? { id, src: newSrc, isLoading: false } : img));
        
        const newHistoryItem = { id: `hist-${Date.now()}-remake`, src: newSrc, category, prompt: style, createdAt: Date.now() };
        setHistory(prev => {
          const updatedHistory = [newHistoryItem, ...prev].slice(0, MAX_HISTORY_SIZE);
          saveHistoryToDB(updatedHistory);
          return updatedHistory;
        });
    } catch (err: any) {
        setError(`Erro ao refazer: ${err.message}`);
        setGeneratedImages(prev => prev.map(img => img.id === id ? { ...img, isLoading: false } : img));
    }
  }, [uploadedFile, category, style, layout, aspectRatio]);

  const downloadImage = (base64Image: string, fileName: string, id: string) => {
    setDownloadStatus(prev => ({ ...prev, [id]: 'downloading' }));
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64Image}`;
    link.download = fileName;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(() => {
      setDownloadStatus(prev => ({ ...prev, [id]: 'saved' }));
      setTimeout(() => setDownloadStatus(prev => { const n = {...prev}; delete n[id]; return n; }), 1500);
    }, 500);
  };

  const isGenerateDisabled = isLoading || !uploadedFile || !category;

  return (
    <div className="min-h-screen w-full bg-white relative p-4 md:p-8 flex items-center justify-center font-display">
      
      {/* Brutalist Poster Frame */}
      <div className="w-full max-w-6xl bg-white poster-border flex flex-col p-6 md:p-12 relative overflow-hidden">
        
        {/* Gritty Background Texture (Faint) */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")'}}></div>
        
        {/* HERO BANNER IMAGE */}
        <div className={`w-full h-64 md:h-[420px] mb-8 border-b-8 border-black overflow-hidden relative brutalist-shadow-sm transition-all duration-700 ${!isColorEnabled ? 'grayscale contrast-110' : ''}`}>
           {/* Fallback color if the image isn't loaded yet */}
           <div className="absolute inset-0 bg-gray-200"></div>
           {/* The actual image from the public folder */}
           <img src="/header.jpeg" alt="Rocky Legends" className="w-full h-full object-cover object-top relative z-10" />
           {/* Overlay for grittiness */}
           <div className="absolute inset-0 bg-black/10 mix-blend-overlay z-20"></div>

           {/* Botão de Ligar/Desligar Cores */}
           <button 
             onClick={() => setIsColorEnabled(!isColorEnabled)}
             className="absolute top-4 right-4 z-30 border-2 border-black bg-white text-black font-poster uppercase px-2 py-1 text-[10px] md:text-xs hover:bg-black hover:text-white transition-colors cursor-pointer opacity-70 hover:opacity-100"
           >
             {isColorEnabled ? '⚫ B&W' : '🔴 COR'}
           </button>
        </div>
        
        <header className="text-center mb-10 relative z-30 flex flex-col items-center">
          <p className="font-display font-bold uppercase tracking-widest text-sm mb-4 border-b-2 border-black inline-block pb-1">It ain't over 'til it's over.</p>
          <h1 className="font-poster text-[15vw] md:text-[8rem] text-black tracking-tighter m-0">ROCKY</h1>
          <h1 className="font-poster text-[15vw] md:text-[8rem] text-black tracking-tighter m-0 -mt-4 md:-mt-8">MOCKUPS</h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 relative z-10">
          
          {/* UPLOAD ZONE */}
          <div className="flex flex-col">
            <h2 className="font-poster text-3xl mb-4 bg-black text-white inline-block px-4 py-1 self-start uppercase">1. O Peso-Pesado (Sua Imagem)</h2>
            <div 
              className={`flex-1 brutalist-border bg-gray-100 p-8 flex flex-col items-center justify-center transition-all duration-200 min-h-[400px] cursor-pointer ${isDragging ? 'bg-gray-300 brutalist-shadow scale-[1.01]' : 'hover:brutalist-shadow'} ${uploadedFile ? 'p-0 bg-black' : ''}`}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => !uploadedFile && fileInputRef.current?.click()}
            >
              {uploadedFile ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
                  <img src={uploadedFile.prefixed} alt="Preview" className="w-full h-full object-contain max-h-[400px]" />
                  <button onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }} className="absolute top-4 right-4 bg-white text-black font-poster text-xl px-4 py-2 brutalist-border hover:bg-[var(--color-brand-red)] hover:text-white transition">X</button>
                </div>
              ) : (
                <div className="text-center flex flex-col items-center">
                  <span className="text-[80px] mb-4">🥊</span>
                  <h3 className="font-poster text-3xl text-black mb-2 uppercase">Jogue no Ringue</h3>
                  <p className="font-display font-bold text-gray-600">Arraste ou clique (PNG, JPG, WEBP, AVIF)</p>
                </div>
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg,image/webp,image/avif,image/heic" onChange={handleFileChange} />
            </div>

            {/* GENERATE BUTTON MOVED TO LEFT COLUMN */}
            <div className="w-full mt-6 relative z-10 flex flex-col gap-4">
              {error && <div className="bg-black text-white p-4 brutalist-border font-bold uppercase flex items-center gap-3">⚠️ {error}</div>}
              <button 
                onClick={handleGenerate} 
                disabled={isGenerateDisabled}
                className={`w-full py-5 brutalist-border font-poster text-4xl md:text-5xl uppercase flex items-center justify-center gap-4 transition-all duration-200 ${isGenerateDisabled ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[var(--color-brand-red)] text-white brutalist-shadow hover:translate-x-1 hover:translate-y-1 hover:shadow-none'}`}
              >
                {isLoading ? '🥊 GERANDO...' : 'GERAR MOCKUPS'}
              </button>
            </div>
          </div>

          {/* CONTROLS */}
          <div className="flex flex-col">
            <h2 className="font-poster text-3xl mb-4 bg-black text-white inline-block px-4 py-1 self-start uppercase">2. O Treinamento (Ajustes)</h2>
            <div className="brutalist-border bg-white p-6 flex flex-col gap-6 flex-1 brutalist-shadow-sm">
              
              <div className="flex flex-col gap-2">
                <label className="font-poster text-2xl uppercase">Categoria do Mockup</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="brutalist-border bg-gray-100 p-4 font-display font-bold text-lg outline-none cursor-pointer focus:bg-white">
                  <option value="" disabled>Escolha o Alvo...</option>
                  {MOCKUP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-poster text-2xl uppercase">Ângulo / Câmera</label>
                <select value={layout} onChange={e => setLayout(e.target.value)} className="brutalist-border bg-gray-100 p-4 font-display font-bold text-lg outline-none cursor-pointer focus:bg-white">
                  <option value="">Decisão do Treinador (Auto)</option>
                  {LAYOUT_PRESETS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-poster text-2xl uppercase">Vibe do Ambiente</label>
                <select value={style} onChange={e => setStyle(e.target.value)} className="brutalist-border bg-gray-100 p-4 font-display font-bold text-lg outline-none cursor-pointer focus:bg-white">
                  <option value="">Instinto Bruto (Padrão)</option>
                  {STYLE_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-poster text-2xl uppercase">Formato (Proporção)</label>
                <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="brutalist-border bg-gray-100 p-4 font-display font-bold text-lg outline-none cursor-pointer focus:bg-white">
                  <option value="Automático">Automático (Adapta à Imagem)</option>
                  <option value="1:1">Quadrado (1:1 - Feed)</option>
                  <option value="9:16">Vertical (9:16 - Stories/TikTok)</option>
                  <option value="16:9">Horizontal (16:9 - YouTube/TV)</option>
                  <option value="4:3">Retrato (4:3)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2 mt-auto">
                <label className="font-poster text-2xl uppercase">Quantos Rounds? (Variações)</label>
                <div className="flex gap-2">
                  {[1,2,3,4].map(n => (
                    <button key={n} onClick={() => setNumMockups(n)} className={`flex-1 py-3 brutalist-border font-poster text-2xl transition-all ${numMockups === n ? 'bg-black text-white brutalist-shadow-sm' : 'bg-white text-black hover:bg-gray-200'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RESULTS GRID */}
        {generatedImages.length > 0 && (
          <div className="mt-16 w-full relative z-10">
            <h2 className="font-poster text-5xl text-black mb-6 uppercase border-b-8 border-black pb-2">
              RESULTADOS (O CINTURÃO) 🏆
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {generatedImages.map(img => (
                <div key={img.id} className="brutalist-border bg-white flex flex-col">
                  <div 
                    className="relative aspect-square bg-gray-100 flex items-center justify-center p-4 border-b-4 border-black cursor-pointer group"
                    onClick={() => !img.isLoading && setMaximizedImage(img)}
                  >
                     <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-20 flex items-center justify-center pointer-events-none">
                       {!img.isLoading && <span className="opacity-0 group-hover:opacity-100 bg-white font-poster text-2xl px-4 py-2 brutalist-border scale-90 group-hover:scale-100 transition-all text-black">🔍 MAXIMIZAR</span>}
                     </div>
                    {img.isLoading ? (
                      <span className="font-poster text-3xl animate-pulse">CARREGANDO...</span>
                    ) : (
                      <img src={`data:image/png;base64,${img.src}`} alt="Result" className="w-full h-full object-contain brutalist-shadow-sm border-2 border-black" />
                    )}
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2 bg-black">
                    <button onClick={() => downloadImage(img.src, `mockup-${img.id}.png`, img.id)} disabled={img.isLoading || !!downloadStatus[img.id]} className="py-2 bg-white text-black font-poster uppercase text-lg border-2 border-white hover:bg-gray-200 transition disabled:opacity-50">
                        {downloadStatus[img.id] === 'saved' ? 'SALVO!' : 'BAIXAR'}
                    </button>
                    <button onClick={() => handleRemake(img.id)} disabled={img.isLoading} className="py-2 bg-transparent text-white font-poster uppercase text-lg border-2 border-white hover:bg-white hover:text-black transition disabled:opacity-50">
                        REFAZER
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HISTORY GRID */}
        {history.length > 0 && (
          <div className="mt-16 w-full relative z-10 pt-10 border-t-8 border-black border-dashed">
            <div className="flex items-center justify-between mb-6">
                <h2 className="font-poster text-4xl text-black uppercase">
                HISTÓRICO (ÚLTIMAS LUTAS) ⏱️
                </h2>
                <button onClick={() => { setHistory([]); saveHistoryToDB([]); }} className="text-sm font-display font-bold uppercase underline hover:text-red-600">Limpar Histórico</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {history.map(item => (
                <div key={item.id} className="brutalist-border bg-white flex flex-col hover:brutalist-shadow transition-shadow">
                  <div 
                    className="relative aspect-square bg-gray-100 flex items-center justify-center p-2 border-b-2 border-black cursor-pointer group"
                    onClick={() => setMaximizedImage(item)}
                  >
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors z-20 flex items-center justify-center pointer-events-none">
                       <span className="opacity-0 group-hover:opacity-100 text-white font-poster text-4xl drop-shadow-md">🔍</span>
                    </div>
                    <img src={`data:image/png;base64,${item.src}`} alt="History" className="w-full h-full object-contain" />
                  </div>
                  <div className="p-2 bg-black flex justify-between">
                     <span className="text-white font-display text-[10px] truncate">{item.category}</span>
                     <button onClick={() => downloadImage(item.src, `mockup-${item.id}.png`, item.id)} className="text-white hover:text-[var(--color-brand-red)]">
                        ⬇️
                     </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODAL MAXIMIZAR */}
        {maximizedImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 md:p-8 backdrop-blur-sm" onClick={() => setMaximizedImage(null)}>
            <div className="relative w-full max-w-5xl max-h-full flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
              <button 
                className="absolute top-4 right-4 md:-right-8 md:-top-8 bg-white text-black font-poster text-3xl px-4 py-2 brutalist-border hover:bg-[var(--color-brand-red)] hover:text-white transition z-10"
                onClick={() => setMaximizedImage(null)}
              >X</button>
              
              <div className="relative w-full max-h-[75vh] flex justify-center">
                  <img src={`data:image/png;base64,${maximizedImage.src}`} className="max-w-full max-h-[75vh] object-contain border-8 border-white brutalist-shadow-sm" />
              </div>
              
              <button 
                onClick={() => downloadImage(maximizedImage.src, `mockup-max-${maximizedImage.id}.png`, maximizedImage.id)} 
                className="mt-8 font-poster text-3xl md:text-4xl uppercase bg-[var(--color-brand-red)] text-white px-10 py-5 brutalist-border hover:brutalist-shadow transition-all hover:-translate-y-1"
              >
                BAIXAR ESTA IMAGEM ⬇️
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;
