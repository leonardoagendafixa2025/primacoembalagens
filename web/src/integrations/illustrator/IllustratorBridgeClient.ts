import type { PLMPackProjectExchange } from './projectExchange';
import { generateIllustratorJsx } from './jsxGenerator';

export interface BridgeStatus {
  bridgeOnline: boolean;
  authenticated?: boolean;
  illustratorDetected: boolean;
  activeDocument?: string;
  cepExtensionActive?: boolean;
}

export type BridgeEventHandler = (event: {
  type: 'ARTWORK_UPDATED' | 'STATUS_CHANGED' | 'SYNC_COMPLETE' | 'ERROR';
  data?: any;
}) => void;

let inMemorySessionToken: string | null = 'auto_auth_token';

export function getBridgeSessionToken(): string | null {
  return inMemorySessionToken;
}

export function setBridgeSessionToken(token: string | null): void {
  inMemorySessionToken = token;
}

export class IllustratorBridgeClient {
  private static instance: IllustratorBridgeClient;
  private bridgeUrls = ['http://127.0.0.1:48123', 'http://localhost:48123'];
  public currentBridgeUrl = 'http://127.0.0.1:48123';
  private listeners: Set<BridgeEventHandler> = new Set();
  private status: BridgeStatus = { bridgeOnline: false, authenticated: true, illustratorDetected: false };
  private lastArtworkUri: string | null = null;
  private ws: WebSocket | null = null;

  private constructor() {
    this.checkStatus();
    setInterval(() => this.checkStatus(), 2500);
    this.initWebSocket();
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

  public getStatus(): BridgeStatus {
    return { ...this.status };
  }

  public isPaired(): boolean {
    return true;
  }

  public getLastArtworkUri(): string | null {
    return this.lastArtworkUri;
  }

  private initWebSocket() {
    if (typeof window === 'undefined') return;
    const wsUrl = 'ws://127.0.0.1:48123';
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ARTWORK_UPDATED') {
            const uri = msg.data?.textureDataUri || msg.data;
            if (uri) {
              this.lastArtworkUri = uri;
              this.notify('ARTWORK_UPDATED', msg.data);
            }
          }
        } catch {}
      };
      this.ws.onclose = () => {
        setTimeout(() => this.initWebSocket(), 4000);
      };
    } catch {}
  }

  public async pairWithOtp(_pairingCode: string): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'Conexão automática ativa!' };
  }

  public async revokeSession(): Promise<void> {
    this.status.authenticated = true;
  }

  public async checkStatus(): Promise<BridgeStatus> {
    for (const url of this.bridgeUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800);
        const res = await fetch(`${url}/api/status`, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          this.currentBridgeUrl = url;
          this.status.bridgeOnline = true;
          this.status.authenticated = true;
          this.status.illustratorDetected = !!data.illustratorDetected;

          if (data.latestArtworkDataUri && data.latestArtworkDataUri !== this.lastArtworkUri) {
            this.lastArtworkUri = data.latestArtworkDataUri;
            this.notify('ARTWORK_UPDATED', { textureDataUri: this.lastArtworkUri });
          }

          this.notify('STATUS_CHANGED', this.status);
          return this.status;
        }
      } catch {}
    }

    if (this.status.bridgeOnline) {
      this.status.bridgeOnline = false;
      this.notify('STATUS_CHANGED', this.status);
    }
    return this.status;
  }

  /**
   * Envia o projeto para abertura imediata no Adobe Illustrator 2025 em 1 clique
   */
  public async openInIllustrator(project: PLMPackProjectExchange): Promise<{ success: boolean; message: string; isFallback?: boolean }> {
    const jsxCode = (project as any).jsx || generateIllustratorJsx(project);
    const payload = { ...project, jsx: jsxCode, targetApp: 'illustrator' };

    for (const url of this.bridgeUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);
        const res = await fetch(`${url}/api/open`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const result = await res.json();
          this.currentBridgeUrl = url;
          this.status.bridgeOnline = true;
          this.notify('STATUS_CHANGED', this.status);
          return {
            success: result.success !== false,
            message: result.message || 'Projeto aberto com sucesso no Adobe Illustrator!',
          };
        } else {
          const errData = await res.json().catch(() => ({}));
          return {
            success: false,
            message: errData.message || 'Falha ao processar abertura no Illustrator.',
          };
        }
      } catch {}
    }

    return {
      success: false,
      message: 'Não foi possível conectar à Bridge local (127.0.0.1:48123). Verifique se ela está aberta no terminal.',
      isFallback: true,
    };
  }

  /**
   * Solicita a última arte sincronizada
   */
  public async requestArtworkSync(_modelId?: string): Promise<{ success: boolean; textureDataUri?: string; message?: string }> {
    for (const url of this.bridgeUrls) {
      try {
        const res = await fetch(`${url}/api/latest-artwork`);
        if (res.ok) {
          const data = await res.json();
          if (data.hasArtwork && data.textureDataUri) {
            this.lastArtworkUri = data.textureDataUri;
            return { success: true, textureDataUri: data.textureDataUri };
          }
        }
      } catch {}
    }
    return { success: false, message: 'Nenhuma arte sincronizada encontrada na Bridge.' };
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
      console.error('Erro ao baixar script do Illustrator:', e);
    }
  }
}
