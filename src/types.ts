export interface GeneratedImage {
  id: string;
  src: string; // raw base64 string
  isLoading: boolean;
}

export interface HistoryItem {
  id: string;
  src: string; // raw base64 string
  category: string;
  prompt: string;
  createdAt: number;
}
