import type { PLMPackProjectExchange } from './projectExchange';
import { generateIllustratorJsx } from './jsxGenerator';

export interface BridgeStatus {
  bridgeOnline: boolean;
  illustratorDetected: boolean;
  activeDocument?: string;
  cepExtensionActive?: boolean;
}

export type BridgeEventHandler = (event: {
  type: 'ARTWORK_UPDATED' | 'STATUS_CHANGED' | 'SYNC_COMPLETE' | 'ERROR';
  data?: any;
}) => void;

export class IllustratorBridgeClient {
  private static instance: IllustratorBridgeClient;
  private bridgeUrl = 'http://127.0.0.1:48123';
  private wsUrl = 'ws://127.0.0.1:48123/ws';
  private ws: WebSocket | null = null;
  private listeners: Set<BridgeEventHandler> = new Set();
  private status: BridgeStatus = { bridgeOnline: false, illustratorDetected: false };
  private reconnectTimer: any = null;

  private lastArtworkUri: string | null = null;

  private constructor() {
    this.initWebSocket();
    this.checkStatus();
    setInterval(() => this.checkStatus(), 2000);
  }

  public static getInstance(): IllustratorBridgeClient {
    if (!IllustratorBridgeClient.instance) {
      IllustratorBridgeClient.instance = new IllustratorBridgeClient();
    }
    return IllustratorBridgeClient.instance;
  }

  public addListener(handler: BridgeEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private notify(type: 'ARTWORK_UPDATED' | 'STATUS_CHANGED' | 'SYNC_COMPLETE' | 'ERROR', data?: any) {
    for (const handler of this.listeners) {
      try {
        handler({ type, data });
      } catch (err) {
        console.error('Erro no listener da bridge Illustrator:', err);
      }
    }
  }

  private initWebSocket() {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.status.bridgeOnline = true;
        this.notify('STATUS_CHANGED', this.status);
        this.checkStatus();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ARTWORK_UPDATED') {
            this.lastArtworkUri = msg.payload?.textureDataUri || msg.payload;
            this.notify('ARTWORK_UPDATED', msg.payload);
          } else if (msg.type === 'STATUS_UPDATE') {
            this.status = { ...this.status, ...msg.payload };
            this.notify('STATUS_CHANGED', this.status);
          }
        } catch (e) {
          console.error('Falha ao processar mensagem da Bridge:', e);
        }
      };

      this.ws.onclose = () => {
        this.status.bridgeOnline = false;
        this.notify('STATUS_CHANGED', this.status);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.status.bridgeOnline = false;
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initWebSocket();
    }, 4000);
  }

  public async checkStatus(): Promise<BridgeStatus> {
    try {
      const res = await fetch(`${this.bridgeUrl}/api/status`, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        this.status = { bridgeOnline: true, ...data };
        if (data.latestArtworkDataUri && data.latestArtworkDataUri !== this.lastArtworkUri) {
          this.lastArtworkUri = data.latestArtworkDataUri;
          this.notify('ARTWORK_UPDATED', { textureDataUri: data.latestArtworkDataUri });
        }
      } else {
        this.status.bridgeOnline = false;
      }
    } catch {
      this.status.bridgeOnline = false;
    }
    return this.status;
  }

  /**
   * Envia o projeto para abertura imediata no Adobe Illustrator 2025
   */
  public async openInIllustrator(project: PLMPackProjectExchange): Promise<{ success: boolean; message: string; isFallback?: boolean }> {
    // 1. Tenta envio direto para o Bridge Server Local
    try {
      const res = await fetch(`${this.bridgeUrl}/api/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          return {
            success: true,
            message: result.message || 'Projeto aberto com sucesso no Adobe Illustrator 2025!',
          };
        } else {
          return {
            success: false,
            isFallback: true,
            message: result.message || 'Falha ao processar abertura no Illustrator.',
          };
        }
      }
    } catch (e) {
      console.warn('Bridge local não respondeu:', e);
    }

    return {
      success: false,
      message: 'Ponte com Illustrator offline. Abra a extensão no Adobe Illustrator (Janela > Extensões > Primacor Embalagens Studio) para conectar.',
      isFallback: true,
    };
  }

  /**
   * Faz o download direto do arquivo de script .jsx compilado para o Illustrator
   */
  public downloadJsxFile(project: PLMPackProjectExchange): void {
    try {
      const jsxCode = generateIllustratorJsx(project);
      const blob = new Blob([jsxCode], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.modelCode}_${project.parameters.L || 300}x${project.parameters.B || 200}x${project.parameters.H || 150}_1a1.jsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Erro ao baixar arquivo .jsx:', e);
    }
  }

  /**
   * Solicita ao Illustrator que capture a camada de arte e devolva para o PLMPackLib 3D
   */
  public async requestArtworkSync(projectId: string): Promise<{ success: boolean; message: string; textureDataUri?: string }> {
    try {
      const res = await fetch(`${this.bridgeUrl}/api/sync-artwork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.textureDataUri) {
          this.notify('ARTWORK_UPDATED', { textureDataUri: data.textureDataUri });
        }
        return {
          success: true,
          message: 'Arte sincronizada com sucesso do Adobe Illustrator!',
          textureDataUri: data.textureDataUri,
        };
      }
      return { success: false, message: 'Illustrator não respondeu ao pedido de captura da arte.' };
    } catch (e) {
      return { success: false, message: 'Serviço de ponte local indisponível no momento.' };
    }
  }
}
